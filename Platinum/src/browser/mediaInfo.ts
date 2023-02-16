(() => {
    let meta = document.getElementsByTagName("meta");
    let getMeta = (value: string, prop: string) => {
        let element = <HTMLMetaElement>(
            document.querySelector("head>meta[" + prop + '="' + value + '"]')
        );
        if (element) return element.content;
        else return null;
    };

    let title = getMeta("name", "itemprop");
    if (!title) title = getMeta("og:title", "property");
    if (!title) title = getMeta("description", "itemprop");
    if (!title) title = getMeta("og:description", "property");
    if (!title) title = document.title;

    let author = getMeta("author", "itemprop");
    if (!author) author = getMeta("og:author", "property");

    let cover = getMeta("image", "itemprop");
    if (!cover) cover = getMeta("og:image", "property");
    if (!cover) cover = getMeta("thumbnailUrl", "itemprop");
    if (!cover) {
        let videos = document.querySelectorAll("video");
        for (let i = 0; i < videos.length; i++) {
            const video = videos.item(i);
            if (video.poster && video.poster != "") {
                cover = video.poster;
                break;
            }
        }
    }

    return {
        title: title,
        author: author,
        cover: cover,
    } as Browser.MediaInfo;
})();
