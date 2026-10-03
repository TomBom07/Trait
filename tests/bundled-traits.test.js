import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "../src/core/manifest.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const traitsRoot = resolve(repoRoot, "traits");

function bundledTraitNames() {
  const names = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile() && entry.name === "trait.json") {
        const traitDir = dirname(path);
        names.push(relative(traitsRoot, traitDir).split(sep).join("/"));
      }
    }
  }

  walk(traitsRoot);
  return names.sort();
}

test("every bundled trait loads, has guidance, and has a unique package name", () => {
  const sources = bundledTraitNames();
  const loaded = sources.map((source) => loadManifest(source, repoRoot));
  const names = loaded.map((item) => item.manifest.name);

  assert.equal(new Set(names).size, names.length);
  for (let i = 0; i < loaded.length; i += 1) {
    assert.equal(loaded[i].manifest.name, sources[i]);
    assert.match(loaded[i].guidance, /\S/);
    assert(loaded[i].manifest.acceptance.length >= 3);
  }
});

test("the bundled catalog covers auth, api safety, browser security, jobs and auditability", () => {
  assert.deepEqual(bundledTraitNames(), [
    "api/idempotency",
    "api/rate-limit",
    "auth/passkeys",
    "data/audit-log",
    "jobs/retry-safety",
    "security/csrf"
  ]);
});
