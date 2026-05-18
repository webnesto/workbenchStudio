# Custom CSS

Two complementary settings for raw CSS injection into the workbench:

- **`workbenchStudio.css`** — inline CSS as a string or array of strings.
- **`workbenchStudio.cssFiles`** — path(s) to `.css` files on disk.

Both contribute to the final injected CSS (their contents are concatenated, file content last). Workspace-aware: changes require Apply-and-Reload — VSCode will prompt on `workbenchStudio.css` edits. Saving an external `.css` file rewrites the runtime state file silently but **does not currently prompt for reload**; reload manually for those changes to apply. See [Why settings changes require Apply-and-Reload](dangers.md#why-settings-changes-require-apply-and-reload).

Power-user escape hatch for when the typed feature modules (backgrounds, typography, surfaceOpacity) don't cover what you need.

## Inline shape (`workbenchStudio.css`)

Either a string or an array of strings:

```jsonc
// String form
"workbenchStudio.css": ".composite > .title h2 { font-family: 'Whatever'; }"
```

```jsonc
// Array form (multi-line ergonomics; entries are joined with newline)
"workbenchStudio.css": [
  ".composite > .title h2 { font-family: 'Whatever'; }",
  ".pane-header { letter-spacing: 1px; }",
  ".monaco-list-row.focused { outline: 1px solid red; }"
]
```

## File shape (`workbenchStudio.cssFiles`)

```jsonc
// Single file
"workbenchStudio.cssFiles": "~/dotfiles/vscode/workbench.css"
```

```jsonc
// Array
"workbenchStudio.cssFiles": [
  "~/dotfiles/vscode/workbench.css",
  "/usr/local/share/themes/extras.css",
  ".vscode/workbench.css"          // resolved relative to first workspace folder
]
```

Accepted path forms:

- `file://...` URI
- `~/...` home-relative
- Absolute (`/usr/...`, `C:\...`)
- Relative — resolved against the **first workspace folder**

Missing or unreadable files contribute the empty string (no surfaced error — they may be created later). `fs.watch` is registered for each path; on save the extension rewrites its runtime state file, but the in-window loader only reads it at workbench boot — reload the window to pick up the change.

The value is applied verbatim into a managed `<style>` tag in the document head. No validation, no sanitization, no selector rewriting — what you write is what runs.

## Use cases this unlocks

- Targeting workbench elements that don't have a typed module yet
- Tweaking individual buttons, icons, scrollbars
- Adding outlines / debug markers while iterating
- Overriding theme colors at specific selectors

## What it can't do

- Reach into webview iframes (Claude Code chat, terminal, Copilot Chat, etc.) — cross-origin wall, same as all workbench-studio CSS. See [Typography → Webview limitation](typography.md#webview-limitation).
- Override settings that are baked into VSCode's compiled JS (editor render, keybindings, etc.).

## Relationship to typed modules

The typed feature modules (`backgrounds.*`, `typography.*`, `surfaceOpacity.*`) wrap common patterns ergonomically. Raw CSS is the escape hatch for anything not covered.

Order of CSS application in the workbench:

1. VSCode's own theme CSS
2. Workbench Studio's static scaffolds (typography modules, surface opacity, backgrounds image positioning)
3. Workbench Studio's runtime-state-driven rules (per-image backgrounds, per-section surface opacity values)
4. **Custom CSS (this module)** — injected last, so by source order it wins ties

`!important` interactions still follow CSS rules: an `!important` rule from your custom CSS beats a non-`!important` rule from a typed module; an `!important` rule from a typed module needs another `!important` to override.

## Recovery if you lock yourself out

CSS that hides the Command Palette, disables clicks, or makes settings unreadable can leave you unable to fix it from the same window. Recovery paths:

1. **Open `settings.json` from another VSCode window** — workspaces with workbench-studio settings stored in user-level `settings.json` are editable from any window. Empty out `workbenchStudio.css` and save. The locked window will get an "Apply and Reload" toast — click it to recover.
2. **Open settings.json from the terminal** — `code ~/Library/Application\ Support/Code/User/settings.json` (macOS) — edit and save. The locked window will get an "Apply and Reload" toast.
3. **Disable the extension** — Command Palette → `Workbench Studio: Disable Workbench Studio` if the palette is still reachable. Or use `code --disable-extension eno.workbench-studio` from a terminal.
4. **Nuclear option** — see [Dangers → Recovery: nuclear option](dangers.md#recovery-nuclear-option).

## Example: extending the explorer pane title typography

If `typography.paneTitles` doesn't reach a specific title-bar variant, you can target it directly:

```jsonc
"workbenchStudio.css": [
  ".monaco-workbench .pane-composite-part > .title > h2 { font-size: 14px !important; letter-spacing: 0.5px !important; }",
  ".monaco-workbench .composite > .title-actions h2 { font-weight: 200 !important; }"
]
```
