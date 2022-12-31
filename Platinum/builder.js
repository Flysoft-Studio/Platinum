const {
    createHash
} = require("crypto");
const builder = require("electron-builder");
const {
    writeFileSync,
    existsSync,
    mkdirSync,
    renameSync,
    createReadStream,
    readFileSync,
    rmSync
} = require("fs");
const {
    dirname,
    resolve,
    extname,
    basename
} = require("path");
const pkgFile = "./package.json";
const pkg = JSON.parse(readFileSync(pkgFile).toString());
const isPreview = pkg.version.indexOf("pre") != -1;
/**
 * @type {import("electron-builder").Configuration}
 */
const options = {
    "electronDownload": {
        "mirror": "https://npmmirror.com/mirrors/electron/",
    },
    "icon": "./" + ((isPreview) ? "platinum_preview.png" : "platinum.png"),
    "productName": "Platinum Browser",
    "appId": "com.flysoft.platinum",
    "extraResources": [
        "./data/**",
        "./engine/aria2_default.conf",
        "./engine/" + process.platform + "/**",
        "./platform/" + process.platform + "/**",
        "./wrapper/" + process.platform + "/**",
        "./icon.png",
    ],
    "files": [
        "**/*",
        "build/**",
        "!NOTICE",
        "!*.js",
        "!**/*.nsh",
        "!msstore/**",
        "!src/**",
        "!docker/**",
        "!dist/**",
        "!vercel/**",
        "!engine/**",
        "!platform/**",
        "!wrapper/**",
        "!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}",
        "!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}",
        "!**/node_modules/*.d.ts",
        "!**/node_modules/.bin",
        "!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}",
        "!.editorconfig",
        "!**/._*",
        "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}",
        "!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.vscode,.nyc_output}",
        "!**/{appveyor.yml,.travis.yml,circle.yml}",
        "!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}",
        "!**/{tsconfig.json,jsconfig.json}",
    ],
    "compression": "maximum",
    "win": {
        "publisherName": "Flysoft",
        "target": [
            "nsis",
            "dir",
        ],
    },
    "linux": {
        "category": "Network",
        "target": [
            "AppImage",
        ],
    },
    "nsis": {
        "oneClick": false,
        "perMachine": true,
        "allowToChangeInstallationDirectory": true,
        "runAfterFinish": false,
        "installerIcon": "./platinum_installer.ico",
        "uninstallerIcon": "./platinum_installer.ico",
        "installerHeaderIcon": "./platinum.ico",
        "createDesktopShortcut": true,
        "createStartMenuShortcut": true,
        "include": "./install.nsh",
    },
}
console.log("Platinum Builder");
console.log("Version: " + pkg.version);
let target;
if (process.platform == "linux") target = builder.Platform.LINUX.createTarget(undefined, builder.Arch.x64);
else if (process.platform == "win32") target = builder.Platform.WINDOWS.createTarget(undefined, builder.Arch.x64);
else if (process.platform == "darwin") target = builder.Platform.MAC.createTarget(undefined, builder.Arch.x64, builder.Arch.arm64);
else {
    console.log("[Error] No valid target.");
    process.exit(-1);
}
pkg.name = "platinum";
writeFileSync(pkgFile, JSON.stringify(pkg));
builder.build({
    targets: target,
    config: options,
}).then((result) => {
    if (result.length != 0) {
        let dist = resolve(dirname(result[0]) + "/publish");
        if (!existsSync(dist)) mkdirSync(dist);
        console.log("Dist path: " + dist);
        for (let i = 0; i < result.length; i++) {
            if (result[i].indexOf(".blockmap") == -1) {
                let exe = result[i];
                const stream = createReadStream(exe);
                const hash = createHash("md5");
                stream.on("data", (chunk) => {
                    hash.update(chunk);
                });
                stream.on("end", () => {
                    const md5 = hash.digest("hex");
                    let channelString = (isPreview ? "preview" : "latest");

                    let arch = "x64";
                    if (basename(exe).indexOf("ia32") != -1) arch = "ia32";
                    if (basename(exe).indexOf("i386") != -1) arch = "ia32";
                    if (basename(exe).indexOf("x32") != -1) arch = "ia32";
                    if (basename(exe).indexOf("arm64") != -1) arch = "arm64";
                    if (process.platform == "win32") arch = "all";
                    let exeName = pkg.name + "_" + channelString + "_" + arch + extname(exe);
                    renameSync(exe, resolve(dist + "/" + exeName));
                    writeFileSync(resolve(dist + "/" + channelString + "_" + process.platform + "_" + arch + ".json"), JSON.stringify({
                        version: pkg.version,
                        hash: md5,
                        provider: {
                            shareKey: "hfH9-kj2OA",
                            sharePwd: "fspl",
                            folder: "Platinum",
                            file: exeName,
                        }
                    }));
                    pkg.name = "platinum-dev";
                    writeFileSync(pkgFile, JSON.stringify(pkg));
                    console.log("Build successful: " + exeName);
                });
            } else {
                rmSync(result[i]);
            }
        }
    }
}).catch((error) => {
    console.error(error);
});