import * as lang from "../common/language";
import * as com from "../common/common";
import * as win32 from "../platform/win32";
import * as db from "./database";
import * as downloader from "./downloader";
import * as mediactrl from "./media";
import * as user from "./user";
import * as qrcode from "./qrcode";
import * as acrylic from "./acrylic";
import { Menu } from "../common/menu";
import { Dialog } from "../common/dialog";
import { Favourite } from "../common/favourite";
import { isBackdropSupported, isBlurSupported } from "../platform/win32";
import { loadSVGs } from "../common/svgLoader";
import { registerRipple, registerRipples } from "../common/ripple";
import Sortable from "sortablejs";
import axios from "axios";
import { create as createLogger } from "electron-log";
import { ipcRenderer } from "electron";
import { parse as parseURL, format as formatURL } from "url";
import {
    existsSync,
    readdirSync,
    readFileSync,
    rmdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from "fs-extra";
import { basename, dirname, extname, join, normalize, resolve } from "path";
import { release as osRelease } from "os";
import { lte as verLte } from "semver";
import { connect as tlsConnect } from "tls";
import { randomUUID, X509Certificate } from "crypto";
import pkg from "../common/package";
import * as remote from "@electron/remote";

process.noDeprecation = true;

const logger = createLogger("renderer");
let level = remote.getGlobal("logLevel");
logger.transports.console.level = level;
logger.transports.ipc.level = false;
logger.transports.file.level = level;
logger.transports.file.resolvePath = () =>
    normalize(remote.getGlobal("logDir") + "/renderer.log");
const log = logger.scope("browser");

export class Tab {
    public webview: Electron.WebviewTag;
    public webcontents: Electron.WebContents;
    public mediaElementID: string;
    public mediaElementData: Browser.MediaInfo;
    public id: number;
    public pid: number = -1;
    public ready: boolean = false;
    public internal: boolean = false;
    public destroying: boolean = false;
    public historyID: number;
    public icon: string;
    public secret: string;
    public sleeping: boolean = false;
    public sleepTimer: NodeJS.Timeout;
    public securityX509Cert: X509Certificate;
    public securityStatus: string = "unknown";
    public title: string = lang.get("com_new_tab");
    async new(id: number, internal: boolean = false) {
        await new Promise((resolve) => {
            this.id = id;
            this.webview = document.createElement("webview");
            this.webview.partition = curSession;
            this.webview.allowpopups = true;
            this.internal = internal;
            this.webview.classList.add("page");
            let webpreferences = ["contextIsolation=no"];
            if (this.internal) {
                this.webview.nodeintegration = true;
            }
            this.webview.webpreferences = webpreferences.join(",");
            com.setElementVisible(this.webview, false);
            com.setElementVisible(tabMgr.pagePlaceholder, true);
            document.querySelector("#pages").appendChild(this.webview);
            var listen = () => {
                this.webview.removeEventListener("dom-ready", listen);
                this.ready = true;
                this.webcontents = remote.webContents.fromId(
                    this.webview.getWebContentsId()
                );
                this.webcontents.stop();
                if (this.internal)
                    ipcRenderer.sendSync("enable-remote", this.webcontents.id);
                // Example: Mozilla/5.0 (<Operating System>) AppleWebKit/<WebKit Version> (KHTML, like Gecko) Platinum/<Platinum Version> Chrome/<Chromium Version> Safari/<WebKit Version>
                this.webcontents.setUserAgent(
                    this.webcontents
                        .getUserAgent()
                        .replace("Electron/" + process.versions.electron, "")
                        .replace(pkg.name, "Platinum")
                        .replace("  ", " ")
                );
                this.webview.addEventListener("ipc-message", async (event) => {
                    if (event.channel == "process_info_pid") {
                        this.pid = event.args[0];
                        log.log("Tab " + this.id + ": PID: " + this.pid);
                    } else if (event.channel == "start") {
                        startOp(event.args[0], event.args[1]);
                    } else if (event.channel == "get_history") {
                        await tabMgr.listHistory((value) => {
                            if (this.ready) this.webcontents.send("history", value);
                        });
                    } else if (event.channel == "remove_history") {
                        await tabMgr.removeHistory(event.args[0]);
                    } else if (event.channel == "edit_user") {
                        await user.editUser();
                    } else if (event.channel == "delete_user") {
                        await user.deleteUser();
                    } else if (event.channel == "relaunch") {
                        relaunch(event.args[0]);
                    } else if (
                        event.channel == "error_page_controller_proceed_to_unsafe_page"
                    ) {
                        if (!this.ready) return;
                        let url = this.webcontents.getURL();
                        let urlStruct = parseURL(url);
                        if (urlStruct.hostname)
                            ipcRenderer.send(
                                "add-ignorecerterrorhosts",
                                urlStruct.hostname
                            );
                        this.jump(url);
                    }
                });
                // use ipc instead
                ipcRenderer.send("set-certificateerror", this.webcontents.id);
                this.webcontents.addListener("before-input-event", keyPress);
                this.webcontents.addListener("context-menu", (event, params) => {
                    pageMenuParam = params;
                    log.log(
                        "Tab " +
                            this.id +
                            ": Context Menu params: " +
                            JSON.stringify(pageMenuParam)
                    );
                    var sections = [];
                    var showNav = true;
                    if (pageMenuParam.linkURL != "") {
                        sections.push("link");
                        showNav = false;
                    }
                    if (pageMenuParam.hasImageContents == true) {
                        sections.push("image");
                        showNav = false;
                    }
                    if (pageMenuParam.isEditable == true) {
                        sections.push("edit");
                        showNav = false;
                    }
                    if (pageMenuParam.selectionText != "") {
                        sections.push("select");
                        pageMenu.setItemTitle("select_search", "page_select_search", [
                            pageMenuParam.selectionText,
                        ]);
                    }
                    if (showNav) sections.push("nav", "save", "share");
                    sections.push("dev");
                    pageMenu.show(pageMenuParam.x, pageMenuParam.y, sections);
                });
                resolve(null);
            };
            this.webview.addEventListener("dom-ready", listen);
            this.webview.preload = __dirname + "/preload.js";
            this.webview.src = "about:blank";
        });
    }
    public setID(id: number) {
        this.id = id;
    }
    public remove() {
        if (this.ready) {
            if (this.webcontents.isLoading()) this.webcontents.stop();
            if (this.webcontents.isDevToolsOpened()) this.webcontents.closeDevTools();
        }
        this.ready = false;
        this.webview.remove();
    }
    public sleep() {
        if (this.sleepTimer) return;
        let sleepEnabled = () =>
            (com.store.get("pfm.sleep.enable") as boolean) && process.platform == "win32";
        if (!sleepEnabled()) return;
        this.sleepTimer = setTimeout(() => {
            this.sleepTimer = null;
            if (!sleepEnabled()) return;
            if (
                !this.ready ||
                this.webcontents.isLoading() ||
                this.webcontents.isCurrentlyAudible() ||
                this.sleeping ||
                !this.pid ||
                this.id == curTab ||
                this.mediaElementID ||
                this.internal
            ) {
                this.sleep();
                return;
            }
            log.log("Tab " + this.id + ": Sleep");

            let tabEle = tabMgr.getTabElements(this.id);
            tabEle.item.classList.add("tab_sleep");
            win32.spawnHelper(["process_suspend", this.pid.toString()]);
            this.sleeping = true;
        }, parseInt(com.store.get("pfm.sleep.timeout") as string));
        // half hour 1800000
    }
    public wake() {
        if (!this.sleeping) return;
        if (this.sleepTimer) clearTimeout(this.sleepTimer);
        this.sleepTimer = null;
        log.log("Tab " + this.id + ": Wake");
        let tabEle = tabMgr.getTabElements(this.id);
        tabEle.item.classList.remove("tab_sleep");
        win32.spawnHelper(["process_resume", this.pid.toString()]);
        this.sleeping = false;
    }
    public async jump(url: string) {
        const { decodedURL, internal } = tabMgr.decodeURL(url);
        if (internal) {
            url = decodedURL;
            if (!this.internal && internal) {
                tabMgr.new(url, true, this.id);
                return;
            }
        } else if (this.internal) {
            tabMgr.new(url, false, this.id);
            return;
        }
        if (this.id == curTab) tabMgr.updateNavURL(url);
        this.loadURL(url);
    }
    public loadURL(url: string) {
        let headers = [];
        if (browserOptions.guest) headers.push("preferanonymous: 1");
        this.webview.loadURL(url, {
            extraHeaders: headers.join("\n"),
        });

        this.webview.focus();
    }
    public getTitle(url?: string) {
        let title = this.webcontents.getTitle();
        if (title == "about:blank" && url) title = url;
        return title;
    }
    public updateSecret() {
        if (!this.ready) return;
        this.secret = randomUUID();
        this.webcontents.send("get-secret", this.secret);
    }
    public setSecurityStatus(status: string) {
        this.securityStatus = status;
        if (this.id == curTab) {
            tabMgr.updateSiteInfoIcon(status);
        }
    }
    back() {
        if (this.webview.canGoBack()) {
            this.webview.goBack();
        }
    }
    forward() {
        if (this.webview.canGoForward()) {
            this.webview.goForward();
        }
    }
}

class TabManager {
    public tabContainer: HTMLElement;
    public tabBox: HTMLElement;
    public tabNew: HTMLElement;
    public pagePlaceholder: HTMLElement;
    public tabSwap: Sortable;
    public reloadTabStyleTimer: NodeJS.Timeout;
    constructor() {
        this.tabBox = <HTMLElement>document.querySelector(".title_tabbox");
        this.tabContainer = <HTMLElement>document.querySelector(".title_tabs");
        this.tabNew = <HTMLElement>document.querySelector(".tabs_new");
        this.pagePlaceholder = <HTMLElement>document.querySelector("#page_placeholder");
    }
    public updateNavURL(url: string) {
        if (!urlBarChangeable) return;
        (<HTMLInputElement>document.querySelector(".nav_url_input")).value =
            this.encodeURL(url);
    }
    // file://XXX -> platinum://XXX
    public encodeURL(url: string) {
        let urlchecker = urlcheck;
        if (url.startsWith(urlchecker)) {
            if (url.startsWith(urlchecker + "/")) urlchecker = urlchecker + "/";
            url = url.replace(urlchecker, com.scheme + "://").replace(/\.html/g, "");
        }
        if (url.startsWith("chrome://"))
            url = url.replace("chrome://", com.scheme + "://");
        return url;
    }
    // file://XXX <- platinum://XXX
    public decodeURL(url: string) {
        let internal = false;
        if (url.startsWith(com.scheme + "://")) {
            let urlchecker = urlcheck;
            let urlPath = url.replace(com.scheme + "://", "");
            url = url.replace(com.scheme + "://", urlchecker + "/");
            let urlStruct = parseURL(url);
            if (!urlStruct.pathname.endsWith(".html"))
                urlStruct.pathname = urlStruct.pathname + ".html";
            let file = decodeURIComponent(urlStruct.pathname);
            if (process.platform == "win32" && file.startsWith("/"))
                file = file.substring(1);
            file = normalize(file);
            if (!existsSync(file)) url = "chrome://" + urlPath;
            else {
                url = formatURL(urlStruct);
                internal = true;
            }
        }

        return {
            decodedURL: url,
            internal: internal,
        };
    }
    public updateLoadingStatus(isLoading: boolean) {
        com.setElementVisible(
            <HTMLButtonElement>document.querySelector("#nav_refresh"),
            !isLoading
        );
        com.setElementVisible(
            <HTMLButtonElement>document.querySelector("#nav_stop"),
            isLoading
        );
    }
    public updateScaleValue() {
        let tab = tabs[curTab];
        (<HTMLInputElement>document.querySelector(".scale_value")).innerHTML =
            lang.encode(
                Math.round(tab.ready ? tab.webcontents.getZoomFactor() * 100 : 100) + "%"
            );
    }
    public updateFavStatus(isInFav: boolean) {
        com.setElementVisible(
            <HTMLButtonElement>document.querySelector("#nav_url_fav_add"),
            !isInFav
        );
        com.setElementVisible(
            <HTMLButtonElement>document.querySelector("#nav_url_fav_remove"),
            isInFav
        );
    }
    public updateSiteInfoIcon(icon: string) {
        let icons = ["unknown", "safe", "unsafe", "internal", "file"];
        for (let i = 0; i < icons.length; i++)
            com.setElementVisible(
                <HTMLButtonElement>(
                    document.querySelector("#nav_url_siteinfo_" + icons[i])
                ),
                icons[i] == icon
            );
    }
    public async updateTitle(id: number, title: string, url: string) {
        let tab = tabs[id];
        let tabEle = this.getTabElements(id);
        if (title.startsWith("chrome://"))
            title = title.replace("chrome://", com.scheme + "://");
        if (title == "") title = lang.get("com_new_tab");
        tab.title = title;
        if (id == curTab) this.updateDocumentTitle(title);
        tabEle.item.title =
            title && title != "" && title != url ? title + "\n" + url : url;
        tabEle.radio.ariaLabel = title;
        tabEle.title.innerHTML = lang.encode(title);
        if (tab.historyID)
            await this.historyUpdate(tab.id, null, tab.historyID, (value) => {
                if (value) value.title = title;
                return value;
            });
    }
    public updateDocumentTitle(title: string) {
        document.title = title + " - " + lang.get("com_name");
    }
    public listHistory(callback: Function) {
        return new Promise((resolve, reject) => {
            let transaction = db.db
                .transaction("history", "readwrite")
                .objectStore("history");
            let cursor = transaction.index("time").openCursor(undefined, "prev");
            cursor.onsuccess = () => {
                if (cursor.result) {
                    callback(cursor.result.value);
                    cursor.result.continue();
                } else resolve(null);
            };
            cursor.onerror = () => {
                reject("Error");
            };
        });
    }
    public async removeHistory(ids: Array<number>) {
        let transaction = db.db
            .transaction("history", "readwrite")
            .objectStore("history");
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            try {
                await db.request(transaction.delete(id));
            } catch {
                log.warn("Try to remove history item failed, id: " + id);
            }
        }
    }
    public async historyUpdate(
        id: number,
        index: string,
        key: string | number,
        callback: Function
    ) {
        // save history
        let tab = tabs[id];
        let transaction = db.db
            .transaction("history", "readwrite")
            .objectStore("history");
        let value = index
            ? ((await db.request(transaction.index(index).get(key))) as any)
            : ((await db.request(transaction.get(key))) as any);
        if (value) {
            value = callback(value);
            if (value) tab.historyID = await db.request(transaction.put(value));
        } else {
            value = callback(value);
            if (value) tab.historyID = await db.request(transaction.add(value));
        }
    }
    public async startNavEvent(id: number, url: string, isInPage: boolean = false) {
        let tabEle = this.getTabElements(id);
        let tab = tabs[id];
        if (!tab.webcontents.isLoading()) return;

        let decodedURL = url;
        let encodedURL = this.encodeURL(decodedURL);
        log.log(
            "Tab " +
                tab.id +
                ": Start navigation: " +
                encodedURL +
                ", inpage: " +
                isInPage
        );
        if (curTab == id) this.updateNavURL(encodedURL);
        // update zoom factor in more menu
        if (curTab == id) this.updateScaleValue();
        // remove existing media control
        if (tab.mediaElementID) {
            mediactrl.removeItem(tab);
            tab.mediaElementID = undefined;
        }
        if (!isInPage) {
            if (id == curTab) this.updateLoadingStatus(true);
            tabEle.icon.src = "../img/browser/tab/tab.svg";
            tabEle.icon.style.display = "none";
            tabEle.loading.style.display = "block";
            tab.icon = null;
            tab.securityX509Cert = null;
            tab.securityStatus = "unknown";
        }
        let title = tab.getTitle(encodedURL);

        let time = new Date();
        if (!browserOptions.guest)
            await this.historyUpdate(id, "url", encodedURL, (value) => {
                if (value) {
                    value.time = time.getTime();
                    value.frequency++;
                    return value;
                } else {
                    value = {
                        url: encodedURL,
                        time: time.getTime(),
                        frequency: 0,
                        icon: tab.icon,
                    };
                    return value;
                }
            });

        await this.updateTitle(id, title, encodedURL);
        this.updateFavStatus(favMgr.favourite.existsPage(encodedURL));

        if (!isInPage) {
            if (encodedURL.startsWith("http://")) {
                tab.setSecurityStatus("unsafe");
            } else if (encodedURL.startsWith("https://")) {
                tab.setSecurityStatus("unknown");
            } else if (
                encodedURL.startsWith(com.scheme + "://") ||
                encodedURL.startsWith("view-source:")
            ) {
                tab.setSecurityStatus("internal");
            } else if (encodedURL.startsWith("file://")) {
                tab.setSecurityStatus("file");
            } else {
                tab.setSecurityStatus("unknown");
            }
        }
    }
    public async navigateEvent(id: number, url: string) {
        let tab = tabs[id];
        if (!tab.webcontents.isLoading() || url == "about:blank") return;

        let decodedURL = url;
        let encodedURL = this.encodeURL(decodedURL);
        log.log("Tab " + tab.id + ": Navigate: " + encodedURL);
        if (encodedURL.startsWith("https://")) {
            let urlStruct = parseURL(decodedURL);
            let port = parseInt(urlStruct.port);
            if (isNaN(port)) port = 443;
            let tlsSocket = tlsConnect(
                {
                    host: urlStruct.host,
                    servername: urlStruct.host,
                    port: port,
                    checkServerIdentity: () => {
                        return null;
                    },
                    timeout: 10000,
                },
                () => {
                    tab.securityX509Cert = tlsSocket.getPeerX509Certificate();
                    tlsSocket.destroy();
                }
            );
            tlsSocket.on("error", (error) => {
                log.error(
                    "Cannot connect " + decodedURL + " using TLS, reason: " + error
                );
            });
            tab.setSecurityStatus("safe");
        }

        if (encodedURL.indexOf("LICENSES.chromium.html") != -1) {
            await tab.webcontents.insertCSS(
                readFileSync(
                    resolve(__dirname + "/../../libs/chromium/credits.css")
                ).toString()
            );
            await tab.webcontents.insertCSS(
                readFileSync(
                    resolve(__dirname + "/../../libs/chromium/text_defaults.css")
                ).toString()
            );
        }
    }
    public async stopNavEvent(id: number, userGesture?: boolean) {
        let tabEle = this.getTabElements(id);
        let tab = tabs[id];
        if (!userGesture && tab.webcontents.isLoading()) return;

        let url = this.encodeURL(tab.webcontents.getURL());
        log.log("Tab " + tab.id + ": Finish load");
        if (id == curTab) this.updateLoadingStatus(false);
        // send update information
        if (tab.internal) {
            tab.webcontents.send("lang", langLocale);
            tab.webcontents.send("load");
        }
        let title = tab.getTitle(url);
        await this.updateTitle(tab.id, title, url);
        tabEle.icon.style.display = "block";
        tabEle.loading.style.display = "none";
        try {
            if (tab.internal) tab.webview.classList.remove("page_compatible");
            else {
                let needCompatible = await tab.webcontents.executeJavaScript(
                    "window.platinum.needCompatible;"
                );
                if (needCompatible == false)
                    tab.webview.classList.remove("page_compatible");
                else {
                    let content: string = await tab.webcontents.executeJavaScript(
                        '(()=>{let child=document.childNodes;let scheme=document.querySelector("meta[name=color-scheme]");if(scheme)return scheme.content;else if(child.length==1&&child[0].tagName=="svg")return "light dark";else return null;})();'
                    );
                    if (content) {
                        let supportedSchemes = content.split(" ");
                        let curScheme = remote.nativeTheme.shouldUseDarkColors
                            ? "dark"
                            : "light";
                        if (supportedSchemes.includes(curScheme))
                            tab.webview.classList.remove("page_compatible");
                        else tab.webview.classList.add("page_compatible");
                    } else tab.webview.classList.add("page_compatible");
                }
            }
        } catch (error) {
            log.error("Cannot get page's color scheme, reason: " + error);
        }
    }
    public processURL(url: string) {
        if (url == "" || !url) return homepageURL;
        var search = false;
        var urlStruct = parseURL(url);
        var protocol = urlStruct.protocol;
        if (!protocol) {
            var path = urlStruct.path;
            if (path.startsWith("//")) {
                url = "https:" + url;
            } else {
                var domainStart = path.indexOf("//");
                if (domainStart == -1) domainStart = 0;
                var domainEnd = path.indexOf("/");
                if (domainEnd == -1) domainEnd = path.length;
                var domainTopDot = path.lastIndexOf(".", domainEnd);
                if (domainTopDot == -1) search = true;
                else {
                    var domainTop = decodeURIComponent(
                        path.substring(domainTopDot + 1, domainEnd)
                    );
                    var domainFull = decodeURIComponent(
                        path.substring(domainStart, domainEnd)
                    );
                    if (
                        domainTop.length >= 2 &&
                        !/\d/.test(domainTop) &&
                        domainFull.indexOf(" ") == -1 &&
                        domainFull.indexOf("..") == -1
                    ) {
                        url = "https://" + url;
                    } else {
                        search = true;
                    }
                }
            }
        }
        if (search) {
            url = this.processSearch(url);
        }
        return url;
    }
    public processSearch(content: string) {
        return (com.store.get("search.engines") as Array<any>)[
            com.store.get("search.current") as number
        ].url.replace("%s", encodeURIComponent(content));
    }
    public async new(
        url: string = homepageURL,
        internal: boolean = false,
        oldID: number = -1
    ) {
        const decoded = tabMgr.decodeURL(url);
        if (decoded.internal) internal = true;

        if (oldID != -1) await this.close(oldID, true);

        // TODO: make isOpingTab functional
        // if (isOpingTab) return;
        isOpingTab = true;

        let tab = new Tab();
        let id: number = oldID != -1 ? oldID : tabs.length;
        tabs[id] = tab;

        log.log(
            "Tab " +
                id +
                ": Creating tab, url: " +
                url +
                ", internal: " +
                internal +
                ", oldID: " +
                oldID
        );

        // tab element not exist, create one
        if (oldID == -1) {
            let tabItem = <HTMLElement>(
                document.querySelector(".tab.template").cloneNode(true)
            );
            tabItem.classList.remove("template");
            tabItem.id = "tab_" + id;
            this.tabContainer.appendChild(tabItem);
        }

        this.reloadTabStyle();

        let tabEle = this.getTabElements(id);

        if (oldID == -1) {
            // scrolls to end
            this.tabContainer.scroll({
                behavior: "smooth",
                left: this.tabContainer.clientWidth,
                top: 0,
            });

            // create animation
            requestAnimationFrame(() => {
                try {
                    tabEle.item.classList.add("tab_created");
                    setTimeout(() => {
                        try {
                            tabEle.item.classList.add("tab_transition");
                        } catch {}
                    }, 300);
                } catch {}
            });

            await this.updateTitle(id, lang.get("com_new_tab"), url);
        }

        // register dom events, update tab instance inside
        tabEle.radio.onclick = () => {
            this.switch(tab.id);
        };
        tabEle.radio.onmousedown = (event) => {
            if (event.button == 1) {
                if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                this.close(tab.id);
            }
        };
        tabEle.close.onclick = (event) => {
            // prevents tabswitch
            if (event) event.stopPropagation();
            this.close(tab.id);
        };
        tabEle.icon.onerror = () => {
            tabEle.icon.src = "../img/browser/tab/tab.svg";
        };

        tabEle.icon.style.display = "none";
        tabEle.loading.style.display = "block";

        tab.new(id, internal).then(() => {
            tab.webcontents.addListener("media-started-playing", async () => {
                if (tab.destroying) return;
                if (!tab.mediaElementID) await mediactrl.createItem(tab, true);
                mediactrl.updatePlayState(tab, true);
            });
            tab.webcontents.addListener("media-paused", async () => {
                if (tab.destroying) return;
                // this will never happen
                if (!tab.mediaElementID) return;
                mediactrl.updatePlayState(tab, false);
            });
            tab.webcontents.addListener(
                "did-navigate",
                (
                    event: Event,
                    url: string,
                    httpResponseCode: number,
                    httpStatusText: string
                ) => {
                    if (tab.destroying) return;
                    this.navigateEvent(tab.id, url);
                }
            );
            tab.webcontents.addListener(
                "did-start-navigation",
                (
                    event: Event,
                    url: string,
                    /* is in-page navigate */
                    isInPlace: boolean,
                    isMainFrame: boolean,
                    frameProcessId: number,
                    frameRoutingId: number
                ) => {
                    if (tab.destroying || !isMainFrame) return;
                    this.startNavEvent(tab.id, url, isInPlace);
                }
            );
            // tab.webcontents.addListener("did-navigate-in-page", (event: Event,
            //     url: string,
            //     isMainFrame: boolean,
            //     frameProcessId: number,
            //     frameRoutingId: number) => {
            //     if (tab.destroying) return;
            //     if (!isMainFrame) return;
            //     this.startNavEvent(tab.id, url, true);
            // });
            // use "did-start-navigation" instead
            tab.webcontents.addListener("did-finish-load", () => {
                if (tab.destroying) return;
                this.stopNavEvent(tab.id);
            });
            tab.webcontents.addListener(
                "did-fail-load",
                async (
                    event: Event,
                    errorCode: number,
                    errorDescription: string,
                    validatedURL: string,
                    isMainFrame: boolean,
                    frameProcessId: number,
                    frameRoutingId: number
                ) => {
                    if (tab.destroying) return;
                    if (!isMainFrame) return;
                    let ignoreList = [-2, -3, -7];
                    if (ignoreList.includes(errorCode)) return;
                    log.log("Tab " + tab.id + ": Failed to load");
                    // to UTF-8
                    let encodeText = (str: string) => {
                        if (str.length == 0) return;
                        let res = [];
                        for (var i = 0; i < str.length; i++)
                            res[i] = ("00" + str.charCodeAt(i).toString(16)).slice(-4);
                        return ("&#x" + res.join(";&#x") + ";").replace(
                            /&#x00a;/g,
                            "<br>"
                        );
                    };
                    let errorInfo = lang.get(
                        "errno_" + errorCode.toString(),
                        [this.encodeURL(tab.webcontents.getURL())],
                        false
                    );
                    if (!errorInfo) errorInfo = lang.get("errno_unknown");
                    tab.setSecurityStatus("unsafe");
                    tab.updateSecret();
                    await tab.webcontents.executeJavaScript(
                        "document.querySelector('html').lang='en';window.platinum.needCompatible=false;document.querySelector('html').innerHTML=atob('" +
                            Buffer.from(
                                readFileSync(
                                    __dirname + "/../../pages/internal-error.html"
                                )
                                    .toString()
                                    .replace(
                                        "/*!<CSS>!*/",
                                        readFileSync(
                                            __dirname + "/../../css/error.css"
                                        ).toString() +
                                            "*,*::before,*::after{--theme-color:" +
                                            getComputedStyle(document.body).color +
                                            "}.error_icon{content:url(data:image/svg+xml;base64," +
                                            Buffer.from(
                                                readFileSync(
                                                    __dirname +
                                                        "/../../img/error/icon.svg"
                                                ).toString()
                                            ).toString("base64") +
                                            ");}"
                                    )
                                    .replace(
                                        "<!--!<Title>!-->",
                                        encodeText(lang.get("error_title"))
                                    )
                                    .replace("<!--!<Detail>!-->", encodeText(errorInfo))
                                    .replace(
                                        "<!--!<Code>!-->",
                                        encodeText(
                                            errorDescription ? errorDescription : ""
                                        )
                                    )
                                    .replace(
                                        "<!--!<GameText>!-->",
                                        encodeText(lang.get("error_game"))
                                    )
                                    .replace(
                                        "<!--!<ProceedToUnsafePageText>!-->",
                                        encodeText(
                                            lang.get("error_proceed_to_unsafe_page")
                                        )
                                    )
                            ).toString("base64") +
                            "')"
                    );
                    let buttons = [];
                    // cert
                    if (errorCode <= -200 && errorCode > -300)
                        buttons.push("proceed_to_unsafe_page");
                    await tab.webcontents.executeJavaScript(
                        readFileSync(__dirname + "/../pages/errorPage.js")
                            .toString()
                            .replace("!<Secret>!", tab.secret)
                            .replace(
                                '"!<Buttons>!"',
                                buttons.length != 0 ? '"' + buttons.join('","') + '"' : ""
                            ),
                        true
                    );
                }
            );
            // https://github.com/electron/remote/issues/120 causes "The window open handler response must be an object, but was instead of type 'undefined'."
            // tab.webcontents.setWindowOpenHandler((details) => {
            //     this.new(details.url);
            //     return {
            //         action: "deny",
            //     }
            // });
            // use ipc instead
            ipcRenderer.send("set-windowopenhandler", tab.webcontents.id);

            tab.webcontents.addListener(
                "page-favicon-updated",
                async (event, favicons) => {
                    if (tab.destroying) return;
                    // use svg first
                    if (favicons.length < 1) return;
                    let icon = favicons[0];
                    for (let i = 0; i < favicons.length; i++) {
                        if (favicons[i].indexOf(".svg") != -1) icon = favicons[i];
                    }
                    let response = await axios.get(icon, { responseType: "arraybuffer" });
                    if (response.headers["Content-Type"]) {
                        let mime = response.headers["Content-Type"];

                        let data = await response.data;
                        let dataBase64 =
                            "data:image/" +
                            mime +
                            ";base64," +
                            Buffer.from(data).toString("base64");

                        tab.icon = dataBase64;
                        tabEle.icon.src = dataBase64;

                        if (tab.historyID)
                            await this.historyUpdate(
                                tab.id,
                                null,
                                tab.historyID,
                                (value) => {
                                    if (value) value.icon = dataBase64;
                                    return value;
                                }
                            );
                    }
                }
            );
            tab.webcontents.addListener("page-title-updated", async (event, title) => {
                if (tab.destroying) return;
                await this.updateTitle(
                    tab.id,
                    title,
                    this.encodeURL(tab.webcontents.getURL())
                );
            });
            tab.webcontents.addListener("devtools-opened", () => {
                ipcRenderer.send(
                    "set-windowopenhandler",
                    tab.webcontents.devToolsWebContents.id
                );
            });
            if (tab.id == curTab) {
                com.setElementVisible(tab.webview, true);
                com.setElementVisible(tabMgr.pagePlaceholder, false);
            }
            tab.loadURL(decoded.decodedURL);
        });

        isOpingTab = false;
        this.switch(tab.id);
        this.updateNavURL(url);
    }
    public close(id: number, keepElements?: boolean) {
        // keepElements: if it is true, it won't remove tab element, and it just closes the webview
        return new Promise((resolve) => {
            // TODO: make isOpingTab functional
            // if (isOpingTab) return;
            if (id >= tabs.length) throw new Error("Tab " + id + " not exists");
            isOpingTab = true;
            log.log("Tab " + id + ": Closing tab");

            if (!keepElements) {
                // closes window if there is only one tab left
                if (tabs.length == 1) com.curWin.close();
            }

            tabs[id].destroying = true;

            if (tabs[id].mediaElementID) mediactrl.removeItem(tabs[id]);

            let tabEle = this.getTabElements(id);
            let newBtn = <HTMLElement>document.querySelector(".tabs_new");

            if (!keepElements) {
                for (let i = id + 1; i < tabs.length; i++) {
                    this.getTabElements(i).item.classList.add("tab_afterclose");
                }
                newBtn.classList.add("tabs_new_closing");
                newBtn.style.transform = "translateX(" + -tabWidth + "px)";
                tabEle.item.classList.add("tab_closing");
            }

            let animationDuration = keepElements ? 0 : 200;

            setTimeout(() => {
                requestAnimationFrame(() => {
                    tabs[id].remove();
                    tabs[id] = null;
                    if (!keepElements) {
                        // the tab at the end of list
                        let isLastTab = curTab == tabs.length - 1;

                        tabEle.item.remove();

                        // restore default
                        for (let i = id + 1; i < tabs.length; i++) {
                            let tabEle = this.getTabElements(i);
                            tabEle.item.classList.remove("tab_afterclose");
                            tabs[i].setID(i - 1);
                            tabEle.item.id = "tab_" + (i - 1);
                        }
                        // removes tab in tabs
                        tabs.splice(id, 1);

                        newBtn.classList.remove("tabs_new_closing");
                        newBtn.style.transform = null;

                        isOpingTab = false;
                        if (curTab == id) {
                            let nextID = id - 1;
                            if (nextID < 0) nextID = 0;
                            curTab = -1;
                            this.switch(nextID);
                        }
                        if (curTab > id) curTab -= 1;
                        if (lastTab > id) lastTab -= 1;
                        if (this.reloadTabStyleTimer) {
                            clearTimeout(this.reloadTabStyleTimer);
                            this.reloadTabStyleTimer = null;
                        }
                        if (isLastTab) this.reloadTabStyle();
                    } else isOpingTab = false;

                    resolve(null);
                });
            }, animationDuration);
        });
    }
    public getTabElements(id: number) {
        const prefix = "#tab_" + id;
        if (!document.querySelector(prefix)) throw new Error("Tab " + id + " not exists");
        return {
            item: <HTMLButtonElement>document.querySelector(prefix),
            icon: <HTMLImageElement>document.querySelector(prefix + " .tab_icon"),
            loading: <HTMLElement>document.querySelector(prefix + " .tab_loading"),
            title: <HTMLDivElement>document.querySelector(prefix + " .tab_title"),
            close: <HTMLButtonElement>document.querySelector(prefix + " .tab_close"),
            radio: <HTMLInputElement>document.querySelector(prefix + " .tab_radio"),
            rect: (<HTMLButtonElement>(
                document.querySelector(prefix)
            )).getBoundingClientRect(),
        };
    }
    public reloadTabStyle() {
        let tabBoxRect = this.tabBox.getBoundingClientRect();
        let tabNewRect = this.tabNew.getBoundingClientRect();
        tabWidth =
            (tabBoxRect.width - tabNewRect.width - 8 * 2 - (tabs.length - 1) * 2 * 2) /
            tabs.length;
        if (tabWidth > 300) tabWidth = 300;
        for (let i = 0; i < tabs.length; i++) {
            let tabEle = this.getTabElements(i);
            tabEle.item.style.width = tabWidth + "px";
            if (tabWidth <= 75) {
                if (tabWidth >= 40) {
                    tabEle.item.classList.add("tab_medium");
                    tabEle.item.classList.remove("tab_small");
                } else {
                    tabEle.item.classList.remove("tab_medium");
                    tabEle.item.classList.add("tab_small");
                }
            } else {
                tabEle.item.classList.remove("tab_medium");
                tabEle.item.classList.remove("tab_small");
            }
        }
        return true;
    }
    public switch(id: number) {
        // TODO: make isOpingTab functional
        // if (isOpingTab) return;
        if (id >= tabs.length) throw new Error("Tab " + id + " not exists");
        isOpingTab = true;
        if (curTab != id) lastTab = curTab;
        curTab = id;
        urlBarChangeable = true;

        // Hide last tab
        if (lastTab != -1) {
            let lastTabEle = this.getTabElements(lastTab);
            lastTabEle.item.classList.remove("tab_active");
            lastTabEle.item.ariaSelected = "false";
            com.setElementVisible(tabs[lastTab].webview, false);
            tabs[lastTab].sleep();
        }

        // Show current tab
        let tab = tabs[id];
        let tabEle = this.getTabElements(curTab);
        tabEle.item.classList.add("tab_active");
        tabEle.item.ariaSelected = "true";
        tabEle.radio.checked = true;
        tab.wake();
        if (tab.ready) {
            this.updateNavURL(tab.webcontents.getURL());
            this.updateLoadingStatus(tab.webcontents.isLoading());
            this.updateScaleValue();
            this.updateFavStatus(
                favMgr.favourite.existsPage(
                    (<HTMLInputElement>document.querySelector(".nav_url_input")).value
                )
            );
            com.setElementVisible(tab.webview, true);
            com.setElementVisible(tabMgr.pagePlaceholder, false);
        } else {
            this.updateNavURL("");
            this.updateLoadingStatus(true);
            this.updateScaleValue();
            this.updateFavStatus(false);
            // com.setElementVisible(tab.webview, true);
            // call it manually
        }
        this.updateDocumentTitle(tab.title);
        this.updateSiteInfoIcon(tab.securityStatus);

        isOpingTab = false;
    }
}

