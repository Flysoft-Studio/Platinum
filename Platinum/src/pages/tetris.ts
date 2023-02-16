import { ipcRenderer } from "electron";
import * as lang from "../common/language";

ipcRenderer.on("lang", (event, language: string) => {
    lang.reload(language);
});

ipcRenderer.on("load", (event) => {
    const blockWidth = 30,
        blockHeight = 30,
        xBlocks = 12,
        yBlocks = 18,
        dpi = 2;
    const canvasWidth = blockWidth * xBlocks,
        canvasHeight = blockHeight * yBlocks;

    let canvas = <HTMLCanvasElement>document.querySelector(".game");
    canvas.width = (canvasWidth + 1) * dpi;
    canvas.height = (canvasHeight + 1) * dpi;
    canvas.style.width = canvasWidth + "px";
    canvas.style.height = canvasHeight + "px";
    let ctx = canvas.getContext("2d");
    let map: string[][] = [];

    const blocks = [
        {
            color: "red",
            rect: [
                [1, 1],
                [1, 1],
            ],
        },
        {
            color: "blue",
            rect: [[1], [1], [1], [1]],
        },
        {
            color: "yellow",
            rect: [
                [0, 1, 1],
                [1, 1, 0],
            ],
        },
        {
            color: "green",
            rect: [
                [1, 1, 0],
                [0, 1, 1],
            ],
        },
        {
            color: "orange",
            rect: [
                [1, 0],
                [1, 0],
                [1, 1],
            ],
        },
        {
            color: "pink",
            rect: [
                [0, 1],
                [0, 1],
                [1, 1],
            ],
        },
        {
            color: "purple",
            rect: [
                [0, 1, 0],
                [1, 1, 1],
            ],
        },
    ];

    let score = 0,
        curX = 0,
        curY = 0,
        block: { color: any; rect: any };

    function drawBlock(x: number, y: number) {
        ctx.fillStyle = block.color;
        for (let i = 0; i < block.rect.length; i++) {
            for (let j = 0; j < block.rect[i].length; j++) {
                let point = block.rect[i][j];
                if (point == 1) {
                    ctx.fillRect(
                        (j + x) * blockWidth * dpi,
                        (i + y) * blockHeight * dpi,
                        blockWidth * dpi,
                        blockHeight * dpi
                    );
                }
            }
        }
    }

    function drawMap() {
        for (let i = 0; i < map.length; i++) {
            for (let j = 0; j < map[i].length; j++) {
                let color = map[i][j];
                if (color != "") {
                    ctx.lineWidth = 1 * dpi;
                    ctx.fillStyle = color;
                    ctx.fillRect(
                        j * blockWidth * dpi,
                        i * blockHeight * dpi,
                        blockWidth * dpi,
                        blockHeight * dpi
                    );
                }
            }
        }
    }

    function drawBackground() {
        ctx.strokeStyle = "rgb(100,100,100)";
        for (var i = 0; i <= xBlocks; i++) {
            ctx.beginPath();
            ctx.moveTo(i * blockWidth * dpi, 0);
            ctx.lineTo(i * blockWidth * dpi, blockHeight * yBlocks * dpi);
            ctx.stroke();
            ctx.closePath();
        }
        for (var i = 0; i <= yBlocks; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * blockHeight * dpi);
            ctx.lineTo(blockWidth * xBlocks * dpi, i * blockHeight * dpi);
            ctx.stroke();
            ctx.closePath();
        }
    }

    function randBlock() {
        curX = Math.floor(Math.random() * (xBlocks - 4));
        curY = 0;
        block = blocks[Math.floor(Math.random() * blocks.length)];
        if (isLanded()) stopped = true;
    }

    function isLRMovable(left: boolean) {
        for (let i = 0; i < block.rect.length; i++) {
            if (left) {
                if (curX <= 0) return false;
            } else {
                if (curX + block.rect[i].length >= xBlocks) return false;
            }

            for (let j = 0; j < block.rect[i].length; j++) {
                let point = block.rect[i][j];
                if (point == 1 && map[curY + i][curX + j + (left ? -1 : 1)] != "")
                    return false;
            }
        }

        return true;
    }

    function isLanded() {
        for (let i = 0; i < block.rect.length; i++) {
            if (yBlocks <= curY + block.rect.length) return true;
            for (let j = 0; j < block.rect[i].length; j++) {
                let point = block.rect[i][j];
                if (point == 1 && map[curY + i + 1][curX + j] != "") return true;
            }
        }
        return false;
    }

    function draw() {
        ctx.clearRect(0, 0, canvasWidth * dpi, canvasHeight * dpi);
        drawMap();
        drawBlock(curX, curY);
        drawBackground();
        drawText(
            lang.get("tetris_score", [score.toString()]),
            28 * dpi,
            10 * dpi,
            10 * dpi,
            "left",
            "top"
        );
        if (stopped)
            drawText(
                lang.get("tetris_gameover"),
                28 * dpi,
                (canvasWidth / 2) * dpi,
                (canvasHeight / 2) * dpi,
                "center",
                "middle"
            );
    }

    function land() {
        if (isLanded()) {
            for (let i = 0; i < block.rect.length; i++) {
                for (let j = 0; j < block.rect[i].length; j++) {
                    let point = block.rect[i][j];
                    if (point == 1 && (map[curY + i][curX + j] != "" || curY == 0)) {
                        stopped = true;
                        return false;
                    }
                }
            }
            for (let i = 0; i < block.rect.length; i++) {
                for (let j = 0; j < block.rect[i].length; j++) {
                    let point = block.rect[i][j];
                    if (point == 1) {
                        map[curY + i][curX + j] = block.color;
                    }
                }
            }
            addScore();
            randBlock();
        }
        return true;
    }

    function rotate() {
        let newRect: number[][] = [];
        for (let i = block.rect.length - 1; i >= 0; i--) {
            for (let j = 0; j < block.rect[i].length; j++) {
                if (!newRect[j]) newRect[j] = [];
                newRect[j].push(block.rect[i][j]);
                if (map[curY + j][curX + i] != "") return false;
            }
        }
        block.rect = newRect;
        return true;
    }

    function addScore() {
        for (let i = 0; i < map.length; i++) {
            let blockCount = 0;
            for (let j = 0; j < map[i].length; j++) {
                let color = map[i][j];
                if (color != "") blockCount++;
            }
            if (blockCount >= xBlocks) {
                score += 10;
                for (let j = i; j >= 1; j--) {
                    map[j] = map[j - 1];
                }
            }
        }
    }

    function drawText(
        text: string,
        fontSize: number,
        x: number,
        y: number,
        align: CanvasTextAlign,
        baseline: CanvasTextBaseline
    ) {
        ctx.fillStyle = "white";
        ctx.textAlign = align;
        ctx.textBaseline = baseline;
        ctx.font = fontSize + "px sans-serif";
        ctx.fillText(text, x, y);
    }

    function loop() {
        if (stopped) draw();
        else {
            land();
            if (!stopped) {
                draw();
                curY++;
            }
        }
        setTimeout(() => loop(), 500);
    }

    let stopped = false;

    function start() {
        stopped = false;
        map = [];
        score = 0;
        for (let i = 0; i < yBlocks; i++) {
            let x = [];
            for (let j = 0; j < xBlocks; j++) {
                x.push("");
            }
            map.push(x);
        }
        randBlock();
    }

    start();
    loop();

    window.addEventListener("keydown", (event) => {
        if (event.key == " ") {
            start();
        }
        if (!stopped)
            if (event.key == "ArrowLeft") {
                if (!isLRMovable(true)) return;
                curX--;
                draw();
            } else if (event.key == "ArrowRight") {
                if (!isLRMovable(false)) return;
                curX++;
                draw();
            } else if (event.key == "ArrowUp") {
                rotate();
                draw();
            } else if (event.key == "ArrowDown") {
                if (!isLanded()) curY++;
                land();
                draw();
            }
    });
});
