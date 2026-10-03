import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configureRegistry,
  distrustPublisher,
  fetchRegistryPackage,
  inspectRegistryPackage,
  packRegistryPackage,
  resolveCachedRegistrySource,
  trustRegistryPackage
} from "../src/core/registry.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "trait-registry-host-"));
  const packageDir = mkdtempSync(join(tmpdir(), "trait-registry-package-"));
  const registryDir = mkdtempSync(join(tmpdir(), "trait-registry-static-"));
  const keysDir = mkdtempSync(join(tmpdir(), "trait-registry-keys-"));

  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "host" }));
  writeFileSync(join(packageDir, "trait.json"), JSON.stringify({
    schemaVersion: 1,
    name: "demo/cache",
    version: "1.0.0",
    summary: "Cache repeated reads while preserving observable behavior.",
    intent: "Repeated equivalent reads can reuse prior work while callers observe the same result.",
    rules: [{ id: "cache.reuse", text: "Equivalent reads may reuse a cached result." }],
    invariants: [{ id: "cache.result", text: "Caching does not change the returned result." }],
    acceptance: [{ id: "accept.cache", text: "A repeated read has evidence of cache reuse." }],
    guidance: "IMPLEMENTATION.md"
  }));
  writeFileSync(join(packageDir, "IMPLEMENTATION.md"), "Use the host project's existing cache primitives.\n");

  const { privateKey } = generateKeyPairSync("ed25519");
  const privatePath = join(keysDir, "publisher.pem");
  writeFileSync(
    privatePath,
    privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  );

  const packed = packRegistryPackage(packageDir, {
    publisher: "demo",
    keyPath: privatePath,
    outDir: registryDir
  });
  configureRegistry(root, registryDir);
  return { root, registryDir, packed };
}

test("registry flow requires explicit fingerprint trust before fetching", async () => {
  const { root, packed } = fixture();
  const info = await inspectRegistryPackage(root, "demo/cache@1.0.0");

  assert.equal(info.artifactHash, packed.artifactHash);
  assert.equal(info.fingerprint, packed.fingerprint);
  assert.equal(info.signatureValid, true);
  assert(info.files.some((file) => file.path === "trait.json"));

  await assert.rejects(
    () => fetchRegistryPackage(root, "demo/cache@1.0.0"),
    /not trusted/
  );

  await assert.rejects(
    () => trustRegistryPackage(root, "demo/cache@1.0.0", { fingerprint: "sha256:" + "0".repeat(64) }),
    /fingerprint mismatch/
  );

  const trusted = await trustRegistryPackage(root, "demo/cache@1.0.0", {
    fingerprint: info.fingerprint
  });
  assert.equal(trusted.publisher, "demo");

  const fetched = await fetchRegistryPackage(root, "demo/cache@1.0.0");
  assert.match(fetched.source, /^registry:demo\/cache@1\.0\.0#sha256:[a-f0-9]{64}$/);

  const resolved = resolveCachedRegistrySource("registry:demo/cache@1.0.0", root);
  assert.equal(resolved.source, fetched.source);
});

test("offline cache works and revocation blocks new fetches without rewriting pinned artifacts", async () => {
  const { root, packed } = fixture();
  await trustRegistryPackage(root, "demo/cache@1.0.0", { fingerprint: packed.fingerprint });
  const fetched = await fetchRegistryPackage(root, "demo/cache@1.0.0");

  const offline = await fetchRegistryPackage(root, "demo/cache@1.0.0", { offline: true });
  assert.equal(offline.artifactHash, fetched.artifactHash);

  distrustPublisher(root, "demo");
  await assert.rejects(
    () => fetchRegistryPackage(root, "demo/cache@1.0.0", { offline: true }),
    /revoked/
  );

  const pinned = resolveCachedRegistrySource(fetched.source, root);
  assert.equal(pinned.source, fetched.source);
});

test("tampered cached package files are rejected", async () => {
  const { root, packed } = fixture();
  await trustRegistryPackage(root, "demo/cache@1.0.0", { fingerprint: packed.fingerprint });
  const fetched = await fetchRegistryPackage(root, "demo/cache@1.0.0");

  const hash = fetched.artifactHash.slice("sha256:".length);
  const cachedManifest = join(root, ".trait", "cache", "packages", hash, "trait.json");
  writeFileSync(cachedManifest, "{}\n");

  assert.throws(
    () => resolveCachedRegistrySource(fetched.source, root),
    /was modified/
  );
});
