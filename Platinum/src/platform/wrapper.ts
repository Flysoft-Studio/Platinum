import { findExecutable } from "../platform/executable";
import { spawn } from "child_process";
import { normalize } from "path";
import { getDir } from "../common/dir";
import electron = require("electron");

const dir = getDir(electron);

// nodejs executable file path
const executable = findExecutable(dir.asarDirname + "/wrapper", "node", true);
// wrapper.js file path
const wrapperFile = normalize(dir.asarDirname + "/wrapper/" + process.platform + "/" + process.arch + "/wrapper.js");

export async function runWrapper(script: string) {
    return await new Promise<string>((resolve, reject) => {
        let wrapper = spawn(executable, [wrapperFile], {
            shell: false,
            windowsHide: true,
            detached: false,
        });
        wrapper.stdin.write(script);
        let stdout = "";
        wrapper.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        wrapper.stderr.pipe(process.stderr);
        wrapper.on("exit", () => {
            resolve(stdout);
        });
        wrapper.on("error", (error) => {
            reject(error);
        });
    });
}