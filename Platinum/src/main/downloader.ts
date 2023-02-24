import { findExecutable } from "../platform/executable";
import { getDir } from "../common/dir";
import { getUserFolder, sendBroadcast, store } from "./instance";
import { ElectronLog, LogFunctions } from "electron-log";
import fs from "fs-extra";
import path from "path";
import net from "net";
import cp from "child_process";
import { JSONRPCClient } from "json-rpc-2.0";
import electron, { app } from "electron";
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

export async function download(
    url: string,
    filename: string,
    cookies?: string,
    folder?: string
) {
    let isDataURI = url.startsWith("data:");
    log.log(
        "Starting download, url: " +
            (isDataURI ? "DataURI" : url) +
            ", filename: " +
            filename
    );
    try {
        if (!folder) folder = store.get("download.path");
        if (!fs.existsSync(folder)) fs.mkdirSync(folder);

        // Aria2 can't handle Data URIs, so I write a handler by myself
        if (isDataURI) {
            let commaPos = url.indexOf(",");
            let rawData = url.substring(commaPos + 1);
            let isEncoded = url.lastIndexOf(";base64", commaPos) != -1;
            let decodedData = isEncoded ? Buffer.from(rawData, "base64") : rawData;

            const tries = 9999;
            let fileExt = path.extname(filename);
            let fileBase = path.basename(filename, fileExt);
            for (let i = 1; i < tries; i++) {
                let filePath =
                    folder +
                    "/" +
                    fileBase +
                    (i != 1 ? " (" + i.toString() + ")" : "") +
                    fileExt;
                if (!fs.existsSync(filePath)) {
                    fs.writeFileSync(filePath, decodedData);
                    break;
                } else if (i + 1 >= tries) {
                    throw new Error(
                        "We had tried too many times finding a available filename, but failed."
                    );
                }
            }
        } else if (dlClient) {
            await dlClient.request("aria2.addUri", [
                [url],
                {
                    header: cookies ? ["Cookie: " + cookies] : [],
                    out: filename,
                    dir: folder,
                },
            ]);
        } else {
            throw new Error("No available downloader found.");
        }
    } catch (error) {
        log.error("Download failed, reason: " + error);
    }
}

export async function method(method: string, params: any[]) {
    try {
        return await dlClient.request(method, params);
    } catch (error) {
        log.warn("Cannot send method request, reason: " + error);
    }
}

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
    let port: number;
    for (let i = 2000; i <= 65536; i++) {
        try {
            port = await new Promise((resolve, reject) => {
                const server = net.createServer();
                server.on("error", reject);
                server.listen({ port: i }, () => {
                    const { port } = server.address() as net.AddressInfo;
                    server.close(() => {
                        resolve(port);
                    });
                });
            });
            break;
        } catch {}
    }
    if (!port) return new Error("No free port number was found for aria2");
    global.dlPort = port;
    log.log("Starting aria2, port: " + global.dlPort);
    try {
        // set default
        let confFile = path.normalize(getUserFolder() + "/aria2.conf");
        if (!fs.existsSync(confFile)) {
            let conf = fs
                .readFileSync(
                    path.normalize(dir.asarDirname + "/engine/aria2_default.conf")
                )
                .toString()
                .replace("[DLPath]", app.getPath("downloads"));
            fs.writeFileSync(confFile, conf);
            log.log("Config file generated: " + confFile);
        }
        let sessionFile = path.normalize(getUserFolder() + "/aria2.session");
        if (!fs.existsSync(sessionFile)) {
            fs.writeFileSync(sessionFile, Buffer.alloc(0));
        }
        // aria2 executable file path
        let executable = findExecutable(dir.asarDirname + "/engine", "aria2c", true);
        let aria2 = cp.spawn(
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
            log.error("Error: " + chunk.toString());
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
                            log.warn("Cannot get difference, error: " + error);
                        }
                        setTimeout(() => tellDiff(), 500);
                    },
                    (error) => {
                        log.warn("Cannot get global stat, error: " + error);
                        setTimeout(() => tellDiff(), 2000);
                    }
                );
            };
            tellDiff();
        });
    } catch (error) {
        log.error("Failed to spawn aria2 process, reason: " + error);
    }
}

export function init(logger: ElectronLog) {
    log = logger.scope("downloader");
}
