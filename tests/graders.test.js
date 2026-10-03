import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pendingAcceptance, runAcceptanceGraders } from "../src/core/graders.js";

function makeProject(scripts) {
  const root = mkdtempSync(join(tmpdir(), "trait-graders-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "grader-fixture", scripts }));
  return root;
}

test("project-script graders can reuse an already successful host check", () => {
  const root = makeProject({ "trait:retry": "node -e \"process.exit(0)\"" });
  const manifest = {
    acceptance: [
      { id: "accept.retry", text: "Retries execute once.", grader: { type: "project-script", script: "trait:retry" } },
      { id: "accept.other", text: "Another property is visible." }
    ]
  };

  const result = runAcceptanceGraders(root, manifest, {
    projectVerification: { results: [{ script: "trait:retry", status: 0 }] },
    quiet: true
  });

  assert.equal(result.checks[0].status, "pass");
  assert.equal(result.checks[0].grader.reused, true);
  assert.deepEqual(pendingAcceptance(manifest, result).map((item) => item.id), ["accept.other"]);
});

test("a configured grader fails explicitly when its host script is missing", () => {
  const root = makeProject({ test: "node --test" });
  const manifest = {
    acceptance: [
      { id: "accept.retry", text: "Retries execute once.", grader: { type: "project-script", script: "trait:retry" } }
    ]
  };

  const result = runAcceptanceGraders(root, manifest, { quiet: true });
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].status, "fail");
  assert.match(result.checks[0].notes, /does not exist/);
});
