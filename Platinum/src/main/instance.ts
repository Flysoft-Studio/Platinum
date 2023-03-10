import * as lang from "../common/language";
import * as win32 from "../platform/win32";
import * as downloader from "./downloader";
import { getDir } from "../common/dir";
import { getIpcPath } from "../common/ipcPath";
import { args } from "./args";
import {
    setUserList,
    getUserList,
    init as initUser,
    logDir,
    dataDir,
    generateLink,
    deleteLink,
    getLinkFile,
    mgrDataDir,
} from "./user";
import { Store } from "../common/store";
import { Favourite } from "../common/favourite";
import { getDefaultOptions, getMgrDefaultOptions } from "../common/default";
import electron, {
    app,
    BrowserWindow,
    Certificate,
    dialog,
    ipcMain,
    Menu,
    nativeTheme,
    session,
    systemPreferences,
    webContents,
} from "electron";
import { create as createLogger } from "electron-log";
import { ElectronBlocker } from "@cliqz/adblocker-electron";
import { JSONRPCClient } from "json-rpc-2.0";
import { dirname, extname, normalize } from "path";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs-extra";
import { parse as parseURL } from "url";
import { WebSocket } from "ws";
import EventEmitter from "events";
import pkg from "../common/package";
import * as remote from "@electron/remote/main";
import axios, { ResponseType } from "axios";

const defaultSession = "persist:user";

const dir = getDir(electron);
const isPreview = pkg.version.indexOf("preview") != -1;
process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
process.noDeprecation = true;
EventEmitter.defaultMaxListeners = 0;

let browsers: Array<Window> = [];
export let store: Store;
let globalStore: Store;
let favourite: Favourite;
let cachedWindow: Window;
let lastActiveWindow: Window;
let adBlocker: ElectronBlocker;
// hosts which may contain cert errors but the user wanted to proceed to
let ignoreCertErrorHosts: Array<string> = [];
let sessions: Array<string> = [];
let users = { object: getUserList() };
global.users = users;
let updateStatus = { object: null };
global.updateStatus = updateStatus;

let user: string = args["instance-user"];
if (!user) throw Error("Instance user not specified.");
else if (user == "manager")
    throw Error("You can't login as \"" + user + "\". It's a internal user.");
if (!users.object[user]) throw Error('User "' + user + '" not exists.');

let ipcPath: string = args["named-pipe"];
if (!ipcPath) throw Error("WebSocket server port not specified.");
let ws: WebSocket;

initUser(user);

const logger = createLogger("main");
let level = args["enable-browser-logging"] == true ? undefined : false;
global.logLevel = level;
logger.transports.console.level = level;
logger.transports.ipc.level = false;
logger.transports.file.level = level;
logger.transports.file.resolvePath = () => normalize(logDir + "/main.log");
const log = logger.scope("instance");
log.log("Starting main process");
downloader.init(logger);

store = new Store(
    normalize(dataDir + "/config.json"),
    getDefaultOptions(user, electron),
    "store-update"
);
globalStore = new Store(
    normalize(mgrDataDir + "/config.json"),
    getMgrDefaultOptions(),
    "global-store-update"
);
favourite = new Favourite(
    store,
    logger,
    dataDir + "/favourites.json",
    dataDir + "/favouritesIndex.json"
);

for (const option of [
    "ignore_gpu_blocklist",
    "enable_unsafe_webgpu",
    "disable_smooth_scrolling",
]) {
    let value: string | boolean = store.get("dev." + option);
    if (value) {
        app.commandLine.appendSwitch(
            option.replace(/_/g, "-"),
            typeof value == "string" ? value : undefined
        );
    }
}

if (
    (store.get("pfm.sys.hardwareacceleration") as boolean) == false ||
    (store.get("applyrestart.pfm.sys.hardwareacceleration") as boolean) == false
) {
    log.warn("Hardware acceleration disabled");
    app.disableHardwareAcceleration();
}

global.updateStatus = null;

