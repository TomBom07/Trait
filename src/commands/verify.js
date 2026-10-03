import { collectEvidence, inspectEvidenceReceipt } from "../core/evidence.js";
import { runAcceptanceGraders } from "../core/graders.js";
import { loadManifest } from "../core/manifest.js";
import { readLock } from "../core/state.js";
import { verifyProject } from "../core/verify.js";

export function verifyCommand(name, options, root) {
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

    if (checksumChanged) {
      process.stdout.write("failed: the behavior contract changed; run trait update before verifying it.\n");
      failed = true;
      continue;
    }

    const projectVerification = verifyProject(root, loaded.manifest);
    process.stdout.write(`${projectVerification.ok ? "ok" : "failed"}: ${projectVerification.note}\n`);
    if (!projectVerification.ok) {
      failed = true;
      continue;
    }

    const graderResults = runAcceptanceGraders(root, loaded.manifest, { projectVerification });

    if (options.checksOnly) {
      const cached = inspectEvidenceReceipt(root, traitName, locked, { graderResults });
      process.stdout.write(`${cached.ok ? "verified" : cached.status}: ${cached.note}.\n`);
      failed ||= !cached.ok;
      continue;
    }

    const agent = options.agent ?? locked.agent ?? "codex";
    const evidence = collectEvidence(root, loaded, projectVerification, { agent, graderResults });
    process.stdout.write(`${evidence.ok ? "verified" : "not verified"}: ${evidence.note}\n`);
    if (evidence.receipt) {
      for (const check of evidence.receipt.checks) {
        process.stdout.write(`  ${symbol(check.status)} ${check.id}\n`);
      }
    }
    failed ||= !evidence.ok;
  }

  return failed ? 1 : 0;
}

export function sourceFromLock(source) {
  if (source.startsWith("builtin:")) return source.slice("builtin:".length);
  if (source.startsWith("file:")) return source.slice("file:".length);
  return source;
}

function symbol(status) {
  if (status === "pass") return "✓";
  if (status === "fail") return "×";
  return "?";
}
