import fs from 'fs';
import { homedir, tmpdir } from 'os';
import path from 'path';

import vscode, { Disposable, l10n, Uri } from 'vscode';

import { AuxiliarybarPatchGenerator } from '../features/backgrounds/auxiliarybar';
import { EditorPatchGenerator } from '../features/backgrounds/editor';
import { FullscreenPatchGenerator } from '../features/backgrounds/fullscreen';
import { PanelPatchGenerator } from '../features/backgrounds/panel';
import { SidebarPatchGenerator } from '../features/backgrounds/sidebar';
import {
    BACKGROUNDS_KEY,
    CONFIG_NAMESPACE,
    CUSTOM_CSS_FILES_KEY,
    CUSTOM_CSS_KEY,
    ENCODING,
    STATE_CSS_PATH,
    STATE_JSON_PATH,
    SURFACE_OPACITY_KEY,
    TOUCH_JSFILE_PATH,
    TYPOGRAPHY_KEY,
    VERSION
} from '../utils/constants';
import { vscodePath } from '../utils/vscodePath';
import { vsHelp } from '../utils/vsHelp';
import { CssFile } from './CssFile';
import { EFilePatchType, JsPatchFile } from './PatchFile';
import { PatchGenerator, TPatchGeneratorConfig } from './PatchGenerator';

export class Studio implements Disposable {
    // #region fields 字段

    public cssFile = new CssFile(vscodePath.cssPath);

    public jsFile = new JsPatchFile(vscodePath.jsPath);

    /**
     * Raw VSCode workspace configuration for the workbenchStudio namespace.
     * Use this for `.update()` calls and direct key access (e.g. `enabled`).
     * For the patch-generator's nested shape, use `getPatchConfig()`.
     */
    public get config(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    }

    /**
     * Build the nested config the PatchGenerator expects from the flat
     * settings layout (`workbenchStudio.enabled`, `workbenchStudio.backgrounds.*`).
     */
    private getPatchConfig(folderUri?: vscode.Uri): TPatchGeneratorConfig {
        const cfg = vscode.workspace.getConfiguration(CONFIG_NAMESPACE, folderUri);
        const bg = cfg.get<any>(BACKGROUNDS_KEY) || {};
        const tg = cfg.get<any>(TYPOGRAPHY_KEY) || {};
        return {
            enabled: cfg.get<boolean>('enabled', true),
            editor: bg.editor || {},
            fullscreen: bg.fullscreen || {},
            sidebar: bg.sidebar || {},
            panel: bg.panel || {},
            auxiliarybar: bg.auxiliarybar || {},
            typography: {
                explorer: tg.explorer || {},
                tabs: tg.tabs || {},
                paneTitles: tg.paneTitles || {}
            }
        };
    }

    /**
     * 需要释放的资源
     *
     * @private
     * @type {Disposable[]}
     * @memberof Studio
     */
    private disposables: Disposable[] = [];

    /**
     * Active fs.watch handles, keyed by resolved absolute file path. Each
     * entry observes a user-provided `workbenchStudio.cssFiles` path; on file
     * change the handler triggers `writeWorkspaceState` so the runtime state
     * file reflects the new content. Each window picks it up on next reload.
     */
    private cssFileWatchers = new Map<string, fs.FSWatcher>();

    // #endregion

    // #region private methods 私有方法

