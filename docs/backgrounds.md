# Backgrounds

Workspace-aware background images for 5 workbench sections. Each section has its own settings block under `workbenchStudio.backgrounds.<section>`. Changes apply live (~1.5s after settings.json saves) — no reload required.

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

**`useFront` (editor / sidebar / panel / auxiliarybar — NOT fullscreen):**

| Field      | Type    | Default | Notes                                                                            |
|------------|---------|---------|----------------------------------------------------------------------------------|
| `useFront` | boolean | `true`  | `true` = overlay above content; `false` = render behind. Overridable per-image.  |

**Editor adds:**

| Field            | Type   | Default | Notes                                                                                   |
|------------------|--------|---------|-----------------------------------------------------------------------------------------|
| `minimapOpacity` | number | `0.8`   | Opacity of the editor minimap (scroll preview). `1` = fully opaque; `0` = hidden.       |

**Why fullscreen has no `useFront`.** "Image behind the workbench" requires stripping opaque theme surfaces all the way down to the body. VSCode renders many opaque layers (chrome, panes, lists, tabs, headers) plus webview iframes that the workbench patch can't reach. Stripping just enough to be useful without breaking readability is impossible in practice. See [Dangers](dangers.md#why-fullscreen-has-no-usefront).

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

Supported on editor, sidebar, panel, auxiliarybar. **Not supported on fullscreen** — see [Why fullscreen has no `useFront`](dangers.md#why-fullscreen-has-no-usefront).

`useFront: true` (default) — image painted as an overlay (`::after`, high z-index, low opacity, theme-driven blend mode). Visible *through* the section's content because of the low opacity + screen blend.

`useFront: false` — image moves behind. For editor: pseudo flips to `::before`, image sits behind code. For sidebar/panel/auxiliarybar: pseudo z-index drops to `-1`, opacity defaults to `1`, blend disabled.

Per-image `useFront` overrides apply at rotation time. Inside an `images[]` object set `"useFront": true|false` to flip that specific image.

## Workspace awareness

Background settings resolve per-workspace per-window. Three windows on three different workspaces show three different configurations simultaneously. Settings can live in:

- **User settings** — global default for everyone.
- **Single-folder workspace** — `.vscode/settings.json` overrides user.
- **Multi-root workspace** — the `.code-workspace` file's `"settings": {}` block. Folder-level `.vscode/settings.json` is silently ignored by VSCode for window-scoped settings in multi-root workspaces. (Not our behavior — that's VSCode.)

The extension polls a state file in its install directory every ~1.5s; on settings change, the loader re-renders without a reload.

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

## Live update vs Apply-and-Reload

Background changes are workspace-aware and live (~1.5s). The only exception: enabling/disabling the patcher (`workbenchStudio.enabled`) and typography settings require Apply-and-Reload — VSCode will prompt.
