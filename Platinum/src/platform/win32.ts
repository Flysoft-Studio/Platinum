import { spawnSync } from "child_process";
import { ElectronLog, LogFunctions } from "electron-log";
import { release as osRelease } from "os";
import { dirname, normalize } from "path";
import { lte as verLte } from "semver";
import { getDir } from "../common/dir";

let log: LogFunctions;

let dir;
export const isBlurSupported = process.platform == "win32";
export const isBackdropSupported = process.platform == "win32" && verLte("10.0.22523", osRelease());

export function init(logger: ElectronLog, electron: typeof Electron.CrossProcessExports) {
    log = logger.scope("native");
    dir = getDir(electron);
}

export function spawnHelper(args: Array<string>) {
    const helperExecutable = dir.asarDirname + "/platform/win32/PlatinumHelper.exe";
    log.log("Run helper, args: " + JSON.stringify(args));
    spawnSync(helperExecutable, args, {
        shell: false,
        windowsHide: true,
    });
}