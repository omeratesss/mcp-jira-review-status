import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgJson = JSON.parse(readFileSync(resolve(here, "..", "package.json"), "utf8"));

export const VERSION: string = pkgJson.version;
export const PACKAGE_NAME: string = pkgJson.name;