    /**
     * 检测是否初次加载
     *
     * @private
     * @returns {boolean} 是否初次加载
     * @memberof Studio
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

    public showWelcome() {
        return this.showDoc('welcome');
    }

    /**
     * Render any markdown file from `docs/` in an in-VSCode markdown preview.
     *
     * Syncs ALL doc files to a shared tmp dir (with image and version
     * substitutions applied), then opens the requested one. Writing them all
     * to the same dir makes relative `.md` links between docs resolve
     * correctly in the markdown preview.
     *
     * Inline-substitutes images from the extension's `images/` dir as base64
     * data URLs and replaces `${VERSION}` template tokens.
     */
    public async showDoc(name: string) {
        const docDir = path.join(__dirname, '../../docs');
        const tmpDocDir = path.join(tmpdir(), 'workbench-studio-docs');
        await fs.promises.mkdir(tmpDocDir, { recursive: true });

        let docFiles: string[];
        try {
            docFiles = (await fs.promises.readdir(docDir)).filter(f => f.endsWith('.md'));
        } catch {
            docFiles = [];
        }

        for (const file of docFiles) {
            const srcPath = path.join(docDir, file);
            const tmpPath = path.join(tmpDocDir, file);
            let content = await fs.promises.readFile(srcPath, ENCODING);
            content = content.replace(/\.\.\/images[^\")]+/g, (relativePath: string) => {
                try {
                    const imgPath = path.join(vscodePath.extRoot, 'images', relativePath);
                    return (
                        `data:image/${path.extname(imgPath).slice(1) || 'png'};base64,` +
                        Buffer.from(fs.readFileSync(imgPath)).toString('base64')
                    );
                } catch {
                    return relativePath;
                }
            });
            const paramsMap = { VERSION } as Record<string, string>;
            for (const [key, value] of Object.entries(paramsMap)) {
                content = content.replaceAll('${' + key + '}', value);
            }
            await fs.promises.writeFile(tmpPath, content, ENCODING);
        }

        const targetPath = path.join(tmpDocDir, `${name}.md`);
        if (!fs.existsSync(targetPath)) {
            vscode.window.showErrorMessage(`Workbench Studio: documentation page "${name}" not found.`);
            return;
        }
        vscode.commands.executeCommand('markdown.showPreviewToSide', vscode.Uri.file(targetPath));
    }

