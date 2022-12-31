import { reload } from "./language.js";

let downloading = false;

async function startDownload(platform, arch) {
    if (downloading) return;
    downloading = true;
    document.querySelector("#started").classList.add("dialog_show");
    const prefix = "https://api.flysoftapp.com/update/platinum/";
    let provider;
    let url = prefix + "latest_" + platform + "_" + arch + ".json";
    let options = {
        headers: {
            "Cache-Control": "no-cache",
        },
    }
    try {
        provider = (await (await fetch(url, options)).json()).provider;
    } catch {
        try {
            url = prefix + "preview_" + platform + "_" + arch + ".json";
            provider = (await (await fetch(url, options)).json()).provider;
        } catch {
            alert("An error occurred. See console for more details.");
            downloading = false;
            throw "Cannot fetch update info";
        }
    }
    console.log("Got provider: " + JSON.stringify(provider));
    let dlURL = "//api.flysoftapp.com/api/download.php?key=" + encodeURIComponent(provider.shareKey) + "&pwd=" + encodeURIComponent(provider.sharePwd) + "&root=" + encodeURIComponent(provider.folder) + "&file=" + encodeURIComponent(provider.file);
    console.log("Download url: " + dlURL);
    var a = document.createElement('a');
    a.href = dlURL;
    a.download = "";
    a.click();
    downloading = false;
    return true;
}

window.addEventListener("load", async () => {
    document.body.classList.add("transition");
    reload();

    document.querySelector("#dl_win").addEventListener("click", () => {
        startDownload("win32", "all");
    });
    document.querySelector("#dl_linux").addEventListener("click", () => {
        startDownload("linux", "x64");
    });
    document.querySelector("#dl_ms").addEventListener("click", () => {
        window.open("https://www.microsoft.com/store/productId/9N5S8XGW37NB", "_blank");
    });
    document.querySelector("#started_close").addEventListener("click", () => {
        document.querySelector("#started").classList.remove("dialog_show");
    });
});
