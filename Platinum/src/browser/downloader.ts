import * as lang from "../common/language";
import * as com from "../common/common";
import { Menu } from "../common/menu";
import { ipcRenderer, shell } from "electron";
import { existsSync, rmSync } from "fs";
import { extname, normalize } from "path";
import { parse as parseURL } from "url";
import { ElectronLog, LogFunctions } from "electron-log";

const remote = require("@electron/remote");
let log: LogFunctions;

export let downloadMenu: Menu;
let menuDownloadActive: HTMLElement,
    menuDownloadWaiting: HTMLElement,
    menuDownloadStopped: HTMLElement;
// sync with main process
export let downloader: Download.DownloaderInfo = remote.getGlobal("downloader");
let fileNameMap = {};

function getElements(gid: string) {
    const prefix = "#download_" + gid;
    if (!document.querySelector(prefix))
        throw new Error("Download item " + gid + " not exists");
    return {
        item: <HTMLButtonElement>document.querySelector(prefix),
        icon: <HTMLImageElement>document.querySelector(prefix + " .download_icon>img"),
        title: <HTMLLinkElement>document.querySelector(prefix + " .download_title"),
        progress: <HTMLElement>document.querySelector(prefix + " .download_progress"),
        progressInner: <HTMLElement>(
            document.querySelector(prefix + " .download_progress>div")
        ),
        speed: <HTMLElement>document.querySelector(prefix + " .download_speed"),
        openfolder: <HTMLLinkElement>(
            document.querySelector(prefix + " .download_openfolder")
        ),
        controls: {
            delete: <HTMLButtonElement>(
                document.querySelector(prefix + " .download_btn_delete")
            ),
            start: <HTMLButtonElement>(
                document.querySelector(prefix + " .download_btn_start")
            ),
            pause: <HTMLButtonElement>(
                document.querySelector(prefix + " .download_btn_pause")
            ),
            redownload: <HTMLButtonElement>(
                document.querySelector(prefix + " .download_btn_redownload")
            ),
            cancel: <HTMLButtonElement>(
                document.querySelector(prefix + " .download_btn_cancel")
            ),
            removeResult: <HTMLButtonElement>(
                document.querySelector(prefix + " .download_btn_remove_result")
            ),
        },
    };
}

function getFilename(file: Download.File) {
    let path = file.path;
    // no file path, uses url instead
    if (!path) path = parseURL(file.uris[0].uri).href;
    // finds / or \ in the path
    let pos = path.lastIndexOf("/");
    if (pos == -1) pos = path.lastIndexOf("\\");
    // no / or \ found or they are at the end of path
    if (pos == -1 || pos >= path.length - 1) return decodeURIComponent(path);
    else return decodeURIComponent(path.substring(pos + 1));
}

function getSuitableUnit(bytes: number) {
    let KB = bytes / 1024;
    if (KB < 1024) return KB.toFixed(1) + " KiB";
    let MB = KB / 1024;
    if (MB < 1024) return MB.toFixed(1) + " MiB";
    let GB = MB / 1024;
    if (GB < 1024) return GB.toFixed(1) + " GiB";
    let TB = GB / 1024;
    return TB.toFixed(1) + " TiB";
}

function updateInfo(item: Download.Item, newItem: boolean = false) {
    let dlEle = getElements(item.gid);
    let fileName = getFilename(item.files[0]);
    if (newItem || fileNameMap[item.gid] != fileName) {
        dlEle.title.innerHTML = lang.encode(fileName);
        dlEle.title.title = fileName;
        dlEle.item.ariaLabel = lang.get("dl_item", [fileName]);
        dlEle.title.ariaLabel = lang.get("dl_open");
        let path = normalize(item.files[0].path);
        if (item.status == "complete" && path && existsSync(path))
            dlEle.icon.src = ipcRenderer.sendSync("get-icon", path);
        else dlEle.icon.src = ipcRenderer.sendSync("get-icon", extname(fileName));
        fileNameMap[item.gid] = fileName;
    }

    com.setElementVisible(
        dlEle.progress,
        item.status == "active" || item.status == "waiting" || item.status == "paused"
    );
    com.setElementVisible(dlEle.controls.start, item.status == "paused");
    com.setElementVisible(
        dlEle.controls.pause,
        item.status == "waiting" || item.status == "active"
    );
    com.setElementVisible(
        dlEle.controls.cancel,
        item.status == "waiting" || item.status == "active" || item.status == "paused"
    );

    let completedLength = parseInt(item.completedLength);
    let totalLength = parseInt(item.totalLength);
    let speed = parseInt(item.downloadSpeed);

    // calculates the progress
    if (item.status == "active" || item.status == "waiting" || item.status == "paused") {
        let progress = completedLength / totalLength;
        if (isNaN(progress)) progress = 0;
        if (progress > 1) progress = 1;
        dlEle.progressInner.style.width = (progress * 100).toFixed(2) + "%";

        let speedText = getSuitableUnit(speed);
        let completedLengthText = getSuitableUnit(completedLength);
        let totalLengthText = getSuitableUnit(totalLength);

        dlEle.speed.innerHTML = lang.encode(
            (item.status == "active" ? speedText + "/s, " : "") +
                completedLengthText +
                " / " +
                totalLengthText
        );
    }
}

