import { STATE_CSS_PATH } from '../../utils/constants';

/**
 * Returns the JS body for a workspace-aware "simple section" runtime loader.
 *
 * Used by sidebar, panel, and auxiliarybar workspace-aware patch generators.
 * Mirrors the structure of WorkspaceAwareFullscreenPatchGenerator's inline
 * loader but is parameterized by section name + CSS variable prefix so each
 * section reads its own slice of state.workspaces[key].<sectionName>.
 *
 * The fullscreen loader stays inline in PatchGenerator.fullscreen.ts to avoid
 * disturbing tested code; this helper is used only for the three simpler
 * sections.
 */
export function buildSectionLoaderScript(opts: {
    /** State-file key under workspaces[key], e.g. 'sidebar'. */
    sectionName: string;
    /** CSS variable holding the current image URL, e.g. '--background-sidebar-img'. */
    cssVarImg: string;
    /**
     * Prefix for CSS variables the loader sets on document.body for this section,
     * e.g. 'bg-sb' yields '--bg-sb-opacity', '--bg-sb-size', '--bg-sb-position'.
     * Must be unique per section.
     */
    cssVarPrefix: string;
}): string {
    const { sectionName, cssVarImg, cssVarPrefix } = opts;
    const stateUrl = 'vscode-file://vscode-app' + STATE_CSS_PATH;

    return `
try {
    const STATE_URL = ${JSON.stringify(stateUrl)};
    const SECTION = ${JSON.stringify(sectionName)};
    const CSS_VAR_IMG = ${JSON.stringify(cssVarImg)};
    const CSS_VAR_OPACITY = ${JSON.stringify(`--${cssVarPrefix}-opacity`)};
    const CSS_VAR_SIZE = ${JSON.stringify(`--${cssVarPrefix}-size`)};
    const CSS_VAR_POSITION = ${JSON.stringify(`--${cssVarPrefix}-position`)};
    const STATE_LINK_ID = ${JSON.stringify(`background-${sectionName}-state-link`)};

    let rotationTimer = null;
    let curIndex = -1;
    let lastConfigSerialized = null;
    let myWorkspaceKey = null;

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

    function applyConfig(cfg) {
        if (rotationTimer) {
            clearInterval(rotationTimer);
            rotationTimer = null;
        }

        if (!cfg) {
            document.body.style.setProperty(CSS_VAR_IMG, 'none');
            return;
        }

        const images = cfg.images || [];
        const opacity = cfg.opacity != null ? cfg.opacity : 0.1;
        const size = cfg.size || 'cover';
        const position = cfg.position || 'center';
        const random = !!cfg.random;
        const interval = cfg.interval || 0;

        document.body.style.setProperty(CSS_VAR_OPACITY, String(opacity));
        document.body.style.setProperty(CSS_VAR_SIZE, size);
        document.body.style.setProperty(CSS_VAR_POSITION, position);

        if (!images.length) {
            document.body.style.setProperty(CSS_VAR_IMG, 'none');
            return;
        }

        curIndex = -1;

        function getNext() {
            if (random) return images[Math.floor(Math.random() * images.length)];
            curIndex = (curIndex + 1) % images.length;
            return images[curIndex];
        }
        function setNext() {
            document.body.style.setProperty(CSS_VAR_IMG, 'url(' + getNext() + ')');
        }

        setNext();
        if (interval > 0) {
            rotationTimer = setInterval(setNext, interval * 1000);
        }
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
            const workspaces = state.workspaces || {};
            const lookupKey = (myWorkspaceKey && workspaces[myWorkspaceKey])
                ? myWorkspaceKey
                : (state.current || 'global');
            const cfg = (workspaces[lookupKey] && workspaces[lookupKey][SECTION])
                || (workspaces.global && workspaces.global[SECTION])
                || null;
            const ser = JSON.stringify(cfg);
            if (ser === lastConfigSerialized) return;
            lastConfigSerialized = ser;
            applyConfig(cfg);
        } catch (e) {}
    }

    async function init() {
        myWorkspaceKey = await detectWorkspaceKey();
        readAndApply();
        setInterval(readAndApply, 1500);
    }

    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
} catch (e) {
    console.error('background ${sectionName} loader failed:', e);
}
        `;
}
