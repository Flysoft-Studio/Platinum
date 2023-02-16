import {
    genIcon,
    getImageData,
    getImageMIME,
    imageDataToBase64,
    resizeImage,
} from "../common/image";
import {
    ensureDirSync,
    existsSync,
    mkdirSync,
    moveSync,
    readFileSync,
    removeSync,
    rmSync,
    writeFileSync,
} from "fs-extra";
import { app, shell } from "electron";
import { extname, normalize } from "path";
import { randomUUID } from "crypto";

export let oldUserDir = app.getPath("userData");
export let usersDir = app.getPath("appData") + "/Platinum-Browser";
export let mgrDir = normalize(usersDir + "/manager");
export let mgrDataDir = normalize(mgrDir + "/User Data");
export let usersListFile = normalize(mgrDataDir + "/users.json");
export let userDir: string;
export let logDir: string;
export let dataDir: string;

export function init(user: string) {
    userDir = getUserFolder(user);
    logDir = getUserLogFolder(user);
    dataDir = getUserDataFolder(user);
    (global.user = user),
        (global.usersDir = usersDir),
        (global.mgrDir = mgrDir),
        (global.mgrDataDir = mgrDataDir),
        (global.usersListFile = usersListFile),
        (global.userDir = userDir),
        (global.logDir = logDir),
        (global.dataDir = dataDir);

    ensureDirSync(usersDir);
    ensureDirSync(mgrDir);

    if (!existsSync(userDir)) {
        mkdirSync(userDir);
        if (user == "default") {
            // migrate user data
            if (existsSync(oldUserDir)) {
                removeSync(userDir);
                moveSync(oldUserDir, userDir);
                removeSync(oldUserDir);
            }
        }
    }

    ensureDirSync(userDir);
    ensureDirSync(logDir);
    ensureDirSync(dataDir);

    app.setPath("userData", userDir);
    app.setAppLogsPath(logDir);

    if (!existsSync(usersListFile))
        writeFileSync(
            usersListFile,
            JSON.stringify({
                default: {
                    id: "default",
                },
            } as Browser.UserInfoList)
        );
}

export async function generateLink(user: Browser.UserInfo) {
    if (user.id == "default" || process.platform != "win32") return;
    deleteLink(user);

    let userFilePath = normalize(
        user.icon
            ? getUserDataFolder(user.id) + "/" + user.icon
            : __dirname + "/../../img/user/user.svg"
    );
    let userFileData = await resizeImage(
        (
            await getImageData(userFilePath, getImageMIME(userFilePath), true)
        ).data,
        256,
        256
    );
    let userFileBase64 = imageDataToBase64(userFileData.data, userFileData.mime);

    let logoFilePath = normalize(__dirname + "/../../platinum.svg");
    let logoFileData = await resizeImage(
        (
            await getImageData(logoFilePath, getImageMIME(logoFilePath), true)
        ).data,
        256,
        256
    );
    let logoFileBase64 = imageDataToBase64(logoFileData.data, logoFileData.mime);

    let desktopIconFileSVGContent = readFileSync(
        __dirname + "/../../img/user/desktop.svg"
    )
        .toString()
        .replace("!<PlatinumIcon>!", logoFileBase64)
        .replace("!<ProfileIcon>!", userFileBase64);
    let desktopIconFileICONPath = normalize(
        getUserDataFolder(user.id) + "/desktopIcon_" + randomUUID() + ".ico"
    );
    genIcon(Buffer.from(desktopIconFileSVGContent), desktopIconFileICONPath);

    shell.writeShortcutLink(getLinkFile(user), "create", {
        description: "Platinum Browser",
        icon: desktopIconFileICONPath,
        iconIndex: 0,
        target: app.getPath("exe"),
        args: (app.isPackaged ? [] : [process.cwd()])
            .concat(["--user=" + user.id])
            .join(" "),
    });
}

export function deleteLink(user: Browser.UserInfo) {
    if (user.id == "default" || process.platform != "win32") return;
    let desktopLinkFile = getLinkFile(user);
    if (existsSync(desktopLinkFile)) {
        // delete the icon file
        try {
            let desktopLinkInfo = shell.readShortcutLink(desktopLinkFile);
            if (
                desktopLinkInfo.icon &&
                extname(desktopLinkInfo.icon) == ".ico" &&
                existsSync(desktopLinkInfo.icon)
            ) {
                rmSync(desktopLinkInfo.icon);
            }
        } catch {}
        // delete the link itself
        try {
            rmSync(desktopLinkFile);
        } catch (error) {
            console.log(error);
        }
    }
}

export function getLinkFile(user: Browser.UserInfo) {
    if (user.id == "default" || process.platform != "win32") return;
    return normalize(
        app.getPath("desktop") +
            "/" +
            (user.name
                ? [
                      user.name
                          .replace(/\n/g, " ")
                          .replace(/</g, " ")
                          .replace(/>/g, " ")
                          .replace(/\?/g, " ")
                          .replace(/\*/g, " ")
                          .replace(/\\/g, " ")
                          .replace(/\//g, " ")
                          .replace(/:/g, " ")
                          .replace(/\|/g, " "),
                  ]
                : []
            )
                .concat(["Platinum"])
                .join(" - ") +
            ".lnk"
    );
}

export function getUserFolder(user: string) {
    return normalize(usersDir + "/" + user);
}

export function getUserLogFolder(user: string) {
    return normalize(getUserFolder(user) + "/Logs");
}

export function getUserDataFolder(user: string) {
    return normalize(getUserFolder(user) + "/User Data");
}

export function getUserList() {
    try {
        return JSON.parse(readFileSync(usersListFile).toString()) as Browser.UserInfoList;
    } catch (error) {
        return {};
    }
}

export function setUserList(userList: Browser.UserInfoList) {
    try {
        writeFileSync(usersListFile, JSON.stringify(userList));
        return true;
    } catch (error) {
        return false;
    }
}
