import { Store } from "./store";
import { createHash } from "crypto";
import { Worker } from "worker_threads";
import { existsSync, readFileSync, watch, writeFileSync } from "fs-extra";
import { ipcMain, ipcRenderer } from "electron";
import { ElectronLog, LogFunctions } from "electron-log";
import { deserialize, serialize } from "v8";
import EventEmitter = require("events");

const isMain = ipcMain != undefined;

export class Favourite extends EventEmitter {
    private dataFile: string;
    private indexFile: string;
    private defaultIndex = {
        hashes: [],
        changes: {
            added: [],
            removed: [],
            changed: [],
            moved: [],
        },
    } as Favourite.Index;
    private defaultData = [] as Favourite.Root;
    private store: Store;
    private log: LogFunctions;
    public index: Favourite.Index;
    public data: Favourite.Root;
    public syncWorker: Worker;
    private syncTimer: NodeJS.Timeout;
    constructor(store: Store, logger: ElectronLog, dataFile: string, indexFile: string) {
        super();
        super.setMaxListeners(0);
        (this.store = store),
            (this.log = logger.scope("favourite")),
            (this.dataFile = dataFile),
            (this.indexFile = indexFile);
        this.reload();
        if (!existsSync(this.dataFile) || !existsSync(this.indexFile)) this.write();
        (isMain ? ipcMain : ipcRenderer).on("favourite-update", () => {
            this.reload();
            super.emit("change");
            this.sync();
        });
        this.store.on("change", () => {
            if (!this.isSyncEnabled()) {
                if (this.syncWorker) this.killSyncWorker();
                this.updateSyncStatus("unset");
            } else {
                if (!this.syncWorker) this.sync();
            }
        });
    }

    public rebuildHashTable(hashes: Array<string>, root: Favourite.Root) {
        this.index.hashes = [];
        for (let i = 0; i < root.length; i++) {
            const data = root[i];
            let hash = this.createItemHash(data);
            hashes.push(hash);
            if (data.type == 1) this.rebuildHashTable(hashes, data.folder.children);
        }
        return this.write(["index"]);
    }

    private updateSyncStatus(status: Favourite.SyncStatus, error?: string) {
        global.syncStatus = status;
        global.syncError = error;
        super.emit("sync-status");
    }

    private isSyncEnabled() {
        return (
            (this.store.get("user.sync.enable") as boolean) &&
            (this.store.get("user.sync.token") as string) != "" &&
            isMain
        );
    }

    private callSyncWorker(args: Favourite.WorkerIn) {
        return new Promise<Favourite.WorkerOut>((resolve, reject) => {
            this.syncWorker = new Worker(__dirname + "/favouriteSync.js");
            this.syncWorker.on("message", async (args: Favourite.WorkerOut) => {
                this.syncWorker.removeAllListeners("exit");
                await this.syncWorker.terminate();
                this.syncWorker = null;
                this.log.info("Sync worker ended, args: " + JSON.stringify(args));
                if (args.error) {
                    this.updateSyncStatus("error", args.error);
                    if (this.syncTimer) {
                        clearTimeout(this.syncTimer);
                        this.syncTimer = null;
                    }
                    this.syncTimer = setTimeout(() => this.sync(), 5000);
                    reject(new Error("Failed to sync: " + args.error));
                    return;
                }
                resolve(args);
            });
            this.syncWorker.on("exit", () => {
                reject(new Error("Failed to sync: Worker had been killed forcefully"));
                return;
            });
            this.syncWorker.postMessage(args);
            this.log.info("Sync worker started, args: " + JSON.stringify(args));
        });
    }

    private killSyncWorker() {
        if (this.syncWorker) {
            this.syncWorker.terminate();
            this.syncWorker = null;
        }
    }

