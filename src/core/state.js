import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const TRAIT_DIR = ".trait";
export const LOCK_NAME = "lock.json";

export function readLock(root) {
  const path = join(root, TRAIT_DIR, LOCK_NAME);
  if (!existsSync(path)) return { version: 1, traits: {} };

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed?.version !== 1 || !parsed?.traits || typeof parsed.traits !== "object") {
      throw new Error("unsupported lock format");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Could not read ${TRAIT_DIR}/${LOCK_NAME}: ${error.message}`);
  }
}

export function writeLock(root, lock) {
  const dir = join(root, TRAIT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, LOCK_NAME), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

export function recordTrait(root, loaded, agent) {
  const lock = readLock(root);
  lock.traits[loaded.manifest.name] = {
    version: loaded.manifest.version,
    source: loaded.source,
    checksum: loaded.checksum,
    installedAt: new Date().toISOString(),
    agent
  };
  writeLock(root, lock);
}

export function forgetTrait(root, name) {
  const lock = readLock(root);
  if (!lock.traits[name]) return false;
  delete lock.traits[name];
  writeLock(root, lock);
  return true;
}
