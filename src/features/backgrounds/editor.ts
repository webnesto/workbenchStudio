import { AbsPatchGenerator, css } from '../../core/patches/base';
import { ThemePatchGenerator } from '../../core/patches/theme';
import { STATE_CSS_PATH } from '../../utils/constants';

export class EditorPatchGeneratorConfig {
    useFront = true;
    style: Record<string, string> = {};
    styles: Array<Record<string, string>> = [];
    images: string[] = [];
    interval = 0;
    random = false;
    /**
     * Opacity for the editor's minimap (the scroll-thumb preview on the right).
     * Default 0.8 dims the minimap slightly so the background image can show
     * through. Set to 1 to leave minimap fully opaque, 0 to hide it.
     */
    minimapOpacity = 0.8;
    /**
     * CSS `mix-blend-mode` override for the editor section. Empty / undefined
     * falls back to the theme default (`unset` on light, `screen` on dark).
     * Per-image `mix-blend-mode` inside an `images[]` object entry overrides
     * this for that image.
     */
    blendMode?: string;
    /**
     * Surface opacity (0..1) for the editor's theme background color. Resolved
     * by Studio.ts smart defaults (0 if editor has images or fullscreen.useFront
     * is false; otherwise 1). Not directly settable here — use
     * `workbenchStudio.surfaceOpacity.editor`.
     */
    surfaceOpacity?: number;
}

export class EditorPatchGenerator extends AbsPatchGenerator<EditorPatchGeneratorConfig> {
    private readonly cssplaceholder = '--background-editor-placeholder';

    private get curConfig() {
        // 默认值实际在 package.json 中定义，会 deep merge
        return {
            ...new EditorPatchGeneratorConfig(),
            ...this.config
        };
    }

    private getStyleByOptions(style: Record<string, string>): string {
        // Always strip pointer-events (clicks must pass through) and z-index
        // (no access to other elements' stacks; would be a useless footgun).
        const excludeKeys = ['pointer-events', 'z-index'];

        return Object.entries(style)
            .filter(([key]) => !excludeKeys.includes(key))
            .map(([key, value]) => `${key}: ${value};`)
            .join('');
    }

    private get imageStyles() {
        const { images, style, styles } = this.curConfig;

        return images.map((img, index) => {
            return this.getStyleByOptions({
                ...style,
                ...styles[index],
                'background-image': `url(${img})`
            });
        });
    }

    private get styleTemplate() {
        const { images, useFront } = this.curConfig;

        // ------ 在前景图时使用 ::after ------
        const frontContent = useFront ? 'after' : 'before';

        // ------ 生成样式 ------
        return this.compileCSS(css`
            /* minimap */
            .minimap {
                opacity: 0.8;
            }

            [id='workbench.parts.editor'] .split-view-view {
                /* 处理一块背景色遮挡 */
                .editor-container .overflow-guard > .monaco-scrollable-element > .monaco-editor-background {
                    background: none;
                }
                /* 背景图片样式 */
                ${images.map((_img, index) => {
                    const nthChild = `${images.length}n + ${index + 1}`;

                    return css`
                        /* code editor */
                        &:nth-child(${nthChild}) .editor-instance > .monaco-editor > .overflow-guard > .monaco-scrollable-element::${frontContent} {
                            content: '';
                            width: 100%;
                            height: 100%;
                            position: absolute;
                            z-index: ${useFront ? 99 : 'initial'};
                            pointer-events: ${useFront ? 'none' : 'initial'};
                            transition: 0.3s;
                            background-repeat: no-repeat;
                            mix-blend-mode: var(${ThemePatchGenerator.cssMixBlendMode});
                            /* placeholder，用于动态替换css */
                            ${this.cssplaceholder + (index % images.length)}: #000;
                            ${this.cssplaceholder + '-end'}: #000;
                        }
                    `;
                })}
            }
        `);
    }