    public async sync() {
        try {
            let accessToken = this.store.get("user.sync.token") as string;
            if (!this.isSyncEnabled()) {
                this.updateSyncStatus("unset");
                return false;
            }
            let tokenHash = createHash("sha512").update(accessToken).digest("hex");
            let tokenUpdated =
                tokenHash != (this.store.get("user.sync.tokenhash") as string);
            let gist = this.store.get("user.sync.gist") as string;

            if (this.syncWorker) {
                this.killSyncWorker();
                this.updateSyncStatus("idle");
                this.log.info("Killed last sync worker");
            }

            this.updateSyncStatus("syncing");
            this.log.info("Sync started");

            let args: Favourite.WorkerOut;

            // make sure the gist is valid
            args = await this.callSyncWorker({
                accessToken: accessToken,
                op: "verify-gist",
                gist: gist,
            } as Favourite.WorkerIn);
            // not found or invalid gist
            if (!args.value as boolean) {
                // look for an existing gist, if not found, create a new one
                args = await this.callSyncWorker({
                    accessToken: accessToken,
                    op: "get-gist",
                });
                gist = args.value as string;
                this.store.set("user.sync.gist", gist);
            }

            // read favourite data
            args = await this.callSyncWorker({
                accessToken: accessToken,
                op: "get-files",
                gist: gist,
            } as Favourite.WorkerIn);
            let latestData: Favourite.Root;
            let latestIndex: Favourite.Index;
            try {
                latestData = JSON.parse(args.value["favourites.json"]);
            } catch (error) {
                latestData = this.defaultData;
            }
            try {
                latestIndex = JSON.parse(args.value["favouritesIndex.json"]);
            } catch (error) {
                latestIndex = this.defaultIndex;
            }

            // if a new token is used, add all the changes to the server
            if (tokenUpdated)
                this.index.changes.added = deserialize(serialize(this.index.hashes));
            // merge changes
            try {
                for (let i = 0; i < this.index.changes.added.length; i++) {
                    let hash = this.index.changes.added[i];
                    if (!latestIndex.hashes.includes(hash)) {
                        // folder: the parent folder of the item, folder not specified if it's root
                        let addLatestItem = (
                            root: Favourite.Root,
                            folder: Favourite.Item,
                            item: Favourite.Item
                        ) => {
                            if (!folder) {
                                // root
                                latestData.push(item);
                                latestIndex.hashes.push(hash);
                            } else {
                                // look for folder and apply item
                                let folderHash = this.createItemHash(folder);
                                for (let i = 0; i < root.length; i++) {
                                    const data = root[i];
                                    if (
                                        this.createItemHash(data) == folderHash &&
                                        data.type == 1
                                    ) {
                                        data.folder.children.push(item);
                                        latestIndex.hashes.push(hash);
                                        break;
                                    } else if (data.type == 1)
                                        addLatestItem(data.folder.children, folder, item);
                                }
                            }
                        };
                        let addLocalItem = (folder: Favourite.Item) => {
                            // look for item and apply it to remote
                            let root = folder ? folder.folder.children : this.data;
                            for (let i = 0; i < root.length; i++) {
                                const data = root[i];
                                if (this.createItemHash(data) == hash) {
                                    addLatestItem(latestData, folder, data);
                                    break;
                                } else if (data.type == 1) addLocalItem(data);
                            }
                        };
                        addLocalItem(null);
                    }
                }
                for (let i = 0; i < this.index.changes.removed.length; i++) {
                    let hash = this.index.changes.removed[i];
                    if (latestIndex.hashes.includes(hash)) {
                        let removeAllIndex = (root: Favourite.Root) => {
                            for (let i = 0; i < root.length; i++) {
                                const item = root[i];
                                if (item.type == 0) {
                                    let hash = this.createItemHash(item);
                                    if (
                                        !this.index.hashes.includes(hash) ||
                                        this.index.changes.removed.includes(hash)
                                    )
                                        continue;
                                    // added -> removed = none
                                    if (this.index.changes.added.includes(hash)) {
                                        this.index.changes.added.splice(
                                            this.index.changes.added.indexOf(hash),
                                            1
                                        );
                                    } else this.index.changes.removed.push(hash);
                                } else if (item.type == 1)
                                    removeAllIndex(item.folder.children);
                            }
                        };
                        let removeLatestItem = (root: Favourite.Root) => {
                            for (let i = 0; i < root.length; i++) {
                                const data = root[i];
                                if (this.createItemHash(data) == hash) {
                                    if (data.type == 1)
                                        removeAllIndex(data.folder.children);
                                    root.splice(i, 1);
                                    latestIndex.hashes.splice(
                                        latestIndex.hashes.indexOf(hash),
                                        1
                                    );
                                    break;
                                } else if (data.type == 1)
                                    removeLatestItem(data.folder.children);
                            }
                        };
                        removeLatestItem(latestData);
                    }
                }
                for (let i = 0; i < this.index.changes.changed.length; i++) {
                    let hash = this.index.changes.changed[i];
                    if (latestIndex.hashes.includes(hash)) {
                        let changeLatestItem = (
                            root: Favourite.Root,
                            item: Favourite.Item
                        ) => {
                            for (let i = 0; i < root.length; i++) {
                                const data = root[i];
                                if (this.createItemHash(data) == hash) {
                                    root[i] = item;
                                    break;
                                } else if (data.type == 1)
                                    changeLatestItem(data.folder.children, item);
                            }
                        };
                        let changeLocalItem = (root: Favourite.Root) => {
                            // look for item and change it in remote
                            for (let i = 0; i < root.length; i++) {
                                const data = root[i];
                                if (this.createItemHash(data) == hash) {
                                    changeLatestItem(latestData, data);
                                    break;
                                } else if (data.type == 1)
                                    changeLocalItem(data.folder.children);
                            }
                        };
                        changeLocalItem(this.data);
                    }
                }
                for (let i = 0; i < this.index.changes.moved.length; i++) {
                    let hash = this.index.changes.moved[i];
                    let removeLatestItem = (root: Favourite.Root) => {
                        for (let i = 0; i < root.length; i++) {
                            const data = root[i];
                            if (this.createItemHash(data) == hash) {
                                root.splice(i, 1);
                                break;
                            } else if (data.type == 1)
                                removeLatestItem(data.folder.children);
                        }
                    };
                    // folder: the parent folder of the item, folder not specified if it's root
                    let addLatestItem = (
                        root: Favourite.Root,
                        folder: Favourite.Item,
                        item: Favourite.Item
                    ) => {
                        if (!folder) {
                            // root
                            latestData.push(item);
                            latestIndex.hashes.push(hash);
                        } else {
                            // look for folder and apply item
                            let folderHash = this.createItemHash(folder);
                            for (let i = 0; i < root.length; i++) {
                                const data = root[i];
                                if (
                                    this.createItemHash(data) == folderHash &&
                                    data.type == 1
                                ) {
                                    data.folder.children.push(item);
                                    break;
                                } else if (data.type == 1)
                                    addLatestItem(data.folder.children, folder, item);
                            }
                        }
                    };
                    let addLocalItem = (folder: Favourite.Item) => {
                        // look for item, remove it and apply it to new folder
                        let root = folder ? folder.folder.children : this.data;
                        for (let i = 0; i < root.length; i++) {
                            const data = root[i];
                            if (this.createItemHash(data) == hash) {
                                removeLatestItem(latestData);
                                addLatestItem(latestData, folder, data);
                                break;
                            } else if (data.type == 1) addLocalItem(data);
                        }
                    };
                    addLocalItem(null);
                }
            } catch (error) {}

            // rebuild hash table
            this.rebuildHashTable(latestIndex.hashes, latestData);

            // apply changes to local and remote
            args = await this.callSyncWorker({
                accessToken: accessToken,
                op: "set-files",
                gist: gist,
                value: {
                    "favourites.json": JSON.stringify(latestData),
                    "favouritesIndex.json": JSON.stringify(latestIndex),
                },
            } as Favourite.WorkerIn);
            this.data = latestData;
            this.index = latestIndex;
            this.write();

            this.store.set("user.sync.tokenhash", tokenHash, true);
            this.updateSyncStatus("idle");
            this.log.info("Sync finished");
            if (this.syncTimer) {
                clearTimeout(this.syncTimer);
                this.syncTimer = null;
            }
            // 10 min
            this.syncTimer = setTimeout(() => this.sync(), 600000);
            return true;
        } catch (error) {
            this.log.error(error);
        }
    }

