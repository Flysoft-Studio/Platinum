import axios from "axios";
import { parentPort } from "worker_threads";

// a class for operating GitHub Gists.
// see https://docs.github.com/rest/gists/gists
class Gist {
    private idFile = "__platinum_browser_sync.txt";
    private idFileContent =
        "This is the gist which contains your synced Platinum Browser data.\nModify it at your own risk.";
    private idDescription = "Platinum Browser Sync Data";
    public accessToken: string;
    constructor(accessToken: string) {
        this.accessToken = accessToken;
    }

    public async checkToken() {
        let ret = await axios.get("https://api.github.com/rate_limit", {
            headers: {
                Authorization: "token " + this.accessToken,
            },
        });
        if (ret.status != 200) throw new Error("Get info failed, status: " + ret.status);
        if (!ret.headers["x-oauth-scopes"].includes("gist"))
            throw new Error("The token doesn't have gist access");
    }

    public async ratelimit() {
        let ret = await axios.get("https://api.github.com/rate_limit", {
            headers: {
                Authorization: "token " + this.accessToken,
            },
        });
        if (ret.status != 200)
            throw new Error("Get ratelimit failed, status: " + ret.status);
        if (ret.data.resources.core.remaining == 0)
            throw new Error("Rate limit exceeded");
    }

    public async select() {
        let id: string;
        for (let i = 1; i <= 10; i++) {
            let ret = await axios.get(
                "https://api.github.com/gists?per_page=100&page=" + i,
                {
                    headers: {
                        Authorization: "token " + this.accessToken,
                    },
                }
            );
            if (ret.status != 200)
                throw new Error("Select Gist failed, status: " + ret.status);
            let gists: Gist.Gists = ret.data;
            if (gists.length == 0) break;
            for (let j = 0; j < gists.length; j++) {
                const gist = gists[j];
                if (gist.files[this.idFile]) {
                    id = gist.id;
                }
            }
        }
        return id;
    }

    public async create() {
        let ret = await axios.post(
            "https://api.github.com/gists",
            {
                description: this.idDescription,
                files: {
                    [this.idFile]: {
                        content: this.idFileContent,
                    },
                },
                public: false,
            },
            {
                headers: {
                    Accept: "application/vnd.github+json",
                    Authorization: "token " + this.accessToken,
                },
            }
        );
        if (ret.status != 201 && ret.status != 304)
            throw new Error("Create Gist failed, status: " + ret.status);
        let gist: Gist.Gist = ret.data;
        let id: string = gist.id;
        return id;
    }

    public async get(id: string) {
        let ret = await axios.get("https://api.github.com/gists/" + id, {
            headers: {
                Authorization: "token " + this.accessToken,
            },
        });
        if (ret.status != 200)
            throw new Error(
                "Get Gist info failed, gist: " + id + ",status: " + ret.status
            );
        let gist: Gist.Gist = ret.data;
        return gist;
    }

    public async update(id: string, files: Gist.NewFilesInfo) {
        let ret = await axios.patch(
            "https://api.github.com/gists/" + id,
            {
                description: new Date().toISOString(),
                files: files,
            },
            {
                headers: {
                    Authorization: "token " + this.accessToken,
                },
            }
        );
        if (ret.status != 200 && ret.status != 304)
            throw new Error(
                "Update Gist failed, files: " +
                    JSON.stringify(files) +
                    ", status: " +
                    ret.status
            );
    }

    public async getFile(url: string) {
        let ret = await axios.get(url, {
            headers: {
                Authorization: "token " + this.accessToken,
            },
        });
        if (ret.status != 200)
            throw new Error(
                "Read Gist file content failed, file: " + url + ", status: " + ret.status
            );
        let content: string = ret.data;
        return content;
    }
}

export async function run(args: Favourite.WorkerIn) {
    let api = new Gist(args.accessToken);
    try {
        await api.ratelimit();
    } catch (error) {
        return {
            value: null,
            error: error.message,
        } as Favourite.WorkerOut;
    }
    switch (args.op) {
        case "check-token": {
            let errorMsg: string;
            try {
                await api.checkToken();
            } catch (error) {
                errorMsg = error;
            }
            return {
                value: null,
                error: errorMsg,
            } as Favourite.WorkerOut;
        }
        case "get-gist": {
            let errorMsg: string;
            let gist: string;
            try {
                gist = await api.select();
                if (!gist) gist = await api.create();
            } catch (error) {
                errorMsg = error.message;
            }
            return {
                value: gist,
                error: errorMsg,
            } as Favourite.WorkerOut;
        }
        case "verify-gist": {
            let ok = false;
            try {
                await api.get(args.gist);
                ok = true;
            } catch (error) {}
            return {
                value: ok,
                error: null,
            } as Favourite.WorkerOut;
        }
        case "get-files": {
            let errorMsg: string;
            let content: Record<string, string> = {};
            try {
                let gist = await api.get(args.gist);
                for (const key in gist.files) {
                    let fileURL = gist.files[key];
                    let fileContent = await api.getFile(fileURL.raw_url);
                    content[key] = fileContent;
                }
            } catch (error) {
                errorMsg = error.message;
            }
            return {
                value: content,
                error: errorMsg,
            } as Favourite.WorkerOut;
        }
        case "set-files": {
            let errorMsg: string;
            try {
                let filesInfo = {} as Gist.NewFilesInfo;
                for (const key in args.value) {
                    let fileContent = args.value[key];
                    filesInfo[key] = {
                        content: fileContent,
                    };
                }
                await api.update(args.gist, filesInfo);
            } catch (error) {
                errorMsg = error.message;
            }
            return {
                value: null,
                error: errorMsg,
            } as Favourite.WorkerOut;
        }
        default:
            break;
    }
    return null;
}

parentPort.on("message", async (args: Favourite.WorkerIn) => {
    parentPort.postMessage(await run(args));
});