class FavouriteManager {
    public favourite: Favourite;
    public favContainer: HTMLElement;
    public favFolderContainer: HTMLElement;
    public favMoveContainer: HTMLElement;
    public favSwap: Sortable;
    public favFolderSwap: Sortable;
    constructor() {
        this.favourite = new Favourite(
            com.store,
            logger,
            remote.getGlobal("dataDir") + "/favourites.json",
            remote.getGlobal("dataDir") + "/favouritesIndex.json"
        );
        this.favContainer = <HTMLElement>document.querySelector("#favbar");
        this.favFolderContainer = <HTMLElement>document.querySelector("#menu_favfd_main");
        this.favMoveContainer = <HTMLElement>document.querySelector("#fav_move_options");
        this.favContainer.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            favMenu.show(event.clientX, event.clientY);
        });
    }
    public addPage() {
        let tab = tabs[curTab];
        let url = (<HTMLInputElement>document.querySelector(".nav_url_input")).value;
        if (tab.ready) {
            this.favourite.addItem(
                {
                    type: 0,
                    page: {
                        url: url,
                        icon: tab.icon,
                    },
                    title: tab.getTitle(),
                },
                this.favourite.data
            );
            tabMgr.updateFavStatus(true);
        }
    }
    public removePage() {
        let tab = tabs[curTab];
        let url = (<HTMLInputElement>document.querySelector(".nav_url_input")).value;
        if (tab.ready) {
            this.favourite.removeItem(
                {
                    type: 0,
                    page: {
                        url: url,
                        icon: tab.icon,
                    },
                    title: tab.getTitle(),
                },
                this.favourite.data,
                true
            );
            tabMgr.updateFavStatus(false);
        }
    }
    public reload() {
        try {
            favFolderMenu.hide();
            favItemMenu.hide();
            favMoveDialog.hide();
            {
                let favItems = document.querySelectorAll(".fav_item:not(.template)");
                for (var i = 0; i < favItems.length; i++) {
                    const element = <HTMLElement>favItems.item(i);
                    element.remove();
                }
            }
            if (this.favourite.data.length == 0)
                document.body.classList.add("hide_favbar");
            else document.body.classList.remove("hide_favbar");
            for (var i = 0; i < this.favourite.data.length; i++) {
                const data = this.favourite.data[i];
                let favItem = <HTMLElement>(
                    document.querySelector(".fav_item.template").cloneNode(true)
                );
                favItem.classList.remove("template");
                let id: number = i;
                favItem.id = "fav_" + id;
                this.favContainer.appendChild(favItem);
                let favEle = this.getElements(id);
                registerRipple(favEle.radio);
                favEle.title.innerHTML = lang.encode(data.title);
                let sections = ["delete"];
                let clickEventHandler: Function;
                if (data.type == 0) {
                    favEle.icon.src = data.page.icon
                        ? data.page.icon
                        : "../img/browser/tab/tab.svg";
                    favEle.icon.addEventListener("error", () => {
                        favEle.icon.src = "../img/browser/tab/tab.svg";
                    });
                    clickEventHandler = () => {
                        tabMgr.new(data.page.url);
                    };
                    favEle.item.title = data.title + "\n" + data.page.url;
                    sections.push("open", "move");
                } else if (data.type == 1) {
                    favEle.icon.src = "../img/browser/favourite/folder.svg";
                    clickEventHandler = () => {
                        let rect = favEle.item.getBoundingClientRect();
                        favItemMenuRoot = data.folder.children;
                        this.showFolder(
                            data.folder.children,
                            rect.left,
                            rect.bottom + 10
                        );
                    };
                    favEle.item.title = data.title;
                }
                favEle.radio.addEventListener("mouseup", (event) => {
                    if (event.button == 0 || event.button == 1) clickEventHandler();
                });
                favEle.radio.addEventListener("keydown", (event) => {
                    if (event.key == "Enter") clickEventHandler();
                });
                favEle.radio.addEventListener("keyup", (event) => {
                    if (event.key == " ") clickEventHandler();
                });
                favEle.radio.addEventListener("contextmenu", (event) => {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    favItemMenuRoot = this.favourite.data;
                    favItemMenuItem = data;
                    setTimeout(
                        () => favItemMenu.show(event.clientX, event.clientY, sections),
                        100
                    );
                });
            }
        } catch (error) {
            log.error("Favourites: Cannot load favourite data: " + error);
        }
    }
    public showFolder(root: Favourite.Root, x: number, y: number) {
        // clear item list
        {
            let favItems = document.querySelectorAll(".favfd_item:not(.template)");
            for (var i = 0; i < favItems.length; i++) {
                const element = <HTMLElement>favItems.item(i);
                element.remove();
            }
        }
        favFolderMenuRoot = root;
        // don't show item list if there is nothing in the folder
        if (root.length == 0) return;
        // generate item list
        for (var i = 0; i < root.length; i++) {
            const data = root[i];
            let favItem = <HTMLElement>(
                document.querySelector(".favfd_item.template").cloneNode(true)
            );
            favItem.classList.remove("template");
            let id: number = i;
            favItem.id = "favfd_" + id;
            this.favFolderContainer.appendChild(favItem);
            let favEle = this.getFavFolderElements(id);
            favFolderMenu.registerEventsForElement(favEle.item);
            favEle.title.innerHTML = lang.encode(data.title);
            if (data.type == 0) {
                favEle.icon.src = data.page.icon
                    ? data.page.icon
                    : "../img/browser/tab/tab.svg";
                favEle.item.addEventListener("click", () => {
                    tabMgr.new(data.page.url);
                });
                favEle.item.addEventListener("contextmenu", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    favItemMenuItem = data;
                    setTimeout(() => favItemMenu.show(event.clientX, event.clientY), 100);
                });
                favEle.item.title = data.title + "\n" + data.page.url;
            } else if (data.type == 1) {
                favEle.icon.src = "../img/browser/favourite/folder.svg";
                favEle.item.title = data.title;
            }
        }
        favFolderMenu.show(x, y);
    }
    public move() {
        // clear folder list
        {
            let favItems = document.querySelectorAll(".fav_move_item:not(.template)");
            for (var i = 0; i < favItems.length; i++) {
                const element = <HTMLElement>favItems.item(i);
                element.remove();
            }
        }
        // generate folder list
        for (let i = 0; i < this.favourite.data.length + 1; i++) {
            let title;
            // root
            // folder 1
            // folder 2
            if (i == 0) {
                title = lang.get("fav_move_root");
            } else {
                const data = this.favourite.data[i - 1];
                if (data.type != 1) continue;
                title = data.title;
            }

            let favItem = <HTMLElement>(
                document.querySelector(".fav_move_item.template").cloneNode(true)
            );
            favItem.classList.remove("template");
            let id = i == 0 ? "root" : (i - 1).toString();
            favItem.id = "fav_move_" + id;
            this.favMoveContainer.appendChild(favItem);
            let favLabel = <HTMLElement>(
                document.querySelector("#fav_move_" + id + ">label")
            );
            let favInput = <HTMLInputElement>(
                document.querySelector("#fav_move_" + id + ">input")
            );
            favLabel.innerHTML = lang.encode(title);
            favInput.dataset.id = id;
            // check "root"
            if (i == 0) {
                favInput.checked = true;
            }
        }
        favMoveDialog.show();
        return new Promise<boolean>((resolve, reject) => {
            (<HTMLElement>document.querySelector("#fav_move_ok")).onclick = () => {
                favMoveDialog.hide();
                let items = <NodeListOf<HTMLInputElement>>(
                    document.querySelectorAll(".fav_move_item:not(.template)>input")
                );
                for (let i = 0; i < items.length; i++) {
                    const element = items.item(i);
                    if (element.checked) {
                        // target folder
                        let folder = this.favourite.data;
                        if (i != 0)
                            folder =
                                this.favourite.data[parseInt(element.dataset.id)].folder
                                    .children;
                        // remove page in orginal folder
                        this.favourite.move(favItemMenuItem, favItemMenuRoot, folder);
                        break;
                    }
                }
                resolve(true);
            };
            (<HTMLElement>document.querySelector("#fav_move_cancel")).onclick = () => {
                favMoveDialog.hide();
                resolve(false);
            };
        });
    }
    public getElements(id: number) {
        const prefix = "#fav_" + id;
        if (!document.querySelector(prefix))
            throw new Error("Favourite " + id + " not exists");
        return {
            item: <HTMLButtonElement>document.querySelector(prefix),
            icon: <HTMLImageElement>document.querySelector(prefix + " .fav_icon"),
            title: <HTMLElement>document.querySelector(prefix + " .fav_title"),
            radio: <HTMLElement>document.querySelector(prefix + " .fav_radio"),
        };
    }
    public getFavFolderElements(id: number) {
        const prefix = "#favfd_" + id;
        if (!document.querySelector(prefix))
            throw new Error("Favourite Folder Item " + id + " not exists");
        return {
            item: <HTMLButtonElement>document.querySelector(prefix),
            icon: <HTMLImageElement>document.querySelector(prefix + " .favfd_icon>img"),
            title: <HTMLElement>document.querySelector(prefix + " .favfd_title"),
        };
    }
}