    public write(store = ["data", "index"]) {
        try {
            if (store.includes("data")) {
                let str = JSON.stringify(this.data);
                writeFileSync(this.dataFile, str);
                this.log.info("Favourite data written: " + str);
            }
            if (store.includes("index")) {
                let str = JSON.stringify(this.index);
                writeFileSync(this.indexFile, str);
                this.log.info("Favourite index written: " + str);
            }
            super.emit("change");
            if (!isMain) ipcRenderer.send("favourite-update");
            else super.emit("send-broadcast");
        } catch (error) {
            return false;
        }
        return true;
    }

    public reload() {
        try {
            this.data = JSON.parse(readFileSync(this.dataFile).toString());
        } catch (error) {
            this.data = this.defaultData;
        }
        try {
            this.index = JSON.parse(readFileSync(this.indexFile).toString());
        } catch (error) {
            this.index = this.defaultIndex;
        }
        return true;
    }

    public createItemHash(item: Favourite.Item) {
        // use url for page and title for folder to add item
        return createHash("sha256")
            .update(item.type == 0 ? item.page.url : item.title)
            .digest("hex");
    }

    public existsItem(item: Favourite.Item) {
        let hash = this.createItemHash(item);
        return this.index.hashes.includes(hash);
    }

    public existsPage(url: string) {
        let hash = this.createItemHash({ type: 0, page: { url: url } } as Favourite.Item);
        return this.index.hashes.includes(hash);
    }

