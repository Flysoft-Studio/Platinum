(() => {
    let op = "!<OP>!";
    let videos = document.querySelectorAll("video");
    for (let i = 0; i < videos.length; i++) {
        let element = videos.item(i);
        if (op == "play") element.play();
        else if (op == "pause") element.pause();
        else if (op == "pip") element.requestPictureInPicture();
    }
    let audios = document.querySelectorAll("audio");
    for (let i = 0; i < audios.length; i++) {
        let element = audios.item(i);
        if (op == "play") element.play();
        else if (op == "pause") element.pause();
    }
})();