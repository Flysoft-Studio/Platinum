import { args } from "./args";
import { getDir } from "../common/dir";
import { getUserFolder, init as initUser, logDir, mgrDataDir } from "./user";
import { init as initUpdater, Updater } from "./updater";
import { Store } from "../common/store";
import { getMgrDefaultOptions } from "../common/default";
import { app, Notification } from "electron";
import { create as createLogger } from "electron-log";
import { normalize } from "path";
import { WebSocketServer } from "ws";
import { ChildProcessWithoutNullStreams, execSync, spawn } from "child_process";
import { mkdirSync, removeSync } from "fs-extra";
import fp = require("find-free-port");
import electron = require("electron");

const pkg = require("../../package.json");
const isPreview = pkg.version.indexOf("preview") != -1;
const dir = getDir(electron);

app.disableHardwareAcceleration();

let store: Store;
let updater: Updater;
let isFirstTryAutoDownloadUpdate: boolean = true;

initUser("manager");

const logger = createLogger("main");
let level = args["enable-logging"] == true ? undefined : false;
logger.transports.console.level = level;
logger.transports.ipc.level = false;
logger.transports.file.level = level;
logger.transports.file.resolvePath = () => normalize(logDir + "/main.log");
const log = logger.scope("manager");

store = new Store(
    mgrDataDir + "/config.json",
    getMgrDefaultOptions(),
    "global-store-update"
);

initUpdater(logger);
if (!store.get("update.channel"))
    store.set("update.channel", isPreview ? "preview" : "latest");
updater = new Updater(store.get("update.channel"));

let wss: WebSocketServer;
let serverPort: number;
let users: Record<string, Manager.User> = {};

function tryAutoDownloadUpdate() {
    if (
        (store.get("update.auto") as boolean) &&
        isFirstTryAutoDownloadUpdate &&
        updater.updateStatus.available &&
        updater.updateStatus.installing == false
    ) {
        isFirstTryAutoDownloadUpdate = false;
        updater.downloadUpdates();
    }
}

async function tryAutoInstallUpdate() {
    if (updater.updateStatus.status == "waitinstall") {
        try {
            for (const key in users) {
                const user = users[key];
                if (user.socket) {
                    await new Promise((resolve, reject) => {
                        user.onrefuseexit = () => {
                            reject(new Error("Not all instances are allowed to exit."));
                        };
                        user.onexit = () => {
                            resolve(null);
                        };
                        user.socket.send(
                            JSON.stringify({
                                id: "request-quit",
                                data: {},
                            } as Manager.DataPackage),
                            (error) => {
                                if (error) reject(new Error("Send message failed."));
                            }
                        );
                    });
                }
            }
            // start update
            killAllUserProcess().then(() => app.quit());
        } catch (error) {
            log.error(error);
        }
    }
}

async function killUserProcess(user: string) {
    let kill = (childProccess: ChildProcessWithoutNullStreams) => {
        childProccess.kill();
        if (process.platform == "win32") {
            try {
                execSync("taskkill.exe /f /pid " + childProccess.pid);
            } catch {}
        }
    };
    await new Promise((resolve) => {
        if (users[user].socket)
            users[user].socket.send(
                JSON.stringify({
                    id: "quit",
                    data: {},
                } as Manager.DataPackage),
                (error) => {
                    if (error && users[user]) kill(users[user].process);
                    resolve(null);
                }
            );
        else {
            kill(users[user].process);
            resolve(null);
        }
    });
}

async function killAllUserProcess() {
    for (const user in users) {
        try {
            killUserProcess(user);
        } catch {}
    }
}

function spawnUserProcess(user: string, startup: boolean) {
    // debug: electron . --XXX
    // production: platinum --XXX
    users[user].process = spawn(
        app.getPath("exe"),
        (app.isPackaged ? [] : [dir.appPath])
            .concat(args["enable-logging"] ? ["--enable-logging"] : [])
            .concat(startup ? ["--startup"] : [])
            .concat([
                "--run-as-instance",
                "--server-port=" + serverPort,
                "--instance-user=" + user,
            ]),
        {
            shell: false,
            detached: false,
        }
    );
    users[user].process.stdout.pipe(process.stdout);
    users[user].process.stderr.pipe(process.stderr);
    users[user].process.on("exit", () => {
        if (users[user].onexit) users[user].onexit();
        delete users[user];
    });
}

function processLaunch(options: Manager.LaunchOptions, startup: boolean = false) {
    let user = options.user;
    if (!user) user = "default";
    if (!users[user]) {
        users[user] = { options: options } as Manager.User;
        spawnUserProcess(user, startup);
    }
    if (!startup) {
        let sendMsg = () => {
            users[user].socket.send(
                JSON.stringify({
                    id: "open",
                    data: options,
                } as Manager.DataPackage)
            );
        };
        if (users[user].socket) sendMsg();
        // send it later if socket isn't connected
        else users[user].onready = () => sendMsg();
    }
}

