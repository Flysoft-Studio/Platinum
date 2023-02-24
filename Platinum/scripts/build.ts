import { createHash } from "crypto";
import fs from "fs-extra";
import path from "path";
import { Arch, build, Configuration, Platform } from "electron-builder";

async function main() {
    const pkgFile = "./package.json";
    const pkg = JSON.parse(fs.readFileSync(pkgFile).toString());
    pkg.name = "platinum";
    fs.writeFileSync(pkgFile, JSON.stringify(pkg));

    const isPreview = pkg.version.indexOf("pre") != -1;
    const options: Configuration = {
        electronDownload: {
            mirror: process.env["ELECTRON_MIRROR"],
        },
        icon: "./" + (isPreview ? "platinum_preview.png" : "platinum.png"),
        productName: "Platinum Browser",
        appId: "com.flysoft.platinum",
        extraResources: [
            "./data/**",
            "./engine/aria2_default.conf",
            "./engine/" + process.platform + "/**",
            "./platform/" + process.platform + "/**",
            "./icon.png",
        ],
        files: [
            "**/*",
            "build/**",
            "!msstore/**",
            "!{src,scripts,dist}/**",
            "!{platform,engine}/**",
            // remove useless sharp files
            "!**/node_modules/**/sharp/{src,install}",
            process.platform == "win32" ? "!**/node_modules/**/sharp/{vendor}" : null,
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
            "!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json,.npmrc}",
            "!**/{tsconfig.json,jsconfig.json}",
        ].filter(Boolean) as string[],
        compression: "maximum",
        win: {
            publisherName: "Flysoft",
            target: ["nsis", "dir"],
        },
        deb: {
            afterInstall: "./scripts/postinst.tpl",
        },
        linux: {
            icon: "./512x512.png",
            category: "Network",
            target: ["deb"],
            asarUnpack: ["**/node_modules/sharp/**"],
        },
        mac: {
            icon: "./" + (isPreview ? "platinum_preview.icns" : "platinum.icns"),
            category: "public.app-category.productivity",
            target: ["dmg"],
            darkModeSupport: true,
        },
        nsis: {
            oneClick: false,
            perMachine: false,
            allowToChangeInstallationDirectory: true,
            runAfterFinish: false,
            installerIcon: "./platinum_installer.ico",
            uninstallerIcon: "./platinum_installer.ico",
            installerHeaderIcon:
                "./" + (isPreview ? "platinum_preview.ico" : "platinum.ico"),
            createDesktopShortcut: true,
            createStartMenuShortcut: true,
            include: "./scripts/install.nsh",
        },
    };

    console.log("Platinum Builder");
    console.log("Version: " + pkg.version);

    let target = (() => {
        if (process.platform == "linux")
            return Platform.LINUX.createTarget(undefined, Arch.x64);
        else if (process.platform == "win32")
            return Platform.WINDOWS.createTarget(undefined, Arch.x64, Arch.ia32);
        else if (process.platform == "darwin")
            return Platform.MAC.createTarget(undefined, Arch.x64, Arch.arm64);
        else {
            throw new Error("No valid target");
        }
    })();

    let result = await build({
        targets: target,
        config: options,
    });
    let dist = path.resolve(path.dirname(result[0]) + "/publish");
    if (!fs.existsSync(dist)) fs.mkdirSync(dist);
    console.log("Dist path: " + dist);
    let exeName: string | undefined;
    for (let i = 0; i < result.length; i++) {
        if (result[i].indexOf(".blockmap") == -1) {
            await new Promise<void>((resolve) => {
                let exe = result[i];
                const stream = fs.createReadStream(exe);
                const hash = createHash("md5");
                stream.on("data", (chunk) => {
                    hash.update(chunk);
                });
                stream.on("end", () => {
                    const md5 = hash.digest("hex");
                    let channelString = isPreview ? "preview" : "latest";

                    let arch = "x64";
                    if (path.basename(exe).indexOf("ia32") != -1) arch = "ia32";
                    if (path.basename(exe).indexOf("i386") != -1) arch = "ia32";
                    if (path.basename(exe).indexOf("x32") != -1) arch = "ia32";
                    if (path.basename(exe).indexOf("arm64") != -1) arch = "arm64";
                    if (process.platform == "win32") arch = "all";
                    exeName =
                        pkg.name + "_" + channelString + "_" + arch + path.extname(exe);
                    fs.renameSync(exe, path.resolve(dist + "/" + exeName));
                    fs.writeFileSync(
                        path.resolve(
                            dist +
                                "/" +
                                channelString +
                                "_" +
                                process.platform +
                                "_" +
                                arch +
                                ".json"
                        ),
                        JSON.stringify({
                            version: pkg.version,
                            hash: md5,
                            provider: {
                                shareKey: "hfH9-kj2OA",
                                sharePwd: "fspl",
                                folder: "Platinum",
                                file: exeName,
                            },
                        })
                    );
                    resolve();
                });
            });
        } else {
            fs.rmSync(result[i]);
        }
    }
    if (!exeName) throw new Error("No valid build dist found");
    pkg.name = "platinum-dev";
    fs.writeFileSync(pkgFile, JSON.stringify(pkg));
    console.log("Build successful: " + exeName);
}

main();