    protected getScript(): string {
        const { interval, random } = this.curConfig;
        return `
// options
const styleTemplate = ${JSON.stringify(this.styleTemplate)};
const cssplaceholder = '${this.cssplaceholder}';
const imageStyles = ${JSON.stringify(this.imageStyles)};
const interval = ${interval};
const random = ${random};

// variables
let curIndex = -1;

const style = (() => {
    const ele = document.createElement('style');
    document.head.appendChild(ele);
    return ele;
})();

function getNextStyles() {
    // 如果随机，乱序后返回
    if (random) {
        return imageStyles.slice().sort(() => Math.random() - 0.5);
    }

    // 其它按照自增索引返回
    curIndex++;
    curIndex = curIndex % imageStyles.length;
    return imageStyles.map((_s, index) => {
        const sIndex = (curIndex + index) % imageStyles.length;
        return imageStyles[sIndex];
    });
}

// replace placeholders with nextStyles in styleTemplate
function setNextStyles() {
    let curStyle = styleTemplate;
    const nextStyles = getNextStyles();
    for (let i = 0; i < nextStyles.length; i++) {
        const reg = new RegExp(cssplaceholder + i + '[^;]+;', 'g');
        curStyle = curStyle.replace(reg, nextStyles[i]);
    }
    style.textContent = curStyle;
}

if (interval > 0) {
    setInterval(setNextStyles, interval * 1000);
}

setNextStyles();
`;
    }
}

/**
 * Workspace-aware editor generator (V2).
 *
 * Same transport as WorkspaceAwareFullscreenPatchGenerator: read base64-encoded
 * state from runtime-state.css inside the extension install dir via <link>
 * injection, decode, apply editor styling dynamically into a <style> tag whose
 * contents are regenerated on every config change (and on rotation tick).
 *
 * Differs from fullscreen because the editor needs N CSS rules at runtime —
 * one :nth-child(Nn+i) rule per image — and N changes when the user adds or
 * removes images. So instead of a static scaffold + CSS-variable updates, we
 * emit a static reset + minimap rule, then build per-image rules from the
 * current state on every read and stuff them into a single <style> tag.
 */
export class WorkspaceAwareEditorPatchGenerator extends EditorPatchGenerator {
    // Always emit the scaffold + watcher; images may arrive later via state file.
    protected imageRequired = false;

    protected getStyle(): string {
        // Static workbench styling that doesn't depend on image count.
        // Per-image rules are built dynamically by the runtime loader below.
        //
        // The editor-background rule uses color-mix to blend the theme's
        // editor-background color with transparent. opacity 0 (default) gives
        // the original always-strip behavior so editor image backgrounds
        // remain visible. opacity 1 restores the theme color fully. Anything
        // in between blends. Studio.ts smart-defaults to 0 when editor has
        // images or when fullscreen useFront:false; otherwise 1.
        return css`
            .minimap {
                opacity: var(--bg-editor-minimap-opacity, 0.8);
            }

            [id='workbench.parts.editor']
                .split-view-view
                .editor-container
                .overflow-guard
                > .monaco-scrollable-element
                > .monaco-editor-background {
                background-color: color-mix(
                    in srgb,
                    var(--vscode-editor-background) calc(var(--bg-surface-editor-opacity, 0) * 100%),
                    transparent
                ) !important;
            }

            .monaco-workbench .part.editor > .content .editor-group-container.empty.active,
            .monaco-workbench .part.editor > .content .editor-group-container.empty.dragged-over {
                opacity: var(--bg-surface-editor-opacity, 1) !important;
            }

            .monaco-workbench .part.editor > .content .editor-group-container.empty {
                opacity: var(--bg-surface-editor-opacity, 1) !important;
            }
        `;
    }

