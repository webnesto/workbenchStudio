# Workbench Studio

Welcome to `Workbench Studio@${VERSION}` — a fork of [shalldie/vscode-background](https://github.com/shalldie/vscode-background), rewritten as a general VSCode workbench customization tool.

## What's in this version

- **Workspace-aware backgrounds** for 5 sections (editor, fullscreen, sidebar, panel, auxiliary bar). Per-image overrides.
- **Typography** overrides for sidebar tree views.
- **Surface opacity** per section (editor / sidebar / panel / auxiliarybar) — continuous 0–1 blending of theme color with transparent so per-section background images can show through.

## Quick start

```jsonc
{
  "workbenchStudio.enabled": true,

  "workbenchStudio.backgrounds.fullscreen": {
    "images": ["file:///path/to/image.png"],
    "opacity": 0.15
  },

  "workbenchStudio.backgrounds.editor": {
    "images": ["file:///path/to/editor.png"],
    "interval": 30,
    "random": true
  },

  "workbenchStudio.typography.explorer": {
    "fontFamily": "\"JetBrains Mono\", monospace",
    "fontSize": 13
  }
}
```

All `workbenchStudio.*` settings need Apply-and-Reload — you'll be prompted in every open window when settings change. See [Why settings changes require Apply-and-Reload](dangers.md#why-settings-changes-require-apply-and-reload).

## More documentation

Open from the Command Palette:

- `Workbench Studio: Open Documentation` — pick from Backgrounds, Typography, Defaults, or Dangers.

Or browse the docs directly:

- **[Backgrounds](backgrounds.md)** — full reference for all 5 image sections, per-image overrides, `useFront`, recipes.
- **[Typography](typography.md)** — pane fonts (explorer, tabs, pane titles).
- **[Custom CSS](css.md)** — `workbenchStudio.css` raw-injection escape hatch.
- **[Defaults](defaults.md)** — what gets auto-applied and how to override.
- **[Dangers](dangers.md)** — footguns and how to recover.

## Quick command access

The status bar shows `$(symbol-color) Studio` — click to open the Command Palette filtered to Workbench Studio commands.
