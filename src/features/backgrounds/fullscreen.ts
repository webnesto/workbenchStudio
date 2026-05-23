import { AbsPatchGenerator, css } from '../../core/patches/base';
import { ThemePatchGenerator } from '../../core/patches/theme';
import { STATE_CSS_PATH } from '../../utils/constants';

export class FullscreenPatchGeneratorConfig {
    images = [] as string[];
    /**
     * Per-image style overrides, parallel-indexed with `images`. Populated by
     * AbsPatchGenerator's constructor when entries in the user-facing `images`
     * config are objects (`{ "background-image": "...", ...overrides }`). Not
     * user-configurable directly.
     */
    styles: Array<Record<string, string>> = [];
    opacity = 0.1; // 建议在 0.1 ~ 0.3
    size = 'cover' as 'cover' | 'contain';
    position = 'center';
    interval = 0;
    random = false;
    style: Record<string, string> = {};
    /**
     * CSS `mix-blend-mode` override for this section. Empty string / undefined
     * falls back to the theme default (`unset` on light themes, `screen` on
     * dark). Any valid CSS blend keyword: `normal`, `multiply`, `screen`,
     * `overlay`, `darken`, `lighten`, etc. Per-image `mix-blend-mode` inside an
     * `images[]` object entry overrides this for that image.
     */
    blendMode?: string;
    /**
     * Surface opacity (0..1) for this section's theme background color.
     * Resolved by Studio.ts smart defaults (0 if section has images; otherwise 1).
     * Not directly settable on the section — use
     * `workbenchStudio.surfaceOpacity.<section>`.
     */
    surfaceOpacity?: number;
    /**
     * When false, the fullscreen image's ::after pseudo drops to z-index -1
     * (behind the workbench shell). On its own this hides the image — the
     * workbench panes are opaque. To make it visible, the user must also
     * transparentify the relevant surfaces via `workbench.colorCustomizations`
     * (sets the source theme tokens) or via `workbenchStudio.surfaceOpacity.*`
     * (blends per section). Documented as a power-user knob.
     */
    useFront?: boolean;
}

/**
 * Baked-rotation generator: emits a static patch with images, opacity, etc.
 * compiled directly into workbench.desktop.main.js. Settings changes require
 * Apply-and-Reload to regenerate the patch.
 *
 * Used as the parent for sidebar/panel/auxiliarybar (they keep this V1 behavior).
 * The actual fullscreen extension point uses WorkspaceAwareFullscreenPatchGenerator
 * below, which overrides getStyle/getScript with a workspace-aware runtime loader.
 */
export class FullscreenPatchGenerator<T extends FullscreenPatchGeneratorConfig> extends AbsPatchGenerator<T> {
    protected cssvariable = '--background-fullscreen-img';

    protected get curConfig(): T {
        const cur = {
            ...new FullscreenPatchGeneratorConfig(),
            ...this.config
        };

        // ------ opacity ------
        if (cur.opacity < 0 || cur.opacity > 1) {
            cur.opacity = new FullscreenPatchGeneratorConfig().opacity;
        }

        return cur;
    }

    protected getStyle(): string {
        const { size, position, opacity, style } = this.curConfig;

        const userStyle = Object.entries(style)
            .map(([key, value]) => `${key}: ${value};`)
            .join('');

        return css`
            body::after {
                content: '';
                display: block;
                position: absolute;
                z-index: 1000;
                inset: 0;
                pointer-events: none;
                background-size: ${size};
                background-repeat: no-repeat;
                background-position: ${position};
                opacity: ${opacity};
                transition: 1s;
                mix-blend-mode: var(${ThemePatchGenerator.cssMixBlendMode});
                background-image: var(${this.cssvariable});
                ${userStyle}
            }
        `;
    }

