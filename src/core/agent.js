import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { codexAdapter } from "../adapters/codex.js";
import { ensureTraitWorkspace } from "./state.js";

const adapters = new Map([[codexAdapter.name, codexAdapter]]);

export function registerAgentAdapter(adapter) {
  validateAdapter(adapter);
  adapters.set(adapter.name, adapter);
}

export function unregisterAgentAdapter(name) {
  if (name === codexAdapter.name) return false;
  return adapters.delete(name);
}

export function getAgentAdapter(name = "codex") {
  const adapter = adapters.get(name);
  if (!adapter) {
    const available = [...adapters.keys()].sort().join(", ");
    throw new Error(`Unsupported agent "${name}". Available adapters: ${available || "none"}.`);
  }
  return adapter;
}

export function runAgent({ agent = "codex", prompt, cwd, dryRun = false }) {
  if (dryRun) {
    process.stdout.write(`${prompt}\n`);
    return { agent, status: 0, skipped: true };
  }

  const adapter = getAgentAdapter(agent);
  assertAvailable(adapter);

  const runFile = writeRunFile(cwd, prompt);
  const instruction = `Read ${runFile} and carry out that task in the current repository.`;
  process.stdout.write(`\n→ ${adapter.name} (${runFile})\n`);

  const result = adapter.runImplementation({ cwd, instruction, runFile });
  return {
    agent: adapter.name,
    status: result?.status ?? 1,
    skipped: false,
    runFile
  };
}

export function runEvidenceAgent({
  agent = "codex",
  cwd,
  promptPath,
  schemaPath,
  outputPath
}) {
  ensureTraitWorkspace(cwd);
  const adapter = getAgentAdapter(agent);
  assertAvailable(adapter);

  if (!adapter.capabilities?.readOnlyVerification) {
    throw new Error(`Agent adapter "${adapter.name}" does not support read-only verification.`);
  }
  if (!adapter.capabilities?.structuredOutput) {
    throw new Error(`Agent adapter "${adapter.name}" does not support structured verification output.`);
  }

  const instruction = `Read ${promptPath} and evaluate the current repository. Do not modify files.`;
  process.stdout.write(`\n→ ${adapter.name} verify (${promptPath})\n`);

  const result = adapter.runVerification({
    cwd,
    instruction,
    promptPath,
    schemaPath,
    outputPath
  });

  return {
    agent: adapter.name,
    status: result?.status ?? 1
  };
}

function assertAvailable(adapter) {
  const result = adapter.probe();
  if (!result?.ok) {
    throw new Error(result?.message || `Agent adapter "${adapter.name}" is unavailable.`);
  }
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") throw new Error("Agent adapter must be an object.");
  if (typeof adapter.name !== "string" || !adapter.name.trim()) throw new Error("Agent adapter needs a name.");
  if (typeof adapter.probe !== "function") throw new Error(`Agent adapter "${adapter.name}" needs probe().`);
  if (typeof adapter.runImplementation !== "function") {
    throw new Error(`Agent adapter "${adapter.name}" needs runImplementation().`);
  }
  if (typeof adapter.runVerification !== "function") {
    throw new Error(`Agent adapter "${adapter.name}" needs runVerification().`);
  }
}

function writeRunFile(cwd, prompt) {
  const directory = join(ensureTraitWorkspace(cwd), "runs");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${stamp}-${process.pid}.md`;
  writeFileSync(join(directory, filename), `${prompt.trim()}\n`, "utf8");
  return `.trait/runs/${filename}`;
}
