# Defaults

What Workbench Studio applies automatically when active — and how to override (or work around) each item.

## Image-path processing (mandatory, not user-overridable)

Applied in [src/core/patches/base.ts](../src/core/patches/base.ts):

- `file://...` paths and absolute paths → rewritten to `vscode-file://vscode-app/...`. Required by VSCode's sandbox; without the rewrite the protocol handler refuses to serve the image.
- Folder paths → glob-expanded to all `svg|png|jpg|jpeg|gif|bmp|webp|mp4|otf|ttf` files inside.
- Empty strings, and objects in `images[]` missing `background-image`, are silently dropped.

You can't disable any of these. They're load-bearing.

## Theme-driven `mix-blend-mode`

Set in [src/core/patches/theme.ts](../src/core/patches/theme.ts):

- Dark theme: `mix-blend-mode: screen` auto-applied to every section's image layer.
- Light theme: `mix-blend-mode: unset`.

This is what makes images visible *through* the content at low opacity in dark themes — `screen` blends pixel values rather than overlaying.

**Override precedence (high → low):**

1. Per-image `mix-blend-mode` inside an `images[]` object entry (wins for that image only).
2. Section-level `workbenchStudio.backgrounds.<section>.blendMode` — typed knob with an enum of valid CSS blend keywords (`normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity`, `plus-darker`, `plus-lighter`). Empty / unset falls through to the next rule.
3. `useFront: false` (editor / sidebar / panel / auxiliarybar): the loader forces `mix-blend-mode: normal` so the behind-content image renders cleanly without theme-blend distortion.
4. Theme default above.

All four paths live-update (~1.5s) — no Apply-and-Reload. See [Blend mode](backgrounds.md#blend-mode) for examples.

## Always-stripped CSS keys

Regardless of section, regardless of `useFront`, two keys are silently dropped from user style and per-image override objects:

- `pointer-events`
- `z-index`

Why: see [Dangers](dangers.md#pointer-events--z-index). Short version: setting `pointer-events: auto` can lock you out of your editor; `z-index` exposes nothing useful since you don't have access to other elements' stacking context.

**Workaround**: there isn't one via this extension. Use a separate Custom CSS extension if you really need it.

## Editor scaffolding

In [src/features/backgrounds/editor.ts](../src/features/backgrounds/editor.ts):

### `.minimap { opacity: <minimapOpacity> }`

Editor's minimap (the scroll-thumb preview on the right) is dimmed by default to `0.8` so a background image can show through.

**Override**: `workbenchStudio.backgrounds.editor.minimapOpacity` (number 0–1). `1` keeps it fully opaque; `0` hides it.

### `.monaco-editor-background { background-color: color-mix(...) }`

The editor's own backdrop is blended with `transparent` using `--bg-surface-editor-opacity`. With opacity `0` it's effectively stripped (preserves the original "always strip" behavior); with opacity `1` it's full theme color.

**Override**: `workbenchStudio.surfaceOpacity.editor` (number 0–1). See [smart defaults](#surfaceopacity-smart-defaults) below.

### Per-image rule scaffold

For each image in `editor.images`, the loader emits a CSS rule scoped to a `:nth-child` slot index. Hardcoded properties: `content`, `width`, `height`, `position`, `transition: 0.3s`, `background-repeat: no-repeat`, plus z-index/pointer-events derived from the effective per-image `useFront`.

**Override**: anything in your section-level `style` or in a per-image override object wins (it appears after the hardcoded props), except the two always-stripped keys.

## Fullscreen / sidebar / panel / auxiliarybar scaffolding

Each section gets a `::after` pseudo on its container with hardcoded `position`, z-index, `pointer-events: none`, `transition`, `mix-blend-mode`. Plus a section-background `color-mix` rule using `--bg-surface-<section>-opacity`.

When `useFront: false` (editor / sidebar / panel / auxiliarybar): the loader flips z-index to `-1`, defaults `opacity` to `1`, and disables the blend. Not supported on fullscreen — see [Dangers](dangers.md#why-fullscreen-has-no-usefront).

**Override**: per-image objects with `!important` rules override the scaffold. Section-level `style` (fullscreen only) does the same.

## `surfaceOpacity` smart defaults

`workbenchStudio.surfaceOpacity.{editor,sidebar,panel,auxiliarybar}` is a number 0–1 per section. Smart defaults resolve when you haven't set the key explicitly:

1. **Section has its own background images** → defaults to `0` (transparent — preserves the strip behavior so the section's image is visible).
2. **Otherwise** → defaults to `1` (VSCode theme color, no transparency, no change from stock VSCode).

Explicit user values always win.

Resolved in [src/core/Studio.ts](../src/core/Studio.ts) `resolveSurfaceOpacities()`. The result is written to the runtime state file alongside each section's config so the loaders can pick it up on every poll.

## Patcher-level defaults

- **Checksums patch** — VSCode normally complains "Your VSCode installation appears to be corrupt" when its core files are modified. Workbench Studio patches the checksum table to suppress that warning. Mandatory; you can't opt out individually. Disable by setting `workbenchStudio.enabled: false` (which uninstalls the entire patch).

- **Patch markers** — `vscode-background-start/end` (outer, preserved from upstream for backward-compatible detection) and `workbenchStudio.ver.<VERSION>` (inner, ours). The extension uses these to detect and update its own patch on startup.

## Summary table

| Default                        | Configurable?         | How                                                              |
|--------------------------------|-----------------------|------------------------------------------------------------------|
| `vscode-file://` URL rewrite   | No                    | Mandatory (sandbox).                                             |
| Folder glob expansion          | No                    | Mandatory.                                                       |
| `pointer-events` strip         | No                    | Footgun protection.                                              |
| `z-index` strip                | No                    | Footgun protection.                                              |
| Theme `mix-blend-mode`         | Yes (knob)            | `backgrounds.<section>.blendMode` or per-image `mix-blend-mode`. |
| Editor `.minimap` opacity      | Yes (knob)            | `backgrounds.editor.minimapOpacity`.                             |
| Editor surface opacity         | Yes (knob)            | `surfaceOpacity.editor`.                                         |
| Pane surface opacity           | Yes (knob)            | `surfaceOpacity.{sidebar,panel,auxiliarybar}`.                   |
| Per-section `useFront`         | Yes (not fullscreen)  | `backgrounds.<section>.useFront`.                                |
| Per-image `useFront`           | Yes (not fullscreen)  | Inside `images[]` object: `"useFront": true` or `false`.         |
| Per-section image rotation     | Yes                   | `interval` + `random`.                                           |
| Checksums patch                | All-or-nothing        | `workbenchStudio.enabled`.                                       |
