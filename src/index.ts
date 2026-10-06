/**
 * pi-opendesign: drive a local OpenDesign workspace from pi.
 *
 * OpenDesign is a local-first design workspace that spawns your own coding
 * agent to produce HTML artifacts (prototypes, dashboards, decks) against a
 * chosen design system. This extension gives pi one tool for that workflow and
 * returns the artifact link when the run finishes.
 *
 * Why a single `design` tool instead of the full MCP surface:
 * OpenDesign ships an MCP server (`od mcp`) with 22 tools for reading project
 * files and starting runs. pi has no MCP host, so those tools cannot be used
 * as-is, and forwarding all 22 would put raw file-level operations in the
 * model's tool list. The useful unit here is one verb ("build this on-brand")
 * plus a link, so that is what this exposes.
 *
 * How it talks to OpenDesign:
 * Most calls go through `od mcp` over stdio JSON-RPC. Delegating transport
 * discovery to that CLI matters because the daemon is reachable two different
 * ways: plain HTTP on 127.0.0.1:7456 for a source install, or a POSIX socket
 * under /tmp/open-design/ipc/<ns>/ for a packaged one. `od mcp` resolves both.
 *
 * One call does not: starting a run with a design-system override. The MCP
 * `start_run` tool has no such parameter, so that path posts to /api/runs
 * directly.
 *
 * Config (all optional):
 *   OD_BIN         path to an od entrypoint (od.mjs or daemon-cli.mjs)
 *   OD_DAEMON_URL  e.g. http://127.0.0.1:7456
 *   OD_NODE        node binary used to run OD_BIN (default: the running node)
 *   OD_PORT        daemon port when it is not 7456
 *
 * Defaults for project and design system live in ~/.pi/agent/open-design.json
 * and are managed with /od-config.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const NAME = "pi-opendesign";
const CALL_TIMEOUT_MS = 60_000;

/**
 * Resolve the OpenDesign CLI entrypoint.
 *
 * OD_BIN wins when set. Otherwise the usual source-checkout locations are
 * tried. A bare `od` on PATH is never used: on Debian and Ubuntu /usr/bin/od is
 * the POSIX octal dump utility, and spawning that would fail in a confusing way.
 */
function resolveOdCommand(): { command: string; args: string[] } {
  const candidates = [
    process.env.OD_BIN,
    join(homedir(), "open-design", "apps", "daemon", "bin", "od.mjs"),
    join(homedir(), "open-design", "apps", "daemon", "dist", "cli.js"),
  ].filter((value): value is string => Boolean(value && value.length > 0));

  for (const bin of candidates) {
    if (!existsSync(bin)) continue;
    const args = [bin, "mcp"];
    const target = resolveDaemonTarget();
    if (target) args.push("--daemon-url", target);
    return { command: process.env.OD_NODE || process.execPath, args };
  }

  throw new Error(
    `[${NAME}] OpenDesign CLI not found. Set OD_BIN to an od entrypoint, ` +
      `for example ~/open-design/apps/daemon/bin/od.mjs.`,
  );
}

/**
 * Find a daemon address, because `od mcp` refuses to start without one.
 *
 * Its own discovery only understands the packaged socket, and only when
 * OD_SIDECAR_IPC_PATH is set. On a source install, which serves HTTP, it exits
 * with "daemon could not be discovered" unless given --daemon-url.
 *
 * Resolution order:
 *   OD_DAEMON_URL set              -> use it
 *   OD_SIDECAR_IPC_PATH set        -> let od handle it, return null
 *   a socket under /tmp/open-design/ipc -> set the env var, return null
 *   otherwise                      -> the default HTTP port
 */
