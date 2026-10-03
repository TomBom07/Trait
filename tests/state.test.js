import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureTraitWorkspace, forgetTrait, readLock, recordTrait } from "../src/core/state.js";

test("records and removes installed contract state", () => {
  const root = mkdtempSync(join(tmpdir(), "trait-state-"));
  const loaded = {
    manifest: { name: "api/idempotency", version: "0.1.0" },
    source: "builtin:api/idempotency",
    checksum: "abc"
  };

  recordTrait(root, loaded, "codex");
  assert.equal(readLock(root).traits["api/idempotency"].checksum, "abc");

  const receipt = join(root, ".trait", "evidence", "api--idempotency.json");
  writeFileSync(receipt, "{}\n");
  assert.equal(forgetTrait(root, "api/idempotency"), true);
  assert.deepEqual(readLock(root).traits, {});
  assert.equal(existsSync(receipt), false);
});

test("evidence receipts are durable while run prompts stay ignored", () => {
  const root = mkdtempSync(join(tmpdir(), "trait-state-"));
  mkdirSync(join(root, ".trait"), { recursive: true });
  const ignorePath = join(root, ".trait", ".gitignore");
  writeFileSync(ignorePath, "runs/\nevidence/\ncustom/\n");

  ensureTraitWorkspace(root);
  const lines = readFileSync(ignorePath, "utf8").trim().split(/\r?\n/);
  assert(lines.includes("runs/"));
  assert(lines.includes("cache/"));
  assert(lines.includes("custom/"));
  assert(!lines.includes("evidence/"));
});
