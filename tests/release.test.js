import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/core/version.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);
const changelog = readFileSync(
  new URL("../CHANGELOG.md", import.meta.url),
  "utf8"
);

test("runtime version matches package metadata", () => {
  assert.equal(VERSION, packageJson.version);
});

test("current package version has a changelog section", () => {
  assert.equal(changelog.includes(`\n## ${packageJson.version}\n`), true);
});
