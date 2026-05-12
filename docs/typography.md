# Typography

Font overrides for parts of the workbench UI. All typography settings are static — changes require Apply-and-Reload (no live update yet).

## Modules

- **`workbenchStudio.typography.explorer`** — sidebar tree view fonts (Explorer, Source Control, Search results, Extensions list, Run and Debug).
- **`workbenchStudio.typography.tabs`** — editor tab labels (the file-name text inside each tab).
- **`workbenchStudio.typography.paneTitles`** — pane titles (`EXPLORER`, `OUTLINE`, `TIMELINE`...) AND composite-bar tabs (`CHAT` / `CLAUDE CODE` etc. inside sidebar/panel/auxiliarybar title bars).

Each module shares the same shape: `fontFamily`, `fontSize`, `fontWeight`, `style`.

## `explorer`

`workbenchStudio.typography.explorer`:

| Field        | Type   | Default | Description                                                                       |
|--------------|--------|---------|-----------------------------------------------------------------------------------|
| `fontFamily` | string | `""`    | CSS `font-family` value. Empty string = use VSCode default.                       |
| `fontSize`   | number | `0`     | Pixels. `0` = use VSCode default.                                                 |
| `fontWeight` | string | `""`    | CSS `font-weight` value (e.g. `"100"`–`"900"`, `"normal"`, `"bold"`). Empty = default. |
| `style`      | object | `{}`    | Freeform CSS passthrough — any property/value pair (e.g. `letter-spacing`, `line-height`, `color`). Applied after the typed fields, so duplicate keys here override. |

## Example

```jsonc
"workbenchStudio.typography.explorer": {
  "fontFamily": "\"JetBrains Mono\", monospace",
  "fontSize": 13,
  "fontWeight": "300",
  "style": {
    "letter-spacing": "0.5px",
    "line-height": "1.5"
  }
}
```

## Constraint: row heights vs line-height

VSCode tree views use virtual scrolling with **fixed inline row heights** — each row gets `height: 22px` (or theme-dependent) applied directly. That means:

- `line-height` only affects internal text positioning within the row — it doesn't make rows taller.
- To make rows visibly taller, also override `height` and `min-height` via the `style` passthrough. **But** this breaks scroll-position math in long lists (estimated positions diverge from actual positions). Use carefully.

```jsonc
"style": {
  "height": "32px",
  "min-height": "32px"
}
```

If you don't need taller rows, leave it.

## `tabs`

`workbenchStudio.typography.tabs` — overrides the font of editor tab labels (the file-name text inside each tab). Same shape as `explorer`:

| Field        | Type   | Default | Description                                                      |
|--------------|--------|---------|------------------------------------------------------------------|
| `fontFamily` | string | `""`    | CSS `font-family`. Empty = VSCode default.                       |
| `fontSize`   | number | `0`     | Pixels. `0` = default.                                           |
| `fontWeight` | string | `""`    | CSS `font-weight`. Empty = default.                              |
| `style`      | object | `{}`    | Freeform CSS passthrough applied to the tab label.               |

```jsonc
"workbenchStudio.typography.tabs": {
  "fontFamily": "\"Input Mono\", monospace",
  "fontSize": 12,
  "fontWeight": "500",
  "style": {
    "letter-spacing": "0.3px"
  }
}
```

Selector targets just the label text (`.tab .monaco-icon-label .label-name`), not the whole tab — icons, close buttons, and tab chrome keep their default sizing so the row height and close-button alignment don't reflow.

## `paneTitles`

`workbenchStudio.typography.paneTitles` — overrides the font of pane title text **and** composite-bar tab labels. Same shape as `explorer` / `tabs`.

Targets:

- Pane headers — the `EXPLORER`, `OUTLINE`, `TIMELINE` style labels at the top of each collapsible pane.
- Composite-bar tabs — view-switcher labels like `CHAT` / `CLAUDE CODE` that share a pane's title bar.

| Field        | Type   | Default | Description                                                      |
|--------------|--------|---------|------------------------------------------------------------------|
| `fontFamily` | string | `""`    | CSS `font-family`. Empty = VSCode default.                       |
| `fontSize`   | number | `0`     | Pixels. `0` = default.                                           |
| `fontWeight` | string | `""`    | CSS `font-weight`. Empty = default.                              |
| `style`      | object | `{}`    | Freeform CSS passthrough applied to pane titles and tabs.        |

```jsonc
"workbenchStudio.typography.paneTitles": {
  "fontFamily": "\"Input Mono\", monospace",
  "fontSize": 11,
  "fontWeight": "600",
  "style": {
    "letter-spacing": "1px",
    "text-transform": "uppercase"
  }
}
```

Selectors used: `.pane > .pane-header .title-label`, `.pane > .pane-header h3.title`, `.composite-bar .action-label`.

Both targets share one rule — if you want them styled differently you can split via the `style` passthrough using more specific selectors at the cost of `!important` complexity. Most usage will want the unified look.

## Why this isn't workspace-aware (yet)

Typography is currently baked into the workbench patch at apply time — same channel as the legacy upstream rendering. Switching to live, workspace-aware updates means moving to the same runtime-state + `<link>` injection pattern that backgrounds use. The mechanism is solved (see [src/features/backgrounds/section-loader.ts](../src/features/backgrounds/section-loader.ts)); the typography module just hasn't been ported.

Roadmap: copy the section-loader pattern into a typography loader. Not high priority for a personal fork.

## Webview limitation

VSCode webview iframes (Claude Code chat, Copilot Chat, terminal, embedded HTML panels) are **cross-origin** — parent CSS/JS cannot pierce them. Workbench-studio's font overrides apply to the workbench shell but not to anything inside a webview. To style fonts inside a chat panel, that has to come from the panel's own extension.

For Claude Code chat code-block fonts: `chat.editor.fontFamily` is a (largely undocumented) VSCode setting that the editor honors after a restart. `letter-spacing` on those blocks isn't currently customizable.
