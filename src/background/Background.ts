import fs from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import vscode, { Disposable, l10n, Uri } from 'vscode';

import {
    ENCODING,
    EXTENSION_NAME,
    STATE_CSS_PATH,
    STATE_JSON_PATH,
    TOUCH_JSFILE_PATH,
    VERSION
} from '../utils/constants';
import { vscodePath } from '../utils/vscodePath';
import { vsHelp } from '../utils/vsHelp';
import { CssFile } from './CssFile';
import { EFilePatchType, JsPatchFile } from './PatchFile';
import { PatchGenerator, TPatchGeneratorConfig } from './PatchGenerator';
import { AuxiliarybarPatchGenerator } from './PatchGenerator/PatchGenerator.auxiliarybar';
import { EditorPatchGenerator } from './PatchGenerator/PatchGenerator.editor';
import { FullscreenPatchGenerator } from './PatchGenerator/PatchGenerator.fullscreen';
import { PanelPatchGenerator } from './PatchGenerator/PatchGenerator.panel';
import { SidebarPatchGenerator } from './PatchGenerator/PatchGenerator.sidebar';

/**
 * 配置类型
 */
type TConfigType = vscode.WorkspaceConfiguration & TPatchGeneratorConfig;

/**
 * 插件逻辑类
 * Extension logic
 *
 * @export
 * @class Background
 */
export class Background implements Disposable {
    // #region fields 字段

    /**
     * 老版本css文件操作对象
     *
     * @memberof Background
     */
    public cssFile = new CssFile(vscodePath.cssPath); // 没必要继承，组合就行

    public jsFile = new JsPatchFile(vscodePath.jsPath);

    /**
     * Current config
     * 当前用户配置
     *
     * @private
     * @type {TConfigType}
     * @memberof Background
     */
    public get config() {
        return vscode.workspace.getConfiguration('background') as TConfigType;
    }

    /**
     * 需要释放的资源
     *
     * @private
     * @type {Disposable[]}
     * @memberof Background
     */
    private disposables: Disposable[] = [];

    // #endregion

    // #region private methods 私有方法

    /**
     * 检测是否初次加载
     *
     * @private
     * @returns {boolean} 是否初次加载
     * @memberof Background
     */
    private async checkFirstload(): Promise<boolean> {
        const firstLoad = !fs.existsSync(TOUCH_JSFILE_PATH);

        if (firstLoad) {
            // 标识插件已启动过
            await fs.promises.writeFile(TOUCH_JSFILE_PATH, vscodePath.jsPath, ENCODING);
            return true;
        }

        return false;
    }

    public async showWelcome() {
        // 欢迎页
        const docDir = path.join(__dirname, '../../docs');
        const docName = /^zh/.test(vscode.env.language) ? 'welcome.zh-CN.md' : 'welcome.md';

        // welcome 内容
        let content = await fs.promises.readFile(path.join(docDir, docName), ENCODING);
        // 替换图片内联为base64
        content = content.replace(/\.\.\/images[^\")]+/g, (relativePath: string) => {
            const imgPath = path.join(vscodePath.extRoot, 'images', relativePath);

            return (
                `data:image/${path.extname(imgPath).slice(1) || 'png'};base64,` +
                Buffer.from(fs.readFileSync(imgPath)).toString('base64')
            );
        });
        // 替换变量
        const paramsMap = {
            VERSION
        };
        for (const [key, value] of Object.entries(paramsMap)) {
            content = content.replaceAll('${' + key + '}', value);
        }
        vsHelp.showMarkdown(content, 'welcome');
    }

    /**
     * 移除旧版本css文件中的patch
     *
     * @private
     * @return {*}
     * @memberof Background
     */
    private async removeLegacyCssPatch() {
        try {
            const hasInstalled = await this.cssFile.hasInstalled();
            if (!hasInstalled) {
                return;
            }
            await this.cssFile.uninstall();
        } catch (ex) {}
    }

