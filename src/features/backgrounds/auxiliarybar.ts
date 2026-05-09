import { css } from '../../core/patches/base';
import { ThemePatchGenerator } from '../../core/patches/theme';
import { FullscreenPatchGenerator, FullscreenPatchGeneratorConfig } from './fullscreen';
import { buildSectionLoaderScript } from './section-loader';

export class AuxiliarybarPatchGeneratorConfig extends FullscreenPatchGeneratorConfig {}

export class AuxiliarybarPatchGenerator extends FullscreenPatchGenerator<AuxiliarybarPatchGeneratorConfig> {
    protected cssvariable = '--background-auxiliarybar-img';

    protected getStyle(): string {
        const { size, position, opacity } = this.curConfig;

        return css`
            .split-view-view > .part.auxiliarybar::after {
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
 * Workspace-aware auxiliarybar generator (Phase 2B).
 */
export class WorkspaceAwareAuxiliarybarPatchGenerator extends AuxiliarybarPatchGenerator {
    protected imageRequired = false;

    protected getStyle(): string {
        return css`
            .split-view-view > .part.auxiliarybar::after {
                content: '';
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                background-position: var(--bg-ax-position, center);
                background-repeat: no-repeat;
                background-size: var(--bg-ax-size, cover);
                pointer-events: none;
                opacity: var(--bg-ax-opacity, 0.1);
                transition: 1s;
                mix-blend-mode: var(${ThemePatchGenerator.cssMixBlendMode});
                background-image: var(${this.cssvariable});
            }
        `;
    }

    protected getScript(): string {
        return buildSectionLoaderScript({
            sectionName: 'auxiliarybar',
            cssVarImg: this.cssvariable,
            cssVarPrefix: 'bg-ax'
        });
    }
}
