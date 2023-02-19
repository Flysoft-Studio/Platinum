import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { ipcRenderer } from "electron";
import * as lang from "../common/language";
import * as com from "../common/common";
import { Converter } from "showdown";

import * as remote from "@electron/remote";
import pkg from "../common/package";

export function create(file: string, internal: boolean = false) {
    let converter = new Converter({
        moreStyling: true,
        smoothLivePreview: true,
        tables: true,
        simplifiedAutoLink: true,
        emoji: true,
        strikethrough: true,
    });
    let content = readFileSync(
        internal ? resolve(__dirname + "/../../markdown/" + file + ".md") : file
    ).toString();
    if (content.indexOf("!VAR_PKG_USED!") != -1) {
        let pkgList: Array<string> = [];
        for (const dep in pkg.dependencies) {
            pkgList.push("* [" + dep + "](https://www.npmjs.com/package/" + dep + ")");
        }
        for (const dep in pkg.devDependencies) {
            pkgList.push("* [" + dep + "](https://www.npmjs.com/package/" + dep + ")");
        }
        pkgList.sort();
        content = content.replace("!VAR_PKG_USED!", pkgList.join("\n"));
    }
    if (content.indexOf("!VAR_PKG_CHROMIUM!") != -1) {
        content = content.replace(
            "!VAR_PKG_CHROMIUM!",
            "file://" +
                dirname(remote.app.getPath("exe")).replace(/\\/, "/") +
                "/LICENSES.chromium.html"
        );
    }
    let html = converter.makeHtml(content);

    ipcRenderer.on("lang", (event, language: string) => {
        lang.reload(language);
    });

    ipcRenderer.on("load", (event) => {
        com.registerEvents();
        (<HTMLElement>document.querySelector("#markdown")).innerHTML = html;
        // waits for dom response
        requestAnimationFrame(() => {
            // adds style to links
            let links = document.querySelectorAll("a");
            for (let i = 0; i < links.length; i++) {
                const element = links.item(i);
                element.classList.add("link");
                element.target = "_blank";
            }
        });
    });
}
