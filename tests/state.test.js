import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forgetTrait, readLock, recordTrait } from "../src/core/state.js";

test("records and removes installed contract state", () => {
  const root = mkdtempSync(join(tmpdir(), "trait-state-"));
  const loaded = {
    manifest: { name: "api/idempotency", version: "0.1.0" },
    source: "builtin:api/idempotency",
    checksum: "abc"
  };

  recordTrait(root, loaded, "codex");
  assert.equal(readLock(root).traits["api/idempotency"].checksum, "abc");
  assert.equal(forgetTrait(root, "api/idempotency"), true);
  assert.deepEqual(readLock(root).traits, {});
});
