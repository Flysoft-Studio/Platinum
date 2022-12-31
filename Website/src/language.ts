export const _data = {
    "zh-cn": {
        "com_unknown": "无法在语言文件中找到此条目的本地化文本。",
        "com_name": "Platinum",
        "com_author": "Flysoft",
        "com_close": "关闭",
        "cover_sub_placeholder": "一款占位占位的浏览器",
        "cover_sub_1_placeholder": "占",
        "cover_sub_1_part1": "一款",
        "cover_sub_1_part2": "的浏览器",
        "cover_sub_1_lightweight": "轻",
        "cover_sub_1_fast": "快",
        "cover_sub_1_powerful": "强",
        "cover_sub_2_part1": "一款",
        "cover_sub_2_part2": "的浏览器",
        "cover_sub_2_madeforyou": "为你而生",
        "download_title": "下载",
        "download_windows": "Windows 版",
        "download_linux": "Linux 版",
        "download_msstore": "从微软商店下载",
        "download_discord": "加入 Discord 服务器获取预览版",
        "download_qq": "加入 QQ 群获取预览版",
        "started_title": "下载已开始",
        "started_subtitle": "请稍等，这可能需要 5 到 10 秒……",
        "notice_content": "⚠️下载前提示: Windows 版需要 Windows 7 及以上版本的 Windows 操作系统运行，仅支持 64 位和 32 位操作系统。Linux 版仅支持 64 位操作系统，相对于 Windows 版阉割了一些功能。Microsoft Store 内的 UWP 版仅支持 64 位操作系统，且可能不是最新版的 Platinum，相对于 Windows 版阉割了一些功能。",
        "dev_title": "[use_com_name] 正在开发中",
        "dev_progress": "开发进度:",
        "dev_latest": "最新稳定版:",
        "dev_preview": "最新预览版:",
        "footer_home": "主站",
        "footer_privacy": "隐私政策",
        "footer_support": "支持",
        "footer_copyright": "© Flysoft [year]",
    },
    "zh-tw": {
        "com_unknown": "抱歉，我們暫時無法在語言檔案中找到此條目的當地語系化文字。",
        "com_name": "Platinum",
        "com_author": "Flysoft",
        "com_close": "關閉",
        "cover_sub_placeholder": "一款占位占位的瀏覽器",
        "cover_sub_1_placeholder": "占",
        "cover_sub_1_part1": "一款",
        "cover_sub_1_part2": "的瀏覽器",
        "cover_sub_1_lightweight": "輕",
        "cover_sub_1_fast": "快",
        "cover_sub_1_powerful": "強",
        "cover_sub_2_part1": "一款",
        "cover_sub_2_part2": "的瀏覽器",
        "cover_sub_2_madeforyou": "為你而生",
        "download_title": "下載",
        "download_windows": "Windows 版",
        "download_linux": "Linux 版",
        "download_msstore": "從 Microsoft Store 下載",
        "download_discord": "加入 Discord 伺服器以獲取預覽版",
        "download_qq": "加入 QQ 群以獲取預覽版",
        "started_title": "下載已開始",
        "started_subtitle": "請稍等，這可能需要5到10秒……",
        "notice_content": "⚠️下載前提示: Windows 版需要 Windows 7 及以上版本的 Windows 運行，僅支持 64-bit 和 32-bit 的作業系統。 Linux 版僅支持 64-bit 作業系統，相對於 Windows 版閹割了一些功能。Microsoft Store 內的 UWP 版僅支持 64-bit 作業系統，且可能不是最新版的 Platinum，相對於 Windows 版閹割了一些功能。",
        "dev_title": "[use_com_name] 正在開發中",
        "dev_progress": "開發進度:",
        "dev_latest": "最新穩定版:",
        "dev_preview": "最新預覽版:",
        "footer_home": "主頁",
        "footer_privacy": "隱私政策",
        "footer_support": "技術支援",
        "footer_copyright": "© Flysoft [year]",
    },
    "en-us": {
        "com_unknown": "Unknown",
        "com_name": "Platinum",
        "com_author": "Flysoft",
        "com_close": "Close",
        "cover_sub_placeholder": "A xxxxxxxxxxxx browser",
        "cover_sub_1_placeholder": "xxxxxxxxxxx",
        "cover_sub_1_part1": "A ",
        "cover_sub_1_part2": " browser",
        "cover_sub_1_lightweight": "lightweight",
        "cover_sub_1_fast": "fast",
        "cover_sub_1_powerful": "powerful",
        "cover_sub_2_part1": "A browser made for ",
        "cover_sub_2_part2": " ",
        "cover_sub_2_madeforyou": "You",
        "download_title": "Download",
        "download_windows": "For Windows",
        "download_linux": "For Linux",
        "download_msstore": "From Microsoft Store",
        "download_discord": "Join our Discord server to get the preview version",
        "download_qq": "Join our QQ group to get the preview version",
        "started_title": "Download started",
        "started_subtitle": "Please wait, this may take up to 10 seconds...",
        "notice_content": "⚠️Attention: Platinum for Windows requires Windows 7 and above, and it only supports 64-bit and 32-bit Windows. Platinum for Linux only supports 64-bit Linux. Platinum for UWP in the Microsoft Store only supports 64-bit operating systems, and maybe it is not the latest version of Platinum.",
        "dev_title": "[use_com_name] is still under development...",
        "dev_progress": "Progress:",
        "dev_latest": "Latest release: ",
        "dev_preview": "Latest preview: ",
        "footer_home": "Home",
        "footer_privacy": "Privacy Policy",
        "footer_support": "Support",
        "footer_copyright": "© Flysoft [year]",
    },
}
export var _name: string;