export let app: HTMLElement;
export let tabs: Array<Tab> = [];
export let tabMgr: TabManager;
export let favMgr: FavouriteManager;
export let lastTab: number = -1;
export let curTab: number = -1;
export let tabWidth: number = 0;
export let isOpingTab: boolean = false;
export let mediaControls: Array<string> = [];
export let langLocale: string;
export let homepageURL: string;
const urlcheck = encodeURI(
    "file://" +
        (process.platform == "win32" ? "/" : "") +
        resolve(__dirname + "/../../pages").replace(/\\/g, "/")
);
const macSuffix = process.platform == "darwin" ? "_mac" : "";
export let pageMenu: Menu;
export let pageMenuParam: Electron.ContextMenuParams;
export let editMenu: Menu;
export let editMenuParam: Electron.ContextMenuParams;
export let moreMenu: Menu;
export let favMenu: Menu;
export let favItemMenu: Menu;
export let favItemMenuItem: Favourite.Item;
export let favItemMenuRoot: Favourite.Root;
export let favFolderMenu: Menu;
export let favFolderMenuRoot: Favourite.Root;
export let siteInfoMenu: Menu;
export let favMoveDialog: Dialog;
export let inputDialog: Dialog;
export let curSession: string;
export let browserOptions: Browser.BrowserOptions;
let isFullScreen: boolean = false;
let isHTMLFullScreen: boolean = false;
// if the content of the url bar was modified by the user, the browser cannot modify the content
let urlBarChangeable: boolean = true;
let isLoaded: boolean = false;
let isInitStartRequested: boolean = false;
// let proxyServer: string = null;

