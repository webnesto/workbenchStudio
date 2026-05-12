# Dangers

Things that can go wrong, and how to recover. This is a defensive-fork extension that patches VSCode's workbench JS — most failure modes are visual or self-inflicted via config, but a few touch system state.

## pointer-events & z-index

Workbench Studio silently strips `pointer-events` and `z-index` from user-supplied `style` and per-image override objects. Reason:

- `pointer-events: auto` on a full-screen overlay element intercepts every click. If your image is at `z-index: 1000` covering the editor and clicks stop reaching the code, the only way to fix it is **editing settings.json from a different window**. You can't open the Command Palette to fix it; you can't click in your editor. Major footgun.
- `z-index` doesn't expose anything useful — you can't reach into other elements' stacking contexts. It just lets you accidentally pull an image in front of UI you wanted to interact with.

If you really need them, your only recourse is a separate "Custom CSS" extension (e.g. `be5invis.vscode-custom-css`).

## Locking yourself out by stripping the editor

If you set `surfaceOpacity.editor: 0` AND don't have a fullscreen wallpaper AND don't have editor background images, the editor area is fully transparent over the workbench's default background. Probably looks like nothing changed (workbench bg color shows). But on some themes the contrast between editor text and workbench bg can be poor.

**Recovery**: set `surfaceOpacity.editor: 1` or remove the key.

## Why fullscreen has no `useFront`

Other sections (editor, sidebar, panel, auxiliarybar) support `useFront: false` because each section's container is a known opaque layer that the extension can strip transparently. Fullscreen would mean "image behind the entire workbench," which requires stripping:

- `body` and `.monaco-workbench` (top-level surfaces)
- All `.part` containers (titlebar, statusbar, activitybar, editor, sidebar, panel, auxiliarybar)
- Every inner `.part > .content` div with its own background
- Pane headers, tab bars, action bars, group containers, grid containers
- Theme CSS variables consumed by list rows, tree nodes, hover/selection highlights
- Webview iframe contents (Claude Code chat, terminal, Copilot Chat, etc.) — cross-origin, *can't be reached*

Every strip we add risks making text unreadable on a busy wallpaper because VSCode's theme colors are calibrated for solid surfaces. Hover/selection highlights are designed to overlay an opaque row; on a busy image they disappear or look wrong. And no matter how aggressive the strip, webview-based panels stay opaque — they sit in cross-origin iframes that the workbench patch can't pierce.

So fullscreen runs as a *front-layer overlay only* (`useFront: true`, image painted at `z-index: 1000` with low opacity + screen blend). Use the section-level `surfaceOpacity` knobs and per-section background images instead.

If you want a desktop-wallpaper effect, macOS/Windows already does it — set your OS wallpaper and run VSCode with window translucency in the OS preferences. That sits below VSCode without making us responsible for theme contrast trade-offs.

## VSCode auto-update reverts the patch

Workbench Studio modifies `workbench.desktop.main.js` in the VSCode install directory. When VSCode auto-updates, that file is replaced and the patch disappears.

**Symptom**: backgrounds stop showing after a VSCode update.

**Recovery**: open the Command Palette → `Workbench Studio: Enable and apply Workbench Studio`. Reload when prompted. The extension also detects unpatched workbench at startup and offers to re-apply.

To check whether the workbench is currently patched:

```bash
grep -c 'vscode-background' "/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js"
# 2 = patched, 0 = unpatched
```

## `code --install-extension --force` doesn't actually replace files

When iterating on the extension during development, `code --install-extension <file> --force` is unreliable for same-version vsixs — it often keeps the cached files in place. The extension manifest registers as installed but the JS on disk is stale.

**Recovery for dev iteration**:

```bash
code --uninstall-extension eno.workbench-studio
code --install-extension build/workbench-studio-X.X.X.vsix
```

Real version bumps (`0.1.0` → `0.1.1`) avoid this entirely.

## Image RAM blowup

The browser decodes images to their native pixel dimensions, not their displayed size. A 4K-resolution PNG takes ~30 MB of RAM decoded even if you're displaying it at 200×200.

**At-risk configs**:

- Many high-resolution images in an editor rotation with all slots visible at once
- Single fullscreen wallpaper at 8K+ resolution
- A folder path with hundreds of images — the **preload optimization skips at >10 images** so paradoxically this is *less* of a problem; the issue is when you have 8–10 large images that get eagerly preloaded

