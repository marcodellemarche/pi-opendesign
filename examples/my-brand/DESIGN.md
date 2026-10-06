---
version: alpha
name: My Brand
description: "A dark-first product canvas built around #0e0e15, white text, and a single electric blue accent (#0065ff). Surfaces lift by one step (#1a1a20) and depth comes from hairline borders instead of shadows. One sans-serif family carries both display and body type. The accent is reserved for primary actions and one focal element per screen."

colors:
  accent: "#0065ff"
  on-accent: "#ffffff"
  accent-hover: "#005ce8"
  accent-focus: "#0048b5"
  accent-soft: "#0065ff26"
  ink: "#ffffff"
  ink-muted: "#ffffff99"
  ink-subtle: "#ffffff73"
  ink-tertiary: "#ffffff4d"
  canvas: "#0e0e15"
  surface-1: "#1a1a20"
  surface-2: "#22222a"
  hairline: "#ffffff4d"
  hairline-soft: "#ffffff1a"
  inverse-canvas: "#ffffff"
  inverse-ink: "#0e0e15"
  semantic-success: "#26ab75"
  semantic-warning: "#ffb74d"
  semantic-danger: "#e56363"

typography:
  display-lg:
    fontFamily: Figtree
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1.10
    letterSpacing: -0.5px
  display-md:
    fontFamily: Figtree
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.10
    letterSpacing: -0.5px
  headline:
    fontFamily: Figtree
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.20
    letterSpacing: -0.5px
  card-title:
    fontFamily: Figtree
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.20
    letterSpacing: -0.5px
  body-lg:
    fontFamily: Figtree
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.30
    letterSpacing: -0.08px
  body:
    fontFamily: Figtree
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.30
    letterSpacing: -0.14px
  caption:
    fontFamily: Figtree
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.30
    letterSpacing: 0
  label:
    fontFamily: Figtree
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.30
    letterSpacing: 0.14px
  eyebrow:
    fontFamily: Figtree
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.30
    letterSpacing: 0.14px
  mono:
    fontFamily: ui-monospace
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px

rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  pill: 9999px

components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 0px 16px
    height: 36px
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  button-primary-pressed:
    backgroundColor: "{colors.accent-focus}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  button-secondary:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 0px 16px
    height: 36px
  button-ghost:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 0px 16px
    height: 36px
  button-disabled:
    backgroundColor: "{colors.hairline-soft}"
    textColor: "{colors.ink-tertiary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  card-metric:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.display-md}"
    rounded: "{rounded.lg}"
    padding: 24px
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: 0px 12px
    height: 36px
  input-focus:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
  chip:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 0px 12px
    height: 28px
  table-header:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.xs}"
  navigation-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
---

## Overview

A dark-first product surface for dense, technical interfaces. The canvas is
near-black instead of pure black, and containers lift by one barely visible
step. Depth comes from hairline borders, not shadows, which keeps the interface
reading as instrumentation instead of as a consumer page.

The palette is deliberately narrow: white at several opacities, plus one blue.
That restraint is the point. If everything is emphasised, nothing is.

## Colors

### Accent

- **Accent** ({colors.accent}): The only chromatic colour in the interface.
  Primary buttons, the active navigation state, and one focal element per
  screen. Nothing else.
- **Accent Hover** ({colors.accent-hover}): Hovered primary buttons.
- **Accent Focus** ({colors.accent-focus}): Pressed primary buttons.
- **Accent Soft** ({colors.accent-soft}): A translucent wash, 15% of the accent.
  Used for selected rows and the secondary button, where a solid fill would be
  too loud.

### Surface

- **Canvas** ({colors.canvas}): The page background. Never pure black.
- **Surface 1** ({colors.surface-1}): Cards and panels, one step above canvas.
- **Surface 2** ({colors.surface-2}): Hovered cards, and menus that float above
  other surfaces.
- **Inverse Canvas** ({colors.inverse-canvas}): White, for the rare inverted
  band. Use sparingly, since the system is dark by default.

### Text

Text is white at four opacities instead of four greys. The difference matters
on the lifted surfaces, where an opaque grey reads as muddy and an alpha
composites correctly.

