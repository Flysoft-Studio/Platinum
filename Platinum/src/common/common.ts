import * as lang from "./language";
import { getDefaultOptions, getMgrDefaultOptions } from "./default";
import { Store } from "./store";
import { readdirSync, rmdirSync, rmSync, statSync } from "fs-extra";
import { lte as verLte } from "semver";
import { release as osRelease } from "os";
import { ipcRenderer } from "electron";
import { join, normalize } from "path";
import rgba = require("color-rgba");
const remote = require("@electron/remote");
export let store: Store;
export let globalStore: Store;

export let curWin: Electron.BrowserWindow;
export const scheme = "platinum";

export function reloadTColor() {
    // reload theme color config
    let tcolorType = store.get("appearance.tcolor.uses") as string;
    let tcolor: string = undefined;
    // Windows only
    if (tcolorType == "system" && process.platform == "win32" && verLte("6.2.0", osRelease())) tcolor = "#" + remote.systemPreferences.getAccentColor();
    else if (tcolorType == "theme") tcolor = null;
    else tcolor = store.get("appearance.tcolor.custom") as string;
    if (tcolor) {
        let [r, g, b, alpha] = rgba(tcolor);

        // makes it brighter
        const brighterValue = (remote.nativeTheme.shouldUseDarkColors) ? (100) : (20);
        r += brighterValue;
        if (r > 255) r = 255;
        g += brighterValue;
        if (g > 255) g = 255;
        b += brighterValue;
        if (b > 255) b = 255;

        tcolor = "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }
    addStyleSheet((tcolor) ? "*,*::before,*::after{--theme-color:" + tcolor + ";}" : null, "com_style_tcolor");
}

export function getImageColorInfo(pixels: Uint8Array) {
    let rgba = {
        r: 0, g: 0, b: 0, a: 1,
    }
    let pixelCount = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        rgba.r += pixels[i];
        rgba.g += pixels[i + 1];
        rgba.b += pixels[i + 2];
        pixelCount++;
    }
    rgba.r = Math.floor(rgba.r / pixelCount);
    rgba.g = Math.floor(rgba.g / pixelCount);
    rgba.b = Math.floor(rgba.b / pixelCount);

    var isDark: boolean;

    var checkDark = () => isDark = rgba.r * 0.299 + rgba.g * 0.587 + rgba.b * 0.114 < 192;

    checkDark();

    if (isDark) {
        // makes it brighter
        const brighterValue = 50;
        rgba.r += brighterValue;
        if (rgba.r > 255) rgba.r = 255;
        rgba.g += brighterValue;
        if (rgba.g > 255) rgba.g = 255;
        rgba.b += brighterValue;
        if (rgba.b > 255) rgba.b = 255;
        checkDark();
    }

    let rgbaString = "rgba(" + rgba.r + "," + rgba.g + "," + rgba.b + "," + rgba.a + ")";

    return {
        isDark: isDark,
        rgba: rgbaString,
    }
}

export function addStyleSheet(css?: string, tag?: string) {
    let cssElement = (tag) ? <HTMLStyleElement>document.querySelector("#" + tag) : null;
    if (cssElement) cssElement.remove();
    if (css) {
        cssElement = document.createElement("style");
        cssElement.id = tag;
        cssElement.type = "text/css";
        cssElement.innerText = css;
        document.head.appendChild(cssElement);
    }
}

export function showTabbar() {
    let tabbar = <HTMLElement>document.querySelector(".titlebar");
    tabbar.classList.remove("titlebar_hide");
}

export function hideTabbar() {
    let tabbar = <HTMLElement>document.querySelector(".titlebar");
    tabbar.classList.add("titlebar_hide");
}

export function reloadConfig() {
    reloadTColor();
    // enable or disable animation
    let disableAnimation = store.get("appearance.visual.animation") as boolean;
    addStyleSheet((disableAnimation) ? "*,*::before,*::after{animation:none!important;transition:none!important;}" : null, "com_style_animation");
    if (disableAnimation) document.body.classList.add("no_animation");
    else document.body.classList.remove("no_animation");

    let lowPerformance = store.get("appearance.visual.lowperformance") as boolean;
    if (lowPerformance) document.body.classList.add("low_performance");
    else document.body.classList.remove("low_performance");

    let spotlight = store.get("appearance.visual.spotlight") as boolean;
    if (spotlight) document.body.classList.add("spotlight");
    else document.body.classList.remove("spotlight");
}

