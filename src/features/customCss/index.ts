import { WithoutImagesPatchGenerator } from '../../core/patches/base';
import { STATE_CSS_PATH } from '../../utils/constants';

/**
 * Workspace-aware raw CSS injection.
 *
 * Emits a loader that reads `runtime-state.css` once at workbench boot (via
 * <link> injection), pulls `workspaces[key].css` for the current workspace,
 * and writes its value into a single managed `<style>` tag in the document
 * head. Changes require Apply-and-Reload to take effect — see
 * docs/dangers.md#why-settings-changes-require-apply-and-reload.
 *
 * The user-facing setting `workbenchStudio.css` accepts either a string or
 * an array of strings; Studio.ts joins arrays with `\n` before writing to
 * state, so the loader only ever sees a string.
 *
 * No validation, no sanitization — the user's CSS is applied verbatim. This
 * is the "power-user escape hatch" knob (see docs/dangers.md).
 */
export class CustomCssPatchGenerator extends WithoutImagesPatchGenerator {
    protected getStyle(): string {
        return '';
    }

    protected getScript(): string {
        const stateUrl = 'vscode-file://vscode-app' + STATE_CSS_PATH;
        return `
try {
    const STATE_URL = ${JSON.stringify(stateUrl)};
    const STYLE_TAG_ID = 'workbench-studio-custom-css';
    const STATE_LINK_ID = 'workbench-studio-custom-css-state-link';

    let lastApplied = null;
    let myWorkspaceKey = null;
    let pollTimer = null;

    // Live-preview poll timer. Started/stopped by readAndApply based on the
    // state file's top-level livePreview flag. Turning live preview off is
    // self-healing: the running poller sees the flag flip and clears itself.
    function managePollTimer(live) {
        if (live && !pollTimer) {
            pollTimer = setInterval(readAndApply, 1500);
        } else if (!live && pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    async function detectWorkspaceKey() {
        try {
            if (typeof window.vscode === 'undefined' || !window.vscode.context) return null;
            const cfg = await window.vscode.context.resolveConfiguration();
            const ws = cfg && cfg.workspace;
            if (!ws) return null;
            if (ws.configPath && ws.configPath._formatted) return ws.configPath._formatted;
            if (ws.uri && ws.uri._formatted) return ws.uri._formatted;
            if (ws.folders && ws.folders[0] && ws.folders[0].uri && ws.folders[0].uri._formatted) {
                return ws.folders[0].uri._formatted;
            }
        } catch (e) {}
        return null;
    }

    function applyCss(cssText) {
        let tag = document.getElementById(STYLE_TAG_ID);
        if (!tag) {
            tag = document.createElement('style');
            tag.id = STYLE_TAG_ID;
            document.head.appendChild(tag);
        }
        tag.textContent = cssText || '';
        lastApplied = cssText || '';
    }

    function loadStateOnce() {
        return new Promise(function (resolve) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = STATE_URL + '?t=' + Date.now();
            link.onload = function () {
                const raw = getComputedStyle(document.documentElement)
                    .getPropertyValue('--bg-state-b64')
                    .trim();
                const stripped = raw.replace(/^['"]|['"]$/g, '');
                let state = null;
                try {
                    if (stripped) state = JSON.parse(atob(stripped));
                } catch (e) {}
                const prev = document.getElementById(STATE_LINK_ID);
                if (prev && prev !== link) prev.remove();
                link.id = STATE_LINK_ID;
                resolve(state);
            };
            link.onerror = function () {
                link.remove();
                resolve(null);
            };
            document.head.appendChild(link);
        });
    }

    async function readAndApply() {
        try {
            const state = await loadStateOnce();
            if (!state) return;
            managePollTimer(!!state.livePreview);
            const workspaces = state.workspaces || {};
            const key = (myWorkspaceKey && workspaces[myWorkspaceKey])
                ? myWorkspaceKey
                : (state.current || 'global');
            const cfg = (workspaces[key] && workspaces[key].css)
                || (workspaces.global && workspaces.global.css)
                || '';
            const cssText = typeof cfg === 'string' ? cfg : '';
            if (cssText === lastApplied) return;
            applyCss(cssText);
        } catch (e) {}
    }

    async function init() {
        myWorkspaceKey = await detectWorkspaceKey();
        readAndApply();
    }

    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
} catch (e) {
    console.error('workbench-studio custom CSS loader failed:', e);
}
        `;
    }
}