app.on("ready", () => {
    log.log("Starting manager process");
    app.setAppUserModelId("Platinum");

    let options: Manager.LaunchOptions = {};
    let url = null;
    if (args["_"].length >= 1) url = args["_"][0];

    options.url = url;
    options.guest = args["guest"];
    options.dev = args["dev"];
    options.user = args["user"];

    if (!app.requestSingleInstanceLock(options)) {
        log.warn("An instance already exists, options: " + JSON.stringify(options));
        app.quit();
        return;
    }

    if (store.data["applyrestart"] != null) {
        Object.assign(store.data, store.data["applyrestart"]);
        store.data["applyrestart"] = null;
        store.write();
    }

    store.on("send-broadcast", () => {
        for (const key in users) {
            if (users[key].socket)
                users[key].socket.send(
                    JSON.stringify({
                        id: "global-store-update",
                        data: {} as Manager.DataPackageBase,
                    } as Manager.DataPackage)
                );
        }
    });

    updater.on("update-status", async () => {
        tryAutoDownloadUpdate();
        for (const key in users) {
            const user = users[key];
            await new Promise((resolve) => {
                if (user.socket)
                    user.socket.send(
                        JSON.stringify({
                            id: "update-status",
                            data: updater.updateStatus as Manager.DataPackageUpdate,
                        } as Manager.DataPackage),
                        () => {
                            resolve(null);
                        }
                    );
            });
        }
        if (updater.updateStatus.status == "waitinstall") {
            let object = new Notification({
                title: "Platinum needs to restart",
                body: "Update files were downloaded. Please restart Platinum to install updates.\nClick here to restart.",
                urgency: "critical",
                timeoutType: "default",
            });
            object.addListener("click", () => app.quit());
            object.show();
        }
        await tryAutoInstallUpdate();
    });

    fp(9000, (error, port: number) => {
        if (error) {
            log.error("Cannot find a free port for Manager, reason: " + error);
            return;
        }

        serverPort = port;
        wss = new WebSocketServer({
            host: "127.0.0.1",
            port: serverPort,
        });
        wss.on("connection", (socket, request) => {
            socket.on("message", (rawData, isBinary) => {
                let data: Manager.DataPackageI = JSON.parse(rawData.toString());
                let userName = data.data.user;
                let user = users[userName];
                if (!user) {
                    log.error("Recv package from unknown, user: " + userName);
                    return;
                }
                switch (data.id) {
                    case "connected": {
                        user.socket = socket;
                        if (user.onready) user.onready();
                        break;
                    }
                    case "open": {
                        let packData = <Manager.DataPackageIOpen>data.data;
                        processLaunch(packData.options);
                        break;
                    }
                    case "active": {
                        let packData = <Manager.DataPackageIActive>data.data;
                        const user = users[packData.targetUser];
                        if (!user) processLaunch({ user: packData.targetUser });
                        else
                            user.socket.send(
                                JSON.stringify({
                                    id: "active",
                                    data: {},
                                } as Manager.DataPackage)
                            );
                        break;
                    }
                    case "delete-data": {
                        let packData = <Manager.DataPackageIBase>data.data;
                        if (packData.user) {
                            let deleteUser = () => {
                                let userDir = getUserFolder(packData.user);
                                try {
                                    removeSync(userDir);
                                } catch {}
                                try {
                                    if (packData.user == "default") {
                                        mkdirSync(userDir);
                                    }
                                } catch {}
                            };
                            if (!users[packData.user]) deleteUser();
                            // send it later if the proccess isn't disconnected
                            else users[packData.user].onexit = () => deleteUser();
                        }
                        break;
                    }
                    case "refuse-exit": {
                        if (user.onrefuseexit) user.onrefuseexit();
                        break;
                    }
                    case "try-autoupdate": {
                        tryAutoInstallUpdate();
                    }
                    case "start-update": {
                        if (!updater.updateStatus.installing) updater.downloadUpdates();
                        break;
                    }
                    case "check-update": {
                        if (!updater.updateStatus.installing) updater.checkForUpdates();
                        break;
                    }
                    case "install-update": {
                        if (updater.updateStatus.status == "waitinstall") {
                            killAllUserProcess().then(() => app.quit());
                        }
                        break;
                    }
                    case "relaunch": {
                        let packData = <Manager.DataPackageIBase>data.data;
                        killAllUserProcess().then(() => {
                            app.relaunch({
                                args: (app.isPackaged ? [] : [process.cwd()]).concat([
                                    "--user=" + packData.user,
                                ]),
                            });
                            app.quit();
                        });
                        break;
                    }
                    case "relaunch-user": {
                        killUserProcess(userName).then(() => {
                            setTimeout(() => processLaunch(user.options), 2000);
                        });
                        break;
                    }
                    case "global-store-update": {
                        store.reload();
                        store.emit("change-internal-notify");
                        store.emit("change");
                        store.emit("send-broadcast", false);
                        for (const key in users) {
                            const user = users[key];
                            // don't send broadcast to sender again
                            if (key == data.data.user) continue;
                            user.socket.send(
                                JSON.stringify({
                                    id: "global-store-update",
                                    data: {} as Manager.DataPackageBase,
                                } as Manager.DataPackage)
                            );
                        }
                        break;
                    }
                    case "broadcast": {
                        let packData = <Manager.DataPackageIBoardcast>data.data;
                        for (const key in users) {
                            const user = users[key];
                            // don't send broadcast to sender again
                            if (key == data.data.user) continue;
                            user.socket.send(JSON.stringify(packData.package));
                        }
                        break;
                    }
                    // no need
                    // case "disconnected":
                    //     user = undefined;
                    //     break;
                    default:
                        break;
                }
            });
        });

        app.on(
            "second-instance",
            (event, commandLine, workingDirectory, additionalData) => {
                processLaunch(additionalData);
            }
        );

        processLaunch(options, args["startup"]);

        if (updater.updateStatus.canUpdate) updater.checkForUpdates();
    });
});
