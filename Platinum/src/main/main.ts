import { args } from "./args";

console.log("Platinum Browser - " + (args["run-as-instance"] ? "instance" : "manager"));

if (args["run-as-instance"]) require("./instance");
else require("./manager");
