import { AbsPatchGenerator, css } from '../../core/patches/base';
import { ThemePatchGenerator } from '../../core/patches/theme';
import { STATE_CSS_PATH } from '../../utils/constants';

/**
 * Module-level style serializer for the static per-image rule builder.
 * Mirrors EditorPatchGenerator.getStyleByOptions: always drop pointer-events
 * (clicks must pass through) and z-index (no access to other elements' stacks).
 */
function serializeStyle(style: Record<string, string>): string {
    const excludeKeys = ['pointer-events', 'z-index'];
    return Object.entries(style)
        .filter(([key]) => !excludeKeys.includes(key))
        .map(([key, value]) => `${key}: ${value};`)
        .join('');
}

/**
 * Deterministic 32-bit djb2 hash of a workspace key → base36 string. Gates the
 * per-workspace editor rules (`:root[data-wbs-ws="<hash>"]`). The renderer
 * loader (getScript) inlines the byte-identical algorithm so both sides agree
 * on the attribute value — keep them in sync.
 */
export function wsAttrHash(key: string): string {
    let h = 5381;
    for (let i = 0; i < key.length; i++) {
        h = ((h << 5) + h + key.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/**
 * STUD4 real-CSS transport. Emit the editor's per-image background rules as
 * *real* static CSS declarations (not packed into the --bg-state-b64 custom
 * property, which is what blew past Chromium's per-property cap — STUD3).
 *
 * One rule per image, selected by `.split-view-view[data-wbs-ed-img="<m>"]`.
 * The renderer loader tags each editor split with the index of the image it
 * should currently show and rotates by re-tagging — so image paths and
 * per-image styles never flow through a capped property. Per-split-distinct
 * rotation is preserved (split p shows image (p + offset) % count).
 *
 * @param cfg         editor config slice (images, styles, style, useFront)
 * @param wsSelector  workspace gate, e.g. `:root[data-wbs-ws="abc"]`
 */
export function buildEditorImageRules(
    cfg: {
        images?: string[];
        styles?: Array<Record<string, string>>;
        style?: Record<string, string>;
        useFront?: boolean;
    },
    wsSelector: string
): string {
    const images = cfg.images || [];
    if (!images.length) return '';

    const sectionUseFront = cfg.useFront !== false;
    const baseStyle = cfg.style || {};
    const perImageStyles = cfg.styles || [];
    const blendModeVar = ThemePatchGenerator.cssMixBlendMode;

    const out: string[] = [];
    for (let m = 0; m < images.length; m++) {
        const img = images[m];
        const perImage = perImageStyles[m] || {};

        // Per-image useFront override. base.ts string-coerces values, so accept
        // both boolean and 'true'/'false' strings.
        let imgUseFront = sectionUseFront;
        if ('useFront' in perImage) {
            const v = (perImage as Record<string, unknown>).useFront;
            imgUseFront = !(v === false || v === 'false');
        }

        // Drop useFront from the CSS-prop list — it's a control flag, not CSS.
        const cleaned: Record<string, string> = {};
        for (const k in perImage) {
            if (k !== 'useFront') cleaned[k] = perImage[k];
        }

        const styleStr = serializeStyle({
            ...baseStyle,
            ...cleaned,
            'background-image': `url(${img})`
        });
        const frontContent = imgUseFront ? 'after' : 'before';

        out.push(
            `${wsSelector} [id='workbench.parts.editor'] .split-view-view[data-wbs-ed-img="${m}"] ` +
                `.editor-instance > .monaco-editor > .overflow-guard > .monaco-scrollable-element::${frontContent}` +
                ` { content: ''; width: 100%; height: 100%; position: absolute; ` +
                `z-index: ${imgUseFront ? '99' : 'initial'}; ` +
                `pointer-events: ${imgUseFront ? 'none' : 'initial'}; ` +
                `transition: 0.3s; background-repeat: no-repeat; ` +
                `mix-blend-mode: var(--bg-editor-blend, var(${blendModeVar})); ` +
                `${styleStr} }`
        );
    }
    return out.join('\n');
}

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

        return `
try {
    const STATE_URL = ${JSON.stringify(stateUrl)};
    const STATE_LINK_ID = 'background-editor-state-link';
    const WS_ATTR = 'data-wbs-ws';
    const IMG_ATTR = 'data-wbs-ed-img';
    const EDITOR_SEL = "[id='workbench.parts.editor']";

    let pollTimer = null;
    let rotationTimer = null;
    let observer = null;
    let myWorkspaceKey = null;
    let offset = 0;
    let count = 0;
    let rafPending = false;
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

    // Image rules live in runtime-state.css as real declarations selected by
    // .split-view-view[data-wbs-ed-img="<m>"]. We tag the *leaf* split of each
    // editor pane (closest .split-view-view to each .editor-instance) so
    // ancestor split containers never get painted with the wrong image.
    function editorPanes() {
        return document.querySelectorAll(EDITOR_SEL + ' .editor-instance');
    }

    // Pane p (DOM order) shows image (p + offset) % count. Reproduces the
    // legacy :nth-child(Nn+i) mapping: pane p and pane p+N resolve to the same
    // image, since +N is a no-op mod count.
    function tagSplits() {
        if (count <= 0) return;
        const panes = editorPanes();
        for (let p = 0; p < panes.length; p++) {
            const split = panes[p].closest('.split-view-view');
            if (split) split.setAttribute(IMG_ATTR, String((p + offset) % count));
        }
    }

    function clearTags() {
        const panes = editorPanes();
        for (let p = 0; p < panes.length; p++) {
            const split = panes[p].closest('.split-view-view');
            if (split) split.removeAttribute(IMG_ATTR);
        }
    }

    // New panes can appear between rotation ticks (or, with interval 0, never).
    // Re-tag on any editor-subtree mutation, throttled to one animation frame.
    function scheduleTag() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(function () {
            rafPending = false;
            tagSplits();
        });
    }

    function ensureObserver() {
        if (observer) return;
        // Observe a STABLE root (body). The editor part is built async during
        // workbench boot, so observing the editor element directly would no-op
        // (it isn't in the DOM yet) and never fire when it appears. Watching
        // body's subtree catches the editor part being created AND later split
        // open/close; the rAF throttle in scheduleTag coalesces the boot-time
        // mutation storm to one tagSplits per frame.
        const root = document.body || document.documentElement;
        if (!root) return;
        observer = new MutationObserver(scheduleTag);
        observer.observe(root, { childList: true, subtree: true });
    }

    function setVar(name, value) {
        if (typeof value === 'number') {
            document.body.style.setProperty(name, String(value));
        } else if (typeof value === 'string' && value.length) {
            document.body.style.setProperty(name, value);
        } else {
            document.body.style.removeProperty(name);
        }
    }

    // Knobs only — image paths/styles arrive as real CSS rules, never here.
    function applyKnobs(knobs) {
        if (rotationTimer) {
            clearInterval(rotationTimer);
            rotationTimer = null;
        }

        setVar('--bg-editor-minimap-opacity',
            knobs && typeof knobs.minimapOpacity === 'number' ? knobs.minimapOpacity : null);
        setVar('--bg-surface-editor-opacity',
            knobs && typeof knobs.surfaceOpacity === 'number' ? knobs.surfaceOpacity : null);
        setVar('--bg-editor-blend',
            knobs && typeof knobs.blendMode === 'string' ? knobs.blendMode : null);

        count = (knobs && knobs.count) || 0;
        if (count <= 0) {
            clearTags();
            return;
        }

        const interval = (knobs && knobs.interval) || 0;
        const random = !!(knobs && knobs.random);

        offset = random ? Math.floor(Math.random() * count) : 0;
        tagSplits();
        ensureObserver();

        if (interval > 0) {
            rotationTimer = setInterval(function () {
                offset = random ? Math.floor(Math.random() * count) : (offset + 1) % count;
                tagSplits();
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
            const knobs = (workspaces[lookupKey] && workspaces[lookupKey].editor)
                || (workspaces.global && workspaces.global.editor)
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
    console.error('background editor loader failed:', e);
}
        `;
    }
}
