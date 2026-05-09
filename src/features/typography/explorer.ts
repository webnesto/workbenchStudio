import { css, WithoutImagesPatchGenerator } from '../../core/patches/base';

export class ExplorerTypographyConfig {
    fontFamily = '';
    fontSize = 0;
    fontWeight = '';
    style: Record<string, string> = {};
}

/**
 * Overrides the font of all sidebar tree views (explorer, source control,
 * search results, extensions list, run-and-debug). Static — font changes
 * require Apply-and-Reload.
 *
 * Typed fields (fontFamily/fontSize/fontWeight) render first; freeform
 * `style` entries render after so they win on duplicate keys.
 */
export class ExplorerTypographyPatchGenerator extends WithoutImagesPatchGenerator {
    private cfg: ExplorerTypographyConfig;

    constructor(cfg: Partial<ExplorerTypographyConfig> = {}) {
        super();
        this.cfg = { ...new ExplorerTypographyConfig(), ...cfg };
    }

    protected getStyle(): string {
        const { fontFamily, fontSize, fontWeight, style } = this.cfg;
        const rules: string[] = [];
        if (fontFamily) rules.push(`font-family: ${fontFamily} !important;`);
        if (fontSize) rules.push(`font-size: ${fontSize}px !important;`);
        if (fontWeight) rules.push(`font-weight: ${fontWeight} !important;`);
        for (const [k, v] of Object.entries(style || {})) {
            if (!k || v === undefined || v === '') continue;
            rules.push(`${k}: ${v} !important;`);
        }
        if (!rules.length) return '';

        return css`
            .monaco-workbench .pane-body .monaco-list-row {
                ${rules.join(' ')}
            }
        `;
    }
}
