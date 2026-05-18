import vscode, { l10n } from 'vscode';

import { Studio } from './core';
import { EXTENSION_ID } from './utils/constants';
import { vsHelp } from './utils/vsHelp';

function getStatusbar() {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);

    item.command = 'extension.workbenchStudio.showAllCommands';
    item.name = 'Workbench Studio';
    item.text = '$(symbol-color) Studio';
    item.tooltip = new vscode.MarkdownString(l10n.t('Show Workbench Studio commands'));
    item.show();

    return item;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const studio = new Studio();

    context.subscriptions.push(studio);
    const ok = await studio.setup();
    if (ok === false) {
        return;
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.workbenchStudio.info', function () {
            studio.showWelcome();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.workbenchStudio.install', async () => {
            await studio.config.update('enabled', true, true);
            const ok = await studio.applyPatch();
            if (!ok) {
                return;
            }
            await vsHelp.reload();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.workbenchStudio.disable', async () => {
            await studio.config.update('enabled', false, true);
            const ok = await studio.uninstall();
            if (!ok) {
                return;
            }
            await vsHelp.reload();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.workbenchStudio.uninstall', async () => {
            await studio.uninstall();
            await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', EXTENSION_ID);
            vsHelp.reload({
                message: l10n.t('Workbench Studio has been uninstalled. See you next time!')
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.workbenchStudio.previewPatch', async () => {
            studio.previewPatch();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.workbenchStudio.openDocs', async () => {
            await studio.pickDoc();
        })
    );

    const statusbar = getStatusbar();
    context.subscriptions.push(
        vscode.commands.registerCommand(statusbar.command as string, async () => {
            vscode.commands.executeCommand('workbench.action.quickOpen', '> Workbench Studio: ');
        })
    );
    context.subscriptions.push(statusbar);
}

export function deactivate(): void {}
