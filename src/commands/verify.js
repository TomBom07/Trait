import { loadManifest } from "../core/manifest.js";
import { readLock } from "../core/state.js";
import { verifyProject } from "../core/verify.js";

export function verifyCommand(name, root) {
  const lock = readLock(root);
  const targets = name ? [[name, lock.traits[name]]] : Object.entries(lock.traits);

  if (name && !lock.traits[name]) throw new Error(`Trait "${name}" is not installed`);
  if (targets.length === 0) {
    process.stdout.write("No traits installed.\n");
    return 0;
  }

  let failed = false;
  for (const [traitName, locked] of targets) {
    const source = sourceFromLock(locked.source);
    const loaded = loadManifest(source, root);
    const checksumChanged = loaded.checksum !== locked.checksum;
    process.stdout.write(`\n${traitName}@${locked.version}${checksumChanged ? " (source changed)" : ""}\n`);

    const result = verifyProject(root, loaded.manifest);
    process.stdout.write(`${result.ok ? "ok" : "failed"}: ${result.note}\n`);
    failed ||= !result.ok || checksumChanged;
  }

  return failed ? 1 : 0;
}

export function sourceFromLock(source) {
  if (source.startsWith("builtin:")) return source.slice("builtin:".length);
  if (source.startsWith("file:")) return source.slice("file:".length);
  return source;
}
