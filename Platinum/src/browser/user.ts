import * as com from "../common/common";
import * as lang from "../common/language";
import { Menu } from "../common/menu";
import { Dialog } from "../common/dialog";
import { ElectronLog, LogFunctions } from "electron-log";
import { ipcRenderer } from "electron";
import { dialog } from "./browser";
import { randomUUID } from "crypto";
import { copyFileSync } from "fs-extra";
import { extname, normalize } from "path";
import { deserialize, serialize } from "v8";

const remote = require("@electron/remote");
let log: LogFunctions;

export let userMenu: Menu;
export let userEditDialog: Dialog;
let userOtherContainer: HTMLElement;
let userAdd: HTMLButtonElement;
// sync with main process
let user = remote.getGlobal("user") as string;
let users = remote.getGlobal("users") as { object: Browser.UserInfoList; };

function getUserOtherElements(id: string) {
    const prefix = "#user_other_" + id;
    if (!document.querySelector(prefix)) throw new Error("User Other Item " + id + " not exists");
    return {
        item: <HTMLButtonElement>document.querySelector(prefix),
        name: <HTMLElement>document.querySelector(prefix + " .user_other_name"),
    }
}

export async function addUser() {
    let ret = await dialog({
        title: lang.get("user_add_title"),
        subtitle: lang.get("user_add_subtitle"),
        input: {
            allowEmptyValues: false,
        },
    });
    if (ret.button != "ok") return;
    let userUUID = randomUUID();
    ipcRenderer.sendSync("users-add", {
        id: userUUID,
        name: ret.input,
    } as Browser.UserInfo);
}

export function showMenu() {
    userMenu.showMenuUnderElement("#nav_user");
}

export function reloadAll() {
    // load info on the panel
    const curUser = deserialize(serialize(users.object[user]));
    (<HTMLElement>document.querySelector(".user_info .user_name")).innerHTML = lang.encode((curUser.name) ? (curUser.name) : (lang.get("user_default")));
    com.setUserPicture(".user_info .user_box", curUser.id, curUser.icon);
    com.setUserPicture("#nav_user .user_box", curUser.id, curUser.icon);
    com.setUserStatus(".user_info", remote.getGlobal("syncStatus"));
    // clear item list
    {
        let userItems = document.querySelectorAll(".user_other_item:not(.template)");
        for (let i = 0; i < userItems.length; i++) {
            const element = <HTMLElement>userItems.item(i);
            element.remove();
        }
    }
    // generate item list
    for (const key in users.object) {
        const data = deserialize(serialize(users.object[key]));
        // skip current user
        if (user == data.id) continue;
        let userItem = <HTMLElement>document.querySelector(".user_other_item.template").cloneNode(true);
        userItem.classList.remove("template");
        userItem.id = "user_other_" + data.id;
        userOtherContainer.insertBefore(userItem, userAdd);
        let userEle = getUserOtherElements(data.id);
        userMenu.registerEventsForElement(userEle.item);
        userEle.name.innerHTML = lang.encode((data.name) ? (data.name) : (lang.get("user_default")));
        com.setUserPicture("#" + userItem.id + " .user_box", data.id, data.icon);
        userEle.item.addEventListener("click", () => ipcRenderer.sendSync("users-active", data.id));
    }
}

export function editUser() {
    let userEditInput = <HTMLInputElement>document.querySelector("#user_edit_input"), userEditIcon = <HTMLElement>document.querySelector("#user_edit_icon"), userEditOK = <HTMLElement>document.querySelector("#user_edit_ok"), userEditCancel = <HTMLElement>document.querySelector("#user_edit_cancel");
    let curUser = deserialize(serialize(users.object[user]));
    userEditInput.value = (curUser.name) ? (curUser.name) : ("");
    userEditDialog.show();
    return new Promise<boolean>((resolve) => {
        userEditIcon.onclick = () => {
            let file = remote.dialog.showOpenDialogSync(com.curWin, {
                filters: [{
                    name: "Image file",
                    properties: ["openFile"],
                    extensions: ["gif", "jpg", "jpeg", "png", "svg", "webp"],
                }],
            });
            if (file && file.length == 1) {
                let fileName = "userPicture" + extname(file[0]);
                let filePath = normalize(remote.getGlobal("dataDir") + "/" + fileName);
                copyFileSync(file[0], filePath);
                curUser.icon = fileName;
                ipcRenderer.sendSync("users-edit", curUser);
            }
            userEditDialog.hide();
            resolve(true);
        }
        userEditOK.onclick = () => {
            userEditDialog.hide();
            let value = userEditInput.value;
            if (value.replace(/ /, "") == "") value = null;
            curUser.name = value;
            ipcRenderer.sendSync("users-edit", curUser);
            resolve(true);
        }
        userEditCancel.onclick = () => {
            userEditDialog.hide();
            resolve(false);
        }
    });
}

export async function deleteUser() {
    let ret = await dialog({
        title: lang.get("user_delete_title"),
        subtitle: lang.get("user_delete_subtitle"),
    });
    if (ret.button != "ok") return;
    ipcRenderer.sendSync("users-delete", user);
}

window.addEventListener("load", () => {
    userOtherContainer = <HTMLElement>document.querySelector("#menu_user_others");
    userAdd = <HTMLButtonElement>document.querySelector("#menu_user_add");
    userAdd.addEventListener("click", () => addUser());
});

export function init(logger: ElectronLog) {
    log = logger.scope("user");
    userMenu = new Menu("user");
    userEditDialog = new Dialog("user_edit");

    reloadAll();
    ipcRenderer.on("users-update", () => reloadAll());
    ipcRenderer.on("favourite-sync", () => reloadAll());
}