- **Ink** ({colors.ink}): Headings and body copy.
- **Ink Muted** ({colors.ink-muted}): Secondary text, 60% white.
- **Ink Subtle** ({colors.ink-subtle}): Labels and metadata, 45% white.
- **Ink Tertiary** ({colors.ink-tertiary}): Disabled text, 30% white. Below the
  contrast floor for body copy, so use it for disabled states only.

### Borders

- **Hairline** ({colors.hairline}): 1px borders on inputs and card edges.
- **Hairline Soft** ({colors.hairline-soft}): Row separators inside a card,
  where a full-strength border would be too heavy.

### Semantic

- **Success** ({colors.semantic-success}), **Warning**
  ({colors.semantic-warning}), **Danger** ({colors.semantic-danger}): Reserved
  for state. Always paired with a label or an icon, never colour alone.

## Typography

One family, Figtree, for everything. Headings are semibold and body text is
regular; there is no second face and no serif.

Display sizes carry a constant -0.5px tracking, which is tight at small sizes.
Keep it, since it is part of how the brand reads.

| Step | Size | Weight | Use |
| --- | --- | --- | --- |
| display-lg | 40px | 600 | Page titles |
| display-md | 32px | 600 | Section titles, metric values |
| headline | 24px | 600 | Card group headings |
| card-title | 16px | 600 | Card headings |
| body-lg | 16px | 400 | Lead paragraphs |
| body | 14px | 400 | Default body text |
| caption | 12px | 400 | Metadata, helper text |
| label | 14px | 500 | Buttons and form labels |
| eyebrow | 12px | 500 | Uppercase section labels |

## Layout

A 4px base unit. The named steps are 4, 8, 12, 16, 24, 32, 48 and 80.

Product screens are full width with a persistent sidebar, not centred columns.
Content inside the sidebar tops out around 1440px. Gutters step 24px on desktop,
16px on tablet, 12px on phone.

Section rhythm is 80px on desktop, 48px on tablet and 32px on phone.

## Elevation & Depth

There are three levels, and the middle one does most of the work.

- **Flat**: The canvas and everything sitting directly on it.
- **Ring**: A 1px hairline. This is the default way to separate a card from the
  page.
- **Raised**: A soft shadow, reserved for menus, dialogs and anything that
  genuinely floats above the layout.

Do not add a fourth level. Do not put a blur shadow on a card that is part of
the page flow.

## Shapes

Controls use an 8px radius. Cards and panels use 12px, or 16px for large
containers. Chips and avatars are fully rounded.

The pill radius is for chips and avatars only. It is not a button or card shape.

## Components

Button variants: primary (solid accent), secondary (translucent accent wash),
ghost (transparent until hover), and disabled (a hairline-soft fill with
tertiary text). Every variant has a visible focus ring.

Inputs sit on the canvas instead of on a lifted surface, with a hairline border
that turns accent-coloured on focus.

Cards use Surface 1 with a soft hairline border and no shadow. A metric card
differs only in that its value uses the display-md step.

The active navigation item is marked with an accent-soft fill, not a solid
accent block.

## Do's and Don'ts

**Do**

- Use the accent for one thing per screen. If two elements compete, one of them
  is wrong.
- Separate cards from the page with a hairline border.
- Keep text tiers as white at reduced opacity, so they composite correctly over
  lifted surfaces.
- Give every interactive element a visible focus state.

**Don't**

- Don't use pure black or pure white as a surface.
- Don't add drop shadows to cards in the page flow.
- Don't introduce a second typeface, or a serif display pairing.
- Don't flatten the text ramp to opaque greys.
- Don't use the pill radius on cards or buttons.
- Don't use tertiary text for anything except disabled states.

## Responsive Behavior

Breakpoints are 640px, 1024px and 1440px.

Below 1024px the sidebar collapses to icons, and below 640px it becomes a
bottom bar. Tables switch to stacked rows with the header repeated per row.
Touch targets stay at least 44px.

## Iteration Guide

When changing this system, keep `DESIGN.md` and any compiled token file in
agreement. If a colour or a type step changes here, it changes in both.

Add a token only when a second component needs the same value. Values used once
belong inline in that component.

## Known Gaps

The mono stack is a substitute. There is no first-party monospace face, so
`ui-monospace` is used and may render differently across platforms.

No light theme is defined. The system is dark by default, and the inverse canvas
covers the rare case where a light band is needed.