    protected getScript(): string {
        const { images, random, interval } = this.curConfig;
        if (!images.length) {
            return '';
        }
        return `
const cssvariable = '${this.cssvariable}';
const images = ${JSON.stringify(images)};
const random = ${random};
const interval = ${interval};

let curIndex = -1;

function getNextImg() {
    if (random) {
        return images[Math.floor(Math.random() * images.length)];
    }

    curIndex++;
    curIndex = curIndex % images.length;
    return images[curIndex];
}

function setNextImg() {
    document.body.style.setProperty(cssvariable, 'url(' + getNextImg() + ')');
}

if (interval > 0) {
    setInterval(setNextImg, interval * 1000);
}

setNextImg();
        `;
    }
}

/**
 * Workspace-aware fullscreen generator (V2).
 *
 * Emits a generic scaffold that loads its effective config at runtime from
 * <ext-install-dir>/runtime-state.css (written by the extension host) by
 * injecting a <link rel=stylesheet> tag with cache-busting query string. The
 * stylesheet sets `--bg-state-b64` on :root with a base64-encoded JSON state,
 * which the loader reads via getComputedStyle, decodes, parses, and applies.
 *
 * Why this transport (and only this transport):
 * - fetch/xhr: connect-src CSP blocks vscode-file://.
 * - <script src>: TrustedTypes blocks; CSP allowlist of policy names doesn't
 *   include any we can register.
 * - <link> from arbitrary user-home paths: protocol handler refuses with a
 *   network-level error (no CSP report).
 * - <link> from the extension's install dir: works. (Empirically verified.)
 * - <img> from user-home paths: works, but we can't read content from images.
 *
 * Sidebar/Panel/Auxiliarybar inherit from FullscreenPatchGenerator (above),
 * NOT from this class — they keep the V1 baked-rotation behavior.
 */
export class WorkspaceAwareFullscreenPatchGenerator extends FullscreenPatchGenerator<FullscreenPatchGeneratorConfig> {
    // Always emit the scaffold + watcher; images may arrive later via state file.
    protected imageRequired = false;

    protected getStyle(): string {
        return css`
            body::after {
                content: '';
                display: block;
                position: absolute;
                z-index: var(--bg-fs-z-index, 1000);
                inset: 0;
                pointer-events: none;
                background-size: var(--bg-fs-size, cover);
                background-repeat: no-repeat;
                background-position: var(--bg-fs-position, center);
                opacity: var(--bg-fs-opacity, 0.1);
                transition: 1s;
                mix-blend-mode: var(--bg-fs-blend, var(${ThemePatchGenerator.cssMixBlendMode}));
                background-image: var(${this.cssvariable});
            }
        `;
    }

