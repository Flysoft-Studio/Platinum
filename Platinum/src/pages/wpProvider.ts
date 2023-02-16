import * as com from "../common/common";
import { normalize } from "path";
const remote = require("@electron/remote");

async function fetchWallpaper(url: string, mime?: string) {
    let res = await fetch(url);
    return (
        "data:" +
        (res.headers.has("Content-Type")
            ? res.headers.get("Content-Type")
            : "image/" + mime) +
        ";base64," +
        Buffer.from(await res.arrayBuffer()).toString("base64")
    );
}

export async function getLocalWallpaper(fileName: string) {
    let filePath =
        fileName && fileName != ""
            ? normalize(com.getUserFolder(remote.getGlobal("user")) + "/" + fileName)
            : null;
    return {
        url: await fetchWallpaper(
            filePath ? encodeURI("file://" + filePath.replace(/\\/g, "/")) : "",
            "jpeg"
        ),
    } as Browser.FSWallpaperProvider;
}

export async function getURLWallpaper(url: string) {
    return {
        url: await fetchWallpaper(url == "" ? "" : url, "jpeg"),
    } as Browser.FSWallpaperProvider;
}

export async function getBingWallpaper() {
    const prefix = "https://bing.com";
    let data = (await (await fetch(prefix + "/HPImageArchive.aspx?format=js&n=1")).json())
        .images[0];
    return {
        url: await fetchWallpaper(prefix + data.url, "jpeg"),
        title: data.title,
        copyright: data.copyright,
        copyrightUrl: data.copyrightlink,
    } as Browser.FSWallpaperProvider;
}

export async function getUnsplashWallpaper() {
    const prefix = "https://picsum.photos";
    let res = await fetch(prefix + "/1920/1080?random");
    let id = res.headers.get("Picsum-ID");
    let data = await (await fetch(prefix + "/id/" + id + "/info")).json();
    return {
        url: await fetchWallpaper(data.download_url, "jpeg"),
        copyright: data.author,
        copyrightUrl: data.url,
    } as Browser.FSWallpaperProvider;
}