    public addItem(
        item: Favourite.Item,
        root: Favourite.Root,
        skipWrite: boolean = false,
        skipIndex: boolean = false
    ) {
        if (!skipIndex) {
            let hash = this.createItemHash(item);
            if (
                this.index.hashes.includes(hash) ||
                this.index.changes.added.includes(hash)
            )
                return false;
            // removed -> added = changed
            if (this.index.changes.removed.includes(hash)) {
                this.index.changes.removed.splice(
                    this.index.changes.removed.indexOf(hash),
                    1
                );
                this.index.changes.changed.push(hash);
            } else this.index.changes.added.push(hash);
            this.index.hashes.push(hash);
        }
        root.push(item);
        if (!skipWrite) return this.write();
        else return true;
    }

    public removeItem(
        item: Favourite.Item,
        root: Favourite.Root,
        searchSubDir: boolean = false,
        skipWrite: boolean = false,
        skipIndex: boolean = false
    ) {
        let hash = this.createItemHash(item);
        if (!skipIndex) {
            if (
                !this.index.hashes.includes(hash) ||
                this.index.changes.removed.includes(hash)
            )
                return false;
            // added -> removed = none
            if (this.index.changes.added.includes(hash)) {
                this.index.changes.added.splice(
                    this.index.changes.added.indexOf(hash),
                    1
                );
            } else this.index.changes.removed.push(hash);
            this.index.hashes.splice(this.index.hashes.indexOf(hash), 1);
        }
        if (item.type == 0) {
            let removeItem = (root: Favourite.Root) => {
                for (let i = 0; i < root.length; i++) {
                    const data = root[i];
                    if (data.type == 0 && this.createItemHash(data) == hash) {
                        root.splice(i, 1);
                        break;
                    } else if (data.type == 1 && searchSubDir)
                        removeItem(data.folder.children);
                }
            };
            removeItem(root);
        } else if (item.type == 1) {
            for (let i = 0; i < root.length; i++) {
                let removeAllIndex = (root: Favourite.Root) => {
                    for (let i = 0; i < root.length; i++) {
                        const item = root[i];
                        if (item.type == 0) {
                            let hash = this.createItemHash(item);
                            if (
                                !this.index.hashes.includes(hash) ||
                                this.index.changes.removed.includes(hash)
                            )
                                continue;
                            // added -> removed = none
                            if (this.index.changes.added.includes(hash)) {
                                this.index.changes.added.splice(
                                    this.index.changes.added.indexOf(hash),
                                    1
                                );
                            } else this.index.changes.removed.push(hash);
                        } else if (item.type == 1) removeAllIndex(item.folder.children);
                    }
                };
                const data = root[i];
                if (data == item) {
                    if (!skipIndex) removeAllIndex(item.folder.children);
                    root.splice(i, 1);
                    break;
                }
            }
        }
        if (!skipWrite) return this.write();
        else return true;
    }

    public move(item: Favourite.Item, source: Favourite.Root, target: Favourite.Root) {
        let hash = this.createItemHash(item);
        this.removeItem(item, source, false, true, true);
        this.addItem(item, target, true, true);
        this.index.changes.moved.push(hash);
        return this.write();
    }

    public sort(root: Favourite.Root, oldIndex: number, newIndex: number) {
        if (root == null) root = this.data;
        const targetItem = root.splice(oldIndex - 1, 1)[0];
        root.splice(newIndex - 1, 0, targetItem);
        return this.write();
    }

    public clear() {
        this.index = this.defaultIndex;
        this.data = this.defaultData;
        return this.write();
    }
}
