import { spawnSync } from "node:child_process";
import { defaultVerificationScripts, inspectRepo } from "./repo.js";

export function verifyProject(root, manifest, { quiet = false } = {}) {
  const repo = inspectRepo(root);
  const requested = manifest.verify?.scripts ?? [];
  const scripts = defaultVerificationScripts(repo, requested);
  const results = [];

  if (!repo.packageManager || scripts.length === 0) {
    return { ok: true, results, note: "No matching project scripts were available to run." };
  }

  for (const script of scripts) {
    const args = scriptArgs(repo.packageManager, script);
    if (!quiet) process.stdout.write(`\n→ ${repo.packageManager} ${args.join(" ")}\n`);
    const result = spawnSync(repo.packageManager, args, {
      cwd: root,
      stdio: quiet ? "pipe" : "inherit",
      encoding: quiet ? "utf8" : undefined,
      shell: process.platform === "win32"
    });

    results.push({ script, status: result.status ?? 1 });
    if ((result.status ?? 1) !== 0) {
      return { ok: false, results, note: `${script} failed` };
    }
  }

  return { ok: true, results, note: scripts.length ? "Project checks passed." : "No checks ran." };
}

function scriptArgs(manager, script) {
  if (manager === "npm") return ["run", script];
  if (manager === "yarn") return [script];
  if (manager === "pnpm" || manager === "bun") return ["run", script];
  return ["run", script];
}
