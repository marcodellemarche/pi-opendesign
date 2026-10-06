# Example design system

A minimal, working design system in the [DESIGN.md][spec] format. Two files:

```
my-brand/
├── DESIGN.md      the design system
└── metadata.json  { "status": "published" }
```

Copy the folder into OpenDesign's user design-system directory and it appears in
the picker:

```bash
cp -r examples/my-brand ~/open-design/.od/design-systems/my-brand
```

Or push the folder to a repository of the same name and install it:

```bash
curl -s -X POST http://127.0.0.1:7456/api/design-systems/install \
  -H 'content-type: application/json' \
  -d '{"source":"github","url":"https://github.com/you/my-brand"}'
```

Then point a run at it:

```text
/od-config designSystem user:my-brand
```

`metadata.json` carries `"status": "published"` and nothing else. It is not
optional in practice: without it a design system defaults to `draft`, and a
draft is skipped at run time with no error, so the artifact comes back in the
default style and nothing says why.

[spec]: https://stitch.withgoogle.com/docs/design-md/specification/

## What the format looks like

The file has two parts.

**YAML frontmatter** holds the raw values, so an agent can read exact colours and
sizes without parsing prose:

```yaml
colors:
  accent: "#0065ff"
  canvas: "#0e0e15"

typography:
  display-lg:
    fontFamily: Figtree
    fontSize: 40px
    fontWeight: 600

rounded:
  sm: 8px
```

Components reference those values by path instead of repeating them:

```yaml
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
```

**Prose sections** carry the rules an agent cannot infer from the values: which
colour is reserved for what, what not to do, how layout collapses.

## Required sections

These are the section names the format uses. `Overview`, `Colors`,
`Typography`, `Layout`, `Components` and `Do's and Don'ts` appear in
essentially every published example.

| Section | Contents |
| --- | --- |
| `## Overview` | Mood, density, what the system is and is not |
| `## Colors` | Each role, its value, and where it is allowed |
| `## Typography` | Families, the full scale, where each step is used |
| `## Layout` | Spacing scale, grid, container widths, section rhythm |
| `## Elevation & Depth` | How surfaces separate, and which level is default |
| `## Shapes` | Corner radii and where each applies |
| `## Components` | Buttons, inputs, cards, navigation, with states |
| `## Do's and Don'ts` | The mistakes an agent would otherwise make |
| `## Responsive Behavior` | Breakpoints and how layout collapses |
| `## Iteration Guide` | Rules for changing the system later |
| `## Known Gaps` | Substitutions and omissions, stated plainly |

## More examples

[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
has 74 files in this format, extracted from real products, including Linear,
Stripe, Vercel, Figma and IBM. Any of them works as-is.