    /**
     * QuickPick menu listing the doc pages — the entry point for the
     * "Open Documentation" command.
     */
    public async pickDoc() {
        const items: Array<vscode.QuickPickItem & { name: string }> = [
            { name: 'welcome', label: 'Welcome', description: 'Overview and quickstart' },
            { name: 'backgrounds', label: 'Backgrounds', description: 'All 5 sections, per-image overrides, recipes' },
            { name: 'typography', label: 'Typography', description: 'Explorer / tabs / pane title fonts' },
            { name: 'css', label: 'Custom CSS', description: 'Raw CSS injection escape hatch' },
            { name: 'defaults', label: 'Defaults', description: "What's auto-applied and how to override" },
            { name: 'dangers', label: 'Dangers', description: 'Footguns and recovery procedures' }
        ];
        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: 'Workbench Studio: pick a documentation page'
        });
        if (pick) {
            this.showDoc(pick.name);
        }
    }

    /**
     * 移除旧版本css文件中的patch
     *
     * @private
     * @return {*}
     * @memberof Studio
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
     * @memberof Studio
     */
    private async onConfigChange() {
        const hasInstalled = await this.hasInstalled();
        const enabled = this.config.get<boolean>('enabled', true);

        if (!enabled) {
            if (hasInstalled) {
                vsHelp.reload({
                    message: l10n.t('Workbench Studio will be disabled.'),
                    btnReload: l10n.t('Disable and Reload'),
                    beforeReload: () => this.uninstall()
                });
            }
            return;
        }

        vsHelp.reload({
            message: l10n.t('Configuration has been changed, click to apply.'),
            btnReload: l10n.t('Apply and Reload'),
            beforeReload: () => this.applyPatch()
        });
    }

    public async applyPatch() {
        if (!this.config.get<boolean>('enabled', true)) {
            return false;
        }

        const scriptContent = PatchGenerator.create(this.getPatchConfig());
        const ok = await this.jsFile.applyPatches(scriptContent);
        if (!ok) {
            this.showPatchWriteError('apply Workbench Studio');
        }
        return ok;
    }

    private showPatchWriteError(action: string) {
        vscode.window.showErrorMessage(
            `Workbench Studio could not ${action}. It needs write access to ${vscodePath.jsPath}. If this VS Code install is not user-writable, retry and approve the admin prompt.`
        );
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
     * The patched workbench JS reads this state file once at workbench boot.
     * Settings changes require Apply-and-Reload to take effect — see
     * docs/dangers.md#why-settings-changes-require-apply-and-reload.
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
        throw new Error('workbench-studio: failed to acquire state-file lock after retries');
    }

    /**
     * Resolve a user-provided CSS file path. Accepts:
     *  - `file://` URIs
     *  - `~/...` home-relative paths
     *  - Absolute paths
     *  - Relative paths (resolved against the first workspace folder)
     */
    private resolveCssFilePath(p: string): string {
        if (!p) return '';
        if (p.startsWith('file://')) {
            try {
                return vscode.Uri.parse(p).fsPath;
            } catch {
                return p;
            }
        }
        if (p.startsWith('~/') || p === '~') {
            return path.join(homedir(), p.slice(p === '~' ? 1 : 2));
        }
        if (path.isAbsolute(p)) return p;
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return ws ? path.join(ws, p) : p;
    }

    /**
     * Read all configured CSS files, returning their concatenated content
     * (newline-separated). Missing / unreadable files contribute the empty
     * string — no surfaced errors, since this is a power-user knob.
     */
    private async readCssFiles(paths: string[]): Promise<string> {
        const results = await Promise.all(
            paths.map(async p => {
                const resolved = this.resolveCssFilePath(p);
                if (!resolved) return '';
                try {
                    return await fs.promises.readFile(resolved, ENCODING);
                } catch {
                    return '';
                }
            })
        );
        return results.filter(s => s && s.length).join('\n');
    }

    /**
     * Sync the active `fs.watch` set with the resolved list of user CSS files.
     * Each watch fires `writeWorkspaceState` so the runtime state file reflects
     * the new content. Windows pick it up on next reload.
     */
    private reconcileCssWatchers(resolvedPaths: string[]) {
        const wanted = new Set(resolvedPaths.filter(p => p && p.length));

        for (const [p, w] of this.cssFileWatchers) {
            if (!wanted.has(p)) {
                try {
                    w.close();
                } catch {}
                this.cssFileWatchers.delete(p);
            }
        }

        for (const p of wanted) {
            if (this.cssFileWatchers.has(p)) continue;
            try {
                const w = fs.watch(p, () => {
                    this.writeWorkspaceState();
                });
                this.cssFileWatchers.set(p, w);
            } catch {
                // File may not exist yet (user hasn't created it) — try again on next reconcile.
            }
        }
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
            // folder-level `.vscode/settings.json` overrides.
            const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
            const cfg = vscode.workspace.getConfiguration(CONFIG_NAMESPACE, folderUri);
            const bg = cfg.get<any>(BACKGROUNDS_KEY) || {};
            const fullscreenRaw = bg.fullscreen || {};
            const editorRaw = bg.editor || {};
            const sidebarRaw = bg.sidebar || {};
            const panelRaw = bg.panel || {};
            const auxiliarybarRaw = bg.auxiliarybar || {};

            // Normalize image paths via each section's patch generator constructor.
            const fullscreenGen = new FullscreenPatchGenerator(fullscreenRaw);
            const editorGen = new EditorPatchGenerator(editorRaw);
            const sidebarGen = new SidebarPatchGenerator(sidebarRaw);
            const panelGen = new PanelPatchGenerator(panelRaw);
            const auxiliarybarGen = new AuxiliarybarPatchGenerator(auxiliarybarRaw);

            // Resolve surface opacity per section. User-explicit values win;
            // otherwise smart-default to 0 (transparent) when the section has
            // its own background images; otherwise 1 (theme color visible).
            const surfaceOpacity = this.resolveSurfaceOpacities(folderUri, {
                editor: (editorGen.config.images || []).length > 0,
                sidebar: (sidebarGen.config.images || []).length > 0,
                panel: (panelGen.config.images || []).length > 0,
                auxiliarybar: (auxiliarybarGen.config.images || []).length > 0
            });

            // Raw CSS injection — accept string or string[], normalize to one string.
            const rawCss = cfg.get<any>(CUSTOM_CSS_KEY);
            const inlineCss = Array.isArray(rawCss)
                ? rawCss.filter(s => typeof s === 'string').join('\n')
                : typeof rawCss === 'string'
                  ? rawCss
                  : '';

            // CSS file paths — resolve, read, watch.
            const rawCssFiles = cfg.get<any>(CUSTOM_CSS_FILES_KEY);
            const cssFilePaths = (
                Array.isArray(rawCssFiles)
                    ? rawCssFiles
                    : typeof rawCssFiles === 'string' && rawCssFiles
                      ? [rawCssFiles]
                      : []
            ).filter((s: any) => typeof s === 'string' && s.length);
            const resolvedFilePaths = cssFilePaths.map(p => this.resolveCssFilePath(p));
            this.reconcileCssWatchers(resolvedFilePaths);
            const fileCss = await this.readCssFiles(cssFilePaths);

            const customCss = [inlineCss, fileCss].filter(s => s && s.length).join('\n');

            const key = this.getWorkspaceKey();
            state.workspaces[key] = {
                fullscreen: { ...fullscreenGen.config },
                editor: { ...editorGen.config, surfaceOpacity: surfaceOpacity.editor },
                sidebar: { ...sidebarGen.config, surfaceOpacity: surfaceOpacity.sidebar },
                panel: { ...panelGen.config, surfaceOpacity: surfaceOpacity.panel },
                auxiliarybar: { ...auxiliarybarGen.config, surfaceOpacity: surfaceOpacity.auxiliarybar },
                css: customCss
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
            console.error('workbench-studio: failed to write workspace state', ex);
        }
    }

    /**
     * Resolve effective surface opacity (0..1) for each section.
     *
     * Per-section flow:
     *   1. If the user has any explicit value in any settings scope (user,
     *      workspace, folder), use it.
     *   2. Else if the section has its own background images, default to 0
     *      (transparent — preserves the original always-strip behavior for
     *      editor backgrounds and makes per-section images visible elsewhere).
     *   3. Else 1 (theme background color visible — no change from VSCode default).
     */
    private resolveSurfaceOpacities(
        folderUri: vscode.Uri | undefined,
        flags: {
            editor: boolean;
            sidebar: boolean;
            panel: boolean;
            auxiliarybar: boolean;
        }
    ): { editor: number; sidebar: number; panel: number; auxiliarybar: number } {
        const cfg = vscode.workspace.getConfiguration(CONFIG_NAMESPACE, folderUri);
        const surfaces = cfg.get<any>(SURFACE_OPACITY_KEY) || {};
        const inspected = cfg.inspect<any>(SURFACE_OPACITY_KEY);

        const isExplicit = (section: string): boolean => {
            const scopes = [
                inspected?.globalValue,
                inspected?.workspaceValue,
                inspected?.workspaceFolderValue,
                inspected?.globalLanguageValue,
                inspected?.workspaceLanguageValue,
                inspected?.workspaceFolderLanguageValue
            ];
            return scopes.some(s => s && typeof s === 'object' && typeof s[section] === 'number');
        };

        const resolveOne = (section: 'editor' | 'sidebar' | 'panel' | 'auxiliarybar'): number => {
            if (isExplicit(section)) {
                const v = surfaces[section];
                if (typeof v === 'number') return Math.max(0, Math.min(1, v));
            }
            if (flags[section]) return 0;
            return 1;
        };

        return {
            editor: resolveOne('editor'),
            sidebar: resolveOne('sidebar'),
            panel: resolveOne('panel'),
            auxiliarybar: resolveOne('auxiliarybar')
        };
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
        const scriptContent = PatchGenerator.create(this.getPatchConfig());
        vsHelp.showMarkdown('```ts\n' + scriptContent + '\n```', 'preview-patch');
    }

    // #endregion

    // #region public methods

    /**
     * 初始化
     *
     * @return {*}  {Promise<any>}
     * @memberof Studio
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
        if (this.config.get<boolean>('enabled', true) && needApply) {
            vscode.window
                .showInformationMessage(
                    l10n.t('Workbench Studio@{version} is ready! Apply to take effect.', { version: VERSION }),
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
        //             message: l10n.t('Workbench Studio has been changed! Please reload.')
        //         });
        //     }
        // }

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(async ex => {
                const hasChanged = ex.affectsConfiguration(CONFIG_NAMESPACE);
                if (!hasChanged) {
                    return;
                }

                await this.writeWorkspaceState();

                // All settings now require reload: loaders read the state file
                // once at workbench init and don't poll for changes. Settings
                // changes propagate to the state file immediately but each
                // window needs a reload to pick them up.
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
     * @memberof Studio
     */
    public hasInstalled(): Promise<boolean> {
        return this.jsFile.hasPatched();
    }

    /**
     * 卸载
     *
     * @return {*}  {Promise<boolean>} 是否成功卸载
     * @memberof Studio
     */
    public async uninstall(): Promise<boolean> {
        await this.removeLegacyCssPatch();
        const ok = await this.jsFile.restore();
        if (!ok) {
            this.showPatchWriteError('remove its workbench patch');
        }
        return ok;
    }

    /**
     * 释放资源
     *
     * @memberof Studio
     */
    public dispose(): void {
        this.disposables.forEach(n => n.dispose());
        for (const w of this.cssFileWatchers.values()) {
            try {
                w.close();
            } catch {}
        }
        this.cssFileWatchers.clear();
    }

    // #endregion
}