    protected getScript(): string {
        const stateUrl = 'vscode-file://vscode-app' + STATE_CSS_PATH;

        return `
try {
    const STATE_URL = ${JSON.stringify(stateUrl)};
    const CSS_VAR_IMG = '${this.cssvariable}';
    const STYLE_TAG_ID = 'background-fullscreen-user-style';
    const STATE_LINK_ID = 'background-fullscreen-state-link';

    let rotationTimer = null;
    let curIndex = -1;
    let lastConfigSerialized = null;
    // Per-window workspace identity, detected once at init via VSCode's
    // exposed configuration bridge. Falls back to state.current (last-write-wins)
    // if detection fails — preserves Phase 2A behavior as graceful degradation.
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
            // .code-workspace file: configPath._formatted is the file:// URI.
            if (ws.configPath && ws.configPath._formatted) return ws.configPath._formatted;
            // Plain folder workspace: shape unverified, try a few likely paths.
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
            document.body.style.removeProperty('--bg-fs-blend');
            document.body.style.removeProperty('--bg-fs-z-index');
            return;
        }

        const images = cfg.images || [];
        const perImageStyles = cfg.styles || [];
        const opacity = cfg.opacity != null ? cfg.opacity : 0.1;
        const size = cfg.size || 'cover';
        const position = cfg.position || 'center';
        const random = !!cfg.random;
        const interval = cfg.interval || 0;
        const style = cfg.style || {};
        const useFront = cfg.useFront !== false;

        document.body.style.setProperty('--bg-fs-opacity', String(opacity));
        document.body.style.setProperty('--bg-fs-size', size);
        document.body.style.setProperty('--bg-fs-position', position);
        document.body.style.setProperty('--bg-fs-z-index', useFront ? '1000' : '-1');
        if (typeof cfg.blendMode === 'string' && cfg.blendMode.length) {
            document.body.style.setProperty('--bg-fs-blend', cfg.blendMode);
        } else if (!useFront) {
            document.body.style.setProperty('--bg-fs-blend', 'normal');
        } else {
            document.body.style.removeProperty('--bg-fs-blend');
        }

        let tag = document.getElementById(STYLE_TAG_ID);
        if (!tag) {
            tag = document.createElement('style');
            tag.id = STYLE_TAG_ID;
            document.head.appendChild(tag);
        }

        function renderStyle(idx) {
            const merged = Object.assign({}, style, perImageStyles[idx] || {});
            const rules = Object.entries(merged)
                .filter(function (e) {
                    // Always strip pointer-events (clicks must pass through)
                    // and z-index (footgun with no useful access surface).
                    return e[0] !== 'pointer-events' && e[0] !== 'z-index';
                })
                .map(function (e) { return e[0] + ': ' + e[1] + ' !important;'; })
                .join(' ');
            tag.textContent = rules ? 'body::after { ' + rules + ' }' : '';
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
            // Per-image useFront / opacity overrides — apply just to this tick.
            const perImage = perImageStyles[curIndex] || {};
            let imgUseFront = useFront;
            if ('useFront' in perImage) {
                const v = perImage.useFront;
                imgUseFront = !(v === false || v === 'false');
            }
            document.body.style.setProperty('--bg-fs-z-index', imgUseFront ? '1000' : '-1');
            // Section-level blendMode wins; otherwise mirror applyConfig's logic
            // so per-image useFront flips the blend in lock-step with z-index.
            if (typeof cfg.blendMode === 'string' && cfg.blendMode.length) {
                // already set in applyConfig; leave alone
            } else if (!imgUseFront) {
                document.body.style.setProperty('--bg-fs-blend', 'normal');
            } else {
                document.body.style.removeProperty('--bg-fs-blend');
            }
            const imgOpacity = ('opacity' in perImage) ? perImage.opacity : opacity;
            document.body.style.setProperty('--bg-fs-opacity', String(imgOpacity));
            try {
                console.log('[workbench-studio] fullscreen tick', {
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

    // Load state via <link rel=stylesheet> injection. The CSS sets a custom
    // property on :root with a base64-encoded JSON payload; we read it via
    // getComputedStyle once the link loads, then swap the new link in for
    // the old one (sequencing onload->read->remove keeps a stylesheet always
    // applied so the property never blanks out mid-cycle).
    function loadStateOnce() {
        return new Promise(function (resolve) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = STATE_URL + '?t=' + Date.now();
            link.onload = function () {
                const raw = getComputedStyle(document.documentElement)
                    .getPropertyValue('--bg-state-b64')
                    .trim();
                // Strip CSS string quotes — getPropertyValue returns the value
                // including surrounding quotes for string custom properties.
                const stripped = raw.replace(/^['"]|['"]$/g, '');
                let state = null;
                try {
                    if (stripped) state = JSON.parse(atob(stripped));
                } catch (e) {}
                // Replace the previous state link (if any) with this one.
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
            // Prefer this window's own workspace key (Phase 2B). Fall back to
            // state.current if detection didn't succeed.
            const lookupKey = (myWorkspaceKey && workspaces[myWorkspaceKey])
                ? myWorkspaceKey
                : (state.current || 'global');
            const cfg = (workspaces[lookupKey] && workspaces[lookupKey].fullscreen)
                || (workspaces.global && workspaces.global.fullscreen)
                || null;
            const ser = JSON.stringify(cfg);
            if (ser === lastConfigSerialized) return;
            lastConfigSerialized = ser;
            applyConfig(cfg);
        } catch (e) {
            // Silently ignore — next poll retries.
        }
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
    console.error('background fullscreen loader failed:', e);
}
        `;
    }
}
