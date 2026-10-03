import { readLock } from "../core/state.js";

export function listCommand(root) {
  const lock = readLock(root);
  const entries = Object.entries(lock.traits);
  if (entries.length === 0) {
    process.stdout.write("No traits installed.\n");
    return 0;
  }

  const width = Math.max(...entries.map(([name]) => name.length));
  for (const [name, item] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    const status = item.verification?.status === "pass" ? "verified" : "unverified";
    process.stdout.write(`${name.padEnd(width)}  ${item.version}  ${status}  ${item.agent ?? "-"}\n`);
  }
  return 0;
}
