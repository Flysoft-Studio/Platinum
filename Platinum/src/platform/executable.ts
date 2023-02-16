import { existsSync } from "fs-extra";
import { release as osRelease } from "os";
import { normalize } from "path";
import { lte as verLte } from "semver";

// find a executable file for current platform and arch
export function findExecutable(
    baseDir: string,
    fileName: string,
    findMacOSMajor: boolean
) {
    // executable path
    let executable: string;
    // get macOS major version
    let versions: string;
    if (process.platform == "darwin" && findMacOSMajor)
        if (verLte("12.0", osRelease())) versions = "monterey";
        else if (verLte("11.0", osRelease())) versions = "bigsur";
        else if (verLte("10.15", osRelease())) versions = "catalina";
    let setExecutablePath = (arch: string) => {
        // alias
        if (arch == "i386") arch = "ia32";
        if (arch == "x32") arch = "ia32";
        let ext: string = "";
        if (process.platform == "win32") ext = ".exe";
        let path = baseDir + "/" + process.platform + "/" + arch;
        if (process.platform == "darwin" && findMacOSMajor)
            if (versions) path += "/" + versions;
            else return false;
        executable = normalize(path + "/" + fileName + ext);
        return existsSync(executable);
    };
    if (!setExecutablePath(process.arch))
        if (!setExecutablePath("ia32"))
            throw new Error(
                "No executable available for this platform or this arch, you're in " +
                    process.platform +
                    " " +
                    process.arch
            );
    return executable;
}
