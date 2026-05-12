# Workbench Studio

VSCode design customizations: workspace-aware backgrounds, typography overrides, surface transparency, and a fullscreen-as-wallpaper mode.

A fork of [shalldie/vscode-background](https://github.com/shalldie/vscode-background) — see [Acknowledgements](#acknowledgements).

## What this fork adds

- **Workspace-aware backgrounds** for editor, fullscreen, sidebar, panel, and auxiliary bar — different config per window, live updates without reload.
- **Per-image overrides.** Mix strings and objects in a single `images[]`; each object can carry CSS overrides (opacity, size, position) plus a per-image `useFront` flip.
- **Surface opacity** per section (editor / sidebar / panel / auxiliarybar) — continuous 0–1 blending of theme color with transparent for sections that have their own background images.
- **Typography overrides** for sidebar tree views, editor tab labels, and pane titles. Family / size / weight / freeform CSS.
- **Raw CSS injection** via `workbenchStudio.css` — power-user escape hatch for anything the typed modules don't cover. Workspace-aware, live update.

## Status

Personal fork. Not on the marketplace. Install from a built `.vsix`.

## Install

```bash
npm install
npm run package
code --uninstall-extension eno.workbench-studio
code --install-extension build/workbench-studio-0.1.0.vsix
```

Then in VSCode: `> Workbench Studio: Enable and apply Workbench Studio`. Reload when prompted.

To remove: `> Workbench Studio: Uninstall the extension` (the extension's uninstall hook restores `workbench.desktop.main.js`).

`--force` is unreliable for same-version vsix builds; uninstall+install is the safe path during dev iteration.

## Documentation

Full reference docs live in [`docs/`](docs/). Open from inside VSCode via `> Workbench Studio: Open Documentation` (QuickPick), or browse here:

- **[Welcome](docs/welcome.md)** — overview, quickstart, links.
- **[Backgrounds](docs/backgrounds.md)** — every section's settings, image source forms, per-image overrides, useFront, recipes.
- **[Typography](docs/typography.md)** — explorer / tabs / pane-titles font controls.
- **[Custom CSS](docs/css.md)** — `workbenchStudio.css` raw-injection escape hatch.
- **[Defaults](docs/defaults.md)** — what's auto-applied, where, and how to override each item.
- **[Dangers](docs/dangers.md)** — footguns, recovery procedures, the nuclear option.

## Quick start

```jsonc
{
  "workbenchStudio.enabled": true,

  "workbenchStudio.backgrounds.fullscreen": {
    "images": ["file:///path/to/wallpaper.png"],
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

Backgrounds update live (~1.5s after settings.json save). Typography and `workbenchStudio.enabled` need Apply-and-Reload — the extension will prompt.

## Commands

| Command                                            | Title                                                  |
|----------------------------------------------------|--------------------------------------------------------|
| `extension.workbenchStudio.install`                | Workbench Studio: Enable and apply Workbench Studio    |
| `extension.workbenchStudio.disable`                | Workbench Studio: Disable Workbench Studio             |
| `extension.workbenchStudio.uninstall`              | Workbench Studio: Uninstall the extension              |
| `extension.workbenchStudio.info`                   | Workbench Studio: Welcome                              |
| `extension.workbenchStudio.openDocs`               | Workbench Studio: Open Documentation                   |
| `extension.workbenchStudio.previewPatch`           | Workbench Studio: [Dev] Preview Patch                  |

## Architecture sketch

The extension modifies VSCode's `workbench.desktop.main.js` at activation time, injecting CSS and JS that run at workbench bootstrap. For workspace-aware sections, a runtime `<link>` tag reads per-workspace state from `runtime-state.css` (in the extension install dir) and a polling loop keeps the rendered styles in sync with settings — no reload required for backgrounds.

See [.claude/CLAUDE.md](.claude/CLAUDE.md) for deeper architecture context (intended for code-assistant tools but readable).

## Acknowledgements

This project is a fork of [shalldie/vscode-background](https://github.com/shalldie/vscode-background). The original extension's image-injection mechanism and patch-detection markers are preserved. The fork pivoted toward general workbench design customization and substantially rewrote the runtime to be workspace-aware.

License: MIT (same as upstream).
