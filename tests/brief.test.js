import test from "node:test";
import assert from "node:assert/strict";
import { buildAddBrief, buildRemoveBrief } from "../src/core/brief.js";

const loaded = {
  manifest: {
    name: "api/idempotency",
    version: "0.1.0",
    intent: "Retrying a protected mutation does not repeat its side effect.",
    rules: [{ id: "api.retry", text: "Equivalent retries execute once." }],
    invariants: [{ id: "api.errors", text: "Existing response conventions stay intact." }],
    security: [{ id: "api.scope", text: "Keys are scoped to the correct caller." }],
    acceptance: [{ id: "accept.retry", text: "A duplicate request proves one execution." }]
  },
  guidance: "Use the database the project already has."
};
const repo = {
  projectName: "checkout",
  packageManager: "npm",
  frameworks: ["Fastify"],
  scripts: { test: "node --test" },
  topLevel: ["src/", "package.json"]
};

test("implementation brief carries contract and host context", () => {
  const brief = buildAddBrief(loaded, repo);
  assert.match(brief, /checkout/);
  assert.match(brief, /Fastify/);
  assert.match(brief, /api\.retry/);
  assert.match(brief, /Use the database/);
  assert.match(brief, /Do not replace working subsystems/);
});

test("removal is framed as a selective unwind, not a blind revert", () => {
  const brief = buildRemoveBrief(loaded, repo);
  assert.match(brief, /not a blind revert/i);
  assert.match(brief, /shared infrastructure/);
});
