import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../package.json");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

export const VERSION = packageJson.version;