function updateDeleteStatus(item: Download.Item) {
    let dlEle = getElements(item.gid);
    let path = item.files[0].path;
    let exist = false;
    if (path) exist = existsSync(path);
    let finished = exist && item.status == "complete";
    let deleted = !exist && item.status == "complete";
    com.setElementVisible(dlEle.openfolder, finished);
    com.setElementVisible(dlEle.controls.delete, finished);
    com.setElementVisible(
        dlEle.controls.redownload,
        deleted || item.status == "error" || item.status == "removed"
    );
    com.setElementVisible(
        dlEle.controls.removeResult,
        finished || deleted || item.status == "error" || item.status == "removed"
    );
    com.setElementVisible(
        dlEle.speed,
        deleted ||
            item.status == "paused" ||
            item.status == "removed" ||
            item.status == "error" ||
            item.status == "active" ||
            item.status == "waiting" ||
            item.status == "paused"
    );
    if (!finished) dlEle.title.classList.add("link_disabled");
    else dlEle.title.classList.remove("link_disabled");
    if (item.status == "active" || item.status == "waiting" || item.status == "paused")
        dlEle.title.classList.add("link_disabled_noline");
    else dlEle.title.classList.remove("link_disabled_noline");
    let text: string = "";
    if (deleted) text = lang.get("dl_deleted");
    else if (item.status == "error") text = lang.get("dl_error", [item.errorMessage]);
    else if (item.status == "removed") text = lang.get("dl_cancelled");
    else if (item.status == "paused") text = lang.get("dl_paused");
    dlEle.speed.innerHTML = lang.encode(text);
    dlEle.speed.title = text;
}

function createItem(item: Download.Item, parent: HTMLElement) {
    removeItem(item, null);
    let dlItem = <HTMLElement>(
        document.querySelector(".download_item.template").cloneNode(true)
    );
    dlItem.classList.remove("template");
    dlItem.id = "download_" + item.gid;
    // insert item to the front
    if (!parent.firstElementChild) parent.appendChild(dlItem);
    else parent.insertBefore(dlItem, parent.firstElementChild);
    downloadMenu.registerEventsForElement(dlItem);
    let dlEle = getElements(item.gid);
    // register events
    let path = normalize(item.files[0].path);
    if (path) {
        dlEle.openfolder.onclick = () => {
            downloadMenu.menu.focus();
            if (!existsSync(path)) updateDeleteStatus(item);
            else remote.shell.showItemInFolder(path);
        };
        dlEle.title.onclick = () => {
            downloadMenu.menu.focus();
            if (!existsSync(path)) updateDeleteStatus(item);
            else remote.shell.openPath(path);
        };
        dlEle.controls.delete.onclick = () => {
            downloadMenu.menu.focus();
            if (existsSync(path)) {
                remote.shell
                    .trashItem(path)
                    .catch((error) => {
                        log.error(
                            "Trash item failed, try using rm, path: " +
                                path +
                                ", reason: " +
                                error
                        );
                        try {
                            rmSync(path);
                            updateDeleteStatus(item);
                        } catch (error) {
                            log.error(
                                "Rm item failed, path: " + path + ", reason: " + error
                            );
                        }
                    })
                    .then(() => {
                        updateDeleteStatus(item);
                    });
            }
        };
    }
    dlEle.controls.start.onclick = () => {
        downloadMenu.menu.focus();
        ipcRenderer.sendSync("download-method", "aria2.unpause", [item.gid]);
    };
    dlEle.controls.pause.onclick = () => {
        downloadMenu.menu.focus();
        ipcRenderer.sendSync("download-method", "aria2.pause", [item.gid]);
    };
    dlEle.controls.cancel.onclick = () => {
        downloadMenu.menu.focus();
        ipcRenderer.sendSync("download-method", "aria2.remove", [item.gid]);
        if (path && existsSync(path)) {
            try {
                rmSync(path);
            } catch (error) {
                log.error("Failed to remove file, path: " + path + ", reason: " + error);
            }
            try {
                rmSync(path + ".aria2");
            } catch (error) {
                log.warn(
                    "Failed to remove aria2 file, path: " + path + ", reason: " + error
                );
            }
        }
    };
    dlEle.controls.removeResult.onclick = () => {
        downloadMenu.menu.focus();
        ipcRenderer.sendSync("download-method", "aria2.removeDownloadResult", [item.gid]);
    };
    dlEle.controls.redownload.onclick = () => {
        downloadMenu.menu.focus();
        // removes old item
        ipcRenderer.sendSync("download-method", "aria2.removeDownloadResult", [item.gid]);
        // starts a new download
        ipcRenderer.sendSync(
            "download",
            item.files[0].uris[0].uri,
            getFilename(item.files[0])
        );
    };
    updateDeleteStatus(item);
    updateInfo(item, true);
}

