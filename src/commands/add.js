import { runAgent } from "../core/agent.js";
import { buildAddBrief } from "../core/brief.js";
import { loadManifest } from "../core/manifest.js";
import { inspectRepo } from "../core/repo.js";
import { recordTrait } from "../core/state.js";
import { verifyProject } from "../core/verify.js";

export function addCommand(source, options, root) {
  const loaded = loadManifest(source, root);
  const repo = inspectRepo(root);
  const agent = options.agent ?? "codex";
  const plan = Boolean(options.plan);

  process.stdout.write(`Trait ${loaded.manifest.name}@${loaded.manifest.version}\n`);
  const result = runAgent({ agent, prompt: buildAddBrief(loaded, repo), cwd: root, dryRun: plan });
  if (plan) return 0;
  if (result.status !== 0) {
    process.stderr.write(`\nAgent exited with status ${result.status}; lockfile was not changed.\n`);
    return result.status;
  }

  const verification = verifyProject(root, loaded.manifest);
  if (!verification.ok) {
    process.stderr.write(`\nVerification failed (${verification.note}); lockfile was not changed.\n`);
    return 1;
  }

  recordTrait(root, loaded, agent);
  process.stdout.write(`\nInstalled ${loaded.manifest.name}@${loaded.manifest.version}. ${verification.note}\n`);
  return 0;
}
