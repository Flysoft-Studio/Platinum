import { ipcRenderer } from "electron";
import { parse as parseURL } from "url";
import * as lang from "../common/language";
import * as sidebar from "../common/sidebar";
import * as com from "../common/common";
import { registerRipples } from "../common/ripple";
const remote = require("@electron/remote");

let selectedItems: Array<number> = [];

export function removeMultiRemove() {
    ipcRenderer.sendToHost("remove_history", selectedItems);
    for (let i = 0; i < selectedItems.length; i++) {
        let historyItem = <HTMLElement>(
            document.querySelector("#history_" + selectedItems[i])
        );
        historyItem.classList.add("list_item_remove");
        setTimeout(() => requestAnimationFrame(() => historyItem.remove()), 300);
    }
    selectedItems = [];
    updateRemoveMultiDlg();
}

export function removeMultiCancel() {
    for (let i = 0; i < selectedItems.length; i++) {
        let historyEle = getElements(selectedItems[i].toString());
        historyEle.checkbox.checked = false;
    }
    selectedItems = [];
    updateRemoveMultiDlg();
}

function updateRemoveMultiDlg() {
    sidebar.setFloatDialogVisible("#history_removemulti", selectedItems.length != 0);
    (<HTMLElement>document.querySelector("#history_removemulti_title")).innerHTML =
        lang.encode(lang.get("his_removemulti_title", [selectedItems.length.toString()]));
}

function getElements(id: string) {
    const prefix = "#history_" + id;
    if (!document.querySelector(prefix))
        throw new Error("History item " + id + " not exists");
    return {
        item: <HTMLButtonElement>document.querySelector(prefix),
        icon: <HTMLImageElement>document.querySelector(prefix + " .history_icon"),
        title: <HTMLLinkElement>document.querySelector(prefix + " .history_title"),
        checkbox: <HTMLInputElement>document.querySelector(prefix + " .history_checkbox"),
        site: <HTMLLinkElement>document.querySelector(prefix + " .history_site"),
        time: <HTMLLinkElement>document.querySelector(prefix + " .history_time"),
        controls: {
            delete: <HTMLButtonElement>(
                document.querySelector(prefix + " .history_btn_delete")
            ),
        },
    };
}

ipcRenderer.on("lang", (event, language: string) => {
    lang.reload(language);
});

ipcRenderer.on("history", (event, data) => {
    let historyItem = <HTMLElement>(
        document.querySelector(".history_item.template").cloneNode(true)
    );
    historyItem.classList.remove("template");
    let id: number = data.id;
    historyItem.id = "history_" + id;
    (<HTMLElement>document.querySelector("#history_list")).appendChild(historyItem);
    let historyEle = getElements(id.toString());
    let urlStruct = parseURL(data.url);
    let isGeneralProtocol =
        data.url.startsWith("http://") ||
        data.url.startsWith("https://") ||
        data.url.startsWith("ftp://");
    historyEle.icon.src = data.icon ? data.icon : "../img/browser/tab/tab.svg";
    historyEle.icon.addEventListener("error", () => {
        historyEle.icon.src = "../img/browser/tab/tab.svg";
    });
    let title = data.title ? data.title : data.url;
    historyEle.title.innerHTML = lang.encode(title);
    historyEle.title.href = data.url;
    historyEle.title.title = title == data.url ? data.url : title + "\n" + data.url;
    historyEle.site.innerHTML = lang.encode(
        isGeneralProtocol ? urlStruct.hostname : data.url
    );
    historyEle.time.innerHTML = lang.encode(com.timeToText(data.time));
    historyEle.checkbox.addEventListener("click", () => {
        if (historyEle.checkbox.checked) selectedItems.push(id);
        else selectedItems.splice(selectedItems.indexOf(id), 1);
        updateRemoveMultiDlg();
    });
    historyEle.controls.delete.addEventListener("click", () => {
        ipcRenderer.sendToHost("remove_history", [id]);
        historyItem.classList.add("list_item_remove");
        setTimeout(() => requestAnimationFrame(() => historyItem.remove()), 300);
    });
});

ipcRenderer.on("load", (event) => {
    com.registerEvents();
    registerRipples();
    sidebar.setEventHandler((event, data) => {
        if (event == "switch_tab") {
        }
    });
    let defaultTab;
    if (window.location.search != "") defaultTab = window.location.search.substring(1);
    sidebar.registerTabs(defaultTab);
    ipcRenderer.sendToHost("get_history");
});
