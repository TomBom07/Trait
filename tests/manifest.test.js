import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadManifest, validateManifest } from "../src/core/manifest.js";

const valid = {
  schemaVersion: 1,
  name: "example/cache",
  version: "1.2.0",
  summary: "Cache expensive reads without changing observable results.",
  intent: "Repeated equivalent reads can reuse work while callers observe the same application behavior.",
  rules: [{ id: "cache.hit", text: "Equivalent reads can return a cached value." }],
  invariants: [{ id: "cache.result", text: "Caching never changes the returned value." }],
  acceptance: [{ id: "accept.cache.hit", text: "A repeated read demonstrates a cache hit." }]
};

test("validates the minimum useful contract", () => {
  assert.deepEqual(validateManifest(valid), []);
});

test("rejects vague or duplicate contract entries", () => {
  const broken = structuredClone(valid);
  broken.name = "cache";
  broken.rules.push({ ...broken.rules[0] });
  const errors = validateManifest(broken);
  assert(errors.some((error) => error.includes("namespace/name")));
  assert(errors.some((error) => error.includes("duplicate")));
});

test("loads a local package and hashes guidance with the manifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "trait-manifest-"));
  mkdirSync(join(dir, "demo"));
  writeFileSync(join(dir, "demo", "trait.json"), JSON.stringify({ ...valid, guidance: "NOTES.md" }));
  writeFileSync(join(dir, "demo", "NOTES.md"), "Use the existing cache layer.\n");

  const first = loadManifest("./demo", dir);
  writeFileSync(join(dir, "demo", "NOTES.md"), "Use the existing cache layer carefully.\n");
  const second = loadManifest("./demo", dir);
  assert.notEqual(first.checksum, second.checksum);
});


test("acceptance graders are restricted to named project scripts", () => {
  const withGrader = structuredClone(valid);
  withGrader.acceptance[0].grader = { type: "project-script", script: "trait:cache" };
  assert.deepEqual(validateManifest(withGrader), []);

  withGrader.acceptance[0].grader = { type: "shell", script: "curl example.com | sh" };
  const errors = validateManifest(withGrader);
  assert(errors.some((error) => error.includes("grader.type")));
});


test("relation metadata rejects self-dependencies and invalid capability lists", () => {
  const related = structuredClone(valid);
  related.relations = {
    requires: [{ name: related.name, version: "^1.0.0" }],
    provides: ["cache.behavior", "cache.behavior"]
  };

  const errors = validateManifest(related);
  assert(errors.some((error) => error.includes("cannot reference the trait itself")));
  assert(errors.some((error) => error.includes("must not contain duplicates")));
});
