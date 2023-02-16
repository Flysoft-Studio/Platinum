import { ipcRenderer } from "electron";
console.log("Platinum Browser");
// (window as any).prompt = (message: string, _default: string) => {
//     ipcRenderer.sendToHost("dlg_prompt", message, _default);
//     let ret;
//     ipcRenderer.once("dlg_prompt_return", (event, confirmed: boolean, text: string) => {
//         ret = (confirmed) ? (text) : null;
//     });
//     return ret;
// }
let curSecret;
ipcRenderer.sendToHost("process_info_pid", process.pid);
ipcRenderer.on("get-secret", (event, newSecret) => {
    curSecret = newSecret;
});
function verifySecret(secret) {
    if (!curSecret) throw new Error("Valid secret not got.");
    else if (secret != curSecret) throw new Error("Invalid secret.");
}
(window as any).platinum = {
    errorPageController: {
        proceedToUnsafePage: (secret) => {
            verifySecret(secret);
            ipcRenderer.sendToHost("error_page_controller_proceed_to_unsafe_page");
        },
        game: (secret) => {
            verifySecret(secret);
            window.open("platinum://tetris", "_blank");
        },
    },
    injectStyleSheet: () => {
        // scrollbar.css
        addStyleSheet(`body {
            /* overrides user agent stylesheet */
            background-color: transparent;
        }
        
        pre {
            font-family: Consolas, 'Courier New', monospace, sans-serif;
        }
        
        @media not (forced-colors: active) {
            body {
                overflow: overlay;
            }
        
            ::-webkit-scrollbar {
                /* 12px + 1px + 1px */
                width: 14px;
                height: 14px;
            }
        
            ::-webkit-scrollbar-corner {
                background: none;
            }
        
            ::-webkit-scrollbar-thumb {
                /* 14px / 2 */
                border-radius: 7px;
                background-clip: padding-box;
                border: transparent 5px solid;
                min-width: 80px;
                min-height: 80px;
            }
        
            ::-webkit-scrollbar-thumb:hover {
                border: transparent 4.5px solid;
            }
        
            ::-webkit-scrollbar-thumb:vertical {
                background-image: linear-gradient(180deg, rgb(99, 99, 99) 0%, rgba(80, 80, 80) 100%);
            }
        
            ::-webkit-scrollbar-thumb:horizontal {
                background-image: linear-gradient(90deg, rgb(99, 99, 99) 0%, rgba(80, 80, 80) 100%);
            }
        
            ::-webkit-scrollbar-track {
                background: none;
            }
        }`);

        if (
            document.querySelector("body>.line-gutter-backdrop") &&
            document.querySelector("body>form") &&
            document.querySelector("body>table")
        ) {
            // viewSource.css
            addStyleSheet(`body>table>tbody {
                position: fixed;
                left: 0;
                top: 30px;
                right: 0;
                bottom: 0;
                font-family: Consolas, 'Courier New', monospace, sans-serif;
                font-size: 16px;
                overflow: auto !important;
            }

            body>form>.line-wrap-control {
                position: fixed;
                left: 0;
                top: 0;
                right: 0;
                width: auto;
                height: 30px;
                font-family: sans-serif;
                font-size: 14px;
                justify-content: flex-end;
                gap: 3px;
                background-color: transparent;
            }
            
            .line-number {
                font-family: sans-serif;
                font-size: 11px;
                background-color: transparent;
            }
            
            .line-gutter-backdrop {
                display: none;
            }`);
        }
    },
};

function addStyleSheet(css: string) {
    if (!document.head) return;
    let cssElement = document.createElement("style");
    cssElement.type = "text/css";
    cssElement.innerText = css;
    cssElement.classList.add("platinum_stylesheet");
    document.head.appendChild(cssElement);
}

window.addEventListener("DOMContentLoaded", () => {
    (window as any).platinum.injectStyleSheet();
    let child = document.childNodes;
    if (child.length == 1 && (<SVGElement>child[0]).tagName == "svg") {
        let svg = <SVGElement>child[0];
        let rect = svg.getBoundingClientRect();
        let targetMaxWidth = 720;
        let targetMaxHeight = 420;
        svg.style.position = "fixed";
        svg.style.transform = "translate(-50%, -50%)";
        svg.style.left = "50%";
        svg.style.top = "50%";
        let zoom: number;
        if (rect.width < targetMaxWidth || rect.height < targetMaxHeight) zoom = 1;
        else {
            let zoomWidth = (targetMaxWidth - rect.width) / rect.width;
            let zoomHeight = (targetMaxHeight - rect.height) / rect.height;
            // get min zoom
            zoom = zoomWidth > zoomHeight ? zoomHeight : zoomWidth;
        }
        (svg.style as any).zoom = zoom.toString();
    }
});