export function dialog(options: Browser.DialogOptions) {
    return new Promise<Browser.DialogRet>((resolve) => {
        if (inputDialog.showed)
            resolve({
                button: "failed",
            });
        let inputInput = <HTMLInputElement>document.querySelector("#input_input"),
            inputCheckbox = <HTMLElement>document.querySelector("#input_checkbox"),
            inputCheckboxInput = <HTMLInputElement>(
                document.querySelector("#input_checkbox_input")
            ),
            inputCheckboxText = <HTMLElement>(
                document.querySelector("#input_checkbox_text")
            ),
            inputTitle = <HTMLElement>document.querySelector("#input_title"),
            inputSubTitle = <HTMLElement>document.querySelector("#input_subtitle"),
            inputOK = <HTMLElement>document.querySelector("#input_ok"),
            inputCancel = <HTMLElement>document.querySelector("#input_cancel");
        inputTitle.innerHTML = lang.encode(options.title);
        inputSubTitle.innerHTML = lang.encode(options.subtitle ? options.subtitle : "");

        com.setElementVisible(inputInput, options.input != undefined);
        com.setElementVisible(inputCheckbox, options.checkbox != undefined);
        if (options.checkbox != undefined) {
            inputCheckboxText.innerHTML = lang.encode(options.checkbox.text);
            inputCheckboxInput.checked = options.checkbox.default
                ? options.checkbox.default
                : false;
        }
        if (options.input != undefined) {
            inputInput.value = options.input.default ? options.input.default : "";
        }

        inputDialog.show();

        inputOK.onclick = () => {
            let ret: Browser.DialogRet = {
                button: "ok",
            };
            if (options.checkbox != undefined) {
                let value = inputCheckboxInput.checked;
                ret.checkbox = value;
            }
            if (options.input != undefined) {
                let value = inputInput.value;
                if (!options.input.allowEmptyValues && value.replace(/ /, "") == "")
                    return;
                ret.input = value;
            }
            inputDialog.hide();
            resolve(ret);
        };
        inputCancel.onclick = () => {
            inputDialog.hide();
            resolve({
                button: "cancel",
            });
        };
    });
}

