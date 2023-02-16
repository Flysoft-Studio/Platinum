import { ipcRenderer } from "electron";

ipcRenderer.on("tip", (event, tip: string) => {
    let tipElement = <HTMLElement>document.querySelector(".tip");
    tipElement.innerText = tip;
    requestAnimationFrame(() => {
        tipElement.classList.add("tip_show");
        setTimeout(() => {
            requestAnimationFrame(() => {
                tipElement.classList.remove("tip_show");
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        window.close();
                    });
                }, 200);
            });
        }, 1000);
    });
});
