import axios from "axios";
import { existsSync, writeFileSync } from "fs-extra";

async function main() {
    // download fontawesome library
    const fajsPath = "./libs/fontawesome.js";
    if (!existsSync(fajsPath)) {
        writeFileSync(
            fajsPath,
            (
                await axios.get(
                    "https://site-assets.fontawesome.com/releases/v6.3.0/js/all.js"
                )
            ).data
        );
    }
}

main();
