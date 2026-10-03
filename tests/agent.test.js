import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getAgentAdapter,
  registerAgentAdapter,
  runAgent,
  runEvidenceAgent,
  unregisterAgentAdapter
} from "../src/core/agent.js";
import { createFakeAdapter } from "./helpers/fake-adapter.js";

test("implementation execution goes through the selected adapter", () => {
  const root = mkdtempSync(join(tmpdir(), "trait-agent-"));
  const adapter = createFakeAdapter();
  registerAgentAdapter(adapter);

  try {
    const result = runAgent({ agent: adapter.name, prompt: "Make the change.", cwd: root });
    assert.equal(result.status, 0);
    assert.equal(adapter.calls.some((call) => call.type === "implementation"), true);
    assert.equal(getAgentAdapter(adapter.name), adapter);
  } finally {
    unregisterAgentAdapter(adapter.name);
  }
});

test("verification execution uses the adapter capability boundary", () => {
  const root = mkdtempSync(join(tmpdir(), "trait-agent-"));
  const adapter = createFakeAdapter();
  registerAgentAdapter(adapter);

  try {
    const result = runEvidenceAgent({
      agent: adapter.name,
      cwd: root,
      promptPath: ".trait/runs/check.md",
      schemaPath: ".trait/runs/check.schema.json",
      outputPath: ".trait/runs/check.json"
    });
    assert.equal(result.status, 0);
    assert.equal(adapter.calls.some((call) => call.type === "verification"), true);
  } finally {
    unregisterAgentAdapter(adapter.name);
  }
});

test("invalid adapters are rejected at registration", () => {
  assert.throws(
    () => registerAgentAdapter({ name: "broken", probe() {}, runImplementation() {} }),
    /runVerification/
  );
});