export function setFullScreen(fullscreen: boolean = !isFullScreen) {
    if (fullscreen == isFullScreen || isHTMLFullScreen) return;
    log.log("Set fullscreen state to " + fullscreen);
    isFullScreen = fullscreen;
    setFullScreenStyle(false);
    reloadTitlebar();
    com.curWin.setFullScreen(fullscreen);
}

export function setFullScreenStyle(triggeredByHTML: boolean = false) {
    if (isFullScreen) {
        document.body.classList.add("fullscreen");
        com.showTip(lang.get(triggeredByHTML ? "fullscreen_html_tip" : "fullscreen_tip"));
    } else {
        document.body.classList.remove("fullscreen");
        document.body.classList.remove("fullscreen_show");
    }
    setTaskbarVisibility(!isFullScreen);
}

export function setTaskbarVisibility(isVisible: boolean) {
    if (process.platform == "win32") {
        win32.spawnHelper(["set_taskbar_visibility", isVisible ? "show" : "hide"]);
    }
}

export function newWindow(
    source: "favItem" | "pageLink" | "default",
    guest: boolean = null
) {
    let options: Browser.BrowserOptions = {};
    switch (source) {
        case "favItem":
            options.url = favItemMenuItem.page.url;
            break;
        case "pageLink":
            options.url = pageMenuParam.linkURL;
            break;
        case "default":
            options.url = null;
            break;
        default:
            break;
    }
    options.guest = guest == null ? options.guest : guest;
    ipcRenderer.send("new-window", options);
}

