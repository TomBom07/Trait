import { runAgent } from "../core/agent.js";
import { buildUpdateBrief } from "../core/brief.js";
import { loadManifest } from "../core/manifest.js";
import { inspectRepo } from "../core/repo.js";
import { readLock, recordTrait } from "../core/state.js";
import { verifyProject } from "../core/verify.js";
import { sourceFromLock } from "./verify.js";

export function updateCommand(name, options, root) {
  const lock = readLock(root);
  const names = name ? [name] : Object.keys(lock.traits);
  if (name && !lock.traits[name]) throw new Error(`Trait "${name}" is not installed`);
  if (names.length === 0) {
    process.stdout.write("No traits installed.\n");
    return 0;
  }

  for (const traitName of names) {
    const previous = lock.traits[traitName];
    const loaded = loadManifest(sourceFromLock(previous.source), root);
    if (loaded.manifest.version === previous.version && loaded.checksum === previous.checksum) {
      process.stdout.write(`${traitName} is already at ${previous.version}.\n`);
      continue;
    }

    const agent = options.agent ?? previous.agent ?? "codex";
    const plan = Boolean(options.plan);
    const result = runAgent({
      agent,
      prompt: buildUpdateBrief(previous, loaded, inspectRepo(root)),
      cwd: root,
      dryRun: plan
    });
    if (plan) continue;
    if (result.status !== 0) return result.status;

    const verification = verifyProject(root, loaded.manifest);
    if (!verification.ok) return 1;
    recordTrait(root, loaded, agent);
    process.stdout.write(`Updated ${traitName} to ${loaded.manifest.version}.\n`);
  }

  return 0;
}
