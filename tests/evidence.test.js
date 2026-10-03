import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEvidenceSchema, evidenceReceiptPath, inspectEvidenceReceipt, normalizeEvidence } from "../src/core/evidence.js";

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


test("recorded evidence becomes stale when a cited file changes", () => {
  const root = mkdtempSync(join(tmpdir(), "trait-evidence-"));
  mkdirSync(join(root, "test"));
  mkdirSync(join(root, ".trait", "evidence"), { recursive: true });
  const sourcePath = join(root, "test", "idempotency.test.js");
  writeFileSync(sourcePath, "assert one execution\\n");

  const checks = normalizeEvidence({ checks: [
    {
      id: "accept.same-key",
      status: "pass",
      evidence: [{ path: "test/idempotency.test.js", kind: "test", reason: "Covers replay." }],
      notes: ""
    },
    {
      id: "accept.conflict",
      status: "pass",
      evidence: [{ path: "test/idempotency.test.js", kind: "test", reason: "Covers conflict." }],
      notes: ""
    }
  ] }, manifest, root);

  const locked = {
    version: manifest.version,
    checksum: "contract-sha",
    verification: { status: "pass", verifiedAt: "2026-10-03T00:00:00.000Z", evidence: ".trait/evidence/api--idempotency.json" }
  };
  const receipt = {
    trait: manifest.name,
    version: manifest.version,
    traitChecksum: locked.checksum,
    verifiedAt: locked.verification.verifiedAt,
    overall: "pass",
    projectChecks: [],
    checks
  };
  writeFileSync(evidenceReceiptPath(root, manifest.name), `${JSON.stringify(receipt, null, 2)}\\n`);

  assert.equal(inspectEvidenceReceipt(root, manifest.name, locked).status, "verified");
  writeFileSync(sourcePath, "assert one execution\\nassert conflict rejected\\n");
  const stale = inspectEvidenceReceipt(root, manifest.name, locked);
  assert.equal(stale.status, "stale");
  assert.match(stale.note, /changed since verification/);
});
