import { existsSync, readFileSync, writeFileSync } from "fs-extra";
import { ipcMain, ipcRenderer } from "electron";
import EventEmitter = require("events");

const isMain = ipcMain != undefined;

export class Store extends EventEmitter {
    private file: string;
    private eventName: string;
    public default: Object;
    public data: Object;

    constructor(file: string, defaultData: Object, eventName: string) {
        super();
        super.setMaxListeners(0);
        (this.file = file), (this.default = defaultData), (this.eventName = eventName);
        this.reload();
        if (!existsSync(this.file)) this.write();
        (isMain ? ipcMain : ipcRenderer).on(
            this.eventName,
            (event, noReload: boolean) => {
                this.reload();
                super.emit("change-internal-notify");
                super.emit("write");
                if (!noReload) super.emit("change");
                if (isMain) super.emit("send-broadcast", noReload);
            }
        );
    }

    public write(noReload: boolean = false) {
        try {
            let str = JSON.stringify(this.data);
            writeFileSync(this.file, str);
            super.emit("change-internal-notify");
            super.emit("write");
            if (!noReload) super.emit("change");
            if (!isMain) ipcRenderer.send(this.eventName, noReload);
            else super.emit("send-broadcast", noReload);
        } catch (error) {
            return false;
        }
        return true;
    }

    public reload() {
        try {
            this.data = JSON.parse(readFileSync(this.file).toString());
        } catch (error) {
            this.data = {};
        }
        return true;
    }

    public get(key: string, readDefault: boolean = false) {
        let path = key.split(".");
        let obj = readDefault ? this.default : this.data;
        for (let i = 0; i < path.length; i++) {
            obj = obj[path[i]];
            // obj not exist and now it is last value
            if (obj == undefined) {
                if (readDefault) return;
                else return this.get(key, true);
            }
        }
        return obj;
    }

    public set(key: string, value: any, noReload: boolean = false) {
        let path = key.split(".");
        let obj = this.data;
        for (let i = 0; i < path.length; i++) {
            if (obj[path[i]] == undefined) if (i + 1 != path.length) obj[path[i]] = {};
            if (i + 1 == path.length) obj[path[i]] = value;

            obj = obj[path[i]];
            // obj not exist and now it is last value
        }
        return this.write(noReload);
    }
}
