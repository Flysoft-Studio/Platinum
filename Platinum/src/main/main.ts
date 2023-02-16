import { args } from "./args";
const pkg = require("../../package.json");

console.log(
    "Platinum Browser " +
        pkg.version +
        " - " +
        (args["run-as-instance"] ? "instance" : "manager")
);

if (args["run-as-instance"]) require("./instance");
else require("./manager");