class Window {
    public browser: electron.BrowserWindow;
    public options: Browser.BrowserOptions;
    public id: number;
    public cached: boolean;
    public ready: boolean = false;
    async new(cached: boolean = false) {
        this.cached = cached;
        log.log("Creating browser, cached: " + this.cached);
        if (this.cached) cachedWindow = this;
        let isBlur = store.get("appearance.visual.blur") as boolean;
        let useBackDrop =
            (store.get("appearance.visual.usebackdrop") as boolean) &&
            isBlur &&
            win32.isBackdropSupported;
        let backdropType = store.get("appearance.visual.backdroptype") as number;
        this.browser = new BrowserWindow({
            width: 1000,
            height: 900,
            minWidth: 740,
            minHeight: 580,
            resizable: true,
            frame: useBackDrop,
            show: false,
            backgroundColor: "#00ffffff",
            webPreferences: {
                webviewTag: true,
                nodeIntegration: true,
                nodeIntegrationInSubFrames: true,
                nodeIntegrationInWorker: true,
                contextIsolation: false,
                allowRunningInsecureContent: true,
                webgl: true,
                session: session.fromPartition("persist:browser"),
            },
        });
        browsers.push(this);
        let id = browsers.length - 1;
        this.id = id;
        remote.enable(this.browser.webContents);
        if (process.platform == "win32") {
            // https://github.com/electron/electron/pull/32692 causes no window animation
            // const WS_THICKFRAME = 0x00040000;
            // const WS_CAPTION = 0x00C00000;
            // const WS_OVERLAPPED = 0x00000000;
            // const WS_MAXIMIZEBOX = 0x00010000;
            // const WS_MINIMIZEBOX = 0x00020000;
            // const WS_CLIPSIBLINGS = 0x04000000;
            // const WS_CLIPCHILDREN = 0x02000000;
            // const WS_SYSMENU = 0x00080000;
            // const style = WS_OVERLAPPED | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU | WS_CAPTION;
            // const style = WS_CLIPSIBLINGS | WS_CLIPCHILDREN | WS_SYSMENU | WS_THICKFRAME | WS_OVERLAPPED | WS_MINIMIZEBOX | WS_MAXIMIZEBOX;
            // let hWnd = this.browser.getNativeWindowHandle().readUint32LE();
            // user32.SetWindowLongA(hWnd, -16, style);
            if (useBackDrop) {
                let window = this.browser.getNativeWindowHandle().readUint32LE();
                win32.spawnHelper([
                    "set_window_backdrop",
                    window.toString(),
                    backdropType.toString(),
                ]);
            }
            // if (store.get("appearance.visual.blur") as boolean && store.get("appearance.visual.useacrylic") as boolean) spawnSync(normalize(asarDirname + "/platform/win32/DwmController.exe"), [hWnd.toString(), "3", 0x0.toString()]);
        }
        this.browser.webContents.on("dom-ready", () => {
            // restart when reload
            if (this.options) this.startup(this.options);
        });
        this.browser.webContents.on(
            "did-start-navigation",
            (
                event: Event,
                url: string,
                isInPlace: boolean,
                isMainFrame: boolean,
                frameProcessId: number,
                frameRoutingId: number
            ) => {
                if (!isMainFrame) return;
                this.ready = false;
            }
        );
        this.browser.webContents.on("context-menu", (event, params) => {
            this.browser.webContents.send("context-menu", params);
        });
        this.browser.webContents.on("before-input-event", (event, input) => {
            this.browser.webContents.send("key-press", input);
        });
        this.browser.on("focus", () => {
            lastActiveWindow = this;
            this.browser.webContents.send("focus");
        });
        this.browser.on("blur", () => {
            this.browser.webContents.send("blur");
        });
        this.browser.on("will-move", () => {
            this.browser.webContents.send("begin-move");
        });
        this.browser.on("move", () => {
            if (process.platform != "win32") this.browser.webContents.send("move");
        });
        this.browser.on("maximize", () => {
            this.browser.webContents.send("move");
        });
        this.browser.on("unmaximize", () => {
            this.browser.webContents.send("move");
        });
        this.browser.on("enter-full-screen", () => {
            this.browser.webContents.send("move");
        });
        this.browser.on("leave-full-screen", () => {
            this.browser.webContents.send("move");
        });
        this.browser.on("moved", () => {
            this.browser.webContents.send("move");
            this.browser.webContents.send("end-move");
        });
        this.browser.on("close", (event) => {
            if (!this.cached) {
                event.preventDefault();
                this.browser.webContents.send("close");
            }
        });
        this.browser.on("closed", () => {
            delete browsers[id];
            if (this == cachedWindow) cachedWindow = null;
            if (this == lastActiveWindow) lastActiveWindow = null;
            // all non-cached windows closed, try auto update
            if (!hasNonCachedWindow())
                ws.send(
                    JSON.stringify({
                        id: "try-autoupdate",
                        data: {
                            user: user,
                        } as Manager.DataPackageIBase,
                    } as Manager.DataPackageI)
                );
        });
        this.browser.on("enter-html-full-screen", () => {
            this.browser.webContents.send("fullscreen-html", true);
        });
        this.browser.on("leave-html-full-screen", () => {
            this.browser.webContents.send("fullscreen-html", false);
        });
        let icon = isPreview ? "preview" : "latest";
        if (Math.floor(Math.random() * (10 + 1)) == 10) icon = "light";
        // await this.browser.loadURL(((app.isPackaged) ? ("file://" + __dirname + "/../..") : ("http://127.0.0.1:5500")) + "/browser.html?icon=" + icon);
        await this.browser.webContents.loadFile(
            __dirname + "/../../pages/internal-browser.html",
            {
                query: { icon: icon },
            }
        );
    }
    async startup(options: Browser.BrowserOptions) {
        let sessionPartition: string;
        if (options.guest) sessionPartition = "persist:guest{" + randomUUID() + "}";
        else sessionPartition = defaultSession;
        let sessionObj = session.fromPartition(sessionPartition);
        if (adBlocker && !adBlocker.isBlockingEnabled(sessionObj))
            adBlocker.enableBlockingInSession(sessionObj);
        if (!sessions.includes(sessionPartition)) {
            sessionObj.addListener("will-download", async (event, item, webcontents) => {
                let fileName = item.getFilename();
                let fileURL = item.getURL();
                if (!fileURL.startsWith("blob:")) {
                    event.preventDefault();
                    let cookies = await sessionObj.cookies.get({
                        url: fileURL,
                    });
                    let cookiesList: Array<string> = [];
                    for (let i = 0; i < cookies.length; i++) {
                        cookiesList.push(cookies[i].name + "=" + cookies[i].value);
                    }
                    webcontents.emit("did-finish-load");
                    await downloader.download(fileURL, fileName, cookiesList.join("; "));
                }
            });
            sessions.push(sessionPartition);
        }
        this.options = options;
        log.log("Starting browser, options: " + JSON.stringify(options));
        if (this.cached) cachedWindow = null;
        this.cached = false;
        this.browser.webContents.send("load", this.options, sessionPartition);
        this.browser.show();
        lastActiveWindow = this;
        this.ready = true;
        if (options.dev) {
            log.log("DevTools opened");
            this.browser.webContents.openDevTools();
        }
    }
}

