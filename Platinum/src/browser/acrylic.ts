import { ipcRenderer } from "electron";
import { ElectronLog, LogFunctions } from "electron-log";
import { existsSync, readFileSync, watch } from "fs";
import getPixels = require("get-pixels-updated");
const remote = require("@electron/remote");

export let bgFile: string;
export let bgMIME: string;
export let bgName = ".bg";
export let bgSize = {};
export let isEnabled = true;
export let isInited = false;
let log: LogFunctions;

let blurWorker: Worker;

export function init(logger: ElectronLog) {
    log = logger.scope("acrylic");
    // only works on Windows
    if (process.platform == "win32") {
        const wpPath =
            process.env["AppData"] + "\\Microsoft\\Windows\\Themes\\TranscodedWallpaper";
        let exts = [
            "",
            "jpg",
            "jpeg",
            "bmp",
            "dib",
            "png",
            "jfif",
            "jpe",
            "gif",
            "tif",
            "tiff",
            "wdp",
            "heic",
            "heif",
            "heics",
            "heifs",
            "hif",
            "avci",
            "avcs",
            "avif",
            "avifs",
        ];
        for (let i = 0; i < exts.length; i++) {
            const file = wpPath + (exts[i] == "" ? "" : "." + exts[i]);
            if (existsSync(file)) {
                bgFile = file;
                break;
            }
        }
        if (!bgFile) {
            log.error("Init: Wallpaper cache not exists");
            // wallpaper not exist
            return -2;
        }
        isInited = true;
        watch(bgFile, (event) => {
            if (event == "change") {
                reload();
            }
        });
        ipcRenderer.on("blur", () => {
            setFocus(false);
        });
        ipcRenderer.on("focus", () => {
            setFocus(true);
        });
        ipcRenderer.on("move", () => {
            updatePos();
        });
        ipcRenderer.on("begin-move", () => {
            setFocus(false);
        });
        ipcRenderer.on("end-move", () => {
            setFocus(true);
        });
        setInterval(() => {
            updatePos();
        }, 1000);
        setFocus(false);
        updatePos();
        reload();
        // successful
        return 0;
    }
    // not supported
    return -1;
}

export function setEnabled(enabled: boolean) {
    // don't reload multiple times
    if (isEnabled == enabled) return;
    isEnabled = enabled;
    var bgs = document.querySelectorAll(bgName);
    let setVisible = () => {
        for (let i = 0; i < bgs.length; i++) {
            let element = <HTMLElement>bgs.item(i);
            element.style.display = enabled ? "block" : "none";
        }
    };
    if (blurWorker) {
        blurWorker.terminate();
        blurWorker = undefined;
    }
    if (enabled && isInited) {
        // enable acrylic
        setVisible();
        setFocus(false);
        setTimeout(() => {
            requestAnimationFrame(() => {
                reload();
                updatePos();
                setFocus(true);
            });
        }, 200);
    } else if (isInited) {
        // disable acrylic
        requestAnimationFrame(() => {
            setFocus(false);
            setTimeout(() => {
                setVisible();
            }, 200);
        });
    } else {
        // not initialized
        setVisible();
    }
}

export async function reload() {
    if (!isEnabled) return;
    try {
        log.log("Reload: Reset wallpaper");

        var raw = readFileSync(bgFile);
        var bgs = document.querySelectorAll(bgName);
        let rawBase64 = raw.toString("base64");
        let formats = ["jpg", "png", "gif", "bmp"];
        for (let i = 0; i < formats.length; i++) {
            var dataBase64 = "data:image/" + formats[i] + ";base64," + rawBase64;
            try {
                await new Promise((resolve, reject) => {
                    getPixels(dataBase64, (error, pixels) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        let canvas = document.createElement("canvas");
                        canvas.width = pixels.shape[0];
                        canvas.height = pixels.shape[1];
                        let ctx = canvas.getContext("2d");
                        // if a job is running, terminate it and start a new one
                        if (blurWorker) blurWorker.terminate();
                        blurWorker = new Worker(__dirname + "/acrylic.worker.js");
                        blurWorker.onmessage = (event) => {
                            ctx.putImageData(event.data, 0, 0);
                            let blurDataBase64 = canvas.toDataURL("png");
                            setFocus(false);
                            setTimeout(() => {
                                for (let i = 0; i < bgs.length; i++) {
                                    let element = <HTMLElement>bgs.item(i);
                                    element.style.backgroundImage =
                                        "url(" + blurDataBase64 + ")";
                                }
                                setFocus(true);
                            }, 200);
                            blurWorker.terminate();
                            blurWorker = null;
                        };
                        blurWorker.postMessage(pixels);
                        resolve(null);
                    });
                });
                break;
            } catch (error) {
                continue;
            }
        }
    } catch (error) {
        log.log(error);
    }
}

export function updatePos() {
    if (!isEnabled) return;
    let curWin: Electron.BrowserWindow = remote.getCurrentWindow();
    var bgs = document.querySelectorAll(bgName);
    for (let i = 0; i < bgs.length; i++) {
        let element = <HTMLElement>bgs.item(i);
        element.style.width = screen.width + "px";
        element.style.height = screen.height + "px";
        var size: Array<number> = bgSize[element.id]
            ? bgSize[element.id]
            : curWin.isMaximized()
            ? [0, 0]
            : curWin.getPosition();
        element.style.left = -size[0] + "px";
        element.style.top = -size[1] + "px";
    }
}

export function setFocus(focus: boolean) {
    if (!isEnabled) return;
    var bgs = document.querySelectorAll(bgName);
    for (let i = 0; i < bgs.length; i++) {
        let element = <HTMLElement>bgs.item(i);
        element.style.opacity = focus ? "1" : "0";
    }
}
