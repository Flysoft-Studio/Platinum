import { isBackdropSupported } from "../platform/win32";

export function getMgrDefaultOptions() {
    return {
        update: {
            auto: (process.platform == "win32"),
            channel: null,
        },
        applyrestart: null,
    }
}

export function getDefaultOptions(user: string, electron: typeof Electron.CrossProcessExports) {
    let downloadPath;
    try {
        downloadPath = electron.app.getPath("downloads");
    } catch (error) {
        downloadPath = "";
    }
    return {
        user: {
            sync: {
                enable: false,
                token: "",
            },
            desktoplink: (process.platform == "win32" && user != "default"),
        },
        search: {
            engines: [{
                name: "Bing",
                url: "https://bing.com/search?q=%s",
            }, {
                name: "Google",
                url: "https://google.com/search?q=%s",
            }, {
                name: "百度",
                url: "https://baidu.com/s?wd=%s",
            }, {
                name: "搜狗",
                url: "https://www.sogou.com/web?query=%s",
            }],
            current: 0,
        },
        appearance: {
            overall: "system",
            visual: {
                blur: (process.platform == "win32"),
                fullblur: false,
                usebackdrop: isBackdropSupported,
                backdroptype: 2,
                spotlight: true,
                animation: false,
            },
            tcolor: {
                uses: "system",
                custom: "rgb(0, 120, 212)",
            },
            behavior: {
                askmulti: true,
            },
        },
        pfm: {
            sys: {
                turbo: user == "default",
                hardwareacceleration: true,
            },
            sleep: {
                enable: (process.platform == "win32"),
                timeout: 3600000,
            },
        },
        home: {
            button: {
                show: true,
            },
            page: {
                uses: "start",
                url: "",
            },
            start: {
                background: {
                    uses: "unsplash",
                    url: "",
                    file: "",
                    blur: false,
                },
            },
        },
        download: {
            path: downloadPath,
        },
        applyrestart: null,
    }
}