export function newTab(source: "favItem" | "pageImage" | "pageLink" | "default") {
    let url: string;
    switch (source) {
        case "favItem":
            url = favItemMenuItem.page.url;
            break;
        case "pageImage":
            url = pageMenuParam.srcURL;
            break;
        case "pageLink":
            url = pageMenuParam.linkURL;
            break;
        case "default":
            url = tabMgr.processURL(null);
            break;
        default:
            break;
    }
    tabMgr.new(url);
}

export async function favOp(type: string) {
    log.log("FavOp: " + type);
    if (type == "move") {
        favMgr.move();
    } else if (type == "delete") {
        favMgr.favourite.removeItem(favItemMenuItem, favItemMenuRoot);
    } else if (type == "new_folder") {
        let ret = await dialog({
            title: lang.get("fav_new_folder"),
            input: {
                allowEmptyValues: false,
            },
        });
        if (ret.button == "ok")
            favMgr.favourite.addItem(
                { type: 1, folder: { children: [] }, title: ret.input },
                favMgr.favourite.data
            );
    }
}

export function startOp(type: string, args: any = { url: null }) {
    log.log("StartOp: " + type);
    if (type == "search") {
        if (args.url == "") return;
        tabMgr.new(tabMgr.processURL(args.url));
    }
}

export function moreOp(
    type: string,
    args: any = { scaleOp: "add", settingsPage: undefined }
) {
    log.log("MoreOp: " + type);
    let tab = tabs[curTab];
    if (type == "restart") {
        relaunch(false);
    } else if (type == "quit") {
        quit(false);
    } else if (type == "scale") {
        let scale;
        if (tab.ready) scale = Math.round(tab.webcontents.getZoomFactor() * 100);
        else scale = 100;
        if (scale >= 500 && args.scaleOp == "add") return;
        if (scale <= 20 + 10 && args.scaleOp == "minus") return;

        if (args.scaleOp == "add")
            if (scale >= 200) scale += 100;
            else if (scale >= 100) scale += 50;
            else scale += 10;
        if (args.scaleOp == "minus")
            if (scale >= 200 + 100) scale -= 100;
            else if (scale >= 100 + 50) scale -= 50;
            else scale -= 10;
        tab.webcontents.setZoomFactor(scale / 100);
        tabMgr.updateScaleValue();
    } else if (type == "settings") {
        tabMgr.new(
            com.scheme +
                "://settings" +
                (args.settingsPage ? "#" + args.settingsPage : "")
        );
    } else if (type == "close_curtab") {
        tabMgr.close(curTab);
    }
}

function notifySaveStarted() {
    let object = new remote.Notification({
        title: lang.get("save_started_title"),
        body: lang.get("save_started_body"),
        urgency: "low",
    });
    object.show();
}

function notifySaveFinished(callback: Function) {
    let object = new remote.Notification({
        title: lang.get("save_finished_title"),
        body: lang.get("save_finished_body"),
        urgency: "normal",
    });
    object.addListener("click", () => callback());
    object.show();
}

function notifySaveError(reason: string) {
    let object = new remote.Notification({
        title: lang.get("save_error_title"),
        body: lang.get("save_error_body", [reason]),
        urgency: "normal",
    });
    object.show();
}

export async function saveHTML() {
    let tab = tabs[curTab];
    if (tab.ready) {
        let filePath = remote.dialog.showSaveDialogSync(com.curWin, {
            filters: [
                {
                    name: "Complete page",
                    extensions: ["complete_html", "complete_htm"],
                },
                {
                    name: "Single file",
                    extensions: ["mhtml"],
                },
                {
                    name: "HTML only",
                    extensions: ["html", "htm"],
                },
            ],
        });
        if (filePath) {
            notifySaveStarted();
            let fileExt = extname(filePath);
            let saveType: string;
            let saveExt: string;
            switch (fileExt) {
                case ".complete_html":
                    saveType = "HTMLComplete";
                    saveExt = ".html";
                    break;
                case ".complete_htm":
                    saveType = "HTMLComplete";
                    saveExt = ".htm";
                    break;
                case ".mhtml":
                    saveType = "MHTML";
                    saveExt = ".mhtml";
                    break;
                case ".html":
                    saveType = "HTMLOnly";
                    saveExt = ".html";
                    break;
                case ".htm":
                    saveType = "HTMLOnly";
                    saveExt = ".htm";
                    break;
                default:
                    saveType = "HTMLComplete";
                    saveExt = ".html";
                    break;
            }
            try {
                let file = normalize(
                    dirname(filePath) + "/" + basename(filePath, fileExt) + saveExt
                );
                await tab.webcontents.savePage(file, <any>saveType);
                notifySaveFinished(() => {
                    tabMgr.new(file);
                });
            } catch (error) {
                notifySaveError(error);
            }
        }
    }
}

export async function savePDF() {
    let tab = tabs[curTab];
    if (tab.ready) {
        let filePath = remote.dialog.showSaveDialogSync(com.curWin, {
            filters: [
                {
                    name: "PDF file",
                    extensions: ["pdf"],
                },
            ],
        });
        if (filePath) {
            notifySaveStarted();
            try {
                writeFileSync(filePath, await tab.webcontents.printToPDF({}));
                notifySaveFinished(() => {
                    tabMgr.new(filePath);
                });
            } catch (error) {
                notifySaveError(error);
            }
        }
    }
}

export async function printHTML() {
    let tab = tabs[curTab];
    if (tab.ready) {
        tab.webcontents.print();
    }
}

export function showQRCode(source: "url" | "pageImage" | "pageLink") {
    let url: string;
    switch (source) {
        case "url":
            url = (<HTMLInputElement>document.querySelector(".nav_url_input")).value;
            break;
        case "pageImage":
            url = pageMenuParam.srcURL;
            break;
        case "pageLink":
            url = pageMenuParam.linkURL;
            break;
        default:
            break;
    }
    qrcode.setURL(url);
    qrcode.generateQRCode();
}

export function siteOp(type: string) {
    log.log("SiteOp: " + type);
    let tab = tabs[curTab];
    if (type == "show_cert") {
        if (!tab.securityX509Cert) return;
        let cert: X509Certificate = tab.securityX509Cert;
        let data: Array<string> = [""];
        while (true) {
            if (cert) {
                data.push(
                    "-----BEGIN CERTIFICATE-----\n" +
                        Buffer.from(cert.raw).toString("base64") +
                        "\n-----END CERTIFICATE-----"
                );
                cert = cert.issuerCertificate;
            } else {
                let path = normalize(
                    remote.app.getPath("temp") +
                        "/platinum.x509cert.{" +
                        randomUUID() +
                        "}.cer"
                );
                writeFileSync(path, data.join("\n\n"));
                remote.shell.openPath(path);
                break;
            }
        }
    }
}

export function pageOp(type: string, args: any = { url: null, force: false }) {
    log.log("PageOp: " + type);
    let tab = tabs[curTab];
    tab.webview.focus();
    if (type == "new_tab") {
        tabMgr.new(tabMgr.processURL(args.url));
    } else if (type == "nav_more") {
        let sections = ["open", "personal", "scale", "help"];
        if (com.store.get("applyrestart") != null) sections.push("restart");
        moreMenu.showMenuUnderElement("#nav_more", sections);
    } else if (type == "nav_media") {
        mediactrl.showMenu();
    } else if (type == "nav_download") {
        downloader.showMenu();
    } else if (type == "nav_user") {
        user.showMenu();
    } else if (type == "nav_history") {
        tabMgr.new(com.scheme + "://history");
    } else if (type == "nav_siteinfo") {
        com.setElementVisible(
            <HTMLButtonElement>document.querySelector("#menu_siteinfo_security_safe"),
            tab.securityStatus == "safe"
        );
        com.setElementVisible(
            <HTMLButtonElement>document.querySelector("#menu_siteinfo_security_unsafe"),
            tab.securityStatus == "unsafe"
        );
        com.setElementVisible(
            <HTMLButtonElement>document.querySelector("#menu_siteinfo_security_cert"),
            tab.securityX509Cert != undefined
        );
        siteInfoMenu.showMenuUnderElement(".siteinfo_btn:not(.hide)");
    } else if (type == "nav_jump") {
        urlBarChangeable = true;
        tabMgr.updateSiteInfoIcon("unknown");
        tab.jump(tabMgr.processURL(args.url));
    } else if (type == "nav_back") {
        tab.back();
    } else if (type == "nav_forward") {
        tab.forward();
    } else if (type == "nav_refresh") {
        if (tab.ready && !tab.webcontents.isLoading()) {
            if (args.force) tab.webcontents.reloadIgnoringCache();
            else tab.webcontents.reload();
        }
    } else if (type == "nav_stop") {
        if (tab.ready && tab.webcontents.isLoading()) {
            tab.webcontents.stop();
            tabMgr.stopNavEvent(curTab, true);
        }
    } else if (type == "nav_home") {
        tab.jump(homepageURL);
    } else if (type == "nav_fav_add") {
        favMgr.addPage();
    } else if (type == "nav_fav_remove") {
        favMgr.removePage();
    } else if (type == "select_copy") {
        tab.webcontents.copy();
    } else if (type == "select_search") {
        tabMgr.new(tabMgr.processSearch(pageMenuParam.selectionText));
    } else if (type == "edit_undo") {
        if (tab.ready) tab.webcontents.undo();
    } else if (type == "edit_redo") {
        if (tab.ready) tab.webcontents.redo();
    } else if (type == "edit_cut") {
        if (tab.ready) tab.webcontents.cut();
    } else if (type == "edit_copy") {
        if (tab.ready) tab.webcontents.copy();
    } else if (type == "edit_paste") {
        if (tab.ready) tab.webcontents.pasteAndMatchStyle();
    } else if (type == "edit_paste_text") {
        if (tab.ready) tab.webcontents.paste();
    } else if (type == "edit_selectall") {
        if (tab.ready) tab.webcontents.selectAll();
    } else if (type == "link_copy") {
        remote.clipboard.writeText(pageMenuParam.linkURL);
    } else if (type == "image_save") {
        if (tab.ready) tab.webcontents.downloadURL(pageMenuParam.srcURL);
    } else if (type == "image_copy") {
        if (tab.ready) tab.webcontents.copyImageAt(pageMenuParam.x, pageMenuParam.y);
    } else if (type == "image_copy_link") {
        if (tab.ready) remote.clipboard.writeText(pageMenuParam.srcURL);
    } else if (type == "dev_source") {
        let url = tab.webcontents.getURL();
        if (!url.startsWith("view-source:")) tabMgr.new("view-source:" + url);
    } else if (type == "dev_inspect" || type == "dev_tools") {
        if (tab.ready) {
            tab.webcontents.openDevTools();
            if (type == "dev_inspect" && pageMenuParam)
                tab.webcontents.inspectElement(pageMenuParam.x, pageMenuParam.y);
        }
    }
    pageMenuParam = null;
}

