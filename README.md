# Workbench Studio

VSCode design customizations: workspace-aware backgrounds, typography overrides, and more.

A fork of [shalldie/vscode-background](https://github.com/shalldie/vscode-background) — see [Acknowledgements](#acknowledgements).

What this fork adds:

- **Per-workspace backgrounds.** Each window can show a different configuration for its workspace, simultaneously, without restart.
- **Workspace-aware live updates.** Most settings apply within ~1.5s of save — no Apply-and-Reload.
- **`style` passthrough on fullscreen.** Arbitrary CSS (including freeform opacity), the upstream feature this fork was originally created for.
- **Typography overrides for sidebar tree views.** Font family, size, weight, and freeform CSS for explorer / source control / search / extensions / debug panes.

## Status

Personal fork. Not on the marketplace. Install from a built `.vsix`.

## Install

```bash
npm install
npm run package
code --install-extension workbench-studio-0.1.0.vsix --force
```

Then in VSCode: `> Workbench Studio: Enable and apply Workbench Studio`. Reload when prompted.

To remove cleanly: `> Workbench Studio: Uninstall the extension` (the extension's uninstall hook restores `workbench.desktop.main.js`).

## Settings

All settings live under `workbenchStudio.*`.

### Top level

| Setting                   | Type    | Default | Description                                  |
|---------------------------|---------|---------|----------------------------------------------|
| `workbenchStudio.enabled` | boolean | `true`  | Whether the patcher is active.               |

### Backgrounds

`workbenchStudio.backgrounds.editor`:

| Field      | Type     | Default      | Description                                       |
|------------|----------|--------------|---------------------------------------------------|
| `useFront` | boolean  | `true`       | Place image above (`::after`) or below the code.  |
| `style`    | object   | `{}`         | CSS applied to all images.                        |
| `styles`   | object[] | `[{},{},{}]` | Per-image CSS (indexed by editor slot).           |
| `images`   | string[] | `[]`         | Image sources (see below).                        |
| `interval` | number   | `0`          | Seconds between rotations. `0` disables.          |
| `random`   | boolean  | `false`      | Pick random images on initial load and rotation.  |

`workbenchStudio.backgrounds.fullscreen` / `.sidebar` / `.panel` / `.auxiliarybar`:

| Field      | Type     | Default     | Description                                  |
|------------|----------|-------------|----------------------------------------------|
| `images`   | string[] | `[]`        | Image sources.                               |
| `opacity`  | number   | `0.1`       | `0.0`–`1.0`.                                 |
| `size`     | string   | `"cover"`   | CSS `background-size`.                       |
| `position` | string   | `"center"`  | CSS `background-position`.                   |
| `interval` | number   | `0`         | Seconds between rotations. `0` disables.     |
| `random`   | boolean  | `false`     | Random rotation order.                       |
| `style`    | object   | `{}`        | (fullscreen only) freeform CSS passthrough.  |

#### Image sources

```jsonc
"images": [
    "https://hostname/online.jpg",
    "file:///local/path/img.jpeg",
    "/home/xie/downloads/img.gif",
    "C:/Users/xie/img.bmp",
    "D:\\downloads\\images\\img.webp",
    "/home/xie/images",                  // folder — picks up all images inside
    "data:image/*;base64,<base64-data>"
]
```

#### Workspace awareness

Background settings resolve per-workspace per-window. Open three windows on three different workspaces and each shows its own configuration at the same time.

Where to put settings:

- **User settings** (`~/Library/Application Support/Code/User/settings.json` on macOS) — global default.
- **Single-folder workspace**: `.vscode/settings.json` overrides user.
- **Multi-root workspace**: the `.code-workspace` file's `"settings": {}` block (folder-level `settings.json` is silently ignored for window-scoped settings in multi-root).

Updates apply live for backgrounds — no reload needed.

### Typography

`workbenchStudio.typography.explorer` — overrides the font of all sidebar tree views (explorer, source control, search results, extensions, run-and-debug).

| Field        | Type   | Default | Description                                          |
|--------------|--------|---------|------------------------------------------------------|
| `fontFamily` | string | `""`    | CSS `font-family`. Empty = use VSCode default.       |
| `fontSize`   | number | `0`     | Pixels. `0` = use VSCode default.                    |
| `fontWeight` | string | `""`    | CSS `font-weight` value. Empty = default.            |
| `style`      | object | `{}`    | Freeform CSS passthrough (any property/value pairs). |

Typography is **not** workspace-aware in this version — changes require Apply-and-Reload.

Note: VSCode's tree views use virtual scrolling with fixed inline row heights (`height: 22px` set per-row by JS). `line-height` only affects internal text positioning, not the row's outer height. To make rows visibly taller, also override `height`/`min-height` via the `style` passthrough — at the cost of slight scroll-position drift in long lists.

## Commands

| Command                                  | Title                              |
|------------------------------------------|------------------------------------|
| `extension.workbenchStudio.info`         | Welcome to Workbench Studio.       |
| `extension.workbenchStudio.install`      | Enable and apply Workbench Studio. |
| `extension.workbenchStudio.disable`      | Disable Workbench Studio.          |
| `extension.workbenchStudio.uninstall`    | Uninstall the extension.           |
| `extension.workbenchStudio.previewPatch` | [Dev] Preview Patch                |

The status bar shows `$(symbol-color) Studio` — click it to open the command palette filtered to Workbench Studio commands.

## How it works

The extension modifies VSCode's `workbench.desktop.main.js` at activation time, injecting CSS and JS that run at workbench bootstrap. For workspace-aware sections, a runtime `<link>` tag reads per-workspace state from `runtime-state.css` (in the extension install dir) and a polling loop keeps the rendered styles in sync with settings — no reload required for backgrounds.

VSCode will warn that the installation is corrupted after patching. That's expected; the patch suppresses the toast. `> Workbench Studio: [Dev] Preview Patch` shows the actual JS being injected if you want to inspect it.

## Acknowledgements

This is a fork of [shalldie/vscode-background](https://github.com/shalldie/vscode-background) ([MIT](https://github.com/shalldie/vscode-background/blob/master/LICENSE.txt)). All credit for the original patching mechanism, multi-section config, and bulk of the implementation belongs to **shalldie** and the upstream contributors.

This fork is unaffiliated with the upstream project and is not endorsed by them. **Do not file fork-specific bugs upstream** — file them on this repo. The upstream extension remains the right choice if you only need global background images.

## License

MIT.
