import * as lang from "../common/language";
import * as sidebar from "../common/sidebar";
import * as com from "../common/common";
import { loadSVGs } from "../common/svgLoader";
import { registerRipples } from "../common/ripple";
import { ipcRenderer } from "electron";
import { extname, normalize } from "path";
import { copyFileSync } from "fs-extra";
import { deserialize, serialize } from "v8";
const remote = require("@electron/remote");
const pkg = require("../../package.json");

function loadUser() {
    const curUser = deserialize(serialize(users.object[user]));
    (<HTMLElement>document.querySelector("#set_user_main_name")).innerHTML = lang.encode((curUser.name) ? (curUser.name) : (lang.get("user_default")));
    com.setUserPicture("#set_user_main_picture", curUser.id, curUser.icon);
    com.setUserStatus("#set_user_main_info", remote.getGlobal("syncStatus"), remote.getGlobal("syncError"));
    com.setElementVisible(<HTMLElement>document.querySelector("#set_user_desktoplink"), process.platform == "win32" && curUser.id != "default");
}

function loadAbout() {
    (<HTMLElement>document.querySelector("#set_about_ver")).innerText = lang.get("set_about_ver", [pkg.version, process.versions.chrome, process.arch]);
}

function loadAppearance() {
    com.setElementVisible(<HTMLElement>document.querySelector("#set_appearance_visual_blur"), process.platform == "win32");
}

function loadPFM() {
    com.setElementVisible(<HTMLElement>document.querySelector("#set_pfm_sys_turbo"), !process.windowsStore);
    com.setElementVisible(<HTMLElement>document.querySelector("#set_pfm_sleep"), process.platform == "win32");
}

function loadUpdate() {
    let update = remote.getGlobal("updateStatus");
    if (update && update.canUpdate) {
        let text: string;
        let setStatus = (status: number) => {
            let icons = ["latest", "updating", "warning"];
            for (let i = 0; i < icons.length; i++) {
                let element = <HTMLElement>document.querySelector("#set_about_update_" + icons[i]);
                if (i == status) {
                    element.classList.remove("hide");
                } else {
                    element.classList.add("hide");
                }
            }
        }
        let updateBtn = false;
        if (update.status == "checking") { setStatus(1); text = lang.get("set_about_update_checking"); }
        else if (update.status == "started") { setStatus(1); text = lang.get("set_about_update_downloading", [update.progress.toString()]); }
        else if (update.status == "waitinstall") { updateBtn = true; setStatus(2); text = lang.get("set_about_update_waiting"); }
        else if (update.status == "error") { updateBtn = false; setStatus(2); text = lang.get("set_about_update_error", [update.error]); }
        else if (!update.available) { setStatus(0); text = lang.get("set_about_update_latest"); }
        else if (update.available) { updateBtn = true; setStatus(0); text = lang.get("set_about_update_available", [update.version.str]); }
        (<HTMLElement>document.querySelector("#set_about_update_btn_update")).style.display = (updateBtn) ? null : "none";
        (<HTMLElement>document.querySelector("#set_about_update_text")).innerHTML = lang.encode(text);
    }
    com.setElementVisible(<HTMLElement>document.querySelector("#set_about_update"), update && update.canUpdate);
}

function loadInsider() {
    let channel = com.globalStore.get("applyrestart.update.channel") as string;
    if (!channel) channel = com.globalStore.get("update.channel") as string;
    com.setElementVisible(<HTMLElement>document.querySelector("#set_about_update_btn_insider_join"), channel == "latest");
    com.setElementVisible(<HTMLElement>document.querySelector("#set_about_update_btn_insider_exit"), channel == "preview");
}

let user = remote.getGlobal("user") as string;
let users = remote.getGlobal("users") as { object: Browser.UserInfoList; };

export function homepageStartBackgroundFileAction() {
    let file = remote.dialog.showOpenDialogSync(com.curWin, {
        filters: [{
            name: "Image file",
            properties: ["openFile"],
            extensions: ["apng", "avif", "bmp", "gif", "jpg", "jpeg", "jfif", "pjpeg", "pjp", "png", "svg", "webp"],
        }],
    });
    if (file && file.length == 1) {
        let fileName = "startBackground" + extname(file[0]);
        let filePath = normalize(remote.getGlobal("dataDir") + "/" + fileName);
        copyFileSync(file[0], filePath);
        com.store.set("home.start.background.file", fileName);
    }
}

export function updateAction() {
    let update = remote.getGlobal("updateStatus");
    if (update.status == "started") return;
    else if (update.status == "waitinstall") ipcRenderer.send("install-update");
    else if (!update.available) return;
    else if (update.available) ipcRenderer.send("start-update");
}

export function insiderAction() {
    let channel = com.globalStore.get("applyrestart.update.channel") as string;
    if (!channel) channel = com.globalStore.get("update.channel") as string;
    if (channel == "preview") com.globalStore.set("applyrestart.update.channel", "latest");
    else if (channel == "latest") com.globalStore.set("applyrestart.update.channel", "preview");
    sidebar.notifyRestart(true);
    loadInsider();
}

export function editUserAction() {
    ipcRenderer.sendToHost("edit_user");
}

export function deleteUserAction() {
    ipcRenderer.sendToHost("delete_user");
}

ipcRenderer.on("update", () => loadUpdate());
ipcRenderer.on("users-update", () => loadUser());
ipcRenderer.on("favourite-sync", () => loadUser());
ipcRenderer.on("lang", (event, language: string) => {
    loadUser();
    loadUpdate();
    loadAbout();
});

function reloadConfig() {
    loadInsider();
}

ipcRenderer.on("load", (event) => {
    com.registerEvents();
    registerRipples();
    loadSVGs();
    loadAbout();
    loadPFM();
    loadAppearance();
    com.globalStore.on("change", () => reloadConfig());
    reloadConfig();
    sidebar.registerTabs();
    sidebar.registerControls();
    ipcRenderer.send("check-update");
});