export function editOp(type: string) {
    log.log("EditOp: " + type);
    if (type == "edit_undo") {
        com.curWin.webContents.undo();
    } else if (type == "edit_redo") {
        com.curWin.webContents.redo();
    } else if (type == "edit_cut") {
        com.curWin.webContents.cut();
    } else if (type == "edit_copy") {
        com.curWin.webContents.copy();
    } else if (type == "edit_paste") {
        com.curWin.webContents.paste();
    } else if (type == "edit_selectall") {
        com.curWin.webContents.selectAll();
    }
    editMenuParam = null;
}

export function reloadTitlebar() {
    let isBlur = (com.store.get("appearance.visual.blur") as boolean) && isBlurSupported;
    let useBackDrop =
        (com.store.get("appearance.visual.usebackdrop") as boolean) &&
        isBlur &&
        isBackdropSupported;
    com.setElementVisible(
        <HTMLElement>document.querySelector(".title_btns" + macSuffix),
        !useBackDrop || isFullScreen
    );
}

export function reloadConfig() {
    // loads language
    langLocale = com.store.get("language.uses") as string;
    lang.reload(langLocale);
    document.title = lang.get("com_name");
    sendBroadcast("lang", langLocale);
    // loads sortable
    let disableAnimation = com.store.get("appearance.visual.animation") as boolean;
    tabMgr.tabSwap = new Sortable(tabMgr.tabContainer, {
        animation: disableAnimation ? 0 : 100,
        easing: disableAnimation ? null : "linear",
    });
    favMgr.favSwap = new Sortable(favMgr.favContainer, {
        animation: disableAnimation ? 0 : 100,
        easing: disableAnimation ? null : "linear",
        onUpdate: (event) => {
            favMgr.favourite.sort(null, event.oldIndex, event.newIndex);
        },
    });
    favMgr.favFolderSwap = new Sortable(favMgr.favFolderContainer, {
        animation: disableAnimation ? 0 : 100,
        easing: disableAnimation ? null : "linear",
        onUpdate: (event) => {
            favMgr.favourite.sort(favFolderMenuRoot, event.oldIndex, event.newIndex);
        },
    });
    // shows or hides home button
    (<HTMLElement>document.querySelector("#nav_home")).style.display = (com.store.get(
        "home.button.show"
    ) as boolean)
        ? "block"
        : "none";
    // blur effect
    let isBlur = (com.store.get("appearance.visual.blur") as boolean) && isBlurSupported;
    let useBackDrop =
        (com.store.get("appearance.visual.usebackdrop") as boolean) &&
        isBlur &&
        isBackdropSupported;
    let isFullBlur =
        ((com.store.get("appearance.visual.fullblur") as boolean) && isBlur) ||
        useBackDrop;

    if (process.platform == "win32") {
        acrylic.setEnabled(isBlur && !useBackDrop);
        com.addStyleSheet(
            isFullBlur ? "*,*::before,*::after{--app-background:transparent;}" : null,
            "com_style_visual_fullblur"
        );
    }
    if (!useBackDrop) document.body.classList.add("no_backdrop");
    else document.body.classList.remove("no_backdrop");
    // control btns
    (<HTMLElement>document.querySelector(".title_btns_min" + macSuffix)).onclick = () => {
        if (isFullScreen) setTaskbarVisibility(true);
        com.curWin.minimize();
    };
    (<HTMLElement>document.querySelector(".title_btns_max" + macSuffix)).onclick = () => {
        if (isFullScreen) setFullScreen();
        else if (com.curWin.isMaximized()) com.curWin.restore();
        else com.curWin.maximize();
    };
    (<HTMLElement>document.querySelector(".title_btns_close" + macSuffix)).onclick =
        () => {
            com.curWin.close();
        };
    reloadTitlebar();
    if (process.platform == "win32" && verLte("10.0.22000", osRelease())) {
        // is Windows 11
        let menuTimer: NodeJS.Timeout;
        (<HTMLElement>document.querySelector(".title_btns_max")).onmouseenter = () => {
            if (com.curWin.isFocused() && !menuTimer)
                menuTimer = setTimeout(async () => {
                    // press Win+Z
                    win32.spawnHelper(["show_layout_panel"]);
                }, 1000);
        };
        (<HTMLElement>document.querySelector(".title_btns_max")).onmouseleave = () => {
            if (menuTimer) {
                clearTimeout(menuTimer);
                menuTimer = null;
            }
        };
    }

    // sets homepage
    let homepageType = com.store.get("home.page.uses") as string;
    if (homepageType == "start") {
        homepageURL = com.scheme + "://start";
    } else {
        homepageURL = com.store.get("home.page.url") as string;
    }
    // adds corner mark
    let moreBtn = <HTMLElement>document.querySelector("#nav_more");
    if (com.store.get("applyrestart") != null) moreBtn.classList.add("nav_item_mark");
    else moreBtn.classList.remove("nav_item_mark");
}

export function sendBroadcast(channel: string, args?: any) {
    for (let i = 0; i < tabs.length; i++) {
        let tab = tabs[i];
        if (tab.internal && tab.ready) {
            tab.webcontents.send(channel, args);
        }
    }
}

export function relaunch(global: boolean) {
    setTaskbarVisibility(true);
    ipcRenderer.sendSync("relaunch", global);
}

export function quit(global: boolean) {
    setTaskbarVisibility(true);
    ipcRenderer.sendSync("quit", global);
}

function rmDir(dir: string) {
    let files = readdirSync(dir);
    files.forEach((file) => {
        var filePath = join(dir, file);
        if (statSync(filePath).isDirectory()) rmDir(filePath);
        else
            try {
                rmSync(filePath);
            } catch {}
    });
    try {
        rmdirSync(dir);
    } catch {}
}

export let update = remote.getGlobal("updateStatus") as Browser.UpdateStatus;

// route
ipcRenderer.on("update", () => sendBroadcast("update"));
ipcRenderer.on("users-update", () => sendBroadcast("users-update"));
ipcRenderer.on("favourite-sync", () => sendBroadcast("favourite-sync"));
ipcRenderer.on("accent-color-changed", () => sendBroadcast("accent-color-changed"));

ipcRenderer.on("close", () => close(false));

export async function close(force: boolean = false) {
    if (
        !force &&
        (com.store.get("appearance.behavior.askmulti") as boolean) &&
        tabs.length > 1
    ) {
        let ret = await dialog({
            title: lang.get("closeall_title"),
        });
        if (ret.button == "ok") close(true);
        return false;
    }
    setTaskbarVisibility(true);
    if (browserOptions.guest) {
        log.log("Browser: Clearing guest data");
        com.curWin.hide();

        let session: Electron.Session = remote.session.fromPartition(curSession);
        session.clearCache().then(() => {
            session.clearStorageData().then(() => {
                rmDir(session.storagePath);
                com.curWin.destroy();
            });
        });
    } else com.curWin.destroy();
    return true;
}

// hot keys
function keyPress(event, input: Electron.Input) {
    if (input.isAutoRepeat || input.type != "keyDown") return;
    let inputStr = "";
    if (input.control) inputStr += "Ctrl+";
    if (input.alt) inputStr += "Alt+";
    if (input.shift) inputStr += "Shift+";
    inputStr += input.key.toUpperCase();
    if (browserOptions)
        if (inputStr == "Alt+F") {
            pageOp("nav_more");
        } else if (inputStr == "Ctrl+R" || inputStr == "F5") {
            pageOp("nav_refresh");
        } else if (inputStr == "Ctrl+F5") {
            pageOp("nav_refresh", { force: true });
        } else if (inputStr == "ESCAPE") {
            let urlElement = <HTMLInputElement>document.querySelector(".nav_url_input");
            if (document.activeElement == urlElement) {
                let tab = tabs[curTab];
                urlBarChangeable = true;
                if (tab.ready)
                    tabMgr.updateNavURL(tabMgr.encodeURL(tab.webcontents.getURL()));
                else tabMgr.updateNavURL("");
            } else {
                pageOp("nav_stop");
            }
        } else if (inputStr == "Ctrl+J") {
            pageOp("nav_download");
        } else if (inputStr == "Ctrl+H") {
            pageOp("nav_history");
        } else if (inputStr == "Ctrl+Shift+I") {
            pageOp("dev_inspect");
        } else if (inputStr == "F12") {
            pageOp("dev_tools");
        } else if (inputStr == "Ctrl+U") {
            pageOp("dev_source");
        } else if (inputStr == "Ctrl+ARROWLEFT") {
            pageOp("nav_back");
        } else if (inputStr == "Ctrl+ARROWRIGHT") {
            pageOp("nav_forward");
        } else if (inputStr == "Alt+HOME") {
            pageOp("nav_home");
        } else if (inputStr == "F11") {
            setFullScreen();
        } else if (inputStr == "Ctrl+T") {
            moreOp("open_tab");
        } else if (inputStr == "Ctrl+N") {
            moreOp("open_window");
        } else if (inputStr == "Ctrl+W") {
            moreOp("close_curtab");
        } else if (inputStr == "Ctrl+S") {
            saveHTML();
        } else if (inputStr == "Ctrl+Shift+N") {
            moreOp("open_window", { guest: true });
        }
}

