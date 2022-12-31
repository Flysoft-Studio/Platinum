import { dirname, normalize } from "path";

export function getDir(electron: typeof Electron.CrossProcessExports) {
    const appPath = electron.app.getAppPath();
    const root = normalize((electron.app.isPackaged) ? (dirname(electron.app.getPath("exe"))) : (appPath));
    const asarDirname = normalize((electron.app.isPackaged) ? (dirname(appPath)) : (appPath));
    return {
        appPath: appPath,
        root: root,
        asarDirname: asarDirname,
    }
}