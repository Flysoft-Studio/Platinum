import ts from "typescript";
import electron from "electron";
import { spawn } from "child_process";

let args = process.argv.slice(2);

function watch(afterProgramCreateOnce: () => void) {
    let configFile = ts.findConfigFile("./", ts.sys.fileExists);
    if (!configFile) {
        throw new Error("Could not find a valid 'tsconfig.json'.");
    }

    const createProgram = ts.createEmitAndSemanticDiagnosticsBuilderProgram;

    // Note that there is another overload for `createWatchCompilerHost` that takes
    // a set of root files.
    const host = ts.createWatchCompilerHost(configFile, undefined, ts.sys, createProgram);

    let firstCreate = true;
    const origPostProgramCreate = host.afterProgramCreate;
    host.afterProgramCreate = (program) => {
        origPostProgramCreate!(program);
        if (firstCreate) afterProgramCreateOnce();
        firstCreate = false;
    };

    ts.createWatchProgram(host);
}

watch(() => {
    spawn(electron as unknown as string, ["./", ...args], {
        stdio: "inherit",
        shell: false,
    });
});