**Recovery**: compress the source files. Use WebP for photos at moderate quality (60–80) — typically ~10× smaller decoded than equivalent PNG. Aim for source images sized to your monitor's resolution rather than the original capture resolution.

## Stale runtime state file

Workbench Studio writes per-workspace state to `runtime-state.json` in the extension install dir. Multiple windows fire `onDidChangeConfiguration` simultaneously on settings.json save; a filesystem lock (`runtime-state.css.lock` with `O_EXCL` + 10s stale reclaim) serializes writes.

**Symptom of failure** (rare): a write loses changes from one window because another window's write clobbered it. Should be impossible given the lock, but if the lock file is stuck or the file system is weird (network mounts, etc.), states can drift.

**Recovery**: in any one open window, save your `settings.json` again. That triggers a re-write of `runtime-state.json` with the current effective config.

To inspect the live state:

```bash
jq . ~/.vscode/extensions/eno.workbench-studio-*/runtime-state.json
```

## Settings-shape mismatch after VSCode reload

Workbench Studio's runtime loader expects a specific state file shape. If you reload a window after upgrading the extension to a version that changes the state shape, but the workbench.js patch is from an older version, the loader may not understand the new fields.

**Symptom**: backgrounds stop showing or images stop rotating after extension upgrade.

**Recovery**: run `Workbench Studio: Enable and apply Workbench Studio` to re-patch with the latest loader. Reload each affected window.

## Multi-root `.vscode/settings.json` is silently ignored

VSCode behavior, not ours: in a multi-root workspace, folder-level `.vscode/settings.json` is **silently ignored** for window-scoped settings like `workbenchStudio.backgrounds.*`. Put settings in the `.code-workspace` file's `"settings": {}` block instead.

**Symptom**: settings appear correct in `.vscode/settings.json` but the extension acts like they're not set.

**Recovery**: move them into the workspace file or into user settings.

## Schema gotcha: `additionalProperties` strips sub-keys

When extending the JSON schema with a freeform `Record<string, string>` field:

```jsonc
// WRONG — VSCode strips user sub-keys when read via cfg.get()
"style": {
  "type": "object",
  "additionalProperties": { "type": "string" }
}
```

```jsonc
// RIGHT — preserves all sub-keys
"style": {
  "type": "object",
  "default": {}
}
```

Affects developers extending the schema, not end users.

## Workbench Studio doesn't pierce webviews

Claude Code chat, GitHub Copilot Chat, terminal, and any other webview-based panels are cross-origin iframes. Workbench Studio's CSS injection applies to the workbench shell but can't reach into webview content. No amount of `workbenchStudio.typography.*` configuration will change a chat panel's code-block font — that has to come from the panel's own extension.

For Claude Code specifically: `chat.editor.fontFamily` is a VSCode setting (undocumented at time of writing) that the chat editor honors after a restart. Letter-spacing isn't customizable from outside.

## Custom CSS lockout

`workbenchStudio.css` is raw passthrough — bad CSS can hide the Command Palette, intercept clicks, or make UI unreadable. Recovery without using the locked window:

1. **Open user `settings.json` from another VSCode window** — empty out `workbenchStudio.css` and save. Workspace-aware update applies within ~1.5s.
2. **Edit `settings.json` from a terminal** — `code ~/Library/Application\ Support/Code/User/settings.json` (macOS). Edit, save, wait for the in-window loader to re-poll.
3. **Disable the extension entirely** — `code --disable-extension eno.workbench-studio` from a terminal restarts VSCode without the extension active.

See [Custom CSS → Recovery](css.md#recovery-if-you-lock-yourself-out) for the full list.

## Recovery: nuclear option

If something's badly broken and you want to start from a clean state:

1. Open the Command Palette → `Workbench Studio: Disable Workbench Studio`. Reload.
2. If that doesn't restore VSCode: `Workbench Studio: Uninstall the extension`. Reload.
3. If even that fails (e.g. workbench.js is in a weird state and VSCode won't start): reinstall VSCode itself. This regenerates `workbench.desktop.main.js` from the install bundle.

Your settings.json is untouched by any of this — re-installing the extension and re-applying will restore your visual config.
