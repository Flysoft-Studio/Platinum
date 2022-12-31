import { Menu } from "../common/menu";
import { ipcRenderer } from "electron";
import { toDataURL } from "qrcode";
import { ElectronLog, LogFunctions } from "electron-log";

let log: LogFunctions;

export let qrcodeMenu: Menu;

let qrcodeURL: HTMLInputElement;
let qrcodeImg: HTMLImageElement;
let qrcodeDownload: HTMLButtonElement;

export function setURL(url: string) {
    qrcodeURL.value = url;
}

export function generateQRCode() {
    return new Promise((resolve, reject) => {
        let sourceURL = qrcodeURL.value;
        toDataURL(sourceURL, {
            type: "image/png",
            margin: 2,
        }, (error, url) => {
            if (error) {
                log.error("Failed to generate, sourceURL: " + sourceURL + ", reason: " + error);
                reject(error);
                return;
            }
            log.log("Generate successfully, sourceURL: " + sourceURL);
            qrcodeImg.src = url;
            resolve(null);
            return;
        });
    });
}

export function downloadQRCode() {
    ipcRenderer.send("download", qrcodeImg.src, "qrcode.png", true);
}

export function showMenu() {
    qrcodeMenu.showMenuUnderElement("#nav_more");
}

window.addEventListener("load", () => {
    qrcodeURL = <HTMLInputElement>document.querySelector(".qrcode_url");
    qrcodeImg = <HTMLImageElement>document.querySelector(".qrcode_img");
    qrcodeDownload = <HTMLButtonElement>document.querySelector(".qrcode_download");

    qrcodeURL.addEventListener("change", () => generateQRCode());
    qrcodeDownload.addEventListener("click", () => downloadQRCode());
    // repositions the menu
    qrcodeImg.addEventListener("load", () => {
        qrcodeMenu.hide();
        showMenu();
    });
});

export function init(logger: ElectronLog) {
    log = logger.scope("qrcode");
    qrcodeMenu = new Menu("qrcode");
}