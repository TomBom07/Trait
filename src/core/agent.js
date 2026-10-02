import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function runAgent({ agent = "codex", prompt, cwd, dryRun = false }) {
  if (dryRun) {
    process.stdout.write(`${prompt}\n`);
    return { agent, status: 0, skipped: true };
  }

  if (agent !== "codex") {
    throw new Error(`Unsupported agent "${agent}". This build currently supports codex.`);
  }

  const probe = spawnSync(process.platform === "win32" ? "where" : "which", ["codex"], {
    encoding: "utf8",
    shell: false
  });
  if (probe.status !== 0) {
    throw new Error("Codex CLI was not found. Install/login to Codex, or rerun with --plan to inspect the generated brief.");
  }

  const runFile = writeRunFile(cwd, prompt);
  const instruction = `Read ${runFile} and carry out that task in the current repository.`;
  process.stdout.write(`\n→ codex (${runFile})\n`);

  const result = spawnSync("codex", ["exec", "--full-auto", instruction], {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) throw result.error;
  return { agent, status: result.status ?? 1, skipped: false, runFile };
}

function writeRunFile(cwd, prompt) {
  const directory = join(cwd, ".trait", "runs");
  mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${stamp}-${process.pid}.md`;
  writeFileSync(join(directory, filename), `${prompt.trim()}\n`, "utf8");
  return `.trait/runs/${filename}`;
}