    /**
     * 配置改变，confirm 并提示应用&重启
     *
     * @private
     * @return {*}
     * @memberof Background
     */
    private async onConfigChange() {
        const hasInstalled = await this.hasInstalled();
        const enabled = this.config.enabled;

        // 禁用
        if (!enabled) {
            if (hasInstalled) {
                // await this.uninstall();

                vsHelp.reload({
                    message: l10n.t('Background will be disabled.'),
                    btnReload: l10n.t('Disable and Reload'),
                    beforeReload: () => this.uninstall()
                });
            }
            return;
        }

        // 更新，需要二次确认
        vsHelp.reload({
            message: l10n.t('Configuration has been changed, click to apply.'),
            btnReload: l10n.t('Apply and Reload'),
            beforeReload: () => this.applyPatch()
        });
    }

    public async applyPatch() {
        // 禁用时候，不处理
        if (!this.config.enabled) {
            return;
        }

        const scriptContent = PatchGenerator.create(this.config);
        return this.jsFile.applyPatches(scriptContent);
    }

    /**
     * Workspace identifier for the per-workspace state file entry.
     *
     * Resolution order (must match the loader's renderer-side detection):
     * 1. `vscode.workspace.workspaceFile` if it's a saved file:// URI (i.e. an
     *    actual `.code-workspace` file). Untitled workspaces use vscode-userdata://
     *    and aren't suitable as cross-process keys.
     * 2. First workspace folder URI for plain folder-only workspaces.
     * 3. "global" for empty windows.
     *
     * The renderer (in WorkspaceAwareFullscreen/EditorPatchGenerator) reads
     * `window.vscode.context.resolveConfiguration().workspace.configPath._formatted`
     * for case 1 — both sides converge on the same URI string.
     */
    private getWorkspaceKey(): string {
        const wsFile = vscode.workspace.workspaceFile;
        if (wsFile && wsFile.scheme === 'file') {
            return wsFile.toString();
        }
        return vscode.workspace.workspaceFolders?.[0]?.uri.toString() || 'global';
    }

    /**
     * Write the resolved per-workspace fullscreen config to two files in the
     * extension install dir:
     *
     * - runtime-state.css  — `:root { --bg-state-b64: "<base64 JSON>"; }` for the
     *                        patched workbench JS to load via <link> injection
     *                        and read via getComputedStyle.
     * - runtime-state.json — same content as JSON, for human inspection.
     *
     * Why CSS in the extension dir? The workbench renderer's CSP is strict:
     * fetch/xhr block vscode-file://, <script src> requires TrustedTypes (and
     * the policy allowlist excludes ours), <link rel=stylesheet> from arbitrary
     * user-home paths is refused by the vscode-file:// protocol handler. But
     * <link> from inside an extension's install dir works — that's our channel.
     *
     * The patched workbench JS polls every 1.5s, so changes apply without an
     * Apply-and-Reload cycle.
     */
    public async writeWorkspaceState(): Promise<void> {
        // Serialize across all windows via a filesystem lock. Multiple windows
        // fire onDidChangeConfiguration simultaneously when settings.json saves;
        // without a lock, concurrent read-modify-write cycles produce two distinct
        // problems:
        //   1. Same `.tmp` filename collisions corrupt the file mid-write.
        //   2. Read-then-write races silently lose updates from windows whose
        //      write got clobbered by a later writer's rename.
        await this.withStateLock(() => this.doWriteWorkspaceState());
    }

