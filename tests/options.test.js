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
