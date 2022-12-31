import { ipcRenderer } from "electron";
import * as lang from "../common/language";
import * as com from "../common/common";

ipcRenderer.on("lang", (event, language: string) => {
    lang.reload(language);
});

ipcRenderer.on("load", (event) => {
    com.registerEvents();
});