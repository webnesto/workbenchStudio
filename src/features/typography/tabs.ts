import { css, WithoutImagesPatchGenerator } from '../../core/patches/base';

export class TabsTypographyConfig {
    fontFamily = '';
    fontSize = 0;
    fontWeight = '';
    style: Record<string, string> = {};
}

/**
 * Overrides the font of editor tab labels (the file-name text inside each
 * tab). Static — changes require Apply-and-Reload.
 *
 * Selector targets just the label, not the whole tab — leaves icons / close
 * buttons / tab chrome at their default sizing so the tab row's height and
 * close-button alignment don't reflow.
 */
export class TabsTypographyPatchGenerator extends WithoutImagesPatchGenerator {
    private cfg: TabsTypographyConfig;

    constructor(cfg: Partial<TabsTypographyConfig> = {}) {
        super();
        this.cfg = { ...new TabsTypographyConfig(), ...cfg };
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
            .monaco-workbench .tab .monaco-icon-label .label-name {
                ${rules.join(' ')}
            }
        `;
    }
}
