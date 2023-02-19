import * as com from "../common/common";
import { normalize } from "path";
import * as remote from "@electron/remote";
import axios from "axios";

export async function getLocalWallpaper(fileName: string) {
    let filePath =
        fileName && fileName != ""
            ? normalize(com.getUserFolder(remote.getGlobal("user")) + "/" + fileName)
            : null;
    return {
        url: filePath ? encodeURI("file://" + filePath.replace(/\\/g, "/")) : "",
    } as Browser.FSWallpaperProvider;
}

export async function getURLWallpaper(url: string) {
    return {
        url: url == "" ? "" : url,
    } as Browser.FSWallpaperProvider;
}

export async function getBingWallpaper() {
    const prefix = "https://bing.com";
    let data = (await axios.get(prefix + "/HPImageArchive.aspx?format=js&n=1")).data
        .images[0];
    return {
        url: prefix + data.url,
        title: data.title,
        copyright: data.copyright,
        copyrightUrl: data.copyrightlink,
    } as Browser.FSWallpaperProvider;
}

export async function getUnsplashWallpaper() {
    return {
        url: "https://picsum.photos/1920/1080?random",
    } as Browser.FSWallpaperProvider;
}
