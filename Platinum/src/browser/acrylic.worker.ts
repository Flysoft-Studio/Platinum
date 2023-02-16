let stackblur = require("stackblur-canvas");

onmessage = (event) => {
    let pixels = event.data;
    postMessage(
        stackblur.imageDataRGB(
            new ImageData(
                new Uint8ClampedArray(pixels.data as Buffer),
                pixels.shape[0],
                pixels.shape[1]
            ),
            0,
            0,
            pixels.shape[0],
            pixels.shape[1],
            180
        )
    );
};
