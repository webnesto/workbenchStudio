import { css } from '../../core/patches/base';
import { ThemePatchGenerator } from '../../core/patches/theme';
import { FullscreenPatchGenerator, FullscreenPatchGeneratorConfig } from './fullscreen';
import { buildSectionLoaderScript } from './section-loader';

export class PanelPatchGeneratorConfig extends FullscreenPatchGeneratorConfig {}

export class PanelPatchGenerator extends FullscreenPatchGenerator<PanelPatchGeneratorConfig> {
    protected cssvariable = '--background-panel-img';

    protected getStyle(): string {
        const { size, position, opacity } = this.curConfig;

        return css`
            .split-view-view > .part.panel::after {
                content: '';
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
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
 * Workspace-aware panel generator (Phase 2B).
 */
export class WorkspaceAwarePanelPatchGenerator extends PanelPatchGenerator {
    protected imageRequired = false;

    protected getStyle(): string {
        return css`
            .split-view-view > .part.panel::after {
                content: '';
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                background-position: var(--bg-pn-position, center);
                background-repeat: no-repeat;
                background-size: var(--bg-pn-size, cover);
                pointer-events: none;
                opacity: var(--bg-pn-opacity, 0.1);
                transition: 1s;
                mix-blend-mode: var(${ThemePatchGenerator.cssMixBlendMode});
                background-image: var(${this.cssvariable});
            }
        `;
    }

    protected getScript(): string {
        return buildSectionLoaderScript({
            sectionName: 'panel',
            cssVarImg: this.cssvariable,
            cssVarPrefix: 'bg-pn'
        });
    }
}
