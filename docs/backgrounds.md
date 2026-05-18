# Backgrounds

Workspace-aware background images for 5 workbench sections. Each section has its own settings block under `workbenchStudio.backgrounds.<section>`. Settings changes require Apply-and-Reload — VSCode will prompt. See [Why settings changes require Apply-and-Reload](dangers.md#why-settings-changes-require-apply-and-reload) for the rationale.

## Sections

| Section        | What it covers                             | Settings key                                |
|----------------|--------------------------------------------|---------------------------------------------|
| `editor`       | The code editor area (per split view)      | `workbenchStudio.backgrounds.editor`        |
| `fullscreen`   | A single image covering the entire window  | `workbenchStudio.backgrounds.fullscreen`    |
| `sidebar`      | The primary sidebar (Explorer, etc.)       | `workbenchStudio.backgrounds.sidebar`       |
| `panel`        | The bottom panel (Terminal, Problems, etc.)| `workbenchStudio.backgrounds.panel`         |
| `auxiliarybar` | The secondary sidebar (right-hand pane)    | `workbenchStudio.backgrounds.auxiliarybar`  |

## Common settings

| Field      | Type                   | Default    | Notes                                                                                  |
|------------|------------------------|------------|----------------------------------------------------------------------------------------|
| `images`   | (string \| object)[]   | `[]`       | Image sources. See [Image sources](#image-sources).                                     |
| `opacity`  | number 0–1             | `0.1`      | Image opacity.                                                                          |
| `size`     | string                 | `"cover"`  | CSS `background-size` (e.g. `"cover"`, `"contain"`, `"300px"`).                         |
| `position` | string                 | `"center"` | CSS `background-position`.                                                              |
| `interval` | number (seconds)       | `0`        | Seconds between rotations. `0` disables rotation.                                       |
| `random`   | boolean                | `false`    | Pick images randomly on initial render and rotation.                                    |
| `style`    | object                 | `{}`       | Freeform CSS applied to all images in this section. (Fullscreen and editor only in schema; the others support it internally — use per-image objects.) |
| `blendMode`| string (enum)          | `""`       | CSS [`mix-blend-mode`](https://developer.mozilla.org/docs/Web/CSS/mix-blend-mode) for this section. Empty = theme default. See [Blend mode](#blend-mode). |

**`useFront` (editor / sidebar / panel / auxiliarybar — NOT fullscreen):**

| Field      | Type    | Default | Notes                                                                            |
|------------|---------|---------|----------------------------------------------------------------------------------|
| `useFront` | boolean | `true`  | `true` = overlay above content; `false` = render behind. Overridable per-image.  |

**Editor adds:**

| Field            | Type   | Default | Notes                                                                                   |
|------------------|--------|---------|-----------------------------------------------------------------------------------------|
| `minimapOpacity` | number | `0.8`   | Opacity of the editor minimap (scroll preview). `1` = fully opaque; `0` = hidden.       |

**Fullscreen `useFront`.** Supported, but with caveats — VSCode renders many opaque layers above the body, so setting `useFront: false` alone makes the image invisible. To actually see the image behind the workbench you must transparentify the surfaces above it via `workbench.colorCustomizations` and/or `workbenchStudio.surfaceOpacity.*`. See [Fullscreen useFront: false](dangers.md#fullscreen-usefront-false) for full guidance.

## Image sources

Each entry in `images[]` is either a string (URL / path / folder) or an object. Objects must have a `background-image` key; everything else becomes a per-image override.

```jsonc
"images": [
    // string forms
    "https://hostname/online.jpg",
    "file:///local/path/img.jpeg",
    "/home/eno/downloads/img.gif",
    "/home/eno/images",                  // folder — auto-expanded to all images inside
    "data:image/*;base64,<base64-data>",

    // object form — per-image overrides win over the section-level `style`
    {
        "background-image": "file:///local/path/other.jpg",
        "opacity": "0.4",
        "background-size": "200px",
        "background-position": "98% 98%"
    },

    // per-image useFront flip — this image renders behind the others
    // (editor / sidebar / panel / auxiliarybar only; NOT fullscreen)
    {
        "background-image": "file:///local/path/behind-slot.jpg",
        "useFront": false
    }
]
```

**Path handling:**

- `file://...` paths and absolute paths are rewritten to `vscode-file://vscode-app/...` (required by the VSCode sandbox).
- Folder paths are glob-expanded to all `svg|png|jpg|jpeg|gif|bmp|webp|mp4|otf|ttf` files inside.
- Empty strings, and objects missing `background-image`, are silently dropped.

**Always-stripped from user style** (across all sections): `pointer-events` and `z-index`. See [Dangers](dangers.md#pointer-events--z-index) for why.

## `useFront` per section

Supported on editor, sidebar, panel, auxiliarybar. **Also supported on fullscreen** with caveats — see [Fullscreen useFront: false](dangers.md#fullscreen-usefront-false).

`useFront: true` (default) — image painted as an overlay (`::after`, high z-index, low opacity, theme-driven blend mode). Visible *through* the section's content because of the low opacity + screen blend.

`useFront: false` — image moves behind. For editor: pseudo flips to `::before`, image sits behind code. For sidebar/panel/auxiliarybar: pseudo z-index drops to `-1`, opacity defaults to `1`, blend disabled.

Per-image `useFront` overrides apply at rotation time. Inside an `images[]` object set `"useFront": true|false` to flip that specific image.

## Blend mode

Every section's image layer is blended into the content beneath it via CSS [`mix-blend-mode`](https://developer.mozilla.org/docs/Web/CSS/mix-blend-mode). By default this is theme-driven (`screen` on dark themes, none on light) — see [Defaults](defaults.md#theme-driven-mix-blend-mode).

`blendMode` (string) on any section overrides that default. Allowed values match the CSS enum:

```text
normal, multiply, screen, overlay, darken, lighten,
color-dodge, color-burn, hard-light, soft-light,
difference, exclusion, hue, saturation, color, luminosity,
plus-darker, plus-lighter
```

Empty string (or unset) = theme default.

**Precedence (high → low):**

1. Per-image `mix-blend-mode` inside an `images[]` object entry
2. Section-level `blendMode`
3. `useFront: false` forces `normal` (editor / sidebar / panel / auxiliarybar — keeps the behind-content wallpaper clean)
4. Theme default (`screen` on dark, none on light)

```jsonc
"workbenchStudio.backgrounds.editor": {
  "blendMode": "soft-light",
  "images": [
    "file:///wall.jpg",
    // this one overrides the section's soft-light just for itself
    { "background-image": "file:///accent.png", "mix-blend-mode": "hard-light" }
  ]
}
```

Applies on Apply-and-Reload along with the rest of the section config.

## Workspace awareness

Background settings resolve per-workspace per-window. Three windows on three different workspaces show three different configurations simultaneously. Settings can live in:

- **User settings** — global default for everyone.
- **Single-folder workspace** — `.vscode/settings.json` overrides user.
- **Multi-root workspace** — the `.code-workspace` file's `"settings": {}` block. Folder-level `.vscode/settings.json` is silently ignored by VSCode for window-scoped settings in multi-root workspaces. (Not our behavior — that's VSCode.)

The extension writes a state file in its install directory on every settings change; each workbench window reads its own workspace's slice once at boot. To pick up a settings change, that window must reload (the extension prompts with "Apply and Reload"). See [Why settings changes require Apply-and-Reload](dangers.md#why-settings-changes-require-apply-and-reload).

## Recipes

### Slot-shuffled image gallery in the editor

```jsonc
"workbenchStudio.backgrounds.editor": {
  "images": ["/path/to/folder-of-images"],
  "interval": 30,
  "random": true,
  "useFront": true,
  "style": { "opacity": 0.6 }
}
```

### Per-image styling without managing parallel arrays

```jsonc
"workbenchStudio.backgrounds.editor": {
  "images": [
    { "background-image": "file:///a.png", "opacity": "0.8", "background-size": "300px" },
    { "background-image": "file:///b.png", "opacity": "0.4", "background-size": "200px" },
    { "background-image": "file:///c.png", "useFront": false }
  ],
  "interval": 0
}
```

Each entry carries its own overrides; no need to keep a separate `styles[]` array index-aligned.

## Apply-and-Reload

All `workbenchStudio.*` changes require Apply-and-Reload — VSCode will prompt in every open window when settings change. Each window reloads independently. See [Why settings changes require Apply-and-Reload](dangers.md#why-settings-changes-require-apply-and-reload) for the history.
