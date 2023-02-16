import fetch = require("node-fetch");

async function getData(provider: Browser.FSDownloadProvider, parent = "0", page = 0) {
    let url =
        "https://www.123pan.com/api/share/get?Page=1&limit=1000&next=" +
        page +
        "&orderBy=share_id&orderDirection=desc&shareKey=" +
        provider.shareKey +
        "&SharePwd=" +
        provider.sharePwd +
        "&ParentFileId=" +
        parent;
    let response = await (await fetch(url)).json();
    if (response["code"] != 0)
        throw new Error("Request " + url + " failed: " + JSON.stringify(response));
    return response["data"]["InfoList"];
}

function getFileObject(data, fileName) {
    for (let i = 0; i < data.length; i++) {
        if (data[i]["FileName"].toUpperCase() == fileName.toUpperCase()) {
            return data[i];
        }
    }
    return null;
}

export async function getURL(updateInfo: Browser.UpdateInfo) {
    let provider = updateInfo.provider;
    let folderObj = getFileObject(await getData(provider), provider.folder);
    if (!folderObj) throw new Error("Cannot find folder: " + provider.folder);
    let folderID = folderObj["FileId"];
    let fileObj = getFileObject(await getData(provider, folderID), provider.file);
    if (!fileObj) throw new Error("Cannot find file: " + provider.file);
    return fileObj["DownloadUrl"];
}
