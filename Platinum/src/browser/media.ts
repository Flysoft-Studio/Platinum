import * as lang from "../common/language";
import * as com from "../common/common";
import { Tab, tabMgr } from "./browser";
import { Menu } from "../common/menu";
import { randomUUID } from "crypto";
import { ElectronLog, LogFunctions } from "electron-log";
import { readFileSync } from "fs";
import { parse as parseURL } from "url";
import pixels from "@cronvel/get-pixels";
import axios from "axios";

let log: LogFunctions;

export let mediaMenu: Menu;
let mediaContainer: HTMLElement;

let controls = [];

function getElements(id: string) {
    const prefix = "#media_" + id;
    if (!document.querySelector(prefix)) throw new Error("Media " + id + " not exists");
    return {
        item: <HTMLButtonElement>document.querySelector(prefix),
        box: <HTMLElement>document.querySelector(prefix + " .media_box"),
        cover: <HTMLImageElement>document.querySelector(prefix + " .media_cover"),
        content: <HTMLElement>document.querySelector(prefix + " .media_content"),
        url: <HTMLElement>document.querySelector(prefix + " .media_url"),
        description: <HTMLElement>document.querySelector(prefix + " .media_description"),
        author: <HTMLElement>document.querySelector(prefix + " .media_author"),
        play: <HTMLButtonElement>document.querySelector(prefix + " .media_control_play"),
        pause: <HTMLButtonElement>(
            document.querySelector(prefix + " .media_control_pause")
        ),
        pip: <HTMLButtonElement>document.querySelector(prefix + " .media_control_pip"),
    };
}

export async function createItem(tab: Tab, isPlaying: boolean = true) {
    let mid = randomUUID();
    tab.mediaElementID = mid;
    log.log("Media control " + mid + ": Creating, tab: " + tab.id);
    let mediaItem = <HTMLElement>(
        document.querySelector(".media_item.template").cloneNode(true)
    );
    mediaItem.classList.remove("template");
    mediaItem.id = "media_" + mid;
    mediaContainer.appendChild(mediaItem);

    let setElementValue = (element: HTMLElement, value: string) => {
        if (value && value != "") {
            com.setElementVisible(element, true);
            if (element.tagName.toLowerCase() == "img") {
                (element as HTMLImageElement).src = value;
            } else {
                element.innerHTML = lang.encode(value);
            }
        } else {
            com.setElementVisible(element, false);
        }
    };

    let mediaEle = getElements(mid);
    setElementValue(mediaEle.cover, null);
    mediaEle.item.addEventListener("click", () => {
        tabMgr.switch(tab.id);
        mediaMenu.hide();
    });
    mediaEle.play.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        sendCommand(tab, "play");
    });
    mediaEle.pause.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        sendCommand(tab, "pause");
    });
    mediaEle.pip.addEventListener("click", (event) => {
        sendCommand(tab, "pip");
        mediaMenu.hide();
    });
    updatePlayState(tab, isPlaying);
    controls.push(mid);

    // shows the button
    com.setElementVisible(<HTMLButtonElement>document.querySelector("#nav_media"), true);

    let mediaInfo = (await tab.webcontents.executeJavaScript(
        readFileSync(__dirname + "/mediaInfo.js").toString()
    )) as Browser.MediaInfo;
    let urlStruct = parseURL(tab.webcontents.getURL());
    setElementValue(mediaEle.url, urlStruct.host);
    setElementValue(mediaEle.description, mediaInfo.title);
    setElementValue(mediaEle.author, mediaInfo.author);
    setElementValue(mediaEle.cover, null);
    if (mediaInfo.cover) {
        let coverRes = await axios.get(mediaInfo.cover);
        if (coverRes.headers["Content-Type"]) {
            // valid image
            let mime = coverRes.headers["Content-Type"].toString();

            let raw = Buffer.from(coverRes.data);
            let dataBase64 = "data:image/" + mime + ";base64," + raw.toString("base64");

            setElementValue(mediaEle.cover, dataBase64);

            pixels(raw, mime.replace("image/", "") as any, (error, pixels) => {
                if (error) {
                    log.error(
                        "MediaControl " +
                            mid +
                            ": Failed to parse cover, url: " +
                            mediaInfo.cover +
                            ", mime: " +
                            mime
                    );
                    return;
                }
                let color = com.getImageColorInfo(pixels.data);
                if (!color.isDark) {
                    mediaEle.item.style.setProperty(
                        "--var-media-background",
                        "var(--media-background)"
                    );
                    mediaEle.item.style.setProperty("--var-media-color", color.rgba);
                    mediaEle.item.style.setProperty("--var-media-sub-color", color.rgba);
                } else {
                    mediaEle.item.style.setProperty("--var-media-background", color.rgba);
                    mediaEle.item.style.setProperty(
                        "--var-media-color",
                        "var(--media-light-color)"
                    );
                    mediaEle.item.style.setProperty(
                        "--var-media-sub-color",
                        "var(--media-light-sub-color)"
                    );
                }
            });
        } else {
            // invalid image
        }
    }
}

export function removeItem(tab: Tab) {
    let mid = tab.mediaElementID;
    log.log("Media control " + mid + ": Closing");
    let mediaEle = getElements(mid);
    mediaEle.item.remove();
    // removes media control in controls
    controls.splice(controls.indexOf(mid), 1);
    // if there is no media control left, closes the menu and hides the button
    if (controls.length == 0) {
        com.setElementVisible(
            <HTMLButtonElement>document.querySelector("#nav_media"),
            false
        );
        mediaMenu.hide();
    }
}

export function updatePlayState(tab: Tab, isPlaying: boolean) {
    let mid = tab.mediaElementID;
    log.log("Media control " + mid + ": State changed, isPlaying: " + isPlaying);
    let mediaEle = getElements(mid);
    com.setElementVisible(mediaEle.play, !isPlaying);
    com.setElementVisible(mediaEle.pause, isPlaying);
}

export async function sendCommand(tab: Tab, command: string) {
    let mid = tab.mediaElementID;
    log.log("Media control " + mid + ": Sending command, command: " + command);
    // webcontents must be active to execute js
    tab.wake();
    await tab.webcontents.executeJavaScript(
        readFileSync(__dirname + "/mediaControl.js")
            .toString()
            .replace("!<OP>!", command),
        true
    );
}

export function showMenu() {
    if (controls.length != 0) mediaMenu.showMenuUnderElement("#nav_media");
    else mediaMenu.hide();
}

window.addEventListener("load", () => {
    mediaContainer = <HTMLElement>document.querySelector("#menu_media_main");
});

export function init(logger: ElectronLog) {
    log = logger.scope("mediacontrol");
    mediaMenu = new Menu("media");
}
