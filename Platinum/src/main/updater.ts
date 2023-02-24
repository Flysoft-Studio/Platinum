import { spawnSync } from "child_process";
import { BinaryLike, createHash, randomUUID } from "crypto";
import { EventEmitter } from "events";
import { createWriteStream } from "fs";
import { normalize } from "path";
import { app, dialog } from "electron";
import { ElectronLog, LogFunctions } from "electron-log";
import { getURL as getProviderURL } from "./updaterProvider";
import pkg from "../common/package";
import axios from "axios";

let log: LogFunctions;

export class Updater extends EventEmitter {
    public channel: string;
    public tempPath: string = app.getPath("temp");
    public tempFile: string;
    public curVersionInfo: Browser.VersionInfo;
    public updateStatus: Browser.UpdateStatus = {} as Browser.UpdateStatus;
    constructor(channel: string) {
        super();
        super.on("update-status", () => {
            log.log("Status: " + JSON.stringify(this.updateStatus));
        });
        this.curVersionInfo = this.parseVersionInfo(pkg.version);
        this.updateStatus.status = "idle";
        this.updateStatus.progress = 0;
        this.updateStatus.installing = false;
        this.updateStatus.available = false;
        this.updateStatus.canUpdate =
            process.platform == "win32" ? !process.windowsStore : false;
        this.updateStatus.canInstallUpdate =
            process.platform == "win32" ? !process.windowsStore : false;
        this.channel = channel;

        app.on("will-quit", (event) => {
            if (this.updateStatus.canUpdate && this.updateStatus.canInstallUpdate) {
                if (this.updateStatus.status == "started") {
                    event.preventDefault();
                } else if (this.updateStatus.status == "waitinstall") {
                    log.warn("Will start update");
                    spawnSync("start", ['"" "' + this.tempFile + '" /S'], {
                        windowsHide: true,
                        shell: true,
                    });
                }
            }
        });
    }
    private parseVersionInfo(versionString: string) {
        let version = {} as Browser.VersionInfo;
        // 1.0.0
        let verPart = versionString;
        // preview.1
        let channelPREPart = "latest";

        // preview
        let channel = channelPREPart;
        // 1
        let preview = 0;

        if (versionString.indexOf("-") != -1) {
            let versionParts = verPart.split("-");
            if (versionParts.length != 2) return null;
            verPart = versionParts[0];
            channelPREPart = versionParts[1];
        }

        // 1 0 0
        let verParts = verPart.split(".");
        if (verParts.length != 3) return null;

        // preview 1
        let channelPREParts = channelPREPart.split(".");
        if (channelPREParts.length == 2) {
            // preview
            channel = channelPREParts[0];

            // 1
            preview = parseInt(channelPREParts[1]);
        }

        version.str = versionString;
        version.major = parseInt(verParts[0]);
        version.minor = parseInt(verParts[1]);
        version.patch = parseInt(verParts[2]);
        version.channel = channel;
        version.preview = preview;
        return version;
    }
    public async downloadUpdates() {
        if (
            !this.updateStatus.canInstallUpdate ||
            this.updateStatus.status == "error" ||
            this.updateStatus.status != "idle"
        )
            return;
        this.updateStatus.installing = true;
        this.updateStatus.status = "started";
        super.emit("update-status");
        let needInstall = false;
        // don't send msg too frequently, it may cause the window to be not responding
        let eventTimer: NodeJS.Timeout;
        let success: boolean;
        try {
            await new Promise<void>(async (resolve, reject) => {
                if (!this.updateStatus.available) {
                    log.log("No updates availble");
                    resolve();
                    return;
                }

                var md5: string;
                let ext: string;
                if (process.platform == "win32") ext = "exe";
                // else if (process.platform == "linux") ext = "AppImage";
                else {
                    reject(new Error("Invalid platform"));
                    return;
                }
                // if (process.platform == "linux") {
                //     let file = dialog.showSaveDialogSync(null, {
                //         title: "Save update file to",
                //         filters: [
                //             {
                //                 extensions: [ext],
                //                 name: "AppImage",
                //             },
                //         ],
                //     });
                //     if (!file) return;
                //     this.tempFile = file;
                // } else {
                this.tempFile = normalize(
                    this.tempPath + "/platinum.update.{" + randomUUID() + "}." + ext
                );
                // }

                const fileStream = createWriteStream(this.tempFile);
                fileStream.on("ready", () => {
                    log.log("Download started: " + this.tempFile);
                });
                fileStream.on("finish", () => {
                    log.log("Downloaded successfully: " + this.tempFile);
                    if (md5)
                        if (this.updateStatus.update.hash == md5) {
                            log.log("MD5 match: " + md5);
                        } else {
                            reject(
                                new Error(
                                    "MD5 mismatch, downloaded: " +
                                        md5 +
                                        " server: " +
                                        this.updateStatus.update.hash
                                )
                            );
                            return;
                        }
                    needInstall = true;
                    resolve();
                    return;
                });

                let url = await getProviderURL(this.updateStatus.update.provider);
                log.log("Got provider url, url: " + url);
                const hash = createHash("md5");
                let response = await axios.get("url", {
                    headers: { "Content-Type": "application/octet-stream" },
                    responseType: "stream",
                    onDownloadProgress: (event) => {
                        let percentage = Math.round(event.loaded / event.total);
                        log.log("Downloaded: " + percentage + "%");
                        this.updateStatus.progress = percentage;
                        super.emit("update-status");
                    },
                });
                response.data.pipe(fileStream);
                response.data.on("data", (chunk: BinaryLike) => {
                    hash.update(chunk);
                });
                response.data.on("end", () => {
                    md5 = hash.digest("hex");
                });
            });
            success = true;
        } catch (error) {
            log.error("" + error);
            this.updateStatus.error = error;
            this.updateStatus.installing = false;
            this.updateStatus.status = "error";
            super.emit("update-status");
            success = false;
        }
        if (eventTimer) clearTimeout(eventTimer);
        this.updateStatus.progress = 100;
        if (needInstall) {
            this.updateStatus.status = "waitinstall";
            super.emit("update-status");
        }
        return success;
    }
    public channelToNumber(channel: string) {
        switch (channel) {
            case "latest":
                return 0;
            /* reserved */
            case "pre":
                return 1;
            case "preview":
                return 1;
            default:
                break;
        }
    }
    public async checkForUpdates(
        channel: string = "latest",
        calledByLatest: boolean = false
    ) {
        if (
            !this.updateStatus.canUpdate ||
            (this.updateStatus.status != "error" &&
                this.updateStatus.status != "idle" &&
                !calledByLatest)
        )
            return;
        log.log("Checking for updates, channel: " + channel);
        if (!calledByLatest) {
            this.updateStatus.status = "checking";
            super.emit("update-status");
        }
        try {
            let arch = "x64";
            if (process.arch == "ia32") arch = "ia32";
            if (process.platform == "win32") arch = "all";
            let updateInfo = (
                await axios.get(
                    "https://flysoftbeta.cn/update/platinum/" +
                        channel +
                        "_" +
                        process.platform +
                        "_" +
                        arch +
                        ".json"
                )
            ).data as Browser.UpdateInfo;
            let versionInfo = this.parseVersionInfo(updateInfo.version);
            if (!versionInfo) throw new Error("Invalid version info");
            if (
                /* check major minor patch preview (current and lower channel) */
                (versionInfo.major > this.curVersionInfo.major ||
                    (versionInfo.major >= this.curVersionInfo.major &&
                        versionInfo.minor > this.curVersionInfo.minor) ||
                    (versionInfo.major >= this.curVersionInfo.major &&
                        versionInfo.minor >= this.curVersionInfo.minor &&
                        this.curVersionInfo.patch > this.curVersionInfo.patch) ||
                    (versionInfo.major >= this.curVersionInfo.major &&
                        versionInfo.minor >= this.curVersionInfo.minor &&
                        this.curVersionInfo.patch >= this.curVersionInfo.patch &&
                        versionInfo.preview > this.curVersionInfo.preview)) &&
                this.channelToNumber(versionInfo.channel) <=
                    this.channelToNumber(this.channel)
            ) {
                this.updateStatus.update = updateInfo;
                this.updateStatus.version = versionInfo;
                this.updateStatus.available = true;
                log.log("Update available, version: " + updateInfo.version);
                super.emit("update-available");
            } else if (
                this.channel != "latest" &&
                channel == "latest" &&
                !calledByLatest
            ) {
                // if there are no latest updates available, it will check preview updates
                await this.checkForUpdates("preview", true);
            }
        } catch (error) {
            log.error("Check for updates failed, reason: " + error);
            if (!calledByLatest) {
                this.updateStatus.error = error.message;
                this.updateStatus.installing = false;
                this.updateStatus.status = "error";
                super.emit("update-status");
            }
            return error;
        }
        if (!calledByLatest) {
            this.updateStatus.status = "idle";
            super.emit("update-status");
        }
    }
}

export function init(logger: ElectronLog) {
    log = logger.scope("update");
}
