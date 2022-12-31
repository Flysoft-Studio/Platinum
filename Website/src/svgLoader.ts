export async function load(element: HTMLElement) {
    element.dataset.loaded = "true";
    element.innerHTML = await (await fetch(element.dataset.url.replace("dirname", "/.."))).text();
}

export async function loadAll() {
    var svgs = document.querySelectorAll(".svg_loader:not([data-loaded=\"true\"])");
    for (var i = 0; i < svgs.length; i++) {
        await load(<HTMLElement>svgs.item(i));
    }
}