function resolveDaemonTarget(): string | null {
  const explicit = process.env.OD_DAEMON_URL?.trim();
  if (explicit) return explicit;

  if (process.env.OD_SIDECAR_IPC_PATH?.trim()) return null;

  try {
    const ipcRoot = join(tmpdir(), "open-design", "ipc");
    if (existsSync(ipcRoot)) {
      for (const namespace of readdirSync(ipcRoot)) {
        const socket = join(ipcRoot, namespace, "daemon.sock");
        if (existsSync(socket)) {
          process.env.OD_SIDECAR_IPC_PATH = socket;
          return null;
        }
      }
    }
  } catch {
    // Fall through to the HTTP default.
  }

  return `http://127.0.0.1:${process.env.OD_PORT || "7456"}`;
}

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

/**
 * Minimal MCP client: one long-lived `od mcp` child, newline-delimited
 * JSON-RPC. Only initialize and tools/call are needed, so the official SDK
 * would be a dependency for a few dozen lines of framing.
 */
class OdMcpClient {
  private child?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private buffer = "";
  private starting?: Promise<void>;
  private lastError?: string;

  get connected(): boolean {
    return Boolean(this.child);
  }

  async start(): Promise<void> {
    if (this.child) return;
    if (this.starting) return this.starting;

    // Held locally so cleanup can tell whether the state still belongs to this
    // attempt. A child that dies during startup clears this.child, after which
    // a later start() can spawn a replacement; without the identity checks the
    // first attempt's cleanup would discard the newer child and leak it.
    let spawned: ChildProcessWithoutNullStreams | undefined;

    const attempt = (async () => {
      const { command, args } = resolveOdCommand();
      const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
      spawned = child;
      this.child = child;
      this.buffer = "";

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => this.handleData(chunk));

      // `od mcp` writes warnings to stderr. Keep the last line for diagnostics.
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        const line = String(chunk).trim().split("\n").pop();
        if (line) this.lastError = line;
      });

      // A spawn failure (missing binary, no execute bit, bad OD_NODE) arrives
      // as an 'error' event. With no listener Node throws it as an unhandled
      // error and terminates the whole process.
      child.on("error", (error: Error) => {
        this.lastError = error.message;
        this.settleChild(child, `[${NAME}] od mcp failed to start`);
      });

      // Writing to a child that has closed its stdin emits EPIPE
      // asynchronously. Unhandled, that also terminates the process. The
      // request itself fails through settleChild, so this listener only
      // absorbs the event.
      child.stdin.on("error", () => {});

      // 'close' fires once the stdio streams are drained, so a response
      // written just before termination is still parsed. 'exit' is kept as a
      // fallback for a child whose streams stay open, for instance when a
      // grandchild inherited them.
      child.on("close", () => this.settleChild(child, `[${NAME}] od mcp exited`));
      child.on("exit", () => this.settleChild(child, `[${NAME}] od mcp exited`));

