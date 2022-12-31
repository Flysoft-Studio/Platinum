import * as com from "../common/common";
import * as lang from "../common/language";
import { getBingWallpaper, getLocalWallpaper, getPixivWallpaper, getUnsplashWallpaper, getURLWallpaper } from "./wpProvider";
import { ipcRenderer } from "electron";
import { loadSVGs } from "../common/svgLoader";

ipcRenderer.on("lang", (event, language: string) => {
    lang.reload(language);
});

ipcRenderer.on("load", async () => {
    com.registerEvents();
    loadSVGs();

    try {
        const widgetObjName = "SeniverseWeatherWidget";
        window["SeniverseWeatherWidgetObject"] = widgetObjName;
        window[widgetObjName] = function () {
            (window[widgetObjName].q = window[widgetObjName].q || []).push(
                arguments);
        }
        window[widgetObjName].l = +new Date();
        let ele = document.createElement("script");
        ele.innerText = (await (await fetch("https://cdn.sencdn.com/widget2/static/js/bundle.js?t=" +
            parseInt((new Date().getTime() / 100000000).toString()))).text()).replace("//widget-v3.seniverse.com", "https://widget-v3.seniverse.com").replace("//cdn.sencdn.com", "https://cdn.sencdn.com").replace("//seniverse.com", "https://seniverse.com").replace("//m.seniverse.com", "https://m.seniverse.com");
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
        let fixNumber = (num: number) => {
            let str = "0" + num;
            return str.substring(str.length - 2);
        }
        timeElement.innerHTML = lang.encode(fixNumber(date.getHours()) + ":" + fixNumber(date.getMinutes()));
    }
    setInterval(() => timeUpdate(), 1000);
    requestAnimationFrame(() => {
        timeElement.style.opacity = "1";
    });
    let bgElement = <HTMLElement>document.querySelector(".startbg>div");
    if (com.store.get("home.start.background.blur") as boolean) bgElement.classList.add("startbg_blur");
    let wpProvider: Browser.FSWallpaperProvider;
    let wpSource = com.store.get("home.start.background.uses") as string;
    let wpString: string;
    if (wpSource == "unsplash") wpProvider = await getUnsplashWallpaper();
    else if (wpSource == "bing") wpProvider = await getBingWallpaper();
    else if (wpSource == "pixiv") wpProvider = await getPixivWallpaper();
    else if (wpSource == "genshin") wpProvider = await getURLWallpaper("https://api.443.fyi/rpicgs/index.php");
    else if (wpSource == "honkai") wpProvider = await getURLWallpaper("https://api.443.fyi/rpicgs/bh3.php");
    else if (wpSource == "mc") wpProvider = await getURLWallpaper("https://api.443.fyi/rpicgs/minecraft.php");
    else if (wpSource == "url") wpProvider = await getURLWallpaper(com.store.get("home.start.background.url") as string);
    else if (wpSource == "file") wpProvider = await getLocalWallpaper(com.store.get("home.start.background.file") as string);
    if (wpProvider) wpString = "url(" + wpProvider.url + ")";
    bgElement.style.backgroundImage = (wpString) ? (wpString) : ("none");
    bgElement.style.opacity = "1";
});