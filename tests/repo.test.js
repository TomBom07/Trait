import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultVerificationScripts, inspectRepo } from "../src/core/repo.js";

test("detects common stack information without crawling the repository", () => {
  const root = mkdtempSync(join(tmpdir(), "trait-repo-"));
  writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "sample-app",
    scripts: { test: "node --test", lint: "eslint ." },
    dependencies: { next: "16.0.0", react: "19.0.0", "drizzle-orm": "1.0.0" }
  }));

  const repo = inspectRepo(root);
  assert.equal(repo.packageManager, "pnpm");
  assert.deepEqual(repo.frameworks, ["Next.js", "React", "Drizzle"]);
  assert.deepEqual(defaultVerificationScripts(repo, ["test", "typecheck", "lint"]), ["test", "lint"]);
});
