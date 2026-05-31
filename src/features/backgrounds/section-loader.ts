import { STATE_CSS_PATH } from '../../utils/constants';

export interface SectionMeta {
    /** Attribute flipped on <html> to rotate; gates each image's static rule. */
    idxAttr: string;
    /** The section's ::after pseudo selector. */
    afterSelector: string;
    /** z-index when the image is in front (useFront). Behind is always -1. */
    frontZ: number;
    /** Opacity default when useFront:false and no explicit per-section opacity. */
    backOpacityDefault: number;
    /** Surface (theme-color) opacity var, or '' if the section has no surface. */
    surfaceOpacityVar: string;
}

/**
 * Metadata for every single-surface workspace-aware section: fullscreen plus
 * the three part sections. (The editor is special — per-split-distinct — and
 * lives in editor.ts.) The writer emits each image as a static rule; the loader
 * flips `idxAttr` on <html> to rotate.
 *
 * fullscreen differs from the part sections: front z-index 1000 (it overlays
 * the whole shell), opacity defaults to 0.1 even behind, and it has no surface.
 */
export const SECTION_META: Record<string, SectionMeta> = {
    fullscreen: {
        idxAttr: 'data-wbs-fs-idx',
        afterSelector: 'body::after',
        frontZ: 1000,
        backOpacityDefault: 0.1,
        surfaceOpacityVar: ''
    },
    sidebar: {
        idxAttr: 'data-wbs-sb-idx',
        afterSelector: '.split-view-view > .part.sidebar::after',
        frontZ: 99,
        backOpacityDefault: 1,
        surfaceOpacityVar: '--bg-surface-sidebar-opacity'
    },
    panel: {
        idxAttr: 'data-wbs-pn-idx',
        afterSelector: '.split-view-view > .part.panel::after',
        frontZ: 99,
        backOpacityDefault: 1,
        surfaceOpacityVar: '--bg-surface-panel-opacity'
    },
    auxiliarybar: {
        idxAttr: 'data-wbs-ax-idx',
        afterSelector: '.split-view-view > .part.auxiliarybar::after',
        frontZ: 99,
        backOpacityDefault: 1,
        surfaceOpacityVar: '--bg-surface-auxiliarybar-opacity'
    }
};

/**
 * STUD4 real-CSS transport for the simple single-surface sections. Emit each
 * image as a *real* static CSS rule (uncapped) gated by the workspace hash and
 * the section's rotation-index attribute:
 *
 *   :root[data-wbs-ws="<h>"][data-wbs-sb-idx="<i>"] <afterSelector> { … }
 *
 * The renderer flips the single index attribute on <html> to rotate — no image
 * data flows through the (capped) --bg-state-b64 property. Unlike the editor
 * these sections are single-surface, so there's no element-tagging and no
 * MutationObserver; the ::after target is stable and the attribute lives on
 * :root. Per-image styles are fully resolved here (section defaults overlaid
 * with per-image overrides) so the loader sets nothing per tick.
 *
 * @param cfg         section config slice (images, styles, useFront, opacity, size, position, blendMode)
 * @param wsSelector  workspace gate, e.g. `:root[data-wbs-ws="abc"]`
 * @param idxAttr     rotation-index attribute, e.g. `data-wbs-sb-idx`
 * @param afterSelector  the section's ::after selector
 */
export function buildSectionImageRules(
    cfg: {
        images?: string[];
        styles?: Array<Record<string, string>>;
        useFront?: boolean;
        opacity?: number | string | null;
        size?: string;
        position?: string;
        blendMode?: string;
    },
    wsSelector: string,
    meta: SectionMeta
): string {
    const images = cfg.images || [];
    if (!images.length) return '';

    const perImageStyles = cfg.styles || [];
    const sectionUseFront = cfg.useFront !== false; // default true
    // Mirror the legacy loaders: useFront:true defaults to a faint 0.1 overlay;
    // useFront:false defaults per section (part sections → 1 wallpaper,
    // fullscreen → 0.1).
    const sectionOpacity =
        cfg.opacity !== null && cfg.opacity !== undefined
            ? cfg.opacity
            : sectionUseFront
              ? 0.1
              : meta.backOpacityDefault;
    const size = cfg.size || 'cover';
    const position = cfg.position || 'center';
    const sectionBlend = typeof cfg.blendMode === 'string' && cfg.blendMode.length ? cfg.blendMode : null;

    const out: string[] = [];
    for (let i = 0; i < images.length; i++) {
        const perImage = perImageStyles[i] || {};

        // Per-image useFront override (base.ts string-coerces values).
        let imgUseFront = sectionUseFront;
        if ('useFront' in perImage) {
            const v = (perImage as Record<string, unknown>).useFront;
            imgUseFront = !(v === false || v === 'false');
        }

        const imgOpacity = 'opacity' in perImage ? perImage.opacity : sectionOpacity;
        const imgZ = imgUseFront ? meta.frontZ : -1;
        // useFront:false drops the blend so the image renders as a clean
        // wallpaper; an explicit section blendMode always wins.
        const blend = sectionBlend ? sectionBlend : !imgUseFront ? 'normal' : null;

        // Resolve the full per-image declaration: section base, overlaid with
        // arbitrary per-image overrides, then the computed values on top.
        const resolved: Record<string, string> = {
            'background-size': size,
            'background-position': position
        };
        for (const k in perImage) {
            // useFront is a control flag; pointer-events/z-index/opacity handled
            // explicitly below (z-index/opacity computed, pointer-events dropped).
            if (k === 'useFront' || k === 'pointer-events' || k === 'z-index' || k === 'opacity') continue;
            resolved[k] = String(perImage[k]);
        }
        resolved['opacity'] = String(imgOpacity);
        resolved['background-image'] = `url(${images[i]})`;
        resolved['z-index'] = String(imgZ);
        if (blend) resolved['mix-blend-mode'] = blend;

        const decl = Object.entries(resolved)
            .map(([k, v]) => `${k}: ${v} !important;`)
            .join(' ');
        out.push(`${wsSelector}[${meta.idxAttr}="${i}"] ${meta.afterSelector} { ${decl} }`);
    }
    return out.join('\n');
}