      await this.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: NAME, version: "1.0.0" },
      });
      // A notification, so no response is expected.
      this.write(child, { jsonrpc: "2.0", method: "notifications/initialized" });
    })();

    this.starting = attempt;
    try {
      await attempt;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      if (this.child === spawned) this.child = undefined;
      if (this.starting === attempt) this.starting = undefined;
      spawned?.kill();
      throw error;
    }
  }

  /**
   * Drop the state for one child and fail its in-flight requests.
   *
   * Idempotent, and a no-op once a newer child has replaced this one, so a
   * late 'close' from an old process cannot tear down a live connection.
   */
  private settleChild(child: ChildProcessWithoutNullStreams, reason: string): void {
    if (this.child !== child) return;
    this.child = undefined;
    this.starting = undefined;
    this.buffer = "";

    const error = new Error(this.lastError ? `${reason}: ${this.lastError}` : reason);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  /** Write one JSON-RPC record, tolerating a stream that has already closed. */
  private write(child: ChildProcessWithoutNullStreams, message: unknown): void {
    if (!child.stdin.writable) return;
    try {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    } catch {
      // The stream is gone. settleChild fails anything still pending.
    }
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;

      let message: JsonRpcResponse;
      try {
        message = JSON.parse(line) as JsonRpcResponse;
      } catch {
        continue;
      }
      if (message.id == null) continue;

      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const child = this.child;
    if (!child) return Promise.reject(new Error(`[${NAME}] od mcp not started`));

    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`[${NAME}] ${method} timed out after ${CALL_TIMEOUT_MS}ms`));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.write(child, { jsonrpc: "2.0", id, method, params });
    });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.start();
    const result = (await this.request("tools/call", { name, arguments: args })) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    const text = (result.content ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("\n");

    if (result.isError) throw new Error(text || `OpenDesign tool ${name} failed`);
    return text;
  }

  /** OpenDesign tools return JSON encoded as text. */
  async callJson<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const text = await this.callTool(name, args);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`OpenDesign tool ${name} returned non-JSON output:\n${text.slice(0, 500)}`);
    }
  }

  stop(): void {
    const child = this.child;
    if (child) {
      this.settleChild(child, `[${NAME}] od mcp stopped`);
      child.kill();
      return;
    }
    // No child, but a start attempt may still be in flight, and any queued
    // request must not be left waiting on its timeout.
    this.starting = undefined;
    this.buffer = "";
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`[${NAME}] od mcp stopped`));
    }
    this.pending.clear();
  }
}

const client = new OdMcpClient();

function daemonBaseUrl(): string {
  return (process.env.OD_DAEMON_URL || "http://127.0.0.1:7456").replace(/\/+$/, "");
}

/**
 * Start a run through /api/runs instead of the MCP tool.
 *
 * Needed only for a design-system override: `start_run` has no designSystemId
 * parameter, while the daemon's run request accepts one. The daemon resolves it
 * with the precedence request > plugin > project > app default, so an explicit
 * per-run value wins over the project's own and a project without one can still
 * be overridden.
 */
async function startRunViaHttp(input: {
  projectId: string;
  message: string;
  designSystemId?: string;
  skillId?: string;
  agentId?: string;
  model?: string;
}): Promise<{ runId?: string; conversationId?: string }> {
  const body: Record<string, unknown> = {
    projectId: input.projectId,
    message: input.message,
  };
  if (input.designSystemId) body.designSystemId = input.designSystemId;
  if (input.skillId) body.skillId = input.skillId;
  if (input.agentId) body.agentId = input.agentId;
  if (input.model) body.model = input.model;

  const response = await fetch(`${daemonBaseUrl()}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `POST /api/runs failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }
  return (await response.json()) as { runId?: string; conversationId?: string };
}

/**
 * Turn a project id or name into an id.
 *
 * An exact id is returned as-is. Name matching has to be careful because a
 * design system and a project can share a name; OpenDesign also creates a
 * backing project for every installed design system, which is not where
 * artifacts belong unless it was asked for by name. When two projects match
 * equally, this fails so the caller can disambiguate.
 */
async function resolveProjectId(idOrName: string): Promise<string> {
  const response = await fetch(`${daemonBaseUrl()}/api/projects`);
  if (!response.ok) throw new Error(`GET /api/projects failed (${response.status})`);

  const data = (await response.json()) as {
    projects?: Array<{ id: string; name?: string; metadata?: Record<string, unknown> }>;
  };
  const projects = data.projects ?? [];

  const exact = projects.find((project) => project.id === idOrName);
  if (exact) return exact.id;

  const lower = idOrName.toLowerCase();
  const byName = projects.filter((project) => (project.name ?? "").toLowerCase() === lower);
  if (byName.length === 1) return byName[0]!.id;
  if (byName.length > 1) {
    const ordinary = byName.filter(
      (project) => (project.metadata?.importedFrom ?? null) !== "design-system",
    );
    if (ordinary.length === 1) return ordinary[0]!.id;
    throw ambiguousProject(idOrName, byName);
  }

  const partial = projects.filter((project) =>
    (project.name ?? "").toLowerCase().includes(lower),
  );
  if (partial.length === 1) return partial[0]!.id;
  if (partial.length > 1) throw ambiguousProject(idOrName, partial);

  throw new Error(`no project matches "${idOrName}"`);
}

