import test from "node:test";
import assert from "node:assert/strict";
import { checkTraitRelations, checkTraitRemoval, orderTraitManifests } from "../src/core/relations.js";
import { satisfiesVersion } from "../src/core/semver.js";

test("version ranges support exact, comparator, caret and tilde forms", () => {
  assert.equal(satisfiesVersion("1.4.2", "^1.2.0"), true);
  assert.equal(satisfiesVersion("2.0.0", "^1.2.0"), false);
  assert.equal(satisfiesVersion("1.4.2", ">=1.0.0 <2.0.0"), true);
  assert.equal(satisfiesVersion("1.5.0", "~1.4.2"), false);
  assert.equal(satisfiesVersion("1.4.9", "~1.4.2"), true);
});

test("relation checks explain missing requirements, conflicts and capabilities", () => {
  const lock = {
    traits: {
      "auth/session": {
        version: "1.2.0",
        relations: { provides: ["auth.session"] }
      },
      "auth/legacy": {
        version: "2.0.0",
        relations: { conflicts: [{ name: "auth/passkeys", version: "*" }] }
      }
    }
  };
  const manifest = {
    name: "auth/passkeys",
    version: "0.2.0",
    relations: {
      requires: [{ name: "auth/session", version: "^1.0.0" }],
      requiresCapabilities: ["auth.session", "auth.user-recovery"]
    }
  };

  const result = checkTraitRelations(manifest, lock);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes("auth.user-recovery")));
  assert(result.errors.some((error) => error.includes("auth/legacy")));
});

test("removal is blocked when another trait depends on the target", () => {
  const lock = {
    traits: {
      "auth/session": {
        version: "1.0.0",
        relations: { provides: ["auth.session"] }
      },
      "auth/passkeys": {
        version: "0.2.0",
        relations: {
          requires: [{ name: "auth/session", version: "^1.0.0" }],
          requiresCapabilities: ["auth.session"]
        }
      }
    }
  };

  const result = checkTraitRemoval("auth/session", lock);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes("auth/passkeys")));
});

test("traits are ordered after dependencies and cycles are surfaced", () => {
  const session = { name: "auth/session", relations: {} };
  const passkeys = { name: "auth/passkeys", relations: { requires: [{ name: "auth/session", version: "*" }] } };
  const ordered = orderTraitManifests([passkeys, session]);
  assert.equal(ordered.ok, true);
  assert.deepEqual(ordered.order.map((item) => item.name), ["auth/session", "auth/passkeys"]);

  session.relations = { requires: [{ name: "auth/passkeys", version: "*" }] };
  const cyclic = orderTraitManifests([passkeys, session]);
  assert.equal(cyclic.ok, false);
  assert.equal(cyclic.cycles.length > 0, true);
});
