import { ChildProcessWithoutNullStreams } from "child_process";
import { WebSocket } from "ws";

declare global {
    namespace Browser {
        interface BrowserOptions {
            guest?: boolean;
            dev?: boolean;
            url?: string;
        }
        interface UserInfo {
            id: string;
            icon?: string;
            name?: string;
        }
        type UserInfoList = Record<string, UserInfo>;
        interface UpdateStatus {
            error: string;
            status: string;
            progress: number;
            installing: boolean;
            available: boolean;
            version: VersionInfo;
            update: UpdateInfo;
            canUpdate: boolean;
        }
        // 1.0.0-pre.1
        interface VersionInfo {
            str: string;
            major: number;
            minor: number;
            patch: number;
            channel: string;
            preview: number;
        }
        interface UpdateInfo {
            version: string;
            hash: string;
            provider: FSDownloadProvider;
        }
        interface FSDownloadProvider {
            shareKey: string;
            sharePwd: string;
            folder: string;
            file: string;
        }
        interface FSWallpaperProvider {
            url: string;
            title?: string;
            copyright?: string;
            copyrightUrl?: string;
        }
        interface MediaInfo {
            title: string;
            author: string;
            cover: string;
        }
        interface DialogOptions {
            title: string;
            subtitle?: string;
            input?: {
                default?: string;
                allowEmptyValues?: boolean;
            };
            checkbox?: {
                text: string;
                default?: boolean;
            };
        }
        interface DialogRet {
            button: "ok" | "cancel" | "failed";
            checkbox?: boolean;
            input?: string;
        }
    }

    namespace Favourite {
        interface Item {
            type: number;
            page?: Page;
            folder?: Folder;
            title: string;
        }
        interface Page {
            icon: string;
            url: string;
        }
        interface Folder {
            children: Root;
        }
        interface Changes {
            added: Array<string>;
            removed: Array<string>;
            changed: Array<string>;
            moved: Array<string>;
        }
        interface Index {
            hashes: Array<string>;
            changes: Changes;
        }
        interface WorkerIn {
            accessToken: string;
            op: "check-token" | "get-gist" | "verify-gist" | "get-files" | "set-files";
            gist?: string;
            value?: Record<string, string> | null;
        }
        interface WorkerOut {
            value?: Record<string, string> | string | boolean | null;
            error?: string;
        }
        type Root = Array<Item>;
        type SyncStatus = "syncing" | "idle" | "error" | "unset";
    }

    namespace Download {
        interface Item {
            gid: string;
            status: string;
            totalLength: string;
            completedLength: string;
            uploadLength: string;
            downloadSpeed: string;
            uploadSpeed: string;
            connections: string;
            errorCode: string;
            errorMessage: string;
            dir: string;
            files: Array<File>
        }
        interface File {
            index: string;
            path: string;
            length: string;
            completedLength: string;
            selected: string;
            uris: Array<URI>;
        }
        interface URI {
            uri: string;
            status: string;
        }
        interface DownloaderInfo {
            numActive: number;
            active: Array<Item>;
            numWaiting: number;
            waiting: Array<Item>;
            numStopped: number;
            stopped: Array<Item>;
        }
        interface ChangedItem {
            item: string;
            added: Array<Item>;
            removed: Array<Item>;
        }
    }

    namespace Manager {
        interface LaunchOptions extends Browser.BrowserOptions {
            user?: string;
        }

        // instance -> manager
        interface DataPackageI {
            id: string;
            data: DataPackageIData;
        }
        type DataPackageIData = DataPackageIBase | DataPackageIBoardcast | DataPackageIOpen | DataPackageIActive;
        interface DataPackageIBase {
            user: string;
        }
        interface DataPackageIBoardcast extends DataPackageIBase {
            package: DataPackage;
        }
        interface DataPackageIOpen extends DataPackageIBase {
            options: LaunchOptions;
        }
        interface DataPackageIActive extends DataPackageIBase {
            targetUser: string;
        }

        // manager -> instance
        interface DataPackage {
            id: string;
            data: DataPackageData;
        }
        type DataPackageData = DataPackageBase | DataPackageOpen;
        interface DataPackageBase { }
        interface DataPackageUpdate extends Browser.UpdateStatus { }
        interface DataPackageOpen extends Browser.BrowserOptions { }

        interface User {
            process: ChildProcessWithoutNullStreams;
            socket: WebSocket;
            onready: Function;
            onexit: Function;
            onrefuseexit: Function;
        }
        type UserList = Record<string, User>;
    }

    namespace Gist {
        interface FileInfo {
            filename: string;
            raw_url: string;
        }
        type FilesInfo = Record<string, FileInfo>;
        interface NewFileInfo {
            content: string;
        }
        type NewFilesInfo = Record<string, NewFileInfo>;
        interface Gist {
            url: string;
            id: string;
            files: Record<string, FileInfo>;
            public: boolean;
            description: string;
        }
        type Gists = Array<Gist>;
    }
}