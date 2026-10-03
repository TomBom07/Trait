import { spawnSync } from "node:child_process";

export const codexAdapter = {
  name: "codex",
  capabilities: {
    structuredOutput: true,
    readOnlyVerification: true
  },

  probe() {
    const result = spawnSync(process.platform === "win32" ? "where" : "which", ["codex"], {
      encoding: "utf8",
      shell: false
    });
    return result.status === 0
      ? { ok: true }
      : { ok: false, message: "Codex CLI was not found. Install and authenticate Codex first." };
  },

  runImplementation({ cwd, instruction }) {
    return runCodex(["exec", "--full-auto", instruction], cwd);
  },

  runVerification({ cwd, instruction, schemaPath, outputPath }) {
    return runCodex(
      ["exec", "--sandbox", "read-only", instruction, "--output-schema", schemaPath, "-o", outputPath],
      cwd
    );
  }
};

function runCodex(args, cwd) {
  const result = spawnSync("codex", args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.error) throw result.error;
  return { status: result.status ?? 1 };
}