function ambiguousProject(
  idOrName: string,
  matches: Array<{ id: string; name?: string }>,
): Error {
  const listed = matches.map((project) => `${project.name} (${project.id})`).join(", ");
  return new Error(`multiple projects match "${idOrName}": ${listed}. Pass the id instead.`);
}

type ProjectSummary = {
  id: string;
  name?: string;
  designSystemId?: string | null;
  entryFile?: string | null;
};

type RunStatus = {
  id?: string;
  status?: string;
  projectId?: string;
  previewUrl?: string;
  studioUrl?: string;
  agentMessage?: string;
  error?: string;
  failureAction?: string;
};

type ProjectList = { projects?: ProjectSummary[] } | ProjectSummary[];

function asProjectList(value: ProjectList): ProjectSummary[] {
  return Array.isArray(value) ? value : (value.projects ?? []);
}

/** Browser link to a project, usable when the daemon reports no studio URL. */
function workspaceLink(projectId: string): string {
  return `${daemonBaseUrl()}/projects/${encodeURIComponent(projectId)}`;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

type Preferences = {
  defaultProject?: string;
  defaultDesignSystem?: string;
};

const PREFS_PATH = join(homedir(), ".pi", "agent", "open-design.json");
let prefsCache: Preferences | undefined;

/**
 * Read the defaults, caching the result for the session.
 *
 * This is a preference of the pi integration, not an OpenDesign setting. The
 * daemon has no per-client default project: its active-project endpoint is
 * same-origin UI state that expires a few minutes after the last interaction.
 */
async function loadPrefs(): Promise<Preferences> {
  if (prefsCache) return prefsCache;
  try {
    prefsCache = JSON.parse(await readFile(PREFS_PATH, "utf8")) as Preferences;
  } catch {
    prefsCache = {};
  }
  return prefsCache;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderCall(args: Record<string, unknown>, theme: Theme): Text {
  const summary = Object.entries(args)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => {
      const rendered = typeof value === "string" ? value : JSON.stringify(value);
      return `${key}=${String(rendered).slice(0, 80)}`;
    })
    .join(" ");
  return new Text(`${theme.fg("toolTitle", theme.bold("design"))} ${theme.fg("accent", summary)}`, 0, 0);
}

function renderResult(
  result: { content?: Array<{ type: string; text?: string }> },
  options: { expanded?: boolean; isPartial?: boolean },
  theme: Theme,
): Text {
  if (options.isPartial) {
    const progress = result.content?.find((part) => part.type === "text")?.text ?? "working";
    return new Text(`${theme.fg("warning", "...")} ${theme.fg("toolOutput", progress)}`, 0, 0);
  }

  const raw = result.content?.find((part) => part.type === "text")?.text ?? "";
  const limit = options.expanded ? 20_000 : 2_500;
  const shown =
    raw.length > limit ? `${raw.slice(0, limit)}\n... ${raw.length - limit} more characters` : raw;
  return new Text(`${theme.fg("success", "ok")}\n${theme.fg("toolOutput", shown)}`, 0, 0);
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function openDesignExtension(pi: ExtensionAPI) {
  // OpenDesign spawns its own agent CLI to do the work, and that child inherits
  // this extension because the daemon runs a bare `pi --mode rpc`. Without this
  // guard the inner agent would open a second `od mcp` connection back into the
  // daemon that spawned it. The daemon marks its children with OD_PROJECT_ID,
  // so presence of that variable means we are the inner agent and should stay
  // inert.
  if (process.env.OD_PROJECT_ID || process.env.OD_RUN_ID) {
    return;
  }

  pi.registerTool({
    name: "design",
    label: "OpenDesign",
    description:
      "Create or refine an on-brand design (web prototype, dashboard, slide deck, image) through " +
      "the user's local OpenDesign workspace. OpenDesign runs its own agent and writes real HTML/CSS " +
      "artifacts into a project. Prefer this over hand-writing HTML when the user asks for a " +
      "design, prototype, dashboard or deck. Returns immediately with a run id and a workspace link; " +
      "call again with action=status to poll, which returns the preview URL once the artifact exists. " +
      "Generation takes 5 to 30 minutes, so poll every 30 to 60 seconds and report progress. " +
      "Pass project or designSystem when the user names one; otherwise the configured defaults apply.",
    promptSnippet: "Generate an on-brand design, dashboard or deck in the local OpenDesign workspace",
    promptGuidelines: [
      "Use the `design` tool for design, prototype, dashboard and deck requests instead of writing raw HTML. OpenDesign's pipeline is what produces the design quality.",
      "After `design` action=start, poll with action=status every 30 to 60 seconds. A long-running status is not a hang, so report progress instead of cancelling.",
      "When action=status returns a previewUrl, give it to the user as a clickable markdown link.",
      "When the user names a project or design system, pass it as `project` or `designSystem`. An explicit value always overrides the configured default.",
    ],
    parameters: Type.Object({
      action: Type.Union([Type.Literal("start"), Type.Literal("status"), Type.Literal("projects")], {
        description: "start begins a run, status polls one, projects lists them",
      }),
      prompt: Type.Optional(
        Type.String({ description: "What to design, in natural language. Required for action=start." }),
      ),
      project: Type.Optional(
        Type.String({
          description:
            "Project id or name to write into. Omit to use the configured default project.",
        }),
      ),
      designSystem: Type.Optional(
        Type.String({
          description:
            "Design system id to force for this run, for example user:acme. Omit to use the configured default or the project's own.",
        }),
      ),
      runId: Type.Optional(Type.String({ description: "Run id to poll. Required for action=status." })),
      skill: Type.Optional(Type.String({ description: "OpenDesign skill id to drive the run." })),
      agent: Type.Optional(
        Type.String({ description: "Runtime id from list_agents. Defaults to the configured runtime." }),
      ),
      model: Type.Optional(Type.String({ description: "Model id to use for the run." })),
    }),
    async execute(_toolCallId, params, _signal, onUpdate) {
      try {
        if (params.action === "projects") {
          const projects = asProjectList(await client.callJson<ProjectList>("list_projects", {}));
          if (projects.length === 0) {
            return {
              content: [{ type: "text" as const, text: "No OpenDesign projects yet." }],
              details: {},
            };
          }
          const lines = projects.map((project) => {
            const designSystem = project.designSystemId ? `  [${project.designSystemId}]` : "";
            const entry = project.entryFile ? `  ${project.entryFile}` : "";
            return `- ${project.name ?? project.id}  (id: ${project.id})${designSystem}${entry}`;
          });
          return {
            content: [{ type: "text" as const, text: `OpenDesign projects:\n${lines.join("\n")}` }],
            details: { count: projects.length },
          };
        }

        if (params.action === "status") {
          if (!params.runId) throw new Error("runId is required for action=status");
          onUpdate?.({
            content: [{ type: "text", text: `Checking run ${params.runId}` }],
            details: {},
          });

          const status = await client.callJson<RunStatus>("get_run", { runId: params.runId });
          const state = status.status ?? "unknown";

          if (state === "succeeded") {
            const parts = [`Run ${status.id ?? params.runId}: succeeded`];
            if (status.previewUrl) {
              parts.push(`\nPreview: ${status.previewUrl}`);
            } else {
              // A run can succeed without a preview: OpenDesign only builds one
              // when it considers the deliverable valid, which needs an entry
              // file. The workspace link still shows the files.
              parts.push(
                "\nNo preview link: OpenDesign did not treat the output as a valid " +
                  "deliverable, usually because the artifact did not declare an entry file. " +
                  "The workspace link below still shows what was written.",
              );
            }
            if (status.studioUrl) parts.push(`\nWorkspace: ${status.studioUrl}`);
            else if (status.projectId) parts.push(`\nWorkspace: ${workspaceLink(status.projectId)}`);
            if (status.agentMessage) parts.push(`\n\n${status.agentMessage}`);
            return {
              content: [{ type: "text" as const, text: parts.join("") }],
              details: { status: state, previewUrl: status.previewUrl, studioUrl: status.studioUrl },
            };
          }

          if (state === "failed" || state === "canceled") {
            const detail = status.error ? `\n${status.error}` : "";
            const hint =
              status.failureAction === "recharge"
                ? "\n\nThe OpenDesign account balance is insufficient. Ask the user to top up, then retry."
                : "";
            return {
              content: [
                { type: "text" as const, text: `Run ${status.id ?? params.runId}: ${state}${detail}${hint}` },
              ],
              details: { status: state, error: status.error },
            };
          }

          const link =
            status.studioUrl ?? (status.projectId ? workspaceLink(status.projectId) : null);
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Run ${status.id ?? params.runId}: ${state}, still working.` +
                  `${link ? `\nWorkspace: ${link}` : ""}\nPoll again in 30 to 60 seconds.`,
              },
            ],
            details: { status: state, inFlight: true, studioUrl: link },
          };
        }

        if (!params.prompt) throw new Error("prompt is required for action=start");
        onUpdate?.({ content: [{ type: "text", text: "Starting OpenDesign run" }], details: {} });

        const prefs = await loadPrefs();
        // An explicit argument wins; the configured default is only a fallback.
        // That is what makes a default safe to set.
        const projectArg = params.project ?? prefs.defaultProject;
        const designSystemArg = params.designSystem ?? prefs.defaultDesignSystem;

        let projectId: string | undefined;
        if (projectArg) projectId = await resolveProjectId(projectArg);

        let started: RunStatus & { runId?: string; id?: string; projectId?: string };
        if (designSystemArg) {
          if (!projectId) {
            throw new Error(
              "a designSystem override needs a project. Set a default in " +
                `${PREFS_PATH} or pass project.`,
            );
          }
          const run = await startRunViaHttp({
            projectId,
            message: params.prompt,
            designSystemId: designSystemArg,
            skillId: params.skill,
            agentId: params.agent,
            model: params.model,
          });
          started = { runId: run.runId, projectId, status: "queued" };
        } else {
          const args: Record<string, unknown> = { prompt: params.prompt };
          if (projectId) args.project = projectId;
          if (params.skill) args.skill = params.skill;
          if (params.agent) args.agent = params.agent;
          if (params.model) args.model = params.model;
          started = await client.callJson<RunStatus & { runId?: string; id?: string; projectId?: string }>(
            "start_run",
            args,
          );
        }

        // /api/runs reports the id as runId, while get_run echoes it as id.
        const runId = started.runId ?? started.id;
        const resolvedProjectId = started.projectId ?? projectId;
        const link =
          started.studioUrl ?? (resolvedProjectId ? workspaceLink(resolvedProjectId) : null);

        const text = [
          "Run started.",
          runId ? `runId: ${runId}` : "",
          link ? `Workspace: ${link}` : "",
          "",
          "Generation usually takes 5 to 30 minutes. Poll with action=status every 30 to 60 " +
            "seconds and report progress. The preview link arrives when it finishes.",
        ]
          .filter(Boolean)
          .join("\n");

        return {
          content: [{ type: "text" as const, text }],
          details: { runId, projectId: resolvedProjectId, studioUrl: link, status: "queued" },
        };
      } catch (error) {
        throw new Error(`OpenDesign: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    renderCall: renderCall as never,
    renderResult: renderResult as never,
  });

  pi.registerCommand("design", {
    description: "Design something on-brand in the local OpenDesign workspace",
    handler: async (args, ctx) => {
      const brief = args.trim();
      if (!brief) {
        ctx.ui.notify("Usage: /design <what to build>", "warning");
        return;
      }

      try {
        await client.start();
      } catch (error) {
        ctx.ui.notify(
          `OpenDesign not reachable: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
        return;
      }

      pi.sendUserMessage(
        `Use the \`design\` tool to create this in the local OpenDesign workspace: ${brief}\n\n` +
          `Start the run, then poll it with action=status every 30 to 60 seconds until it ` +
          `finishes, and give me the preview link as soon as it exists.`,
      );
    },
  });

  pi.registerCommand("od-status", {
    description: "Show OpenDesign connection status and projects",
    handler: async (_args, ctx) => {
      let line: string;
      try {
        const projects = asProjectList(await client.callJson<ProjectList>("list_projects", {}));
        line = `OpenDesign: connected, ${projects.length} project${projects.length === 1 ? "" : "s"}`;
        for (const project of projects.slice(0, 8)) {
          const designSystem = project.designSystemId ? `  [${project.designSystemId}]` : "";
          line += `\n  ${project.name ?? project.id}${designSystem}`;
        }
      } catch (error) {
        line = `OpenDesign: not connected, ${error instanceof Error ? error.message : String(error)}`;
      }
      ctx.ui.notify(line, "info");
    },
  });

  pi.registerCommand("od-config", {
    description: "Show or set OpenDesign defaults (project, design system)",
    handler: async (args, ctx) => {
      const [key, ...rest] = args.trim().split(/\s+/);
      const value = rest.join(" ").trim();
      const prefs = { ...(await loadPrefs()) };

      if (!key) {
        ctx.ui.notify(
          [
            "OpenDesign defaults:",
            `  project:       ${prefs.defaultProject ?? "(none, uses the project open in OpenDesign)"}`,
            `  design system: ${prefs.defaultDesignSystem ?? "(none, uses the project's own)"}`,
            "",
            "Set with:   /od-config project <id-or-name>",
            "            /od-config designSystem <id>",
            "Unset with: /od-config project none",
            "An explicit argument to the `design` tool always overrides these.",
          ].join("\n"),
          "info",
        );
        return;
      }

      if (key !== "project" && key !== "designSystem") {
        ctx.ui.notify(`Unknown key "${key}". Use project or designSystem.`, "warning");
        return;
      }

      if (!value) {
        ctx.ui.notify(`Usage: /od-config ${key} <value|none>`, "warning");
        return;
      }

      // The command key and the preference field differ, so map explicitly.
      const field: keyof Preferences =
        key === "project" ? "defaultProject" : "defaultDesignSystem";
      const clearing = value === "none" || value === "clear";
      if (clearing) delete prefs[field];
      else prefs[field] = value;

      // Validate before persisting so a typo cannot redirect every later run.
      if (field === "defaultProject" && prefs.defaultProject) {
        try {
          prefs.defaultProject = await resolveProjectId(prefs.defaultProject);
        } catch (error) {
          ctx.ui.notify(
            `Not saved: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
          return;
        }
      }

      try {
        await writeFile(PREFS_PATH, `${JSON.stringify(prefs, null, 2)}\n`, "utf8");
        prefsCache = prefs;
        ctx.ui.notify(`OpenDesign ${key} set to ${prefs[field] ?? "(cleared)"}`, "info");
      } catch (error) {
        ctx.ui.notify(
          `Could not write ${PREFS_PATH}: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      }
    },
  });

  // Connect at session start so the first /design is immediate. Failure is not
  // fatal because the daemon may not be running yet.
  pi.on("session_start", async (_event, _ctx: ExtensionContext) => {
    try {
      await client.start();
    } catch {
      // Reported on first use or by /od-status.
    }
  });

  pi.on("session_shutdown", async () => {
    client.stop();
  });
}
