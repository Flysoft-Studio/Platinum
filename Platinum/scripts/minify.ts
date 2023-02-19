import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { resolve } from "path";
import UglifyJS from "uglify-js";
import JavaScriptObfuscator from "javascript-obfuscator";

// these files shouldn't be minified
const exclude = ["mediaInfo.js", "mediaControl.js"];
const seed = rand(5, 15);

compress("./build");

function compress(dir: string) {
    let files = readdirSync(dir);
    for (let i = 0; i < files.length; i++) {
        const fileName = files[i];
        const filePath = dir + "/" + fileName;
        if (statSync(filePath).isDirectory()) {
            compress(filePath);
            continue;
        }

        if (exclude.includes(fileName)) continue;
        let raw = readFileSync(filePath).toString();
        // console.log(fileName + ": Obfuscating");
        // let obfuscate = JavaScriptObfuscator.obfuscate(raw, {
        //     compact: true,
        //     controlFlowFlattening: true,
        //     deadCodeInjection: true,
        //     splitStrings: true,
        //     target: "node",
        //     log: false,
        //     unicodeEscapeSequence: true,
        //     disableConsoleOutput: false,
        //     selfDefending: true,
        //     seed: seed,
        // });
        console.log(fileName + ": Minifying");
        let result = UglifyJS.minify(raw, {
            warnings: "verbose",
            mangle: true,
            toplevel: true,
            compress: {
                passes: seed,
                unsafe: true,
                booleans: true,
                loops: true,
                reduce_vars: true,
                global_defs: {
                    DEBUG: false,
                },
            },
            parse: {
                bare_returns: true,
                html5_comments: false,
            },
            output: {
                quote_style: 1,
                wrap_iife: true,
                // ascii_only: true,
                beautify: false,
            },
        });
        writeFileSync(filePath, result.code);
    }
}

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
