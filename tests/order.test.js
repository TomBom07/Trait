import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { orderCommand } from "../src/commands/order.js";

function writeTrait(root, dir, manifest) {
  const path = join(root, dir);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "trait.json"), JSON.stringify(manifest));
  return `./${dir}`;
}

function base(name) {
  return {
    schemaVersion: 1,
    name,
    version: "1.0.0",
    summary: "A sufficiently descriptive behavior summary.",
    intent: "A sufficiently descriptive intent for this behavior contract.",
    rules: [{ id: "behavior.rule", text: "The behavior provides one observable rule." }],
    invariants: [{ id: "behavior.invariant", text: "Existing behavior remains intact." }],
    acceptance: [{ id: "accept.behavior", text: "The behavior has verifiable evidence." }]
  };
}

test("order command accepts a dependency supplied in the same batch", () => {
  const root = mkdtempSync(join(tmpdir(), "trait-order-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "host" }));
  const session = base("auth/session");
  session.relations = { provides: ["auth.session"] };
  const passkeys = base("auth/passkeys");
  passkeys.relations = {
    requires: [{ name: "auth/session", version: "^1.0.0" }],
    requiresCapabilities: ["auth.session"]
  };

  const sessionSource = writeTrait(root, "session", session);
  const passkeysSource = writeTrait(root, "passkeys", passkeys);
  assert.equal(orderCommand([passkeysSource, sessionSource], root), 0);
});
