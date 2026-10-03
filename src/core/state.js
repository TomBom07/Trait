import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export const TRAIT_DIR = ".trait";
export const LOCK_NAME = "lock.json";

export function ensureTraitWorkspace(root) {
  const dir = join(root, TRAIT_DIR);
  mkdirSync(join(dir, "runs"), { recursive: true });
  mkdirSync(join(dir, "evidence"), { recursive: true });
  reconcileIgnoreFile(join(dir, ".gitignore"));
  return dir;
}

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
  const dir = ensureTraitWorkspace(root);
  writeFileSync(join(dir, LOCK_NAME), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

export function recordTrait(root, loaded, agent, evidence = null) {
  const lock = readLock(root);
  const previous = lock.traits[loaded.manifest.name];
  const now = new Date().toISOString();
  lock.traits[loaded.manifest.name] = {
    version: loaded.manifest.version,
    source: loaded.source,
    checksum: loaded.checksum,
    installedAt: previous?.installedAt ?? now,
    ...(previous ? { updatedAt: now } : {}),
    agent,
    relations: loaded.manifest.relations ?? {},
    ...(evidence ? {
      verification: {
        status: evidence.receipt.overall,
        verifiedAt: evidence.receipt.verifiedAt,
        evidence: evidence.receiptPath
      }
    } : {})
  };
  writeLock(root, lock);
}

export function forgetTrait(root, name) {
  const lock = readLock(root);
  if (!lock.traits[name]) return false;
  delete lock.traits[name];
  writeLock(root, lock);

  const receiptPath = join(root, TRAIT_DIR, "evidence", `${name.replaceAll("/", "--")}.json`);
  if (existsSync(receiptPath)) unlinkSync(receiptPath);
  return true;
}

function reconcileIgnoreFile(path) {
  const existing = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  const lines = existing.filter((line) => line && line !== "evidence/");
  if (!lines.includes("runs/")) lines.push("runs/");
  if (!lines.includes("cache/")) lines.push("cache/");

  const next = `${lines.join("\n")}\n`;
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (current !== next) writeFileSync(path, next, "utf8");
}
