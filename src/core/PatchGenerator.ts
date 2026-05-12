import uglifyjs from 'uglify-js';

import {
    AuxiliarybarPatchGeneratorConfig,
    WorkspaceAwareAuxiliarybarPatchGenerator
} from '../features/backgrounds/auxiliarybar';
import { EditorPatchGeneratorConfig, WorkspaceAwareEditorPatchGenerator } from '../features/backgrounds/editor';
import {
    FullscreenPatchGeneratorConfig,
    WorkspaceAwareFullscreenPatchGenerator
} from '../features/backgrounds/fullscreen';
import { PanelPatchGeneratorConfig, WorkspaceAwarePanelPatchGenerator } from '../features/backgrounds/panel';
import { SidebarPatchGeneratorConfig, WorkspaceAwareSidebarPatchGenerator } from '../features/backgrounds/sidebar';
import { CustomCssPatchGenerator } from '../features/customCss';
import { ExplorerTypographyConfig, ExplorerTypographyPatchGenerator } from '../features/typography/explorer';
import { PaneTitlesTypographyConfig, PaneTitlesTypographyPatchGenerator } from '../features/typography/paneTitles';
import { TabsTypographyConfig, TabsTypographyPatchGenerator } from '../features/typography/tabs';
import { _ } from '../utils';
import { ChecksumsPatchGenerator } from './patches/checksums';
import { ThemePatchGenerator } from './patches/theme';

export type TPatchGeneratorConfig = {
    enabled: boolean;
    editor: EditorPatchGeneratorConfig;
    sidebar: SidebarPatchGeneratorConfig;
    auxiliarybar: AuxiliarybarPatchGeneratorConfig;
    panel: PanelPatchGeneratorConfig;
    fullscreen: FullscreenPatchGeneratorConfig;
    typography: {
        explorer: ExplorerTypographyConfig;
        tabs: TabsTypographyConfig;
        paneTitles: PaneTitlesTypographyConfig;
    };
};

export class PatchGenerator {
    public static create(options: TPatchGeneratorConfig) {
        const script = [
            new ChecksumsPatchGenerator().create(),
            new ThemePatchGenerator().create(),
            new WorkspaceAwareEditorPatchGenerator(options.editor).create(),
            new WorkspaceAwareSidebarPatchGenerator(options.sidebar).create(),
            new WorkspaceAwareAuxiliarybarPatchGenerator(options.auxiliarybar).create(),
            new WorkspaceAwarePanelPatchGenerator(options.panel).create(),
            new WorkspaceAwareFullscreenPatchGenerator(options.fullscreen).create(),
            new ExplorerTypographyPatchGenerator(options.typography.explorer).create(),
            new TabsTypographyPatchGenerator(options.typography.tabs).create(),
            new PaneTitlesTypographyPatchGenerator(options.typography.paneTitles).create(),
            new CustomCssPatchGenerator().create()
        ]
            .filter(n => !!n.length)
            .map(n => _.withIIFE(n))
            .join(';');

        return uglifyjs.minify(script).code;
    }
}
