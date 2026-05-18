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
    /**
     * CSS selector for the section's ::after pseudo-element. Used to scope
     * per-image style overrides so they apply only to this section.
     */
    afterSelector: string;
    /**
     * CSS variable for this section's surface (theme-color) opacity, e.g.
     * '--bg-surface-sidebar-opacity'. The loader sets it from cfg.surfaceOpacity
     * (resolved by Studio.ts smart defaults).
     */
    surfaceOpacityVar: string;
}): string {
    const { sectionName, cssVarImg, cssVarPrefix, afterSelector, surfaceOpacityVar } = opts;
    const stateUrl = 'vscode-file://vscode-app' + STATE_CSS_PATH;

    return `
try {
    const STATE_URL = ${JSON.stringify(stateUrl)};
    const SECTION = ${JSON.stringify(sectionName)};
    const CSS_VAR_IMG = ${JSON.stringify(cssVarImg)};
    const CSS_VAR_OPACITY = ${JSON.stringify(`--${cssVarPrefix}-opacity`)};
    const CSS_VAR_SIZE = ${JSON.stringify(`--${cssVarPrefix}-size`)};
    const CSS_VAR_POSITION = ${JSON.stringify(`--${cssVarPrefix}-position`)};
    const CSS_VAR_Z_INDEX = ${JSON.stringify(`--${cssVarPrefix}-z-index`)};
    const CSS_VAR_BLEND = ${JSON.stringify(`--${cssVarPrefix}-blend`)};
    const CSS_VAR_SURFACE_OPACITY = ${JSON.stringify(surfaceOpacityVar)};
    const STATE_LINK_ID = ${JSON.stringify(`background-${sectionName}-state-link`)};
    const STYLE_TAG_ID = ${JSON.stringify(`background-${sectionName}-per-image-style`)};
    const AFTER_SELECTOR = ${JSON.stringify(afterSelector)};

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

        let tag = document.getElementById(STYLE_TAG_ID);
        if (!tag) {
            tag = document.createElement('style');
            tag.id = STYLE_TAG_ID;
            document.head.appendChild(tag);
        }

        if (!cfg) {
            document.body.style.setProperty(CSS_VAR_IMG, 'none');
            document.body.style.removeProperty(CSS_VAR_SURFACE_OPACITY);
            tag.textContent = '';
            return;
        }

        const images = cfg.images || [];
        const perImageStyles = cfg.styles || [];
        const sectionUseFront = cfg.useFront !== false; // default true
        // When useFront:false the image sits behind the pane's surface;
        // raise default opacity to 1 so it's visible as a wallpaper-style
        // layer rather than a faint overlay. User's explicit opacity wins.
        const opacity = cfg.opacity != null ? cfg.opacity : (sectionUseFront ? 0.1 : 1);
        const size = cfg.size || 'cover';
        const position = cfg.position || 'center';
        const random = !!cfg.random;
        const interval = cfg.interval || 0;
        // Section-level mix-blend-mode override. Empty / unset falls back to
        // either useFront:false's 'normal' rule or the theme default.
        const sectionBlend = (typeof cfg.blendMode === 'string' && cfg.blendMode.length)
            ? cfg.blendMode
            : null;

        function applyBlendVar(useFront) {
            if (sectionBlend) {
                document.body.style.setProperty(CSS_VAR_BLEND, sectionBlend);
            } else if (!useFront) {
                // useFront:false drops the blend so the image renders as a clean
                // wallpaper (no screen-blend distortion against the surface beneath).
                document.body.style.setProperty(CSS_VAR_BLEND, 'normal');
            } else {
                document.body.style.removeProperty(CSS_VAR_BLEND);
            }
        }

        document.body.style.setProperty(CSS_VAR_OPACITY, String(opacity));
        document.body.style.setProperty(CSS_VAR_SIZE, size);
        document.body.style.setProperty(CSS_VAR_POSITION, position);
        document.body.style.setProperty(CSS_VAR_Z_INDEX, sectionUseFront ? '99' : '-1');
        applyBlendVar(sectionUseFront);
        if (typeof cfg.surfaceOpacity === 'number') {
            document.body.style.setProperty(CSS_VAR_SURFACE_OPACITY, String(cfg.surfaceOpacity));
        } else {
            document.body.style.removeProperty(CSS_VAR_SURFACE_OPACITY);
        }

        function renderStyle(idx) {
            const overrides = perImageStyles[idx] || {};
            const rules = Object.entries(overrides)
                .filter(function (e) {
                    // Always strip pointer-events (clicks must pass through)
                    // and z-index (footgun with no useful access surface).
                    return e[0] !== 'pointer-events' && e[0] !== 'z-index';
                })
                .map(function (e) { return e[0] + ': ' + e[1] + ' !important;'; })
                .join(' ');
            tag.textContent = rules ? AFTER_SELECTOR + ' { ' + rules + ' }' : '';
        }

        if (!images.length) {
            document.body.style.setProperty(CSS_VAR_IMG, 'none');
            renderStyle(0);
            return;
        }

        curIndex = -1;

        function getNext() {
            if (random) {
                curIndex = Math.floor(Math.random() * images.length);
            } else {
                curIndex = (curIndex + 1) % images.length;
            }
            return images[curIndex];
        }
        function setNext() {
            const url = getNext();
            document.body.style.setProperty(CSS_VAR_IMG, 'url(' + url + ')');
            renderStyle(curIndex);
            // Per-image useFront override — applies just to this tick.
            const perImage = perImageStyles[curIndex] || {};
            let imgUseFront = sectionUseFront;
            if ('useFront' in perImage) {
                const v = perImage.useFront;
                imgUseFront = !(v === false || v === 'false');
            }
            document.body.style.setProperty(CSS_VAR_Z_INDEX, imgUseFront ? '99' : '-1');
            applyBlendVar(imgUseFront);
            // Per-image opacity override falls back to section default.
            const imgOpacity = ('opacity' in perImage) ? perImage.opacity : opacity;
            document.body.style.setProperty(CSS_VAR_OPACITY, String(imgOpacity));
            try {
                console.log('[workbench-studio] ' + SECTION + ' tick', {
                    index: curIndex,
                    url: url,
                    useFront: imgUseFront,
                    style: perImage
                });
            } catch (e) {}
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
