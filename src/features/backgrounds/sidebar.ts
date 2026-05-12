import { css } from '../../core/patches/base';
import { ThemePatchGenerator } from '../../core/patches/theme';
import { FullscreenPatchGenerator, FullscreenPatchGeneratorConfig } from './fullscreen';
import { buildSectionLoaderScript } from './section-loader';

export class SidebarPatchGeneratorConfig extends FullscreenPatchGeneratorConfig {}

export class SidebarPatchGenerator extends FullscreenPatchGenerator<SidebarPatchGeneratorConfig> {
    protected cssvariable = '--background-sidebar-img';

    protected getStyle(): string {
        const { size, position, opacity } = this.curConfig;

        return css`
            .split-view-view > .part.sidebar::after {
                content: '';
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                z-index: 99;
                background-position: ${position};
                background-repeat: no-repeat;
                background-size: ${size};
                pointer-events: none;
                opacity: ${opacity};
                transition: 1s;
                mix-blend-mode: var(${ThemePatchGenerator.cssMixBlendMode});
                background-image: var(${this.cssvariable});
            }
        `;
    }
}

/**
 * Workspace-aware sidebar generator (Phase 2B).
 *
 * Uses CSS-variable-driven scaffold + runtime loader (via the shared
 * buildSectionLoaderScript helper). Reads workspaces[key].sidebar from the
 * extension's runtime-state.css file. Per-window per-workspace correct.
 */
export class WorkspaceAwareSidebarPatchGenerator extends SidebarPatchGenerator {
    protected imageRequired = false;

    protected getStyle(): string {
        return css`
            .split-view-view > .part.sidebar,
            .split-view-view > .part.sidebar > .content {
                background-color: color-mix(
                    in srgb,
                    var(--vscode-sideBar-background) calc(var(--bg-surface-sidebar-opacity, 1) * 100%),
                    transparent
                ) !important;
            }
            .split-view-view > .part.sidebar::after {
                content: '';
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                z-index: var(--bg-sb-z-index, 99);
                background-position: var(--bg-sb-position, center);
                background-repeat: no-repeat;
                background-size: var(--bg-sb-size, cover);
                pointer-events: none;
                opacity: var(--bg-sb-opacity, 0.1);
                transition: 1s;
                mix-blend-mode: var(--bg-sb-blend, var(${ThemePatchGenerator.cssMixBlendMode}));
                background-image: var(${this.cssvariable});
            }
        `;
    }

    protected getScript(): string {
        return buildSectionLoaderScript({
            sectionName: 'sidebar',
            cssVarImg: this.cssvariable,
            cssVarPrefix: 'bg-sb',
            afterSelector: '.split-view-view > .part.sidebar::after',
            surfaceOpacityVar: '--bg-surface-sidebar-opacity'
        });
    }
}
