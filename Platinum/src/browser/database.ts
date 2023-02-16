import { createHash } from "crypto";

export let db: IDBDatabase;

export function loadDB(session: string) {
    return new Promise((resolve, reject) => {
        let request = indexedDB.open(
            "browser_" + createHash("sha256").update(session).digest("hex")
        );
        request.onsuccess = (event) => {
            db = request.result;
            resolve(db);
            return;
        };
        request.onerror = (event) => {
            reject();
            return;
        };
        request.onupgradeneeded = (event) => {
            db = request.result;

            let history = db.createObjectStore("history", {
                keyPath: "id",
                autoIncrement: true,
            });
            history.createIndex("url", "url", { unique: true });
            history.createIndex("title", "title", { unique: false });
            history.createIndex("time", "time", { unique: false });
        };
    });
}

export function request(req: IDBRequest) {
    return new Promise<any>((resolve, reject) => {
        req.onsuccess = (event) => {
            resolve(req.result);
            return;
        };
        req.onerror = (event) => {
            reject();
            return;
        };
    });
}
