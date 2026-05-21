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

## Fullscreen `useFront: false`

Fullscreen supports `useFront: false` as a power-user knob. It moves the fullscreen `::after` pseudo to `z-index: -1` (behind the workbench shell). **On its own this hides the image** — VSCode's panes are opaque and they sit in front of the body. To make the image visible, you must transparentify the surfaces above it. Two practical paths:

**Path A — `workbench.colorCustomizations` (recommended, broadest reach):**

```jsonc
"workbench.colorCustomizations": {
    "editor.background":       "#0000",
    "sideBar.background":      "#0000",
    "panel.background":        "#0000",
    "auxiliaryBar.background": "#0000",
    "activityBar.background":  "#0000",
    "titleBar.activeBackground": "#0000"
}
```

This zeroes the *source* theme tokens. Every CSS rule in the workbench (and inside webviews that respect those tokens) becomes transparent. Doesn't reach list-row backgrounds (`list.background`), tab strips (`editorGroupHeader.tabsBackground`), or hardcoded webview internals — add those keys individually as needed. See the [VSCode theme color reference](https://code.visualstudio.com/api/references/theme-color) for the full list.

**Path B — `workbenchStudio.surfaceOpacity.*` (our knob, ~partial coverage):**

```jsonc
"workbenchStudio.surfaceOpacity": {
    "editor": 0,
    "sidebar": 0,
    "panel": 0,
    "auxiliarybar": 0
}
```

This blends only the four section shells via `color-mix`. Doesn't touch list rows, tab strips, activity bar, status bar, or webviews. Fades smoothly (good for animation) where Path A is a hard set.

**What neither path solves:**

- **Terminal canvas** — xterm.js paints pixels into a canvas. CSS overrides on the canvas don't repaint already-rendered text. Set `terminal.background: "#0000"` via Path A and *new* output will be transparent, but the canvas is still an opaque-pixel grid.
- **Hardcoded webview backgrounds** — if Claude Code chat or Copilot Chat hardcoded `background: white` instead of consuming a theme token, that's unreachable. Iframe wall.
- **Theme color calibration** — VSCode's hover/selection highlights are designed to overlay solid surfaces. On a busy image they may disappear or look wrong. Not a bug — a design choice you're now responsible for.

If you want a clean desktop-wallpaper effect with zero contrast surprises, set your OS wallpaper and run VSCode with window translucency in the OS preferences. That sits below VSCode without making this extension responsible for theme contrast trade-offs.

## VSCode auto-update reverts the patch

Workbench Studio modifies `workbench.desktop.main.js` in the VSCode install directory. When VSCode auto-updates, that file is replaced and the patch disappears.

**Symptom**: backgrounds stop showing after a VSCode update.

**Recovery**: open the Command Palette → `Workbench Studio: Enable and apply Workbench Studio`. Reload when prompted. The extension also detects unpatched workbench at startup and offers to re-apply.

To check whether the workbench is currently patched:

```bash
grep -c 'vscode-background' "/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js"
# 2 = patched, 0 = unpatched
```

## Patching a locked-down / managed machine (file permissions)

On a managed or locked-down work machine, VSCode is typically installed by IT and the workbench files are owned by `root:wheel`, read-only to your user:

```text
-rw-r--r--  1 root  wheel  16943344  workbench.desktop.main.js
-rw-r--r--  1 root  wheel   1121332  workbench.desktop.main.css
```

Workbench Studio patches **both** of these files. If your user can't write them, `Workbench Studio: Enable and apply` fails — it can't save the modified workbench. (On a personal Mac these are usually already user-writable, so you never hit this.)

**Fix**: make both files writable by your user before applying. From the workbench dir (`/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/` on macOS):

```bash
cd "/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench"

# Option A — take ownership (preferred):
sudo chown "$USER" workbench.desktop.main.js workbench.desktop.main.css

# Option B — keep root ownership, just add a write bit.
# Note: root:wheel files need group/other write, so this means o+w:
sudo chmod o+w workbench.desktop.main.js workbench.desktop.main.css
```

Then re-run `Workbench Studio: Enable and apply` and reload.

**Note**: a VSCode update replaces both files, resetting contents *and* ownership/permissions — so you'll need to repeat this after each update, alongside re-applying the patch (see "VSCode auto-update reverts the patch" above).

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

1. **Open user `settings.json` from another VSCode window** — empty out `workbenchStudio.css` and save. The locked window gets an "Apply and Reload" toast — click it.
2. **Edit `settings.json` from a terminal** — `code ~/Library/Application\ Support/Code/User/settings.json` (macOS). Edit, save. The locked window gets an "Apply and Reload" toast.
3. **Disable the extension entirely** — `code --disable-extension eno.workbench-studio` from a terminal restarts VSCode without the extension active.

See [Custom CSS → Recovery](css.md#recovery-if-you-lock-yourself-out) for the full list.

## Why settings changes require Apply-and-Reload

Through v0.1.0 the workspace-aware sections updated live: settings.json save → ~1.5s → every open window reflected the change without a reload. That mechanism has been removed. Now every `workbenchStudio.*` change triggers an "Apply and Reload" toast in every open window, matching how typography always worked.

**The reason it was removed**: live update was driven by injected `setInterval` polling loops in the patched workbench.js — one per workspace-aware feature (editor, sidebar, panel, auxiliarybar, fullscreen, custom CSS). **Six pollers per window**, each ticking every 1.5 seconds. Each tick:

1. Created a fresh `<link rel="stylesheet">` with a cache-busting `?t=Date.now()` (forced disk re-read of `runtime-state.css`)
2. Appended it to `<head>` (CSSOM invalidation across the workbench)
3. Called `getComputedStyle()` on `:root` to read the encoded state (forced a synchronous style recalc against the full DOM)
4. Removed the previous link (another CSSOM invalidation)

For a single window with a small DOM this was tolerable. With several windows open on a Retina display, especially with `useFront: false` + transparent surfaces forcing the compositor to re-render layers, it could peg multiple CPU cores indefinitely. Cost grew with workbench complexity (DOM size, number of windows, display DPR) — not with how often you actually changed settings — so a config that worked fine on one machine could pin another to the redline.

The Apply-and-Reload pattern is cheaper in every dimension: **zero baseline CPU**, immediate confirmation that the change took, and a single code path that matches how typography has always worked. Workspace-awareness is preserved — `runtime-state.json` is still written per workspace on every settings change; each window resolves its own slice once at workbench boot.

**Practical notes**:

- Settings tweaks across many windows trigger a toast in each one. Dismiss them and reload as you visit each window — they don't queue up.
- Editing an external `.css` file from `workbenchStudio.cssFiles` currently rewrites the state file but does **not** trigger a reload prompt. Reload the window manually after editing the file.
- The state file lives at `~/.vscode/extensions/eno.workbench-studio-*/runtime-state.json`. Useful for confirming the host wrote what you expected before reloading.

## Recovery: nuclear option

If something's badly broken and you want to start from a clean state:

1. Open the Command Palette → `Workbench Studio: Disable Workbench Studio`. Reload.
2. If that doesn't restore VSCode: `Workbench Studio: Uninstall the extension`. Reload.
3. If even that fails (e.g. workbench.js is in a weird state and VSCode won't start): reinstall VSCode itself. This regenerates `workbench.desktop.main.js` from the install bundle.

Your settings.json is untouched by any of this — re-installing the extension and re-applying will restore your visual config.