async function startup() {
    let splash = <HTMLInputElement>document.querySelector("#splash");
    com.setElementVisible(splash, true);

    // init guest mode
    if (browserOptions.guest) {
        logger.transports.file.level = false;
        (<HTMLElement>document.querySelector("#menu_more_open_window")).style.display =
            "none";
        log.log("Browser: You are now in Guest Mode, session " + curSession);
    }

    com.registerEvents();
    registerRipples();
    favMgr = new FavouriteManager();
    com.store.on("change", () => reloadConfig());
    com.store.on("change-internal-notify", () => sendBroadcast("store-update"));
    com.globalStore.on("change-internal-notify", () =>
        sendBroadcast("global-store-update")
    );
    reloadConfig();
    if (!browserOptions.guest) await db.loadDB(curSession);
    downloader.init(logger);
    mediactrl.init(logger);
    user.init(logger);
    qrcode.init(logger);
    acrylic.init(logger);
    if (process.platform == "win32")
        win32.init(logger, remote as unknown as typeof Electron.CrossProcessExports);

    // creates menus
    pageMenu = new Menu("page");
    favMenu = new Menu("fav");
    favItemMenu = new Menu("favitem");
    favFolderMenu = new Menu("favfd");
    siteInfoMenu = new Menu("siteinfo");
    moreMenu = new Menu("more");
    editMenu = new Menu("edit", false);

    // creates dialogs
    favMoveDialog = new Dialog("fav_move");
    inputDialog = new Dialog("input");

    favMgr.reload();
    favMgr.favourite.on("change", () => {
        favMgr.reload();
    });

    // let titlebar = <HTMLElement>document.querySelector(".titlebar");
    // let titlebarElements = [".title_tabs", ".tabs_new", ".title_btns"];
    // let moveTimer: NodeJS.Timer;
    // titlebar.addEventListener("mousedown", (event) => {
    // let hWnd = com.curWin.getNativeWindowHandle().readUint32LE();
    // ipcRenderer.send("start-drag", hWnd, com.curWin.getSize(), com.curWin.getPosition());
    // if (moveTimer || isFullScreen || com.curWin.isMaximized()) return;
    // let hWnd = com.curWin.getNativeWindowHandle().readUint32LE();
    // let scale = user32.GetDpiForWindow(hWnd) / 96;
    // let rect = new RECT();
    // let point = new POINT();
    // let availHeight = window.screen.availHeight;
    // user32.GetWindowRect(hWnd, rect.ref());
    // user32.GetCursorPos(point.ref());
    // let mouseX = point.X - rect.left;
    // let mouseY = point.Y - rect.top;
    // moveTimer = setInterval(() => {
    //     const SWP_NOSIZE = 0x0001;
    //     const SWP_NOZORDER = 0x0004;
    //     user32.GetCursorPos(point.ref());
    //     if (mouseY + 10 > availHeight) mouseY = availHeight - 10;
    //     let x = point.X - mouseX, y = point.Y - mouseY;
    //     user32.SetWindowPos(hWnd, 0, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
    // }, 1);
    // });
    // titlebar.addEventListener("dblclick", () => {
    //     if (com.curWin.isMaximized()) com.curWin.restore();
    //     else com.curWin.maximize();
    // });
    // for (let i = 0; i < titlebarElements.length; i++) {
    //     const element = <HTMLElement>document.querySelector(titlebarElements[i]);
    //     element.addEventListener("mousedown", (event) => event.stopPropagation());
    //     element.addEventListener("mouseup", (event) => event.stopPropagation());
    // }

    let url = browserOptions.url;
    let lastVer = com.store.get("browser.version") as string;
    let curVer = pkg.version;
    // first use
    if (!lastVer) com.store.set("browser.version", curVer);
    // version updated
    if (lastVer != curVer && com.store.get("update.tip")) {
        url = com.scheme + "://update";
        com.store.set("browser.version", curVer);
    }

    // if (process.platform == "win32") {
    //     try {
    //         const subkey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
    //         let ret = await regedit.list(subkey);
    //         for (const key in ret) {
    //             const values = ret[key].values;
    //             if (values["ProxyEnable"].value == 1 && values["ProxyServer"].value != "") {
    //                 proxyServer = values["ProxyServer"].value;
    //             }
    //         }
    //     } catch (error) {
    //         log.error("Get system proxy settings failed, reason: " + error);
    //     }
    // } else if (process.platform == "linux") {
    //     proxyServer = process.env.http_proxy;
    //     if (!proxyServer) proxyServer = process.env.https_proxy;
    //     if (!proxyServer) proxyServer = null;
    // }
    // if (proxyServer) {
    //     if (!proxyServer.startsWith("https://") || !proxyServer.startsWith("http://")) proxyServer = "http://" + proxyServer;
    //     log.log("Got proxy server: " + proxyServer);
    // }

    tabMgr.new(tabMgr.processURL(url));
    ipcRenderer.on("windowopenhandler-cb", (event, details: Electron.HandlerDetails) => {
        tabMgr.new(details.url);
    });

    tabMgr.tabBox.addEventListener("mousemove", () => {
        if (!tabMgr.reloadTabStyleTimer) {
            tabMgr.reloadTabStyleTimer = setTimeout(() => {
                tabMgr.reloadTabStyleTimer = null;
                tabMgr.reloadTabStyle();
            }, 2000);
        }
    });

    com.setElementVisible(app, true);
    // finishes startup
    requestAnimationFrame(() => {
        com.showTabbar();

        splash.style.opacity = "0";
        app.style.opacity = "1";
        setTimeout(() => {
            com.setElementVisible(splash, false);
            com.setElementVisible(app, true);
        }, 300);
    });
}

ipcRenderer.on("blur", () => {
    if (isFullScreen) setTaskbarVisibility(true);
});

ipcRenderer.on("focus", () => {
    if (isFullScreen) setTaskbarVisibility(false);
});

ipcRenderer.on("fullscreen-html", (event, fullscreen: boolean) => {
    isFullScreen = fullscreen;
    isHTMLFullScreen = fullscreen;
    setFullScreenStyle(true);
    com.curWin.setFullScreen(fullscreen);
});

ipcRenderer.on("key-press", keyPress);

ipcRenderer.on("new-tab", (event, url) => {
    tabMgr.new(tabMgr.processURL(url));
});

ipcRenderer.on("certificate-error", (event, id: number, error: string) => {
    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        if (tab.ready && tab.webcontents.id == id) {
            log.log("Tab " + i + ": A certificate error occurred, reason: " + error);
            tab.setSecurityStatus("unsafe");
        }
    }
});

ipcRenderer.on(
    "load",
    async (event, options: Browser.BrowserOptions, session: string) => {
        log.log("Browser: Starting browser");

        browserOptions = options;
        curSession = session;

        if (isLoaded) await startup();
        else isInitStartRequested = true;
    }
);

window.addEventListener("load", async () => {
    let params = new URLSearchParams(window.location.search.substring(1));

    app = document.querySelector("#app");

    let icon = params.get("icon");
    (<HTMLImageElement>document.querySelector("#splash_logo")).src =
        "../platinum" + (icon == "latest" ? "" : "_" + icon) + ".png";
    (<HTMLElement>document.querySelector("#troubleshoot_version")).innerHTML =
        lang.encode("Version: " + pkg.version);

    tabMgr = new TabManager();

    loadSVGs();

    // register url bar
    let urlBGElement = <HTMLInputElement>document.querySelector(".nav_url_bg");
    let urlElement = <HTMLInputElement>document.querySelector(".nav_url_input");
    urlElement.addEventListener("keydown", (event) => {
        urlBarChangeable = false;
        if (event.key == "Enter")
            pageOp("nav_jump", {
                url: urlElement.value,
            });
        // for some reasons, it can't handle Escape event here, so move to keyPress event
    });

    let selectionStart = 0;
    let selectionEnd = 0;
    let selectionDirection: "forward" | "backward" | "none" = "forward";

    urlElement.addEventListener("focus", () => {
        urlBGElement.classList.add("nav_url_bg_active");
        urlElement.select();
    });

    urlElement.addEventListener("blur", () => {
        urlBGElement.classList.remove("nav_url_bg_active");
    });

    // select all when drag enter
    urlElement.addEventListener("dragenter", () => {
        // save selection
        selectionStart = urlElement.selectionStart;
        selectionEnd = urlElement.selectionEnd;
        selectionDirection = urlElement.selectionDirection;
        urlElement.select();
    });

    // restore selection when drag leave
    urlElement.addEventListener("dragleave", () => {
        urlElement.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
    });

    // replace text instead of adding text when drop
    urlElement.addEventListener("drop", (event) => {
        if (event.dataTransfer.files.length != 0)
            urlElement.value = event.dataTransfer.files.item(0).path;
        else urlElement.value = event.dataTransfer.getData("text/plain");
    });

    let collapseTimer: NodeJS.Timeout;
    let topareaCollapsedElement = <HTMLInputElement>(
        document.querySelector("#toparea_collapsed")
    );
    topareaCollapsedElement.addEventListener("mouseenter", () => {
        if (collapseTimer) {
            clearTimeout(collapseTimer);
            collapseTimer = null;
        }
        if (isFullScreen) document.body.classList.add("fullscreen_show");
    });

    let pagesBoxElement = <HTMLElement>document.querySelector("#pages");
    pagesBoxElement.addEventListener("mouseenter", () => {
        if (!collapseTimer && isFullScreen)
            collapseTimer = setTimeout(() => {
                collapseTimer = null;
                if (isFullScreen) document.body.classList.remove("fullscreen_show");
            }, 2000);
    });

    // context menu
    ipcRenderer.on("context-menu", (event, params) => {
        editMenuParam = params;
        if (editMenuParam.menuSourceType == "touch") return;
        log.log("Window: Context Menu params: " + JSON.stringify(editMenuParam));
        // edit menu
        if (editMenuParam.isEditable == true) {
            editMenu.show(editMenuParam.x, editMenuParam.y, ["edit"]);
        }
    });

    // adjust tab's size when window resizes
    window.addEventListener("resize", () => {
        tabMgr.reloadTabStyle();
    });

    isLoaded = true;
    if (isInitStartRequested) await startup();
});
