import { ipcRenderer } from "electron";
import * as lang from "../common/language";
import * as com from "../common/common";
import { registerRipples } from "../common/ripple";
import pkg from "../common/package";

export function whatsnewAction() {
    window.open(com.scheme + "://changelog", "_blank");
}

ipcRenderer.on("lang", (event, language: string) => {
    lang.reload(language);
    (<HTMLElement>document.querySelector("#update_version")).innerHTML = lang.encode(
        lang.get("ups_body", [pkg.version])
    );
});

ipcRenderer.on("load", (event) => {
    com.registerEvents();
    registerRipples();
});
