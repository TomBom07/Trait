import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEvidenceSchema, normalizeEvidence } from "../src/core/evidence.js";

const manifest = {
  name: "api/idempotency",
  version: "0.1.0",
  rules: [{ id: "api.retry", text: "Equivalent retries execute once." }],
  invariants: [{ id: "api.atomic", text: "The operation and replay state do not diverge." }],
  acceptance: [
    { id: "accept.same-key", text: "Equivalent requests with one key execute once." },
    { id: "accept.conflict", text: "A changed request with the same key is rejected." }
  ]
};

test("evidence schema is pinned to the contract's acceptance ids", () => {
  const schema = buildEvidenceSchema(manifest);
  const check = schema.properties.checks.items;
  assert.deepEqual(check.properties.id.enum, ["accept.same-key", "accept.conflict"]);
  assert.equal(schema.properties.checks.minItems, 2);
  assert.equal(schema.properties.checks.maxItems, 2);
});

test("valid repository evidence is hashed and preserved", () => {
  const root = mkdtempSync(join(tmpdir(), "trait-evidence-"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "test", "idempotency.test.js"), "line one\nline two\n");

  const checks = normalizeEvidence({ checks: [
    {
      id: "accept.same-key",
      status: "pass",
      evidence: [{
        path: "test/idempotency.test.js",
        kind: "test",
        lineStart: 1,
        lineEnd: 2,
        reason: "The test exercises a duplicate request."
      }],
      notes: ""
    },
    {
      id: "accept.conflict",
      status: "unknown",
      evidence: [],
      notes: "No conflict case exists yet."
    }
  ] }, manifest, root);

  assert.equal(checks[0].status, "pass");
  assert.match(checks[0].evidence[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(checks[1].status, "unknown");
});

test("a claimed pass without valid evidence is downgraded", () => {
  const root = mkdtempSync(join(tmpdir(), "trait-evidence-"));
  const checks = normalizeEvidence({ checks: [
    {
      id: "accept.same-key",
      status: "pass",
      evidence: [{ path: "missing.test.js", kind: "test", reason: "Trust me." }],
      notes: "Looks good."
    },
    {
      id: "accept.conflict",
      status: "pass",
      evidence: [{ path: ".trait/evidence/fake.json", kind: "other", reason: "Self reference." }],
      notes: ""
    }
  ] }, manifest, root);

  assert.equal(checks[0].status, "unknown");
  assert.match(checks[0].notes, /downgraded/i);
  assert.match(checks[0].notes, /does not exist/i);
  assert.equal(checks[1].status, "unknown");
  assert.match(checks[1].notes, /not an allowed/i);
});
