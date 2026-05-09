# Workbench Studio

Welcome to `Workbench Studio@${VERSION}`.

A fork of [shalldie/vscode-background](https://github.com/shalldie/vscode-background) — see the [README](https://github.com/shalldie/vscode-background) for the full settings reference and acknowledgements.

## Quick start

All settings live under `workbenchStudio.*`. Examples:

```jsonc
{
  "workbenchStudio.enabled": true,

  "workbenchStudio.backgrounds.fullscreen": {
    "images": ["file:///path/to/image.png"],
    "opacity": 0.15,
    "interval": 0
  },

  "workbenchStudio.backgrounds.editor": {
    "images": ["file:///path/to/editor.png"],
    "useFront": true,
    "interval": 30,
    "random": true
  },

  "workbenchStudio.typography.explorer": {
    "fontFamily": "\"JetBrains Mono\", monospace",
    "fontSize": 13
  }
}
```

## Workspace awareness

Backgrounds resolve per-workspace per-window — open multiple windows on different workspaces and each shows its own configuration simultaneously. Settings can live in user, single-folder `.vscode/settings.json`, or a `.code-workspace` file's `"settings"` block.

Background updates apply live (~1.5s after save). Typography and `enabled` changes still need an Apply-and-Reload — the extension will prompt.

## Image sources

```jsonc
"images": [
    "https://hostname/online.jpg",
    "file:///local/path/img.jpeg",
    "/home/xie/downloads/img.gif",
    "C:/Users/xie/img.bmp",
    "D:\\downloads\\images\\img.webp",
    "/home/xie/images",
    "data:image/*;base64,<base64-data>"
]
```

## Quick command access

The status bar shows `$(symbol-color) Studio` — click to open the command palette filtered to Workbench Studio commands.
