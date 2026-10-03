import test from "node:test";
import assert from "node:assert/strict";
import { flag, parseArgs } from "../src/core/options.js";

test("missing valued flags stay undefined", () => {
  const parsed = parseArgs(["auth/passkeys"]);
  assert.equal(flag(parsed, "agent", undefined), undefined);
  assert.equal(flag(parsed, "plan", false), false);
});

test("parses boolean and valued flags", () => {
  const parsed = parseArgs(["auth/passkeys", "--plan", "--agent", "codex"]);
  assert.deepEqual(parsed.positionals, ["auth/passkeys"]);
  assert.equal(flag(parsed, "plan", false), true);
  assert.equal(flag(parsed, "agent"), "codex");
});


test("parses registry valued flags separately from boolean flags", () => {
  const parsed = parseArgs([
    "demo/cache@1.0.0",
    "--registry", "https://traits.example/",
    "--fingerprint", "sha256:abc",
    "--offline"
  ]);
  assert.equal(flag(parsed, "registry"), "https://traits.example/");
  assert.equal(flag(parsed, "fingerprint"), "sha256:abc");
  assert.equal(flag(parsed, "offline", false), true);
});
