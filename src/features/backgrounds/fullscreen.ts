import { AbsPatchGenerator, css } from '../../core/patches/base';
import { ThemePatchGenerator } from '../../core/patches/theme';
import { buildSectionLoaderScript } from './section-loader';

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
        // STUD4: fullscreen is a single-surface section, so it now shares the
        // generic real-CSS loader (rotate by flipping data-wbs-fs-idx on <html>;
        // image rules live in runtime-state.css). The bespoke inline loader and
        // its per-tick --bg-fs-* var juggling are gone.
        return buildSectionLoaderScript({ sectionName: 'fullscreen' });
    }
}