/**
 * Returns the JS body for a workspace-aware "simple section" runtime loader.
 *
 * Used by sidebar, panel, and auxiliarybar. STUD4: image paths + per-image
 * styles now live as real CSS rules (see buildSectionImageRules), so the loader
 * only reads the small KNOBS slice (count/interval/random/surfaceOpacity),
 * sets the surface-opacity var, and rotates by flipping the section's index
 * attribute on <html>. No image data is read here, so nothing can hit the
 * custom-property cap.
 */
export function buildSectionLoaderScript(opts: {
    /** State-file key under workspaces[key], e.g. 'sidebar' or 'fullscreen'. */
    sectionName: string;
}): string {
    const { sectionName } = opts;
    const meta = SECTION_META[sectionName];
    const idxAttr = meta ? meta.idxAttr : `data-wbs-${sectionName}-idx`;
    const surfaceOpacityVar = meta ? meta.surfaceOpacityVar : '';
    const stateUrl = 'vscode-file://vscode-app' + STATE_CSS_PATH;

    return `
try {
    const STATE_URL = ${JSON.stringify(stateUrl)};
    const SECTION = ${JSON.stringify(sectionName)};
    const WS_ATTR = 'data-wbs-ws';
    const IDX_ATTR = ${JSON.stringify(idxAttr)};
    const CSS_VAR_SURFACE_OPACITY = ${JSON.stringify(surfaceOpacityVar)};
    const STATE_LINK_ID = ${JSON.stringify(`background-${sectionName}-state-link`)};

    let rotationTimer = null;
    let pollTimer = null;
    let myWorkspaceKey = null;
    let offset = 0;
    let count = 0;
    let lastKnobsSerialized = null;

    // Deterministic djb2 hash — MUST stay byte-identical to wsAttrHash() in
    // editor.ts so the workspace gate on the emitted rules matches the
    // attribute we set on <html>.
    function wsAttrHash(key) {
        let h = 5381;
        for (let i = 0; i < key.length; i++) {
            h = ((h << 5) + h + key.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(36);
    }

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

    // Knobs only — image paths/styles arrive as real CSS rules, never here.
    function applyKnobs(knobs) {
        if (rotationTimer) {
            clearInterval(rotationTimer);
            rotationTimer = null;
        }

        if (CSS_VAR_SURFACE_OPACITY) {
            if (knobs && typeof knobs.surfaceOpacity === 'number') {
                document.body.style.setProperty(CSS_VAR_SURFACE_OPACITY, String(knobs.surfaceOpacity));
            } else {
                document.body.style.removeProperty(CSS_VAR_SURFACE_OPACITY);
            }
        }

        count = (knobs && knobs.count) || 0;
        if (count <= 0) {
            document.documentElement.removeAttribute(IDX_ATTR);
            return;
        }

        const interval = (knobs && knobs.interval) || 0;
        const random = !!(knobs && knobs.random);

        offset = random ? Math.floor(Math.random() * count) : 0;
        document.documentElement.setAttribute(IDX_ATTR, String(offset));

        if (interval > 0) {
            rotationTimer = setInterval(function () {
                offset = random ? Math.floor(Math.random() * count) : (offset + 1) % count;
                document.documentElement.setAttribute(IDX_ATTR, String(offset));
            }, interval * 1000);
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
            managePollTimer(!!state.livePreview);
            const workspaces = state.workspaces || {};
            const lookupKey = (myWorkspaceKey && workspaces[myWorkspaceKey])
                ? myWorkspaceKey
                : (state.current || 'global');
            // Activate this workspace's gated image rules.
            document.documentElement.setAttribute(WS_ATTR, wsAttrHash(lookupKey));
            const knobs = (workspaces[lookupKey] && workspaces[lookupKey][SECTION])
                || (workspaces.global && workspaces.global[SECTION])
                || null;
            const ser = JSON.stringify(knobs);
            if (ser === lastKnobsSerialized) return;
            lastKnobsSerialized = ser;
            applyKnobs(knobs);
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