    protected getScript(): string {
        const stateUrl = 'vscode-file://vscode-app' + STATE_CSS_PATH;
        const blendModeVar = ThemePatchGenerator.cssMixBlendMode;

        return `
try {
    const STATE_URL = ${JSON.stringify(stateUrl)};
    const STATE_LINK_ID = 'background-editor-state-link';
    const STYLE_TAG_ID = 'background-editor-runtime-style';

    let rotationTimer = null;
    let curIndex = 0;
    let lastConfigSerialized = null;
    let lastConfig = null;
    // Per-window workspace identity (Phase 2B). Detected once at init.
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

    function getStyleByOptions(styleObj) {
        // Always strip pointer-events (clicks must pass through, no matter what)
        // and z-index (user has no access to other elements' stacks, so it's
        // a useless footgun).
        const excludeKeys = ['pointer-events', 'z-index'];
        return Object.entries(styleObj)
            .filter(function (e) { return excludeKeys.indexOf(e[0]) === -1; })
            .map(function (e) { return e[0] + ': ' + e[1] + ';'; })
            .join('');
    }

    function buildEditorCss(cfg, indexOffset) {
        const images = cfg.images || [];
        if (!images.length) return '';

        const sectionUseFront = cfg.useFront !== false;
        const baseStyle = cfg.style || {};
        const perImageStyles = cfg.styles || [];

        const out = [];
        for (let slotIndex = 0; slotIndex < images.length; slotIndex++) {
            const imgIndex = (slotIndex + indexOffset) % images.length;
            const img = images[imgIndex];
            const perImage = perImageStyles[imgIndex] || {};

            // Per-image useFront override. base.ts string-coerces values,
            // so accept both boolean and 'true'/'false' strings.
            let imgUseFront = sectionUseFront;
            if ('useFront' in perImage) {
                const v = perImage.useFront;
                imgUseFront = !(v === false || v === 'false');
            }

            // Drop useFront from CSS-prop list — it's a control flag, not CSS.
            const cleanedPerImage = {};
            for (const k in perImage) {
                if (k !== 'useFront') cleanedPerImage[k] = perImage[k];
            }

            const styleObj = Object.assign({}, baseStyle, cleanedPerImage, {
                'background-image': 'url(' + img + ')'
            });
            const styleStr = getStyleByOptions(styleObj);
            const frontContent = imgUseFront ? 'after' : 'before';
            const nthChild = images.length + 'n + ' + (slotIndex + 1);
            out.push(
                "[id='workbench.parts.editor'] .split-view-view:nth-child(" + nthChild + ") " +
                ".editor-instance > .monaco-editor > .overflow-guard > .monaco-scrollable-element::" + frontContent +
                " { content: ''; width: 100%; height: 100%; position: absolute; " +
                "z-index: " + (imgUseFront ? '99' : 'initial') + "; " +
                "pointer-events: " + (imgUseFront ? 'none' : 'initial') + "; " +
                "transition: 0.3s; background-repeat: no-repeat; " +
                "mix-blend-mode: var(--bg-editor-blend, var(${blendModeVar})); " +
                styleStr + " }"
            );
        }
        return out.join(' ');
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

        // Minimap opacity: scaffold reads from --bg-editor-minimap-opacity; set
        // from cfg (default 0.8). Clears when cfg is null so default applies.
        if (cfg && typeof cfg.minimapOpacity === 'number') {
            document.body.style.setProperty('--bg-editor-minimap-opacity', String(cfg.minimapOpacity));
        } else {
            document.body.style.removeProperty('--bg-editor-minimap-opacity');
        }

        // Surface opacity — resolved value written by Studio.ts.
        if (cfg && typeof cfg.surfaceOpacity === 'number') {
            document.body.style.setProperty('--bg-surface-editor-opacity', String(cfg.surfaceOpacity));
        } else {
            document.body.style.removeProperty('--bg-surface-editor-opacity');
        }

        // Section-level blend-mode override. Empty / unset falls back to the
        // theme default (cssMixBlendMode CSS var).
        if (cfg && typeof cfg.blendMode === 'string' && cfg.blendMode.length) {
            document.body.style.setProperty('--bg-editor-blend', cfg.blendMode);
        } else {
            document.body.style.removeProperty('--bg-editor-blend');
        }

        if (!cfg || !(cfg.images && cfg.images.length)) {
            tag.textContent = '';
            return;
        }

        lastConfig = cfg;
        curIndex = cfg.random ? Math.floor(Math.random() * cfg.images.length) : 0;
        tag.textContent = buildEditorCss(cfg, curIndex);
        logTick(cfg, curIndex);

        if (cfg.interval > 0) {
            rotationTimer = setInterval(function () {
                curIndex = (curIndex + 1) % cfg.images.length;
                if (cfg.random) {
                    // Random: pick a fresh shuffle each tick by jumping curIndex
                    // to a random offset.
                    curIndex = Math.floor(Math.random() * cfg.images.length);
                }
                tag.textContent = buildEditorCss(lastConfig, curIndex);
                logTick(lastConfig, curIndex);
            }, cfg.interval * 1000);
        }
    }

    function logTick(cfg, idx) {
        try {
            const images = (cfg && cfg.images) || [];
            const styles = (cfg && cfg.styles) || [];
            console.log('[workbench-studio] editor tick', {
                index: idx,
                url: images[idx],
                style: styles[idx] || {}
            });
        } catch (e) {}
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
            const cfg = (workspaces[lookupKey] && workspaces[lookupKey].editor)
                || (workspaces.global && workspaces.global.editor)
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
    console.error('background editor loader failed:', e);
}
        `;
    }
}
