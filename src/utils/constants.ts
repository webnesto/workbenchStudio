import path from 'path';

import pkg from '../../package.json';

/** 版本号 */
export const VERSION: string = pkg.version;

/** 版本标识 */
export const BACKGROUND_VER = 'background.ver';

/** 文件编码 */
export const ENCODING = 'utf-8';

/** 发布者 */
export const PUBLISHER: string = pkg.publisher;

/** 扩展名 */
export const EXTENSION_NAME: string = pkg.name;

/** 扩展ID */
export const EXTENSION_ID = `${PUBLISHER}.${EXTENSION_NAME}`;

/** 版本临时文件，存放js路径、标识初次安装 */
export const TOUCH_JSFILE_PATH = path.join(__dirname, `../../vscb.${VERSION}.js.touch`);

/**
 * Extension install root (e.g. ~/.vscode/extensions/eno.background-eno-fork-2.0.10).
 * Files placed here are servable to the workbench renderer via vscode-file://
 * for stylesheet links — unlike arbitrary user-home paths, which the protocol
 * handler refuses for <link rel=stylesheet>.
 */
export const EXTENSION_DIR = path.join(__dirname, '../..');

/** State file used by the workspace-aware fullscreen runtime loader. */
export const STATE_CSS_PATH = path.join(EXTENSION_DIR, 'runtime-state.css');
export const STATE_JSON_PATH = path.join(EXTENSION_DIR, 'runtime-state.json');
