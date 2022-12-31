export const _data = {
    "zh-cn": {
        "com_unknown": "无法在语言文件中找到此条目的本地化文本。",
        "com_name": "Platinum",
        "com_author": "Flysoft",
        "cover_title": "[use_com_name] 浏览器\n现已推出",
        "cover_sub": "一款轻、快、强的浏览器",
        "cover_dl": "下载",
        "cover_dl_win": "Windows 版",
        "cover_dl_linux": "Linux 版",
        "cover_dl_ms": "Microsoft Store",
        "started_title": "下载已开始",
        "started_sub": "请稍等，这可能需要 5 到 10 秒……",
        "started_close": "关闭",
    },
    "zh-tw": {
        "com_unknown": "抱歉，我們暫時無法在語言檔案中找到此條目的當地語系化文字。",
        "com_name": "Platinum",
        "com_author": "Flysoft",
        "cover_title": "[use_com_name]\n現已推出",
        "cover_sub": "一款輕、快、强的瀏覽器",
        "cover_dl": "下載",
        "cover_dl_win": "Windows 版",
        "cover_dl_linux": "Linux 版",
        "cover_dl_ms": "Microsoft Store",
        "started_title": "下載已開始",
        "started_sub": "請稍等，這可能需要 5 到 10 秒……",
        "started_close": "關閉",
    },
    "en-us": {
        "com_unknown": "Unknown",
        "com_name": "Platinum",
        "com_author": "Flysoft",
        "cover_title": "Introducing [use_com_name]",
        "cover_sub": "A lightweight, fast and powerful browser",
        "cover_dl": "Download",
        "cover_dl_win": "for Windows",
        "cover_dl_linux": "for Linux",
        "cover_dl_ms": "from Microsoft Store",
        "started_title": "Download started",
        "started_sub": "Please wait. This may take 5 to 10 seconds.",
        "started_close": "Close",
    },
}
export var _name = "en-us";
export var _locale;

export function reload() {
    _locale = navigator.language;
    if (_locale.indexOf("zh") != -1) {
        if (_locale.indexOf("zh-CN") != -1) _name = "zh-cn";
        else _name = "zh-tw";
    } else _name = "en-us";
    var texts = document.getElementsByClassName("text");
    for (var i = 0; i < texts.length; i++) {
        const element = texts.item(i);
        var domText = element.dataset.text || element.innerHTML;
        if (domText && domText.indexOf("{") != -1 && domText.indexOf("}") != -1) {
            var domLang = get(domText);
            element.innerText = domLang;
            element.dataset.text = domText;
        }
    }
    var imgs = document.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
        imgs.item(i).draggable = false;
    }
}

export function get(msg, replace = []) {
    if (msg.indexOf("{") != -1 && msg.indexOf("}") != -1) {
        msg = msg.replace("{", "").replace("}", "").replace(/\s+/g, "");
    }
    var data = _data[_name][msg];
    if (!data) {
        data = _data[_name]["com_unknown"];
    }
    for (var i = 0; i < replace.length; i++) {
        data = data.replace("[" + i + "]", replace[i]);
    }
    let date = new Date();
    data = data.replace(/\[year\]/g, date.getFullYear().toString());
    let match = data.match(/(?<=\[use_)[^}]*(?=\])/);
    if (match)
        data = data.replace("[use_" + match[0] + "]", get(match[0]));
    return data;
}