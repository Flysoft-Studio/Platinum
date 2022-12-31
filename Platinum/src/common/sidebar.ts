import { ipcRenderer } from "electron";
import * as com from "./common";
import * as lang from "./language";
const remote = require("@electron/remote");

export function registerControls() {
    let controls = document.querySelectorAll(".control");
    for (let i = 0; i < controls.length; i++) {
        const element = <HTMLInputElement>controls.item(i);
        let item: string = element.dataset.item || element.name;
        let controlEle: HTMLElement;
        if (element.dataset.control) controlEle = <HTMLElement>document.querySelector("#" + element.dataset.control);
        let rsItem: string = "applyrestart." + item;
        let needRestart = element.dataset.needrestart == "true";
        let global = element.dataset.global == "true";
        let saveItem: string = ((needRestart) ? (rsItem) : (item));
        let store = (global) ? (com.globalStore) : (com.store);
        let getValue = () => {
            let value = store.get(rsItem);
            if (value == undefined) value = store.get(item);
            return value;
        }
        if (element.type == "checkbox") {
            let update = () => { element.checked = getValue() as boolean; if (controlEle) com.setElementVisible(controlEle, element.checked); }
            store.on("change", () => update());
            update();
            element.addEventListener("change", () => {
                store.set(saveItem, element.checked);
                if (needRestart) notifyRestart(global);
            });
        } else if (element.type == "radio") {
            let update = () => { element.checked = element.dataset.value == (getValue() as string); if (controlEle) com.setElementVisible(controlEle, element.checked); };
            store.on("change", () => update());
            update();
            element.addEventListener("change", () => {
                if (!element.checked) return;
                store.set(saveItem, element.dataset.value);
                if (needRestart) notifyRestart(global);
            });
        } else if (element.type == "color") {
            let update = () => element.value = getValue() as string;
            store.on("change", () => update());
            update();
            element.addEventListener("change", () => {
                store.set(saveItem, element.value);
                if (needRestart) notifyRestart(global);
            });
        } else {
            let update = () => element.value = getValue() as string;
            store.on("change", () => update());
            update();
            element.addEventListener("change", () => {
                store.set(saveItem, element.value);
                if (needRestart) notifyRestart(global);
            });
        }
    }
}

// export function registerRadioGroup(name: string, defaultValue?: string, key?: string) {
//     if (!key) key = name.replace("set_", "").replace(/_/, ".");
//     let radios = document.getElementsByName(name);
//     let curValue = store.get(key, defaultValue);
//     for (let i = 0; i < radios.length; i++) {
//         const element = <HTMLInputElement>radios.item(i);
//         if (element.dataset.value == curValue) element.checked = true;
//         element.addEventListener("change", () => {
//             let value: any = element.dataset.value;
//             if (!value) value = i;
//             store.set(key, value);
//         });
//     }
// }

export function notifyRestart(global: boolean) {
    let object = new remote.Notification({
        title: lang.get("set_needrestart_title"),
        body: lang.get("set_needrestart_settings_body"),
        urgency: "critical",
        timeoutType: "never",
    });
    object.addListener("click", () => ipcRenderer.sendToHost("relaunch", global));
    object.show();
}

export function registerTabs(defaultTab?: string) {
    if (!defaultTab && window.location.hash != "") defaultTab = window.location.hash.substring(1);
    window.addEventListener("hashchange", () => {
        if (window.location.hash != "") switchTab(window.location.hash.substring(1));
        else switchTab(defaultTab);
    })
    let tabs = document.querySelectorAll(".sidebar_item>input");
    for (let i = 0; i < tabs.length; i++) {
        const element = <HTMLElement>tabs.item(i);
        const id: string = element.dataset.tab;
        if (i == 0) {
            // resets default tab if it is invalid
            if (!defaultTab || !document.querySelector("#sidebar_" + defaultTab)) defaultTab = id;
            switchTab(defaultTab);
        }
        element.addEventListener("click", () => {
            switchTab(id);
        });
    }
}

export function switchTab(tab: string) {
    (<HTMLElement>document.querySelector("#sidebar")).classList.remove("sidebar_show");
    if (tab == curTab || switchTasks != 0) return;
    switchTasks++;
    event("switch_tab", tab);
    console.log("switch to " + tab);
    window.location.hash = tab;
    let hasOldTab = curTab;
    if (hasOldTab) {
        switchTasks++;
        let oldTab = <HTMLElement>document.querySelector("#tab_" + curTab);
        let oldSidebar = <HTMLElement>document.querySelector("#sidebar_" + curTab);
        oldSidebar.classList.remove("sidebar_item_active");
        oldTab.classList.add("tab_hided");
        setTimeout(() => {
            requestAnimationFrame(() => {
                oldTab.classList.remove("tab_hided");
                oldTab.classList.remove("tab_show");
                oldTab.classList.remove("tab_showed");
                switchTasks--;
            });
        }, 100);
    }
    curTab = tab;
    let newTab = <HTMLElement>document.querySelector("#tab_" + curTab);
    let newSidebar = <HTMLElement>document.querySelector("#sidebar_" + curTab);
    let newRadio = <HTMLInputElement>document.querySelector("#sidebar_" + curTab + ">input");
    newRadio.checked = true;
    newTab.classList.add("tab_show");
    newTab.scroll({ left: 0, top: 0, });
    newSidebar.classList.add("sidebar_item_active");
    requestAnimationFrame(() => {
        newTab.classList.add("tab_showed");
        switchTasks--;
    });
}

export function setFloatDialogVisible(elementID: string, visible: boolean) {
    let dialog = <HTMLElement>document.querySelector(elementID);
    if (!visible) {
        dialog.classList.remove("fdialog_show");
        dialog.classList.add("fdialog_hide");
    } else {
        dialog.classList.remove("fdialog_hide");
        dialog.classList.add("fdialog_show");
    }
}

ipcRenderer.on("lang", (event, language: string) => {
    lang.reload(language);
});

export function setEventHandler(handler: Function) {
    event = handler;
}

export let event: Function = () => { };
export let switchTasks = 0;
export let curTab: string;

ipcRenderer.on("load", () => {
    let element = <HTMLInputElement>document.querySelector("#sidebar_open>input");
    let sidebar = <HTMLElement>document.querySelector("#sidebar");
    element.addEventListener("change", () => {
        if (element.checked) sidebar.classList.add("sidebar_show");
        else sidebar.classList.remove("sidebar_show");
    });
});