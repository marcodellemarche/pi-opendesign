# pi-opendesign

A [pi](https://github.com/earendil-works/pi-mono) extension for a local
[OpenDesign](https://github.com/nexu-io/open-design) workspace.

OpenDesign runs your own coding agent to produce HTML artifacts (prototypes,
dashboards, decks) against a design system, and previews them live. This
extension gives pi one tool for that, and hands back the artifact link when the
run finishes.

## Install

```bash
pi install git:github.com/marcodellemarche/pi-opendesign
```

OpenDesign has to be running. Either the desktop app, or from a source checkout:

```bash
cd ~/open-design && pnpm install && pnpm tools-dev run web
```

## Use

Ask for a design in plain language and pi picks the tool by itself:

```text
> make me a dashboard for the storage metrics
```

`/design` forces a run when you want to be explicit:

```text
/design a pricing page with three tiers
```

| Command | Purpose |
| --- | --- |
| `/design <brief>` | Start a run from a one-liner |
| `/od-status` | Connection state and project list |
| `/od-config` | Show or set the default project and design system |

The tool has three actions: `start` begins a run, `status` polls one, `projects`
lists them.

## Attaching a design system

A design system is what makes the output look like your brand instead of a
generic page. OpenDesign reads the [DESIGN.md][stitch] format, so you do not need
a plugin, a schema, or any tooling: a Markdown file in a folder is enough.

[stitch]: https://stitch.withgoogle.com/docs/design-md/overview/

### The minimum that works

Two files in one folder:

```text
my-brand/
├── DESIGN.md       the design system, in the format below
└── metadata.json   { "status": "published" }
```

[`examples/my-brand`](examples/my-brand) in this repository is exactly that, and
it is a working design system: copy it, or read it to see the format filled in.

`metadata.json` is not optional in practice. Without it the design system
defaults to `draft`, and a draft is skipped at run time with no error at all:
the artifact comes back in OpenDesign's default style and nothing tells you why.

Put the folder in OpenDesign's user design-system directory and it appears in the
picker:

```bash
mkdir -p ~/open-design/.od/design-systems/my-brand
cp examples/my-brand/* ~/open-design/.od/design-systems/my-brand/
```

### Installing from a git repository

To share a design system, put the folder in a repository and install it. The
repository name becomes the design-system id, so a repository called `my-brand`
installs as `user:my-brand`.

```bash
curl -s -X POST http://127.0.0.1:7456/api/design-systems/install \
  -H 'content-type: application/json' \
  -d '{"source":"github","url":"https://github.com/you/my-brand"}'
```

Use this endpoint, not `design-systems/import-github`. The importer reads only
the CSS custom properties it finds and regenerates `DESIGN.md` from its own
template, discarding yours. `install` clones the repository and keeps it as it
is.

If the repository declares a `manifest.json`, its `id` has to match the folder
name. On a mismatch the daemon ignores the manifest and falls back to reading
`DESIGN.md` alone: the system still appears, but without its declared files or
previews.

### Pointing a run at it

```text
/od-config designSystem user:my-brand
```

Or per request, which overrides the default:

```text
> build the settings page using the user:my-brand design system
```

A Cubbit example of the full package, with a manifest, token file and preview
pages, is at `cubbit/cubbit-design-system`. That repository is private to the
Cubbit organisation, so the link only resolves for members; the structure
described below is what it follows.

### The DESIGN.md format

The format is [Google Stitch's DESIGN.md][stitch-spec]: YAML frontmatter for the
raw values, then prose sections for the rules an agent cannot infer from them.

```markdown
---
name: My Brand
colors:
  canvas: "#0e0e15"
  ink: "#ffffff"
  accent: "#0065ff"
typography:
  display:
    fontFamily: Figtree
    fontSize: 40px
    fontWeight: 600
---

## Overview
What the brand feels like, and what it is not.

## Colors
Which colour carries emphasis, and which are reserved for state.

## Typography
The families, the scale, and where each step is used.

## Layout
Spacing rhythm, grid, and container widths.

## Components
Buttons, inputs, cards, navigation, including hover and focus states.

## Do's and Don'ts
The mistakes an agent would otherwise make.

## Responsive Behavior
Breakpoints and how layout collapses.
```

[stitch-spec]: https://stitch.withgoogle.com/docs/design-md/specification/

A collection of ready-made examples, extracted from real products, is at
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md).
Any of those files works as-is. The [examples](examples) directory here has a
short version with the format annotated.

### Going further

Everything past `DESIGN.md` is optional, and each addition buys something
specific:

| File | Effect |
| --- | --- |
| `tokens.css` | The compiled token block, pasted into the artifact. Keeps the values out of prose. |
| `USAGE.md` | Read order for the agent, and the decisions that are easy to get wrong. |
| `components.html` | A reference fixture the agent can copy component shapes from. |
| `manifest.json` | Declares which files exist, so OpenDesign loads previews and evidence. |
| `preview/` | Review pages for a human, not read by the agent. |

OpenDesign writes its own boilerplate into a design-system folder the first time
it lists one. It only creates files it does not find, so anything you commit is
kept.

## Defaults

```text
/od-config project my-design-work
/od-config designSystem user:my-brand
```

Stored in `~/.pi/agent/open-design.json`:

```json
{
  "defaultProject": "my-design-work",
  "defaultDesignSystem": "user:my-brand"
}
```

An explicit `project` or `designSystem` argument always overrides these.

Prefer a project OpenDesign manages internally. A project can be bound to an
external folder, and runs then write into that folder, which you rarely want if
it is a real repository.

## Configuration

All optional.

| Variable | Purpose |
| --- | --- |
| `OD_BIN` | Path to an `od` entrypoint (`od.mjs` or `daemon-cli.mjs`) |
| `OD_DAEMON_URL` | Daemon address, for example `http://127.0.0.1:7456` |
| `OD_NODE` | Node binary used to run `OD_BIN`, defaults to the running node |
| `OD_PORT` | Daemon port when it is not 7456 |

The extension looks for the CLI at `~/open-design/apps/daemon/bin/od.mjs` and
then `~/open-design/apps/daemon/dist/cli.js`. Set `OD_BIN` when OpenDesign is
somewhere else.

## Notes

**A run takes 5 to 30 minutes.** `start` returns immediately with a run id. Poll
`status` every 30 to 60 seconds; a status of `running` with no new files is the
agent thinking, not a hang.

**A run can succeed without a preview link.** OpenDesign only builds `previewUrl`
when it treats the output as a valid deliverable, which needs the artifact to
declare an entry file. A run that writes a differently named file can finish as
`succeeded` with no preview. The workspace link still shows what was written.

**pi does not always call the tool.** For a trivial request it may write the HTML
itself, which is reasonable for a handful of lines. Name the tool, or ask for
something substantial, when the branded pipeline matters.

**A design-system override needs a project.** Without one there is nothing to
override.

**Project names can be ambiguous.** OpenDesign creates a backing project for
every installed design system, so a design system named `Acme` and a project
named `acme` can both exist. An exact id is used as given; on a name match the
ordinary project wins, and a genuine tie is an error.

**Runs fail if the network drops.** The model OpenDesign drives may be remote,
and an unstable connection kills the stream mid-run.

## How it works

Most calls go through `od mcp` over stdio JSON-RPC, because that CLI already
resolves both ways the daemon can be reached: HTTP on port 7456 for a source
install, or a POSIX socket under `/tmp/open-design/ipc/` for a packaged one.

Starting a run with a design-system override posts to `/api/runs` directly,
because the MCP `start_run` tool has no `designSystemId` parameter. The daemon
resolves it with the precedence `request > plugin > project > app default`.

No runtime dependencies. The MCP client is a small newline-delimited JSON-RPC
implementation instead of the official SDK.

## License

MIT
