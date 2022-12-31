import { spawnSync } from "child_process";
import { createHash, randomUUID } from "crypto";
import { app, dialog } from "electron";
import { ElectronLog, LogFunctions } from "electron-log";
import { EventEmitter } from "events";
import { createWriteStream } from "fs";
import fetch = require("node-fetch");
import { normalize } from "path";
import progress_stream = require("progress-stream");
import { getURL as getProviderURL } from "./updaterProvider";

let log: LogFunctions;

const pkg = require("../../package.json");

export class Updater extends EventEmitter {
    public channel: string;
    public tempPath: string = app.getPath("temp");
    public tempFile: string;
    public curVersionInfo: Browser.VersionInfo;
    public updateStatus: Browser.UpdateStatus = {} as Browser.UpdateStatus;
    constructor(channel: string) {
        super();
        super.on("update-status", () => {
            log.log("Update: Status: " + JSON.stringify(this.updateStatus));
        });
        this.curVersionInfo = this.parseVersionInfo(pkg.version);
        this.updateStatus.status = "idle";
        this.updateStatus.progress = 0;
        this.updateStatus.installing = false;
        this.updateStatus.available = false;
        this.updateStatus.canUpdate = true;
        this.channel = channel;
        if (process.platform == "win32") this.updateStatus.canUpdate = !process.windowsStore;

        app.on("will-quit", (event) => {
            if (this.updateStatus.canUpdate && process.platform == "win32") {
                if (this.updateStatus.status == "started") {
                    event.preventDefault();
                } else if (this.updateStatus.status == "waitinstall") {
                    log.warn("Update: Will start update");
                    spawnSync("start", ["\"\" \"" + this.tempFile + "\" /S"], {
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
        this.updateStatus.installing = true;
        this.updateStatus.status = "started";
        super.emit("update-status");
        let needInstall = false;
        let error = (msg: string) => {
            log.error("Update: " + msg);
            this.updateStatus.error = msg;
            this.updateStatus.installing = false;
            this.updateStatus.status = "error";
            super.emit("update-status");
        }
        // don't send msg too frequently, it may cause the window to be not responding
        let eventTimer: NodeJS.Timeout;
        let ret = await new Promise((resolve, reject) => {
            if (!this.updateStatus.available) {
                log.log("Update: No updates availble");
                resolve(0);
                return;
            }

            var md5: string;
            let ext: string;
            if (process.platform == "win32") ext = "exe";
            else if (process.platform == "linux") ext = "AppImage";
            else {
                error("Invalid platform");
                resolve(-1);
                return;
            }
            if (process.platform != "linux") {
                this.tempFile = normalize(this.tempPath + "/platinum.update.{" + randomUUID() + "}." + ext);
            } else {
                let file = dialog.showSaveDialogSync(null, {
                    title: "Save update file to",
                    filters: [{
                        extensions: [ext],
                        name: "AppImage",
                    }],
                });
                if (!file) return;
                this.tempFile = file;
            }

            const fileStream = createWriteStream(this.tempFile);
            fileStream.on("ready", () => {
                log.log("Update: Download started: " + this.tempFile);
            });
            fileStream.on("finish", () => {
                log.log("Update: Downloaded successfully: " + this.tempFile);
                if (md5)
                    if (this.updateStatus.update.hash == md5) {
                        log.log("Update: MD5 match: " + md5);
                    } else {
                        error("MD5 mismatch, downloaded: " + md5 + " server: " + this.updateStatus.update.hash);
                        resolve(-2);
                        return;
                    }
                needInstall = true;
                resolve(1);
                return;
            });

            getProviderURL(this.updateStatus.update).then((url) => {
                log.log("Update: Got provider url, url: " + url);
                fetch(url, {
                    method: "GET",
                    headers: { "Content-Type": "application/octet-stream" },
                }).then((res) => {
                    const size = res.headers.get("Content-Length");
                    const progressStream = progress_stream({
                        length: size,
                        time: 1000,
                    });
                    const hash = createHash("md5");
                    progressStream.on("progress", (data) => {
                        if (!eventTimer) eventTimer = setTimeout(() => {
                            eventTimer = null;
                            let percentage = Math.round(data.percentage);
                            log.log("Update: Downloaded: " + percentage + "%");
                            this.updateStatus.progress = percentage;
                            super.emit("update-status");
                        }, 3000);
                    });
                    res.body.pipe(progressStream).pipe(fileStream);
                    res.body.on("data", (chunk) => {
                        hash.update(chunk);
                    });
                    res.body.on("end", () => {
                        md5 = hash.digest("hex");
                    });
                }).catch((reason) => {
                    error(reason);
                    resolve(-3);
                    return;
                });
            }).catch((reason) => {
                error(reason);
                resolve(-4);
                return;
            });
        });
        if (eventTimer) clearTimeout(eventTimer);
        this.updateStatus.progress = 100;
        if (needInstall) {
            this.updateStatus.status = "waitinstall";
            super.emit("update-status");
        }
        return ret;
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
    public async checkForUpdates(channel: string = "latest", calledByLatest: boolean = false) {
        if (!this.updateStatus.canUpdate || (this.updateStatus.status != "error" && this.updateStatus.status != "idle" && !calledByLatest)) return;
        log.log("Update: Checking for updates, channel: " + channel);
        if (!calledByLatest) {
            this.updateStatus.status = "checking";
            super.emit("update-status");
        }
        try {
            let arch = "x64";
            if (process.arch == "ia32") arch = "ia32";
            if (process.platform == "win32") arch = "all";
            let updateInfo = (await (await fetch("http://api.flysoftapp.com/update/platinum/" + channel + "_" + process.platform + "_" + arch + ".json")).json()) as Browser.UpdateInfo;
            let versionInfo = this.parseVersionInfo(updateInfo.version);
            if (!versionInfo) throw new Error("Invalid version info");
            if (/* check major minor patch preview (current and lower channel) */
                (((versionInfo.major > this.curVersionInfo.major) || (versionInfo.major >= this.curVersionInfo.major && versionInfo.minor > this.curVersionInfo.minor) || (versionInfo.major >= this.curVersionInfo.major && versionInfo.minor >= this.curVersionInfo.minor && this.curVersionInfo.patch > this.curVersionInfo.patch) || (versionInfo.major >= this.curVersionInfo.major && versionInfo.minor >= this.curVersionInfo.minor && this.curVersionInfo.patch >= this.curVersionInfo.patch && versionInfo.preview > this.curVersionInfo.preview)) && this.channelToNumber(versionInfo.channel) <= this.channelToNumber(this.channel))) {
                this.updateStatus.update = updateInfo;
                this.updateStatus.version = versionInfo;
                this.updateStatus.available = true;
                log.log("Update: Update available, version: " + updateInfo.version);
                super.emit("update-available");
            } else if (this.channel != "latest" && channel == "latest" && !calledByLatest) {
                // if there are no latest updates available, it will check preview updates
                await this.checkForUpdates("preview", true);
            }
        } catch (error) {
            log.error("Update: Check for updates failed, reason: " + error);
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