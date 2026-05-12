import { css, WithoutImagesPatchGenerator } from '../../core/patches/base';

export class PaneTitlesTypographyConfig {
    fontFamily = '';
    fontSize = 0;
    fontWeight = '';
    style: Record<string, string> = {};
}

/**
 * Overrides the font of pane titles and composite-bar tabs:
 *
 * - **Pane headers** — the "EXPLORER", "OUTLINE", "TIMELINE" style labels at
 *   the top of each collapsible pane in sidebar / panel / auxiliarybar.
 * - **Composite-bar tabs** — the view-switcher labels like "CHAT" /
 *   "CLAUDE CODE" that share the title bar of a pane composite.
 *
 * Static — changes require Apply-and-Reload.
 */
export class PaneTitlesTypographyPatchGenerator extends WithoutImagesPatchGenerator {
    private cfg: PaneTitlesTypographyConfig;

    constructor(cfg: Partial<PaneTitlesTypographyConfig> = {}) {
        super();
        this.cfg = { ...new PaneTitlesTypographyConfig(), ...cfg };
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
            .monaco-workbench .pane-header .title-label,
            .monaco-workbench .pane-header h3.title,
            .monaco-workbench .composite > .title .title-label,
            .monaco-workbench .composite > .title h2,
            .monaco-workbench .composite > .title h2.title,
            .monaco-workbench .pane-composite-part > .title h2,
            .monaco-workbench .pane-composite-part > .title .title-label,
            .monaco-workbench .title-actions h3.title,
            .monaco-workbench .title-actions .title-label,
            .monaco-workbench .composite-bar .action-label {
                ${rules.join(' ')}
            }
        `;
    }
}
