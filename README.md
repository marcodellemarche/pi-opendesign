# pi-opendesign

A [pi](https://github.com/earendil-works/pi-mono) extension that drives a local
[OpenDesign](https://github.com/nexu-io/open-design) workspace.

OpenDesign is a local-first design workspace. It spawns your own coding agent to
produce HTML artifacts (prototypes, dashboards, slide decks) against a design
system you pick, and streams the files into a live preview. This extension gives
pi a single tool for that workflow and returns the artifact link when the run
finishes.

## Install

```bash
pi install git:github.com/marcodellemarche/pi-opendesign
```

OpenDesign must be running, either as the desktop app or from a source checkout:

```bash
cd ~/open-design && pnpm install && pnpm tools-dev run web
```

## Usage

Ask for a design in plain language. pi picks the tool by itself:

```text
> make me a dashboard for the storage metrics
```

`/design` forces a run when you want to be explicit:

```text
/design a pricing page with three tiers
```

Other commands:

| Command | Purpose |
| --- | --- |
| `/design <brief>` | Start a run from a one-liner |
| `/od-status` | Connection state and project list |
| `/od-config` | Show or set the default project and design system |

The tool has three actions. `start` begins a run and returns a run id plus a
workspace link, `status` polls an existing run, and `projects` lists them.

## What happens on a run

1. `start` posts the brief and returns immediately. It does not wait.
2. pi polls `status` every 30 to 60 seconds. A run takes 5 to 30 minutes, so a
   status of `running` with no new files is the agent thinking, not a hang.
3. On success, `status` returns `previewUrl`, a browser link to the rendered
   artifact, plus the agent's own message explaining what it built.

## Defaults

Set a default project and design system so you do not have to name them on every
request:

```text
/od-config project my-design-work
/od-config designSystem user:acme
```

These are stored in `~/.pi/agent/open-design.json`:

```json
{
  "defaultProject": "my-design-work",
  "defaultDesignSystem": "user:acme"
}
```

An explicit `project` or `designSystem` argument to the tool always overrides the
default, so a default never blocks working on something else.

Pick a project that OpenDesign manages internally. A project can be bound to an
external folder, and runs then write straight into that folder, which is rarely
what you want if it is a real repository.

## Configuration

All environment variables are optional.

| Variable | Purpose |
| --- | --- |
| `OD_BIN` | Path to an `od` entrypoint (`od.mjs` or `daemon-cli.mjs`) |
| `OD_DAEMON_URL` | Daemon address, for example `http://127.0.0.1:7456` |
| `OD_NODE` | Node binary used to run `OD_BIN`, defaults to the running node |
| `OD_PORT` | Daemon port when it is not 7456 |

`OD_BIN` is needed only when OpenDesign is not in the usual place. The extension
looks at `~/open-design/apps/daemon/bin/od.mjs` and then
`~/open-design/apps/daemon/dist/cli.js`.

## How it talks to OpenDesign

Most calls go through `od mcp` over stdio JSON-RPC. Delegating transport
discovery to that CLI matters because the daemon is reachable in two different
ways: plain HTTP on port 7456 for a source install, or a POSIX socket under
`/tmp/open-design/ipc/` for a packaged one. `od mcp` resolves both.

One call does not. Starting a run with a design-system override posts to
`/api/runs` directly, because the MCP `start_run` tool has no `designSystemId`
parameter. The daemon resolves the design system with the precedence
`request > plugin > project > app default`, so an explicit per-run value wins
over the project's own.

There are no runtime dependencies. The MCP client is about 60 lines of
newline-delimited JSON-RPC.

## Notes

**A design system override needs a project.** Without one there is nothing to
override, and the extension reports that instead of guessing.

**Project names can be ambiguous.** OpenDesign creates a backing project for
every installed design system, so a design system named `Acme` and a project
named `acme` can both exist. An exact id is always used as given. On name
matches the ordinary project is preferred over a design-system backing project,
and a genuine tie is an error so you can disambiguate.

**Runs fail if the network drops.** The model that OpenDesign drives may be
remote, and an unstable connection kills the stream mid-run. If runs start
failing at a steady rate, check the link before suspecting the stack.

**pi does not always call the tool.** For a trivial request it may write the HTML
itself, which is reasonable when the artifact is a handful of lines. Name the
tool, or ask for something substantial, when the on-brand pipeline matters.

## License

MIT
