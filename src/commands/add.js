import { runAgent } from "../core/agent.js";
import { buildAddBrief } from "../core/brief.js";
import { collectEvidence } from "../core/evidence.js";
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

  const projectVerification = verifyProject(root, loaded.manifest);
  if (!projectVerification.ok) {
    process.stderr.write(`\nVerification failed (${projectVerification.note}); lockfile was not changed.\n`);
    return 1;
  }

  const evidence = collectEvidence(root, loaded, projectVerification, { agent });
  printEvidence(evidence);
  if (!evidence.ok) {
    process.stderr.write("Behavioral verification is incomplete; lockfile was not changed.\n");
    return 1;
  }

  recordTrait(root, loaded, agent, evidence);
  process.stdout.write(`\nInstalled ${loaded.manifest.name}@${loaded.manifest.version}.\n`);
  return 0;
}

function printEvidence(result) {
  process.stdout.write(`\n${result.ok ? "verified" : "not verified"}: ${result.note}\n`);
  if (!result.receipt) return;
  for (const check of result.receipt.checks) {
    process.stdout.write(`  ${symbol(check.status)} ${check.id}\n`);
  }
}

function symbol(status) {
  if (status === "pass") return "✓";
  if (status === "fail") return "×";
  return "?";
}
