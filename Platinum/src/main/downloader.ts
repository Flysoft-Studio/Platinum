import { findExecutable } from "../platform/executable";
import { getDir } from "../common/dir";
import { getUserFolder, sendBroadcast } from "./instance";
import { ElectronLog, LogFunctions } from "electron-log";
import { existsSync, readFileSync, writeFileSync } from "fs-extra";
import { normalize } from "path";
import { spawn } from "child_process";
import { JSONRPCClient } from "json-rpc-2.0";
import electron from "electron";
import axios from "axios";

const dir = getDir(electron);
let log: LogFunctions;
let dlClient: JSONRPCClient;

let downloader: Download.DownloaderInfo = {
    numActive: 0,
    active: [],
    numWaiting: 0,
    waiting: [],
    numStopped: 0,
    stopped: [],
};
global.downloader = downloader;

function diff(oldList: Array<Download.Item>, newList: Array<Download.Item>) {
    let added: Array<Download.Item> = [],
        removed: Array<Download.Item> = [],
        oldIDList = [],
        newIDList = [];
    // extracts gids
    for (let i = 0; i < oldList.length; i++) oldIDList.push(oldList[i].gid);
    for (let i = 0; i < newList.length; i++) newIDList.push(newList[i].gid);
    // finds gids those are only in old list (removed)
    for (let i = 0; i < oldIDList.length; i++)
        if (!newIDList.includes(oldIDList[i])) removed.push(oldList[i]);
    // finds gids those are only in new list (added)
    for (let i = 0; i < newIDList.length; i++)
        if (!oldIDList.includes(newIDList[i])) added.push(newList[i]);
    return { added, removed };
}

export async function startAria2() {
    (await import("get-port")).default({ port: 8000 }).then((port) => {
        global.dlPort = port;
        log.log("Aria2 info: Starting, port: " + global.dlPort);
        try {
            // sets default
            let confFile = normalize(getUserFolder() + "/aria2.conf");
            if (!existsSync(confFile)) {
                let defaultConf = readFileSync(
                    normalize(dir.asarDirname + "/engine/aria2_default.conf")
                ).toString();
                writeFileSync(confFile, defaultConf);
                log.log("Aria2 info: Config file generated: " + confFile);
            }
            let sessionFile = normalize(getUserFolder() + "/aria2.session");
            if (!existsSync(sessionFile)) {
                writeFileSync(sessionFile, Buffer.alloc(0));
            }
            // aria2 executable file path
            let executable = findExecutable(dir.asarDirname + "/engine", "aria2c", true);
            let aria2 = spawn(
                executable,
                [
                    "--conf-path=" + confFile,
                    "--rpc-listen-port=" + global.dlPort,
                    "--save-session=" + sessionFile,
                    "--input-file=" + sessionFile,
                ],
                {
                    shell: false,
                    windowsHide: true,
                    detached: false,
                }
            );
            aria2.stderr.on("data", (chunk) => {
                log.error("Aria2 error: " + chunk.toString());
            });
            aria2.stdout.once("data", () => {
                dlClient = new JSONRPCClient(async (payload) => {
                    let response = await axios.post(
                        "http://127.0.0.1:" + global.dlPort + "/jsonrpc",
                        payload
                    );
                    if (response.status === 200) {
                        return dlClient.receive(response.data);
                    }
                });

                let tellDiff = () => {
                    dlClient.request("aria2.getGlobalStat", undefined).then(
                        async (ret) => {
                            try {
                                let changedItems: Array<Download.ChangedItem> = [];
                                let curActive = parseInt(ret.numActive);
                                // gets active item info every time
                                let curActiveList = await dlClient.request(
                                    "aria2.tellActive",
                                    undefined
                                );
                                if (downloader.numActive != curActive) {
                                    if (curActiveList.length == curActive) {
                                        const { added, removed } = diff(
                                            downloader.active,
                                            curActiveList
                                        );
                                        changedItems.push({
                                            item: "active",
                                            added,
                                            removed,
                                        });
                                    }
                                }
                                downloader.active = curActiveList;
                                downloader.numActive = curActiveList.length;

                                let curWaiting = parseInt(ret.numWaiting);
                                if (downloader.numWaiting != curWaiting) {
                                    let curWaitingList = await dlClient.request(
                                        "aria2.tellWaiting",
                                        [0, 200]
                                    );
                                    if (curWaitingList.length == curWaiting) {
                                        const { added, removed } = diff(
                                            downloader.waiting,
                                            curWaitingList
                                        );
                                        changedItems.push({
                                            item: "waiting",
                                            added,
                                            removed,
                                        });
                                        downloader.waiting = curWaitingList;
                                        downloader.numWaiting = curWaiting;
                                    }
                                }

                                let curStopped = parseInt(ret.numStopped);
                                if (downloader.numStopped != curStopped) {
                                    let curStoppedList = await dlClient.request(
                                        "aria2.tellStopped",
                                        [0, 200]
                                    );
                                    if (curStoppedList.length == curStopped) {
                                        const { added, removed } = diff(
                                            downloader.stopped,
                                            curStoppedList
                                        );
                                        changedItems.push({
                                            item: "stopped",
                                            added,
                                            removed,
                                        });
                                        downloader.stopped = curStoppedList;
                                        downloader.numStopped = curStopped;
                                    }
                                }
                                if (changedItems.length != 0) {
                                    sendBroadcast("download-status", changedItems);
                                }
                                if (downloader.numActive != 0) {
                                    sendBroadcast("download-active");
                                }
                            } catch (error) {
                                log.warn(
                                    "Aria2 warning: Cannot get difference, error: " +
                                        error
                                );
                            }
                            setTimeout(() => tellDiff(), 2000);
                        },
                        (error) => {
                            log.warn(" Cannot get global stat, error: " + error);
                            setTimeout(() => tellDiff(), 2000);
                        }
                    );
                };
                tellDiff();
            });
        } catch (error) {
            log.error("Failed to spawn aria2 process, reason: " + error);
        }
    });
}

export function init(logger: ElectronLog) {
    log = logger.scope("downloader");
}
