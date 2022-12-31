import { minimist, ParsedArgs } from "@p-mcgowan/minimist";
import { app } from "electron";

export let args: ParsedArgs;

if (app.isPackaged == true) {
    args = minimist(process.argv.slice(1));
} else {
    args = minimist(process.argv.slice(2));
}