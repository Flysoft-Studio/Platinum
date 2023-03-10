import * as com from "../common/common";
import * as lang from "../common/language";
import {
    getBingWallpaper,
    getLocalWallpaper,
    getUnsplashWallpaper,
    getURLWallpaper,
} from "./wpProvider";
import { ipcRenderer } from "electron";
import { loadSVGs } from "../common/svgLoader";
import axios from "axios";

ipcRenderer.on("lang", (event, language: string) => {
    lang.reload(language);
});

ipcRenderer.on("load", async () => {
    com.registerEvents();
    loadSVGs();

    if (com.store.get("home.start.weather") == true) {
        try {
            const widgetObjName = "SeniverseWeatherWidget";
            window["SeniverseWeatherWidgetObject"] = widgetObjName;
            window[widgetObjName] = function () {
                (window[widgetObjName].q = window[widgetObjName].q || []).push(arguments);
            };
            window[widgetObjName].l = +new Date();
            let ele = document.createElement("script");
            ele.innerText = (
                await axios.get(
                    "https://cdn.sencdn.com/widget2/static/js/bundle.js?t=" +
                        parseInt((new Date().getTime() / 100000000).toString())
                )
            ).data
                .replace("//widget-v3.seniverse.com", "https://widget-v3.seniverse.com")
                .replace("//cdn.sencdn.com", "https://cdn.sencdn.com")
                .replace("//seniverse.com", "https://seniverse.com")
                .replace("//m.seniverse.com", "https://m.seniverse.com");
            document.head.appendChild(ele);
            window[widgetObjName]("show", {
                flavor: "bubble",
                location: "WX4FBXXFKE4F",
                geolocation: true,
                language: "auto",
                unit: "c",
                theme: "dark",
                token: "caef0015-412b-4a98-9706-e160a1cd0777",
                hover: "enabled",
                container: "tp-weather-widget",
            });
        } catch {
            console.error("load weather failed");
        }
    }

    let searchElement = <HTMLInputElement>document.querySelector("#search>input");
    searchElement.addEventListener("keypress", (event) => {
        if (event.key == "Enter") {
            ipcRenderer.sendToHost("start", "search", {
                url: searchElement.value,
            });
            searchElement.value = "";
        }
    });
    let settingsElement = <HTMLElement>document.querySelector("#btns_settings");
    settingsElement.addEventListener("click", () => {
        setTimeout(() => {
            window.open(com.scheme + "://settings#homepage");
        }, 100);
    });
    let timeElement = <HTMLElement>document.querySelector("#time");
    let timeUpdate = () => {
        let date = new Date();
        timeElement.innerHTML = lang.encode(
            date.getHours() + ":" + date.getMinutes().toString().padStart(2, "0")
        );
    };
    setInterval(() => timeUpdate(), 1000);
    requestAnimationFrame(() => {
        timeElement.style.opacity = "1";
    });
    let bgElement = <HTMLImageElement>document.querySelector(".startbg");
    if (com.store.get("home.start.background.blur") as boolean)
        bgElement.classList.add("startbg_blur");
    let wpProvider: Browser.FSWallpaperProvider;
    let wpSource = com.store.get("home.start.background.uses") as string;
    if (wpSource == "unsplash") wpProvider = await getUnsplashWallpaper();
    else if (wpSource == "bing") wpProvider = await getBingWallpaper();
    else if (wpSource == "url")
        wpProvider = await getURLWallpaper(
            com.store.get("home.start.background.url") as string
        );
    else if (wpSource == "file")
        wpProvider = await getLocalWallpaper(
            com.store.get("home.start.background.file") as string
        );
    bgElement.src = wpProvider ? wpProvider.url : "";
    bgElement.addEventListener("load", () => {
        bgElement.style.opacity = "1";
    });
});
