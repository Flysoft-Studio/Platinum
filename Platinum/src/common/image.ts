import { randomUUID } from "crypto";
import { app } from "electron";
import { ensureDirSync, readFileSync } from "fs-extra";
import { extname, normalize } from "path";
import { runWrapper } from "../platform/wrapper";

export function getImageMIME(filePath: string) {
    let fileExt = extname(filePath);
    let fileMIME: string;
    switch (fileExt) {
        case ".gif":
            fileMIME = "image/gif";
            break;
        case ".jpg":
            fileMIME = "image/jpeg";
            break;
        case ".jpeg":
            fileMIME = "image/jpeg";
            break;
        case ".png":
            fileMIME = "image/png";
            break;
        case ".svg":
            fileMIME = "image/svg+xml";
            break;
        case ".webp":
            fileMIME = "image/webp";
            break;
        default:
            fileMIME = "image/jpeg";
            break;
    }
    return fileMIME;
}

export async function getImageData(filePath: string, fileMIME: string, SVGToPNG: boolean = true) {
    let fileData = readFileSync(filePath);
    if (fileMIME == "image/svg+xml" && SVGToPNG) {
        let fileDataBase64 = await runWrapper(`
            const sharp = require("sharp");

            process.stdout.write(
                (await sharp(Buffer.from("` + fileData.toString("base64") + `","base64"))
                    .toFormat("png")
                    .toBuffer())
                .toString("base64"));
            process.exit(0);
        `);
        fileData = Buffer.from(fileDataBase64, "base64");
        fileMIME = "image/png";
    }

    return {
        data: fileData,
        mime: fileMIME,
    }
}

export function imageDataToBase64(fileData: Buffer, fileMIME: string) {
    return "data:" + fileMIME + ";base64," + fileData.toString("base64");
}

export async function resizeImage(fileData: Buffer, width: number, height: number) {
    let fileDataBase64 = await runWrapper(`
        const sharp = require("sharp");

        process.stdout.write(
            (await sharp(Buffer.from("` + fileData.toString("base64") + `","base64"))
                .resize(`+ width + `, ` + height + `)
                .toFormat("png")
                .toBuffer())
            .toString("base64"));
        process.exit(0);
    `);
    fileData = Buffer.from(fileDataBase64, "base64");
    return {
        data: fileData,
        mime: "image/png",
    }
}

export async function genIcon(fileData: Buffer, fileOutPath: string, sizes: Array<number> = [16, 24, 32, 48, 64, 128, 256]) {
    let iconFileDir = normalize(app.getPath("temp") + "/platinum.desktop.icons.{" + randomUUID() + "}");
    ensureDirSync(iconFileDir);
    await runWrapper(`
        const { writeFileSync } = require("fs");
        const { normalize, basename, extname, dirname } = require("path");
        const sharp = require("sharp");
        const icongen = require("icon-gen");

        let fileObj = await require("sharp")(Buffer.from("` + fileData.toString("base64") + `","base64"));
        let fileDir = Buffer.from("`+ Buffer.from(iconFileDir).toString("base64") + `","base64").toString();
        let fileOutPath = Buffer.from("`+ Buffer.from(fileOutPath).toString("base64") + `","base64").toString();

        // generate different sizes of png for the .ico file
        for (const size of `+ JSON.stringify(sizes) + `) {
            writeFileSync(normalize(fileDir + "/" + size + ".png"), await fileObj.resize(size, size).png().toBuffer());
        }

        await icongen(fileDir, dirname(fileOutPath), {
            report: false,
            ico: {
                name: basename(fileOutPath, extname(fileOutPath)),
                sizes: `+ JSON.stringify(sizes) + `,
            },
        });
        process.exit(0);
    `);
}