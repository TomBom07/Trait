import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addCommand } from "../../src/commands/add.js";
import { removeCommand } from "../../src/commands/remove.js";
import { verifyCommand } from "../../src/commands/verify.js";
import {
  registerAgentAdapter,
  unregisterAgentAdapter
} from "../../src/core/agent.js";
import { readLock } from "../../src/core/state.js";
import { createFakeAdapter } from "../helpers/fake-adapter.js";

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "trait-lifecycle-"));
  mkdirSync(join(root, "trait-fixture"));

  writeJson(join(root, "package.json"), {
    name: "trait-lifecycle-host",
    version: "1.0.0",
    type: "module",
    scripts: {
      test: "node -e \"process.exit(0)\""
    }
  });

  writeJson(join(root, "trait-fixture", "trait.json"), {
    schemaVersion: 1,
    name: "demo/feature-flag",
    version: "1.0.0",
    summary: "Adds a tiny deterministic feature flag behavior.",
    intent: "Expose one deterministic feature flag whose behavior can be verified without model judgment.",
    rules: [
      {
        id: "feature.flag.enabled",
        text: "The exported feature flag returns enabled when called."
      }
    ],
    invariants: [
      {
        id: "feature.host.stable",
        text: "Existing host project checks keep passing after installation."
      }
    ],
    acceptance: [
      {
        id: "accept.feature.enabled",
        text: "A host test proves that the feature flag returns enabled.",
        grader: {
          type: "project-script",
          script: "trait:feature-flag"
        }
      }
    ],
    verify: {
      scripts: ["test"]
    }
  });

  return root;
}

function installFeature(root) {
  writeFileSync(join(root, "feature.js"), "export function featureFlag() { return true; }\n", "utf8");
  writeFileSync(
    join(root, "feature.test.js"),
    [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { featureFlag } from "./feature.js";',
      "",
      'test("feature flag is enabled", () => {',
      "  assert.equal(featureFlag(), true);",
      "});",
      ""
    ].join("\n"),
    "utf8"
  );

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  pkg.scripts["trait:feature-flag"] = "node --test feature.test.js";
  writeJson(join(root, "package.json"), pkg);
}

function removeFeature(root) {
  rmSync(join(root, "feature.js"), { force: true });
  rmSync(join(root, "feature.test.js"), { force: true });

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  delete pkg.scripts["trait:feature-flag"];
  writeJson(join(root, "package.json"), pkg);
}

test("full lifecycle installs, verifies drift, recovers and removes through command code", () => {
  const root = makeFixture();
  const adapter = createFakeAdapter({
    name: "lifecycle",
    implementation(input) {
      const prompt = readFileSync(join(input.cwd, input.runFile), "utf8");
      if (prompt.startsWith("Remove the behavior")) removeFeature(input.cwd);
      else installFeature(input.cwd);
    }
  });

  registerAgentAdapter(adapter);
  try {
    const source = "./trait-fixture";
    assert.equal(addCommand(source, { agent: adapter.name, plan: false }, root), 0);

    const installed = readLock(root).traits["demo/feature-flag"];
    assert.equal(installed.version, "1.0.0");
    assert.equal(installed.verification.status, "pass");
    assert.equal(
      adapter.calls.filter((call) => call.type === "verification").length,
      0,
      "deterministic graders should avoid a model verifier"
    );

    assert.equal(
      verifyCommand("demo/feature-flag", { checksOnly: true }, root),
      0
    );

    writeFileSync(join(root, "feature.js"), "export function featureFlag() { return false; }\n", "utf8");
    assert.equal(
      verifyCommand("demo/feature-flag", { checksOnly: true }, root),
      1,
      "a failing deterministic grader should surface drift"
    );

    installFeature(root);
    assert.equal(
      verifyCommand("demo/feature-flag", { checksOnly: true }, root),
      0
    );

    assert.equal(
      removeCommand("demo/feature-flag", { agent: adapter.name, plan: false }, root),
      0
    );
    assert.equal(readLock(root).traits["demo/feature-flag"], undefined);
  } finally {
    unregisterAgentAdapter(adapter.name);
  }
});