function hasNonCachedWindow() {
    let count = 0;
    for (let i = 0; i < browsers.length; i++) {
        if (browsers[i] && !browsers[i].cached) count++;
    }
    return count != 0;
}

export function sendBroadcast(channel: string, args1?: any, args2?: any, args3?: any) {
    for (let i = 0; i < browsers.length; i++) {
        const browser = browsers[i];
        if (browser && browser.ready)
            browser.browser.webContents.send(channel, args1, args2, args3);
    }
}

function reloadConfig() {
    nativeTheme.themeSource = store.get("appearance.overall") as any;
    let langLocale = store.get("language.uses") as string;
    if (!langLocale) {
        let locale = app.getLocale();
        // locale list
        // https://source.chromium.org/chromium/chromium/src/+/master:ui/base/l10n/l10n_util.cc
        if (locale.indexOf("zh-CN") != -1) langLocale = "zh-cn";
        else if (locale.indexOf("zh-HK") != -1 || locale.indexOf("zh-TW") != -1)
            langLocale = "zh-tw";
        else langLocale = "en-us";
        store.set("language.uses", langLocale);
    }
    lang.reload(langLocale);
    if (process.platform == "win32" && !process.windowsStore)
        app.setLoginItemSettings({
            openAtLogin: store.get("pfm.sys.turbo") as boolean,
            args: (app.isPackaged ? [] : ['"' + dir.appPath + '"']).concat([
                "--startup",
                "--user=" + user,
            ]),
            name: "Platinum-" + user,
        });
    else if (process.platform == "linux") {
        let autoStartDir = normalize(app.getPath("appData") + "/autostart");
        let autoStartFile = normalize(autoStartDir + "/Platinum-" + user + ".desktop");
        let exeFile = app.getPath("exe");
        let exeArgs = (app.isPackaged ? [] : ['"' + dir.appPath + '"'])
            .concat(["--startup", "--user=" + user])
            .join(" ");
        let iconFile = dir.asarDirname + "/icon.png";
        if (existsSync(autoStartFile) != (store.get("pfm.sys.turbo") as boolean)) {
            if (!existsSync(autoStartDir)) mkdirSync(autoStartDir);
            if (store.get("pfm.sys.turbo") as boolean)
                writeFileSync(
                    autoStartFile,
                    `[Desktop Entry]
Type=Application
Name=Platinum Browser
Exec="${exeFile}" ${exeArgs}
Icon=${iconFile}
Hidden=true
NoDisplay=true
Comment=Browse the Web.
X-GNOME-Autostart-enabled=true
`
                );
            else if (existsSync(autoStartFile)) rmSync(autoStartFile);
        }
    }
    if (store.get("user.desktoplink") as boolean)
        if (!existsSync(getLinkFile(users.object[user])))
            generateLink(users.object[user]);
        else;
    else deleteLink(users.object[user]);
}

