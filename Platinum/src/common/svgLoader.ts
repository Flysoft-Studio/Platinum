import { readFileSync } from "fs";

export function loadSVG(element: HTMLElement) {
    element.dataset.loaded = "true";
    element.innerHTML = readFileSync(element.dataset.url.replace("dirname", __dirname + "/../..")).toString();
}

export function loadSVGs() {
    var svgs = document.querySelectorAll(".svg_loader:not([data-loaded=\"true\"])");
    for (var i = 0; i < svgs.length; i++) {
        loadSVG(<HTMLElement>svgs.item(i));
    }
}