export function reload() {
    let _locale = navigator.language;
    if (_locale.indexOf("zh") != -1) {
        if (_locale.indexOf("zh-CN") != -1) _name = "zh-cn";
        else _name = "zh-tw";
    } else _name = "en-us";

    if (typeof document !== "undefined") {
        if (_name) {
            var texts = document.getElementsByClassName("text");
            for (var i = 0; i < texts.length; i++) {
                const element = <HTMLElement>texts.item(i);
                var domText = element.dataset.text || element.innerHTML;
                if (domText && domText.indexOf("{") != -1 && domText.indexOf("}") != -1) {
                    var domLang = get(domText);
                    element.innerText = domLang;
                    element.dataset.text = domText;
                }
            }
            var titles = document.getElementsByClassName("stitle");
            for (var i = 0; i < titles.length; i++) {
                const element = <HTMLElement>titles.item(i);
                var titleText = element.dataset["titletext"] || element.title || element.ariaLabel || element.ariaPlaceholder;
                if (titleText && titleText.indexOf("{") != -1 && titleText.indexOf("}") != -1) {
                    var titleLang = get(titleText);

                    if (element.title) element.title = titleLang;
                    if (element.ariaPlaceholder) element.ariaPlaceholder = titleLang;
                    element.ariaLabel = titleLang;
                    element.dataset["titletext"] = titleText;
                }
            }
        }
        var imgs = document.querySelectorAll("img");
        for (var i = 0; i < imgs.length; i++) {
            imgs.item(i).draggable = false;
        }
    }
}

export function get(msg: string, replace = [], fallback: boolean = true): string {
    if (msg.indexOf("{") != -1 && msg.indexOf("}") != -1) {
        msg = msg.replace("{", "").replace("}", "").replace(/\s+/g, "");
    }
    var data: string = _data[_name][msg];
    if (!data && !fallback) return null;
    if (!data && fallback) data = _data["en-us"][msg];
    if (!data && fallback) data = msg.replace(/_/g, ".");
    for (var i = 0; i < replace.length; i++) {
        data = data.replace("[" + i + "]", replace[i]);
    }
    let date = new Date();
    data = data.replace(/\[year\]/g, date.getFullYear().toString());
    let regexp = /(?<=\[use_)[^}]*(?=\])/;
    let match = data.match(regexp);
    if (match)
        data = data.replace("[use_" + match[0] + "]", get(match[0]));
    return data;
}

export function analyse(sourceLang: string, targetLangs: Array<string>) {
    let result: Record<string, Record<string, Array<string>>> = {};
    for (let i = 0; i < targetLangs.length; i++) {
        let targetLang = targetLangs[i];
        result[targetLang] = {
            missing: [],
            redundant: [],
        }
        for (const item in _data[sourceLang]) {
            if (!_data[targetLang][item]) result[targetLang].missing.push(item);
        }
        for (const item in _data[targetLang]) {
            if (!_data[sourceLang][item]) result[targetLang].redundant.push(item);
        }
    }
    return result;
}