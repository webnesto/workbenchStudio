import uglifyjs from 'uglify-js';

import { _ } from '../../utils';
import {
    AuxiliarybarPatchGeneratorConfig,
    WorkspaceAwareAuxiliarybarPatchGenerator
} from './PatchGenerator.auxiliarybar';
import { ChecksumsPatchGenerator } from './PatchGenerator.checksums';
import {
    EditorPatchGenerator,
    EditorPatchGeneratorConfig,
    LegacyEditorPatchGeneratorConfig,
    WorkspaceAwareEditorPatchGenerator
} from './PatchGenerator.editor';
import { FullscreenPatchGeneratorConfig, WorkspaceAwareFullscreenPatchGenerator } from './PatchGenerator.fullscreen';
import { PanelPatchGeneratorConfig, WorkspaceAwarePanelPatchGenerator } from './PatchGenerator.panel';
import { SidebarPatchGeneratorConfig, WorkspaceAwareSidebarPatchGenerator } from './PatchGenerator.sidebar';
import { ThemePatchGenerator } from './PatchGenerator.theme';

export type TPatchGeneratorConfig = {
    enabled: boolean;
    editor: EditorPatchGeneratorConfig;
    sidebar: SidebarPatchGeneratorConfig;
    auxiliarybar: AuxiliarybarPatchGeneratorConfig;
    panel: PanelPatchGeneratorConfig;
    fullscreen: FullscreenPatchGeneratorConfig;
} & LegacyEditorPatchGeneratorConfig;

export class PatchGenerator {
    public static create(options: TPatchGeneratorConfig) {
        const script = [
            // global
            new ChecksumsPatchGenerator().create(), // fix checksums
            new ThemePatchGenerator().create(), // hack theme
            // sections
            new WorkspaceAwareEditorPatchGenerator(
                EditorPatchGenerator.mergeLegacyConfig(options, options.editor)
            ).create(), // editor (workspace-aware)
            new WorkspaceAwareSidebarPatchGenerator(options.sidebar).create(), // sidebar (workspace-aware)
            new WorkspaceAwareAuxiliarybarPatchGenerator(options.auxiliarybar).create(), // auxiliarybar (workspace-aware)
            new WorkspaceAwarePanelPatchGenerator(options.panel).create(), // panel (workspace-aware)
            new WorkspaceAwareFullscreenPatchGenerator(options.fullscreen).create() // fullscreen (workspace-aware)
        ]
            .filter(n => !!n.length)
            .map(n => _.withIIFE(n))
            .join(';');

        // return script;
        return uglifyjs.minify(script).code;
    }
}
