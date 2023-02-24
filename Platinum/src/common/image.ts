import { randomUUID } from "crypto";
import { app } from "electron";
import { ensureDirSync, readFileSync, writeFileSync } from "fs-extra";
import { basename, dirname, extname, normalize } from "path";
import sharp from "sharp";
import icongen from "../../icon-gen";

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

export async function getImageData(
    filePath: string,
    fileMIME: string,
    SVGToPNG: boolean = true
) {
    let fileData = readFileSync(filePath);
    if (fileMIME == "image/svg+xml" && SVGToPNG) {
        fileData = await sharp(Buffer.from(fileData)).toFormat("png").toBuffer();
        fileMIME = "image/png";
    }

    return {
        data: fileData,
        mime: fileMIME,
    };
}

export function imageDataToBase64(fileData: Buffer, fileMIME: string) {
    return "data:" + fileMIME + ";base64," + fileData.toString("base64");
}

export async function resizeImage(fileData: Buffer, width: number, height: number) {
    fileData = await sharp(fileData).resize(width, height).toFormat("png").toBuffer();
    return {
        data: fileData,
        mime: "image/png",
    };
}

export async function genIcon(
    fileData: Buffer,
    fileOutPath: string,
    sizes: Array<number> = [16, 24, 32, 48, 64, 128, 256]
) {
    let iconFileDir = normalize(
        app.getPath("temp") + "/platinum.desktop.icons.{" + randomUUID() + "}"
    );
    ensureDirSync(iconFileDir);
    let fileObj = sharp(fileData);
    for (const size of sizes) {
        writeFileSync(
            normalize(iconFileDir + "/" + size + ".png"),
            await fileObj.resize(size, size).png().toBuffer()
        );
    }
    icongen(iconFileDir, dirname(fileOutPath), {
        report: false,
        ico: {
            name: basename(fileOutPath, extname(fileOutPath)),
            sizes: sizes,
        },
    });
}
