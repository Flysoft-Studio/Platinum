const { runInThisContext } = require("vm");

process.stdin.on("data", (chunk) => {
    runInThisContext("async(exports,require,module,__filename,__dirname)=>{" + chunk.toString() + "}")(exports, require, module, __filename, __dirname);
});

