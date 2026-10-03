import { spawnSync } from "node:child_process";
import { inspectRepo } from "./repo.js";

export function runAcceptanceGraders(root, manifest, { projectVerification = null, quiet = false } = {}) {
  const repo = inspectRepo(root);
  const cached = new Map((projectVerification?.results ?? []).map((result) => [result.script, result.status]));
  const executed = new Map();

  const checks = manifest.acceptance.map((criterion) => {
    if (!criterion.grader) {
      return { id: criterion.id, status: "pending", grader: null, notes: "" };
    }

    const grader = criterion.grader;
    if (grader.type !== "project-script") {
      return {
        id: criterion.id,
        status: "fail",
        grader,
        notes: `Unsupported deterministic grader type "${grader.type}".`
      };
    }

    if (!repo.packageManager) {
      return {
        id: criterion.id,
        status: "fail",
        grader,
        notes: "The host project has no supported package manager for this grader."
      };
    }

    if (typeof repo.scripts[grader.script] !== "string") {
      return {
        id: criterion.id,
        status: "fail",
        grader,
        notes: `Required project script "${grader.script}" does not exist.`
      };
    }

    let status = cached.get(grader.script);
    let reused = status !== undefined;

    if (status === undefined && executed.has(grader.script)) {
      status = executed.get(grader.script);
      reused = true;
    }

    if (status === undefined) {
      const args = scriptArgs(repo.packageManager, grader.script);
      if (!quiet) process.stdout.write(`\n→ grader: ${repo.packageManager} ${args.join(" ")}\n`);
      const result = spawnSync(repo.packageManager, args, {
        cwd: root,
        stdio: quiet ? "pipe" : "inherit",
        encoding: quiet ? "utf8" : undefined,
        shell: process.platform === "win32"
      });
      status = result.status ?? 1;
      executed.set(grader.script, status);
    }

    return {
      id: criterion.id,
      status: status === 0 ? "pass" : "fail",
      grader: {
        type: "project-script",
        script: grader.script,
        exitCode: status,
        reused
      },
      notes: status === 0
        ? `Project script "${grader.script}" passed.`
        : `Project script "${grader.script}" exited with status ${status}.`
    };
  });

  return {
    ok: checks.every((check) => check.status !== "fail"),
    checks
  };
}

export function pendingAcceptance(manifest, graderResults) {
  const byId = new Map((graderResults?.checks ?? []).map((check) => [check.id, check]));
  return manifest.acceptance.filter((criterion) => byId.get(criterion.id)?.status === "pending" || !byId.has(criterion.id));
}

function scriptArgs(manager, script) {
  if (manager === "npm") return ["run", script];
  if (manager === "yarn") return [script];
  if (manager === "pnpm" || manager === "bun") return ["run", script];
  return ["run", script];
}