    /**
     * Acquire a file-based exclusive lock for the duration of `fn`, then release.
     * Lock file uses O_EXCL semantics; if held by another process, retries with
     * a short delay. Stale locks (older than 10s — older than any reasonable
     * write cycle) are forcibly reclaimed.
     */
    private async withStateLock<T>(fn: () => Promise<T>): Promise<T> {
        const lockPath = STATE_CSS_PATH + '.lock';
        const maxAttempts = 100;
        const delayMs = 25;
        const staleAfterMs = 10_000;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const fd = await fs.promises.open(lockPath, 'wx');
                await fd.close();
                try {
                    return await fn();
                } finally {
                    await fs.promises.unlink(lockPath).catch(() => {});
                }
            } catch (e: any) {
                if (e.code !== 'EEXIST') throw e;
                // Lock held — check for staleness, otherwise wait and retry.
                try {
                    const stat = await fs.promises.stat(lockPath);
                    if (Date.now() - stat.mtimeMs > staleAfterMs) {
                        await fs.promises.unlink(lockPath).catch(() => {});
                        continue;
                    }
                } catch {}
                await new Promise(r => setTimeout(r, delayMs));
            }
        }
        throw new Error('background: failed to acquire state-file lock after retries');
    }

    private async doWriteWorkspaceState(): Promise<void> {
        try {
            let state: any = { version: 1, workspaces: {} };
            try {
                const text = await fs.promises.readFile(STATE_JSON_PATH, ENCODING);
                state = JSON.parse(text);
                state.version ??= 1;
                state.workspaces ??= {};
            } catch {}

            // Pass the workspace folder URI as the scope so getConfiguration honors
            // folder-level `.vscode/settings.json` overrides — without a scope it
            // resolves to user + workspace settings only, missing folder-scoped values.
            const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
            const cfg = vscode.workspace.getConfiguration('background', folderUri);
            const fullscreenRaw = cfg.get<any>('fullscreen') || {};
            const editorRaw = cfg.get<any>('editor') || {};
            const sidebarRaw = cfg.get<any>('sidebar') || {};
            const panelRaw = cfg.get<any>('panel') || {};
            const auxiliarybarRaw = cfg.get<any>('auxiliarybar') || {};

            // Normalize image paths via each section's patch generator constructor.
            const fullscreenGen = new FullscreenPatchGenerator(fullscreenRaw);
            const editorMerged = EditorPatchGenerator.mergeLegacyConfig(this.config, editorRaw);
            const editorGen = new EditorPatchGenerator(editorMerged);
            const sidebarGen = new SidebarPatchGenerator(sidebarRaw);
            const panelGen = new PanelPatchGenerator(panelRaw);
            const auxiliarybarGen = new AuxiliarybarPatchGenerator(auxiliarybarRaw);

            const key = this.getWorkspaceKey();
            state.workspaces[key] = {
                fullscreen: fullscreenGen.config,
                editor: editorGen.config,
                sidebar: sidebarGen.config,
                panel: panelGen.config,
                auxiliarybar: auxiliarybarGen.config
            };
            // `current` is now used only as a fallback when the renderer-side
            // workspace detection (window.vscode.context.resolveConfiguration)
            // doesn't match any state entry. With Phase 2B in place each window
            // pins to its own workspace key, so `current` is best-effort.
            state.current = key;

            // Stale-entry cleanup: remove workspace entries that aren't currently open
            // in any window we've ever seen and aren't keyed the way we currently key.
            // We only know about THIS window's key here, so keep entries for any URL
            // shape — only prune entries that look obviously dead (empty values, keys
            // that aren't valid URIs or 'global'). Per-window cleanup happens implicitly
            // because the renderer ignores entries it doesn't match.
            this.pruneStaleStateEntries(state);

            const stateJson = JSON.stringify(state, null, 2);
            // Base64-encode the JSON so we can embed it in a CSS string without
            // worrying about quote/backslash escaping.
            const stateB64 = Buffer.from(stateJson, 'utf-8').toString('base64');
            const stateCss = `:root { --bg-state-b64: "${stateB64}"; }\n`;

            // Atomic writes via process-unique tmp filename + rename. The PID
            // suffix prevents tmp-file collisions if anyone manages to enter
            // this code without holding the lock (defense in depth).
            const tmpSuffix = `.${process.pid}.tmp`;
            const cssTmp = STATE_CSS_PATH + tmpSuffix;
            await fs.promises.writeFile(cssTmp, stateCss, ENCODING);
            await fs.promises.rename(cssTmp, STATE_CSS_PATH);

            const jsonTmp = STATE_JSON_PATH + tmpSuffix;
            await fs.promises.writeFile(jsonTmp, stateJson, ENCODING);
            await fs.promises.rename(jsonTmp, STATE_JSON_PATH);
        } catch (ex) {
            console.error('background: failed to write workspace state', ex);
        }
    }

    /**
     * Drop workspace entries whose key URI refers to a file/folder that no
     * longer exists on disk. Keeps 'global' and any non-file:// URIs.
     *
     * Mutates the state object in-place. Called from writeWorkspaceState.
     */
    private pruneStaleStateEntries(state: any): void {
        const ws = state?.workspaces;
        if (!ws || typeof ws !== 'object') return;

        for (const key of Object.keys(ws)) {
            if (key === 'global') continue;
            if (!key.startsWith('file://')) continue;

            try {
                // Parse the URI's fs path. Use vscode.Uri to handle URL-encoded paths.
                const fsPath = vscode.Uri.parse(key).fsPath;
                if (!fs.existsSync(fsPath)) {
                    delete ws[key];
                }
            } catch {
                // Malformed URI — treat as stale.
                delete ws[key];
            }
        }
    }

    public previewPatch() {
        const scriptContent = PatchGenerator.create(this.config);
        vsHelp.showMarkdown('```ts\n' + scriptContent + '\n```', 'preview-patch');
    }

    // #endregion

    // #region public methods

    /**
     * 初始化
     *
     * @return {*}  {Promise<any>}
     * @memberof Background
     */
    public async setup(): Promise<any> {
        await this.removeLegacyCssPatch(); // 移除「v1旧版本」patch

        await this.checkFirstload(); // 是否初次加载插件

        // Seed the per-workspace state file so the patched workbench JS has data to read.
        await this.writeWorkspaceState();

        const patchType = await this.jsFile.getPatchType(); // 「js文件」目前状态

        // 如果「开启」状态，文件不是「latest」，则进行「提示更新」
        // 此时一般为 「background更新」、「vscode更新」
        const needApply = [EFilePatchType.Legacy, EFilePatchType.None].includes(patchType);
        if (this.config.enabled && needApply) {
            // 提示
            vscode.window
                .showInformationMessage(
                    l10n.t('Background@{version} is ready! Apply to take effect.', { version: VERSION }),
                    {
                        title: l10n.t('Apply and Reload'),
                        action: async () => {
                            await this.applyPatch();
                            await vsHelp.reload();
                        }
                    },
                    {
                        title: l10n.t('More'),
                        action: () => this.showWelcome()
                    }
                )
                .then(confirm => {
                    confirm?.action();
                });
        }
        // if ([EFilePatchType.Legacy, EFilePatchType.None].includes(patchType)) {
        //     // 提示： 欢迎使用 background@version! 「应用并重载」、「更多」
        //     if (await this.applyPatch()) {
        //         vsHelp.reload({
        //             message: l10n.t('Background has been changed! Please reload.')
        //         });
        //     }
        // }

        // 监听文件改变
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(async ex => {
                const hasChanged = ex.affectsConfiguration('background');
                if (!hasChanged) {
                    return;
                }

                // Always update the state file so all workspace-aware sections refresh
                // live without an Apply-and-Reload cycle.
                await this.writeWorkspaceState();

                // All section settings (fullscreen/editor/sidebar/panel/auxiliarybar)
                // are now workspace-aware and reload-free. Only `background.enabled`
                // requires re-patching workbench.js, so prompt only for that.
                const enabledChanged = ex.affectsConfiguration('background.enabled');
                if (!enabledChanged) {
                    return;
                }

                this.onConfigChange();
            })
        );

        // Workspace folder changes shift which key the patched JS picks up.
        this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => this.writeWorkspaceState()));
    }

    /**
     * 是否已安装
     *
     * @return {*}
     * @memberof Background
     */
    public hasInstalled(): Promise<boolean> {
        return this.jsFile.hasPatched();
    }

    /**
     * 卸载
     *
     * @return {*}  {Promise<boolean>} 是否成功卸载
     * @memberof Background
     */
    public async uninstall(): Promise<boolean> {
        await this.removeLegacyCssPatch();
        return this.jsFile.restore();
    }

    /**
     * 释放资源
     *
     * @memberof Background
     */
    public dispose(): void {
        this.disposables.forEach(n => n.dispose());
    }

    // #endregion
}