export function getUserFolder() {
    const path = app.getPath("userData") + "/User Data";
    try {
        if (!existsSync(path)) mkdirSync(path);
    } catch {}
    return path;
}

async function createWindow(options: Browser.BrowserOptions) {
    if (cachedWindow) {
        cachedWindow.startup(options);
    } else {
        let window = new Window();
        await window.new();
        window.startup(options);
    }

    if (store.get("pfm.sys.turbo") as boolean) await createCachedWindow();
}

async function createCachedWindow() {
    let window = new Window();
    await window.new(true);
}

app.commandLine.appendSwitch("enable-transparent-visuals");
app.on("ready", async () => {
    app.setAppUserModelId("Platinum");

    let options: Browser.BrowserOptions = {};
    let url = null;
    if (args["_"].length >= 1) url = args["_"][0];

    options.url = url;
    options.guest = args["guest"];
    options.dev = args["dev"];

    remote.initialize();
    Menu.setApplicationMenu(null);

    if (!app.requestSingleInstanceLock()) {
        log.warn("An instance already exists");
        app.quit();
        return;
    }

    if (store.data["applyrestart"] != null) {
        Object.assign(store.data, store.data["applyrestart"]);
        store.data["applyrestart"] = null;
        store.write();
    }

    store.on("change", () => reloadConfig());
    store.on("send-broadcast", (noReload: boolean) =>
        sendBroadcast("store-update", noReload)
    );

    globalStore.on("change", () => reloadConfig());
    globalStore.on("send-broadcast", (noReload: boolean) =>
        sendBroadcast("global-store-update", noReload)
    );
    globalStore.on("write", () => {
        ws.send(
            JSON.stringify({
                id: "global-store-update",
                data: {
                    user: user,
                } as Manager.DataPackageIBase,
            } as Manager.DataPackageI)
        );
    });
    reloadConfig();

    favourite.rebuildHashTable(favourite.index.hashes, favourite.data);
    favourite.on("send-broadcast", () => sendBroadcast("favourite-update"));
    favourite.on("sync-status", () => sendBroadcast("favourite-sync"));

    ipcMain.on("start-update", () => {
        ws.send(
            JSON.stringify({
                id: "start-update",
                data: {
                    user: user,
                } as Manager.DataPackageIBase,
            } as Manager.DataPackageI)
        );
    });
    ipcMain.on("check-update", () => {
        ws.send(
            JSON.stringify({
                id: "check-update",
                data: {
                    user: user,
                } as Manager.DataPackageIBase,
            } as Manager.DataPackageI)
        );
    });
    ipcMain.on("install-update", () => {
        ws.send(
            JSON.stringify({
                id: "install-update",
                data: {
                    user: user,
                } as Manager.DataPackageIBase,
            } as Manager.DataPackageI)
        );
    });
    ipcMain.on("start-sync", () => {
        if (!favourite.syncWorker) {
            favourite.sync();
        }
    });
    ipcMain.on("relaunch", (event, global: boolean) => {
        ws.send(
            JSON.stringify({
                id: global ? "relaunch" : "relaunch-user",
                data: {
                    user: user,
                } as Manager.DataPackageIBase,
            } as Manager.DataPackageI)
        );
        event.returnValue = null;
    });
    ipcMain.on("quit", (event, global: boolean) => {
        ws.send(
            JSON.stringify({
                id: global ? "quit" : "quit-user",
                data: {
                    user: user,
                } as Manager.DataPackageIBase,
            } as Manager.DataPackageI)
        );
        event.returnValue = null;
    });
    ipcMain.on("new-window", (event, args: Browser.BrowserOptions) => {
        createWindow(args);
    });
    ipcMain.on("enable-remote", (event, webcontents) => {
        remote.enable(webContents.fromId(webcontents));
        event.returnValue = null;
    });
    ipcMain.on("set-windowopenhandler", (event, id, action = "deny") => {
        let webcontents = webContents.fromId(id);
        if (webcontents)
            webcontents.setWindowOpenHandler((details) => {
                event.sender.send("windowopenhandler-cb", details);
                return {
                    action: action,
                };
            });
        event.returnValue = null;
    });
    ipcMain.on("set-certificateerror", (event, id) => {
        let webcontents = webContents.fromId(id);
        if (webcontents)
            webcontents.addListener(
                "certificate-error",
                (
                    _event: Event,
                    url: string,
                    error: string,
                    certificate: Certificate,
                    callback: (isTrusted: boolean) => void,
                    isMainFrame: boolean
                ) => {
                    if (!isMainFrame) return;
                    event.sender.send("certificate-error", webcontents.id, error);
                    let urlStruct = parseURL(url);
                    if (
                        urlStruct.hostname &&
                        ignoreCertErrorHosts.includes(urlStruct.hostname)
                    ) {
                        event.preventDefault();
                        callback(true);
                    } else callback(false);
                }
            );
        event.returnValue = null;
    });
    ipcMain.on("add-ignorecerterrorhosts", (event, host) => {
        ignoreCertErrorHosts.push(host);
    });
    ipcMain.on("download", (event, url, filename, showDialog) => {
        if (showDialog == null) showDialog = false;
        let folder: string;
        if (showDialog) {
            let fileExt = extname(filename).substring(1);
            let filePath = dialog.showSaveDialogSync({
                defaultPath: store.get("download.path") + "/" + filename,
                filters: [
                    {
                        name: "File",
                        extensions: [fileExt],
                    },
                ],
            });
            // cancelled
            if (!filePath) {
                event.returnValue = null;
                return;
            }
            folder = dirname(filePath);
        }
        downloader.download(url, filename, null, folder);
        event.returnValue = null;
    });
    ipcMain.on("download-method", async (event, method: string, params: any[]) => {
        event.returnValue = await downloader.method(method, params);
    });
    ipcMain.on("get-icon", (event, file: string) => {
        app.getFileIcon(file, {
            size: "large",
        })
            .then((img) => {
                event.returnValue = img.toDataURL();
            })
            .catch(() => {
                event.returnValue = null;
            });
    });
    ipcMain.on("users-add", async (event, userInfo: Browser.UserInfo) => {
        if (!users.object[userInfo.id]) {
            users.object[userInfo.id] = userInfo;
            setUserList(users.object);
            sendBroadcast("users-update");
            ws.send(
                JSON.stringify({
                    id: "broadcast",
                    data: {
                        user: user,
                        package: {
                            id: "users-update",
                            data: {},
                        },
                    } as Manager.DataPackageIBoardcast,
                } as Manager.DataPackageI)
            );
            ws.send(
                JSON.stringify({
                    id: "open",
                    data: {
                        user: user,
                        options: {
                            user: userInfo.id,
                        },
                    } as Manager.DataPackageIOpen,
                } as Manager.DataPackageI)
            );
        }
        event.returnValue = null;
    });
    ipcMain.on("users-edit", async (event, userInfo: Browser.UserInfo) => {
        if (users.object[userInfo.id]) {
            deleteLink(users.object[userInfo.id]);
            users.object[userInfo.id] = userInfo;
            setUserList(users.object);
            sendBroadcast("users-update");
            ws.send(
                JSON.stringify({
                    id: "broadcast",
                    data: {
                        user: user,
                        package: {
                            id: "users-update",
                            data: {},
                        },
                    } as Manager.DataPackageIBoardcast,
                } as Manager.DataPackageI)
            );
            if (store.get("user.desktoplink") as boolean)
                await generateLink(users.object[userInfo.id]);
        }
        event.returnValue = null;
    });
    ipcMain.on("users-active", (event, userID: string) => {
        if (users.object[userID]) {
            ws.send(
                JSON.stringify({
                    id: "active",
                    data: {
                        user: user,
                        targetUser: userID,
                    } as Manager.DataPackageIActive,
                } as Manager.DataPackageI)
            );
        }
        event.returnValue = null;
    });
    ipcMain.on("users-delete", (event, userID: string) => {
        if (users.object[userID]) {
            for (let i = 0; i < browsers.length; i++) {
                browsers[i].browser.destroy();
            }
            delete users.object[userID];

            // removing default user may cause some issues
            if (userID != "default") {
                if (store.get("user.desktoplink") as boolean)
                    deleteLink(users.object[userID]);
            } else {
                users.object[userID] = { id: userID };
            }
            setUserList(users.object);
            ws.send(
                JSON.stringify({
                    id: "broadcast",
                    data: {
                        user: user,
                        package: {
                            id: "users-update",
                            data: {},
                        },
                    } as Manager.DataPackageIBoardcast,
                } as Manager.DataPackageI),
                () => {
                    ws.send(
                        JSON.stringify({
                            id: "delete-data",
                            data: {
                                user: userID,
                            } as Manager.DataPackageIBoardcast,
                        } as Manager.DataPackageI),
                        () => {
                            app.exit();
                        }
                    );
                }
            );
        }
        event.returnValue = null;
    });

    downloader.startAria2();
    // extensions = new ElectronChromeExtensions({
    //     session: session.fromPartition(defaultSession),
    // });

    ElectronBlocker.fromLists(
        async (url) => {
            let fetch = async (type: ResponseType) => {
                return (await axios.get(url, { responseType: type })).data;
            };
            return {
                arrayBuffer: () => {
                    return fetch("arraybuffer");
                },
                text: async () => {
                    return fetch("text");
                },
                json: async () => {
                    return fetch("json");
                },
            };
        },
        ["https://easylist.to/easylist/easylist.txt"]
    ).then((obj) => (adBlocker = obj));
    // adBlocker = await ElectronBlocker.parse(await (await fetch("https://easylist.to/easylist/easylist.txt")).text());

    if (process.platform == "win32") {
        nativeTheme.on("updated", () => sendBroadcast("accent-color-changed"));
        systemPreferences.on("accent-color-changed", () =>
            sendBroadcast("accent-color-changed")
        );
        win32.init(logger, electron);
    }

    if (args["startup"] && (store.get("pfm.sys.turbo") as boolean))
        await createCachedWindow();
    // else await createWindow(options);

    ws = new WebSocket("ws+unix:" + getIpcPath(ipcPath));
    ws.on("open", () => {
        ws.send(
            JSON.stringify({
                id: "connected",
                data: {
                    user: user,
                } as Manager.DataPackageIBase,
            } as Manager.DataPackageI)
        );
        let alive = true;
        // let sendHeartbeat = () => {
        //     if (!alive) {
        //         clearInterval(heartbeatTimer);
        //         throw new Error("Server is down.");
        //     }
        //     alive = false;
        //     ws.send(JSON.stringify({
        //         id: "heartbeat",
        //         data: {
        //             user: user,
        //         } as Manager.DataPackageIBase,
        //     } as Manager.DataPackageI), (error) => {
        //         if (!error) alive = true;
        //     });
        // }
        // let heartbeatTimer = setInterval(() => sendHeartbeat(), 10000);
    });
    ws.on("message", async (rawData, isBinary) => {
        let data: Manager.DataPackage = JSON.parse(rawData.toString());
        switch (data.id) {
            case "open": {
                let options = data.data as Manager.LaunchOptions;
                // open guest window in a standalone window
                if (options.guest) createWindow(options);
                else {
                    // url presented, may be called by programs
                    if (options.url) {
                        // finds a valid window
                        let browser: Window = null;
                        for (let i = 0; i < browsers.length; i++) {
                            const element = browsers[i];
                            if (element && !element.cached && !element.options.guest)
                                browser = element;
                        }
                        if (browser) {
                            // a valid window found, open url in a new tab
                            browser.browser.webContents.send("new-tab", options.url);
                        } else {
                            // not found, open url in a new window
                            await createWindow(options);
                        }
                    } else {
                        // not presented, may be opened by user
                        // creates a new window for it
                        await createWindow(options);
                    }
                }
                break;
            }
            case "active": {
                if (lastActiveWindow)
                    if (lastActiveWindow.ready) {
                        // forcedly move window to top
                        lastActiveWindow.browser.restore();
                        lastActiveWindow.browser.flashFrame(true);
                        lastActiveWindow.browser.setAlwaysOnTop(true);
                        lastActiveWindow.browser.setAlwaysOnTop(false);
                        lastActiveWindow.browser.focus();
                        lastActiveWindow.browser.flashFrame(false);
                    } else;
                else await createWindow({});
                break;
            }
            case "users-update": {
                users.object = getUserList();
                sendBroadcast("users-update");
                break;
            }
            case "update-status": {
                let status = data.data as Browser.UpdateStatus;
                global.updateStatus = status;
                sendBroadcast("update");
                break;
            }
            case "global-store-update": {
                globalStore.reload();
                globalStore.emit("change-internal-notify");
                globalStore.emit("change");
                globalStore.emit("send-broadcast", false);
                break;
            }
            case "request-quit": {
                if (!hasNonCachedWindow()) app.exit();
                else
                    ws.send(
                        JSON.stringify({
                            id: "refuse-exit",
                            data: {
                                user: user,
                            } as Manager.DataPackageIBase,
                        } as Manager.DataPackageI)
                    );
                break;
            }
            case "quit": {
                app.exit();
                break;
            }
            default:
                break;
        }
    });

    if (!favourite.syncWorker) favourite.sync();
});