function removeItem(item: Download.Item, parent?: HTMLElement) {
    // removes item in the filename map to prevent possible memory leak
    fileNameMap[item.gid] = undefined;
    let dlItem = <HTMLElement>(
        document.querySelector(
            (parent ? "#" + parent.id + ">" : "") + "#download_" + item.gid
        )
    );
    if (dlItem) dlItem.remove();
}

function updateBtnStatus() {
    // hides the download icon if there is nothing in the list
    com.setElementVisible(
        <HTMLElement>document.querySelector("#nav_download"),
        downloader.numActive != 0 ||
            downloader.numWaiting != 0 ||
            downloader.numStopped != 0
    );
}

export function showMenu() {
    let sections = [];
    if (downloader.active.length != 0) sections.push("active");
    if (downloader.waiting.length != 0) sections.push("waiting");
    if (downloader.stopped.length != 0) sections.push("stopped");
    if (sections.length != 0)
        downloadMenu.showMenuUnderElement("#nav_download", sections);
    else downloadMenu.hide();
}

function setTotalProgress() {
    let completedLength = 0,
        totalLength = 0,
        speed = 0;
    let add = (item: Download.Item) => {
        completedLength += parseInt(item.completedLength);
        totalLength += parseInt(item.totalLength);
        speed += parseInt(item.downloadSpeed);
    };
    for (let i = 0; i < downloader.active.length; i++) add(downloader.active[i]);
    for (let i = 0; i < downloader.waiting.length; i++) add(downloader.waiting[i]);
    let progress = completedLength / totalLength;
    if (isNaN(progress)) progress = 0;
    if (progress > 1) progress = 1;
    let percentage = (progress * 100).toFixed(2) + "%";
    (<HTMLElement>document.querySelector("#nav_download_circle")).innerHTML = lang.encode(
        getSuitableUnit(speed).replace(" ", "\n") + "/s"
    );
    (<HTMLElement>document.querySelector("#nav_download_circle")).style.clipPath =
        "polygon(0% 0%, " + percentage + " 0%, " + percentage + " 100%, 0% 100%)";
    (<HTMLElement>document.querySelector("#nav_download_icon")).style.clipPath =
        "polygon(" + percentage + " 0%, 100% 0%, 100% 100%, " + percentage + " 100%)";
    if (downloader.numActive == 0 && downloader.numWaiting == 0) {
        // removes progressbar
        com.curWin.setProgressBar(-1);
    } else com.curWin.setProgressBar(progress);
}

function reloadAll() {
    menuDownloadActive.innerHTML = "";
    menuDownloadWaiting.innerHTML = "";
    menuDownloadStopped.innerHTML = "";
    // init
    for (let i = 0; i < downloader.active.length; i++) {
        const data = downloader.active[i];
        createItem(data, menuDownloadActive);
        updateInfo(data);
    }
    for (let i = 0; i < downloader.waiting.length; i++) {
        const data = downloader.waiting[i];
        createItem(data, menuDownloadWaiting);
    }
    for (let i = 0; i < downloader.stopped.length; i++) {
        const data = downloader.stopped[i];
        createItem(data, menuDownloadStopped);
    }
}

window.addEventListener("load", () => {
    downloadMenu = new Menu("download");
    (menuDownloadActive = <HTMLElement>document.querySelector("#menu_download_active")),
        (menuDownloadWaiting = <HTMLElement>(
            document.querySelector("#menu_download_waiting")
        )),
        (menuDownloadStopped = <HTMLElement>(
            document.querySelector("#menu_download_stopped")
        ));
});

export function init(logger: ElectronLog) {
    log = logger.scope("downloader");

    reloadAll();
    setTotalProgress();
    updateBtnStatus();

    ipcRenderer.on(
        "download-status",
        (event, changedItems: Array<Download.ChangedItem>) => {
            // checks changed items
            for (let i = 0; i < changedItems.length; i++) {
                const item = changedItems[i];
                let menu: HTMLElement;
                if (item.item == "active") menu = menuDownloadActive;
                else if (item.item == "waiting") menu = menuDownloadWaiting;
                else if (item.item == "stopped") menu = menuDownloadStopped;
                for (let i = 0; i < item.removed.length; i++)
                    removeItem(item.removed[i], menu);
                for (let i = 0; i < item.added.length; i++)
                    createItem(item.added[i], menu);
                if (item.item == "stopped" && item.added.length != 0) {
                    for (let i = 0; i < item.added.length; i++) {
                        let path = normalize(item.added[i].files[0].path);
                        if (path)
                            try {
                                rmSync(path + ".aria2");
                            } catch (error) {
                                log.warn(
                                    "Failed to remove aria2 file, path: " +
                                        path +
                                        ", reason: " +
                                        error
                                );
                            }
                    }
                }
                if (item.item == "active" && item.added.length != 0) {
                    showMenu();
                }
                setTotalProgress();
                ipcRenderer.sendSync("download-method", "aria2.saveSession", []);
            }

            updateBtnStatus();
            requestAnimationFrame(() => {
                // moves the menu to the right position
                if (downloadMenu.showed) showMenu();
            });
        }
    );

    ipcRenderer.on("download-active", () => {
        for (let i = 0; i < downloader.active.length; i++)
            updateInfo(downloader.active[i]);
        setTotalProgress();
    });
}