export function registerEvents() {
    curWin = remote.getCurrentWindow();
    store = new Store(normalize(remote.getGlobal("dataDir") + "/config.json"), getDefaultOptions(remote.getGlobal("user"), remote), "store-update");
    globalStore = new Store(normalize(remote.getGlobal("mgrDataDir") + "/config.json"), getMgrDefaultOptions(), "global-store-update");
    (window as any).store = store;
    (window as any).globalStore = globalStore;
    reloadConfig();
    store.on("change", () => reloadConfig());
    ipcRenderer.on("accent-color-changed", () => reloadTColor());
}

export function setElementVisible(element: HTMLElement, visible: boolean) {
    if (!visible) element.classList.add("hide");
    else element.classList.remove("hide");
}

export function setUserPicture(prefix: string, user: string, fileName: string) {
    let filePath = (fileName) ? (normalize(getUserFolder(user) + "/" + fileName)) : (null);
    setElementVisible(document.querySelector(prefix + " .user_default"), filePath == null);
    setElementVisible(document.querySelector(prefix + " .user_picture"), filePath != null);
    (<HTMLImageElement>document.querySelector(prefix + " .user_picture")).src = "";
    (<HTMLImageElement>document.querySelector(prefix + " .user_picture")).src = (filePath) ? (filePath) : ("");
}

export function setUserStatus(prefix: string, status: Favourite.SyncStatus, errorMsg?: string) {
    let icons = ["syncing", "idle", "error", "unset"];
    for (let i = 0; i < icons.length; i++) {
        let element = <HTMLElement>document.querySelector(prefix + " .user_tips_" + icons[i]);
        if (status == "error" && icons[i] == status) (<HTMLElement>document.querySelector(prefix + " .user_tips_" + icons[i] + ">*:nth-child(2)")).innerHTML = lang.encode(lang.get("user_error", [errorMsg]));
        if (icons[i] == status) element.classList.remove("hide");
        else element.classList.add("hide");
    }
}

export function getUserFolder(user: string) {
    return normalize(remote.getGlobal("usersDir") + "/" + user + "/User Data");
}

export function showTip(title: string) {
    let tip: Electron.BrowserWindow = new remote.BrowserWindow({
        width: window.screen.width,
        height: window.screen.height,
        transparent: true,
        resizable: false,
        frame: false,
        show: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            allowRunningInsecureContent: true,
        },
    } as Electron.BrowserWindowConstructorOptions);
    tip.setIgnoreMouseEvents(true);
    tip.loadURL("file://" + __dirname + "/../../tip.html");
    tip.webContents.on("dom-ready", () => {
        tip.focus();
        tip.webContents.send("tip", title);
    });
}

export function rmDir(dir: string) {
    let files = readdirSync(dir);
    files.forEach((file) => {
        var filePath = join(dir, file);
        if (statSync(filePath).isDirectory()) rmDir(filePath);
        else try { rmSync(filePath); } catch { }
    });
    try { rmdirSync(dir); } catch { }
}

export function timeToText(timestamp: number) {
    let date = new Date();
    date.setTime(timestamp);
    let curDate = new Date();
    let partDate = [];
    let partTime = [];
    let partAll = [];

    let isSameYear = date.getFullYear() == curDate.getFullYear();
    let isSameMonth = date.getMonth() == curDate.getMonth();
    let isSameDate = date.getDate() == curDate.getDate();
    if (!isSameYear) {
        let yearStr = date.getFullYear().toString();
        partDate.push(yearStr.substring(yearStr.length - 2, yearStr.length));
    }
    if (!isSameYear || !isSameMonth || !isSameDate) {
        let monthStr = "00" + date.getMonth().toString();
        partDate.push(monthStr.substring(monthStr.length - 2, monthStr.length));
        let dateStr = "00" + date.getDate().toString();
        partDate.push(dateStr.substring(dateStr.length - 2, dateStr.length));
    }
    partAll.push(partDate.join("/"));

    let hourStr = "00" + date.getHours().toString();
    partTime.push(hourStr.substring(hourStr.length - 2, hourStr.length));
    let minStr = "00" + date.getMinutes().toString();
    partTime.push(minStr.substring(minStr.length - 2, minStr.length));
    partAll.push(partTime.join(":"));

    let AMOrPM: string;
    if (date.getHours() == 0 && date.getMinutes() == 0) AMOrPM = "Midnight";
    else if (date.getHours() == 12 && date.getMinutes() == 0) AMOrPM = "Noon";
    else if (date.getHours() - 12 > 0) AMOrPM = "PM";
    else AMOrPM = "AM";
    partAll.push(AMOrPM);

    return partAll.join(" ");
}