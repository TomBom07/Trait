import {
  createHash,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes
} from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve
} from "node:path";
import { fileURLToPath } from "node:url";
import { ensureTraitWorkspace } from "./state.js";

const REGISTRY_FORMAT = 1;
const MAX_RESOURCE_BYTES = 5 * 1024 * 1024;
const HASH_RE = /^sha256:([a-f0-9]{64})$/;
const NAME_RE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const PUBLISHER_RE = /^[a-z0-9][a-z0-9._-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

export function configureRegistry(root, registry) {
  const normalized = normalizeRegistryBase(registry);
  const dir = ensureTraitWorkspace(root);
  writeJson(join(dir, "registry.json"), { version: 1, url: normalized });
  return normalized;
}

export function registryBase(root, override = null) {
  if (override) return normalizeRegistryBase(override);
  if (process.env.TRAIT_REGISTRY_URL) return normalizeRegistryBase(process.env.TRAIT_REGISTRY_URL);

  const path = join(root, ".trait", "registry.json");
  if (!existsSync(path)) {
    throw new Error("No registry configured. Run trait registry use <url> or pass --registry.");
  }
  const config = readJson(path, "registry config");
  if (config?.version !== 1 || typeof config.url !== "string") {
    throw new Error("Invalid .trait/registry.json.");
  }
  return normalizeRegistryBase(config.url);
}

export async function inspectRegistryPackage(root, spec, { registry = null } = {}) {
  const parsed = parseRegistrySpec(spec);
  const remote = await loadRemoteArtifact(root, parsed, { registry });
  const publisher = remote.artifact.payload.publisher;
  return {
    name: parsed.name,
    version: parsed.version,
    artifactHash: remote.hash,
    publisher: publisher.id,
    fingerprint: fingerprintPublicKey(publisher.publicKey),
    trust: publisherTrustStatus(root, publisher),
    signatureValid: true,
    files: remote.artifact.payload.package.files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
      bytes: Buffer.from(file.contentBase64, "base64").length
    })),
    summary: remote.manifest.summary ?? ""
  };
}

export async function trustRegistryPackage(root, spec, { registry = null, fingerprint, label = null } = {}) {
  if (!fingerprint) throw new Error("Trust requires --fingerprint from an inspected publisher.");
  const parsed = parseRegistrySpec(spec);
  const remote = await loadRemoteArtifact(root, parsed, { registry });
  const publisher = remote.artifact.payload.publisher;
  const actual = fingerprintPublicKey(publisher.publicKey);
  if (actual !== fingerprint) {
    throw new Error(`Publisher fingerprint mismatch: expected ${fingerprint}, received ${actual}.`);
  }

  const trust = readTrust(root);
  const existing = trust.publishers[publisher.id];
  if (existing && existing.fingerprint !== actual) {
    throw new Error(`Publisher "${publisher.id}" is already pinned to a different key.`);
  }

  trust.publishers[publisher.id] = {
    fingerprint: actual,
    publicKey: publisher.publicKey,
    status: "trusted",
    ...(label ? { label: String(label).trim() } : existing?.label ? { label: existing.label } : {}),
    trustedAt: existing?.trustedAt ?? new Date().toISOString()
  };
  writeTrust(root, trust);
  return { publisher: publisher.id, fingerprint: actual };
}

export function distrustPublisher(root, publisher) {
  const trust = readTrust(root);
  const current = trust.publishers[publisher];
  if (!current) throw new Error(`Publisher "${publisher}" is not in the trust store.`);

  trust.publishers[publisher] = {
    ...current,
    status: "revoked",
    revokedAt: new Date().toISOString()
  };
  writeTrust(root, trust);
  return trust.publishers[publisher];
}


export function listTrustedPublishers(root) {
  const trust = readTrust(root);
  return Object.entries(trust.publishers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([publisher, entry]) => ({
      publisher,
      fingerprint: entry.fingerprint,
      status: entry.status,
      label: entry.label ?? null,
      trustedAt: entry.trustedAt ?? null,
      revokedAt: entry.revokedAt ?? null
    }));
}

export async function searchRegistry(root, query = "", { registry = null } = {}) {
  const base = registryBase(root, registry);
  const index = await readJsonResource(base, "v1/index.json");
  validateRegistryIndex(index);

  const needle = String(query ?? "").trim().toLowerCase();
  return index.packages.filter((item) => {
    if (!needle) return true;
    return [
      item.name,
      item.summary ?? "",
      item.publisher ?? ""
    ].some((value) => String(value).toLowerCase().includes(needle));
  });
}

export async function fetchRegistryPackage(root, spec, { registry = null, offline = false } = {}) {
  const parsed = parseRegistrySpec(spec);
  ensureCache(root);

  if (offline) {
    const entry = readCacheIndex(root).packages[packageKey(parsed)];
    if (!entry) throw new Error(`${packageKey(parsed)} is not available in the local registry cache.`);
    const artifact = readCachedArtifact(root, entry.artifactHash);
    verifyArtifact(artifact, {
      expectedHash: entry.artifactHash,
      expectedName: parsed.name,
      expectedVersion: parsed.version,
      expectedPublisher: entry.publisher
    });
    assertPublisherTrusted(root, artifact.payload.publisher);
    extractArtifact(root, entry.artifactHash, artifact);
    return cachedResult(parsed, entry);
  }

  const remote = await loadRemoteArtifact(root, parsed, { registry });
  assertPublisherTrusted(root, remote.artifact.payload.publisher);

  const index = readCacheIndex(root);
  const key = packageKey(parsed);
  const previous = index.packages[key];
  if (previous && previous.artifactHash !== remote.hash) {
    throw new Error(
      `Registry version ${key} moved from ${previous.artifactHash} to ${remote.hash}. Trait treats published versions as immutable.`
    );
  }

  cacheArtifact(root, remote.hash, remote.artifact);
  extractArtifact(root, remote.hash, remote.artifact);
  const publisher = remote.artifact.payload.publisher;
  index.packages[key] = {
    artifactHash: remote.hash,
    publisher: publisher.id,
    fingerprint: fingerprintPublicKey(publisher.publicKey),
    fetchedAt: previous?.fetchedAt ?? new Date().toISOString()
  };
  writeCacheIndex(root, index);
  return cachedResult(parsed, index.packages[key]);
}

export function resolveCachedRegistrySource(source, root) {
  const parsed = parseRegistrySource(source);
  const index = readCacheIndex(root);
  const entry = parsed.artifactHash
    ? {
        artifactHash: parsed.artifactHash,
        publisher: null,
        fingerprint: null
      }
    : index.packages[packageKey(parsed)];

  if (!entry) {
    throw new Error(
      `Registry package ${packageKey(parsed)} is not cached. Run trait registry fetch ${packageKey(parsed)} first.`
    );
  }

  const artifact = readCachedArtifact(root, entry.artifactHash);
  verifyArtifact(artifact, {
    expectedHash: entry.artifactHash,
    expectedName: parsed.name,
    expectedVersion: parsed.version,
    expectedPublisher: entry.publisher
  });

  if (!parsed.artifactHash) assertPublisherTrusted(root, artifact.payload.publisher);
  verifyExtractedPackage(root, entry.artifactHash, artifact);
  const baseDir = packageCacheDir(root, entry.artifactHash);
  const manifestPath = join(baseDir, "trait.json");
  if (!existsSync(manifestPath)) throw new Error("Cached registry artifact does not contain trait.json.");

  return {
    manifestPath,
    baseDir,
    source: `registry:${parsed.name}@${parsed.version}#${entry.artifactHash}`
  };
}

export function packRegistryPackage(packagePath, { publisher, keyPath, outDir }) {
  if (!PUBLISHER_RE.test(publisher ?? "")) {
    throw new Error("Publisher must use lowercase letters, numbers, dots, underscores, or hyphens.");
  }
  if (!keyPath) throw new Error("Registry pack requires --key <private-key.pem>.");
  if (!outDir) throw new Error("Registry pack requires --out <directory>.");

  const baseDir = packagePath.endsWith?.(".json")
    ? dirname(resolve(packagePath))
    : resolve(packagePath);
  const manifestPath = join(baseDir, "trait.json");
  if (!existsSync(manifestPath)) throw new Error(`No trait.json found at ${baseDir}.`);

  const manifest = readJson(manifestPath, "trait manifest");
  if (!NAME_RE.test(manifest?.name ?? "") || typeof manifest?.version !== "string" || !VERSION_RE.test(manifest.version)) {
    throw new Error("trait.json must contain a valid name and exact semantic version before packing.");
  }

  const resolvedKeyPath = resolve(keyPath);
  if (isInside(baseDir, resolvedKeyPath)) {
    throw new Error("Signing keys must live outside the Trait package directory so they cannot be published accidentally.");
  }

  const privateKey = readFileSync(resolvedKeyPath, "utf8");
  const publicKey = createPublicKey(privateKey)
    .export({ type: "spki", format: "pem" })
    .toString();

  const files = collectPackageFiles(baseDir, manifest);
  const payload = {
    formatVersion: REGISTRY_FORMAT,
    publisher: { id: publisher, publicKey },
    package: {
      name: manifest.name,
      version: manifest.version,
      files
    }
  };
  const bytes = Buffer.from(canonicalJson(payload), "utf8");
  const hash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const signature = signBytes(null, bytes, privateKey).toString("base64");
  const artifact = { payload, signature };
  if (Buffer.byteLength(JSON.stringify(artifact), "utf8") > MAX_RESOURCE_BYTES) {
    throw new Error(`Registry artifact exceeds ${MAX_RESOURCE_BYTES} bytes.`);
  }

  const output = resolve(outDir);
  const artifactPath = join(output, "v1", "artifacts", `${hash.slice("sha256:".length)}.json`);
  const [namespace, name] = manifest.name.split("/");
  const descriptorPath = join(output, "v1", "packages", namespace, name, `${manifest.version}.json`);
  mkdirSync(dirname(artifactPath), { recursive: true });
  mkdirSync(dirname(descriptorPath), { recursive: true });
  writeJson(artifactPath, artifact);
  writeJson(descriptorPath, {
    formatVersion: REGISTRY_FORMAT,
    name: manifest.name,
    version: manifest.version,
    publisher,
    artifactHash: hash
  });
  updateRegistryIndex(output, manifest, publisher, hash);

  return {
    name: manifest.name,
    version: manifest.version,
    publisher,
    fingerprint: fingerprintPublicKey(publicKey),
    artifactHash: hash,
    artifactPath,
    descriptorPath
  };
}

export function parseRegistrySpec(spec) {
  const cleaned = String(spec ?? "").replace(/^registry:/, "").split("#", 1)[0];
  const at = cleaned.lastIndexOf("@");
  if (at <= 0) throw new Error('Registry specs must look like "namespace/name@1.2.3".');
  const name = cleaned.slice(0, at);
  const version = cleaned.slice(at + 1);
  if (!NAME_RE.test(name) || !VERSION_RE.test(version)) {
    throw new Error('Registry specs must use an exact version, for example "auth/passkeys@1.2.3".');
  }
  return { name, version };
}

export function fingerprintPublicKey(publicKey) {
  const der = createPublicKey(publicKey).export({ type: "spki", format: "der" });
  return `sha256:${createHash("sha256").update(der).digest("hex")}`;
}

function publisherTrustStatus(root, publisher) {
  const entry = readTrust(root).publishers[publisher.id];
  const fingerprint = fingerprintPublicKey(publisher.publicKey);
  if (!entry) return "untrusted";
  if (entry.fingerprint !== fingerprint || entry.publicKey !== publisher.publicKey) return "key-mismatch";
  return entry.status === "trusted" ? "trusted" : "revoked";
}

function updateRegistryIndex(output, manifest, publisher, artifactHash) {
  const path = join(output, "v1", "index.json");
  const index = existsSync(path)
    ? readJson(path, "registry index")
    : { formatVersion: REGISTRY_FORMAT, packages: [] };

  validateRegistryIndex(index);
  const packages = index.packages.filter((item) => item.name !== manifest.name);
  const previous = index.packages.find((item) => item.name === manifest.name);
  const versions = [
    ...(previous?.versions ?? []).filter((item) => item.version !== manifest.version),
    { version: manifest.version, publisher, artifactHash }
  ].sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));

  const latest = versions.at(-1);
  packages.push({
    name: manifest.name,
    summary: manifest.summary ?? previous?.summary ?? "",
    publisher: latest.publisher,
    latest: latest.version,
    versions
  });
  packages.sort((a, b) => a.name.localeCompare(b.name));
  writeJson(path, { formatVersion: REGISTRY_FORMAT, packages });
}

function validateRegistryIndex(index) {
  if (!index || index.formatVersion !== REGISTRY_FORMAT || !Array.isArray(index.packages)) {
    throw new Error("Registry index format is invalid.");
  }

  for (const item of index.packages) {
    if (!item || !NAME_RE.test(item.name ?? "") || typeof item.latest !== "string") {
      throw new Error("Registry index contains an invalid package entry.");
    }
    if (!PUBLISHER_RE.test(item.publisher ?? "") || !Array.isArray(item.versions)) {
      throw new Error(`Registry index entry for ${item.name} is invalid.`);
    }
    for (const version of item.versions) {
      if (
        typeof version?.version !== "string" ||
        !PUBLISHER_RE.test(version.publisher ?? "") ||
        !HASH_RE.test(version.artifactHash ?? "")
      ) {
        throw new Error(`Registry index version metadata for ${item.name} is invalid.`);
      }
    }
  }
}

async function loadRemoteArtifact(root, parsed, { registry }) {
  const base = registryBase(root, registry);
  const [namespace, name] = parsed.name.split("/");
  const descriptor = await readJsonResource(
    base,
    `v1/packages/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${encodeURIComponent(parsed.version)}.json`
  );
  validateDescriptor(descriptor, parsed);

  const match = String(descriptor.artifactHash).match(HASH_RE);
  if (!match) throw new Error("Registry descriptor has an invalid artifact hash.");
  const artifact = await readJsonResource(base, `v1/artifacts/${match[1]}.json`);
  verifyArtifact(artifact, {
    expectedHash: descriptor.artifactHash,
    expectedName: parsed.name,
    expectedVersion: parsed.version,
    expectedPublisher: descriptor.publisher
  });

  const manifestFile = artifact.payload.package.files.find((file) => file.path === "trait.json");
  if (!manifestFile) throw new Error("Registry artifact does not contain trait.json.");
  const manifest = JSON.parse(Buffer.from(manifestFile.contentBase64, "base64").toString("utf8"));

  return {
    descriptor,
    artifact,
    hash: descriptor.artifactHash,
    manifest
  };
}

function verifyArtifact(artifact, { expectedHash, expectedName, expectedVersion, expectedPublisher = null }) {
  if (!artifact || typeof artifact !== "object" || !artifact.payload || typeof artifact.signature !== "string") {
    throw new Error("Registry artifact has an invalid shape.");
  }
  const payload = artifact.payload;
  if (payload.formatVersion !== REGISTRY_FORMAT) throw new Error("Unsupported registry artifact format.");
  if (payload.package?.name !== expectedName || payload.package?.version !== expectedVersion) {
    throw new Error("Registry artifact identity does not match the requested package.");
  }
  if (!payload.publisher || !PUBLISHER_RE.test(payload.publisher.id ?? "") || typeof payload.publisher.publicKey !== "string") {
    throw new Error("Registry artifact publisher metadata is invalid.");
  }
  if (expectedPublisher && payload.publisher.id !== expectedPublisher) {
    throw new Error("Registry descriptor publisher does not match the signed artifact.");
  }

  const bytes = Buffer.from(canonicalJson(payload), "utf8");
  const hash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (hash !== expectedHash) throw new Error(`Registry artifact hash mismatch: expected ${expectedHash}, received ${hash}.`);

  const valid = verifyBytes(
    null,
    bytes,
    payload.publisher.publicKey,
    Buffer.from(artifact.signature, "base64")
  );
  if (!valid) throw new Error("Registry artifact signature is invalid.");

  validateFiles(payload.package.files);
  return true;
}

function validateDescriptor(descriptor, parsed) {
  if (!descriptor || descriptor.formatVersion !== REGISTRY_FORMAT) {
    throw new Error("Registry descriptor format is invalid.");
  }
  if (descriptor.name !== parsed.name || descriptor.version !== parsed.version) {
    throw new Error("Registry descriptor identity does not match the request.");
  }
  if (!PUBLISHER_RE.test(descriptor.publisher ?? "")) {
    throw new Error("Registry descriptor publisher is invalid.");
  }
}

function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("Registry artifact has no files.");
  const seen = new Set();
  for (const file of files) {
    if (!file || typeof file.path !== "string" || typeof file.contentBase64 !== "string") {
      throw new Error("Registry artifact contains an invalid file entry.");
    }
    const path = normalizePackagePath(file.path);
    if (seen.has(path)) throw new Error(`Registry artifact contains duplicate path ${path}.`);
    seen.add(path);

    const content = Buffer.from(file.contentBase64, "base64");
    const hash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    if (hash !== file.sha256) throw new Error(`Registry file hash mismatch for ${path}.`);
  }
}

function collectPackageFiles(baseDir, manifest) {
  const paths = ["trait.json"];
  if (manifest.guidance) paths.push(manifest.guidance);

  const output = [];
  for (const requested of [...new Set(paths)]) {
    const path = normalizePackagePath(requested);
    const absolute = resolve(baseDir, path);
    if (!isInside(baseDir, absolute)) {
      throw new Error(`Trait package file escapes its directory: ${path}.`);
    }
    if (!existsSync(absolute)) {
      throw new Error(`Trait package file is missing: ${path}.`);
    }

    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Registry packages cannot contain symlinked contract files: ${path}.`);
    if (!stat.isFile()) throw new Error(`Trait package entry is not a file: ${path}.`);

    const content = readFileSync(absolute);
    output.push({
      path,
      sha256: `sha256:${createHash("sha256").update(content).digest("hex")}`,
      contentBase64: content.toString("base64")
    });
  }

  output.sort((a, b) => a.path.localeCompare(b.path));
  return output;
}

function extractArtifact(root, hash, artifact) {
  const dir = packageCacheDir(root, hash);
  mkdirSync(dir, { recursive: true });
  for (const file of artifact.payload.package.files) {
    const path = normalizePackagePath(file.path);
    const absolute = resolve(dir, path);
    if (!isInside(dir, absolute)) throw new Error(`Registry file escapes package cache: ${path}.`);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, Buffer.from(file.contentBase64, "base64"));
  }
}

function verifyExtractedPackage(root, hash, artifact) {
  const dir = packageCacheDir(root, hash);
  for (const file of artifact.payload.package.files) {
    const path = normalizePackagePath(file.path);
    const absolute = resolve(dir, path);
    if (!isInside(dir, absolute) || !existsSync(absolute)) {
      throw new Error(`Cached registry package is missing ${path}. Re-fetch the artifact.`);
    }
    const actual = `sha256:${createHash("sha256").update(readFileSync(absolute)).digest("hex")}`;
    if (actual !== file.sha256) {
      throw new Error(`Cached registry file ${path} was modified. Re-fetch the artifact.`);
    }
  }
}

function normalizePackagePath(path) {
  const cleaned = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!cleaned || cleaned.startsWith("../") || cleaned.includes("/../") || isAbsolute(cleaned)) {
    throw new Error(`Unsafe registry file path: ${path}.`);
  }
  return cleaned;
}

function cacheArtifact(root, hash, artifact) {
  const match = hash.match(HASH_RE);
  if (!match) throw new Error("Cannot cache an invalid artifact hash.");
  const path = join(cacheDir(root), "artifacts", `${match[1]}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeJson(path, artifact);
}

function readCachedArtifact(root, hash) {
  const match = String(hash).match(HASH_RE);
  if (!match) throw new Error("Cached artifact hash is invalid.");
  const path = join(cacheDir(root), "artifacts", `${match[1]}.json`);
  if (!existsSync(path)) throw new Error(`Cached artifact ${hash} is missing.`);
  return readJson(path, "cached registry artifact");
}

function packageCacheDir(root, hash) {
  const match = String(hash).match(HASH_RE);
  if (!match) throw new Error("Package artifact hash is invalid.");
  return join(cacheDir(root), "packages", match[1]);
}

function ensureCache(root) {
  const dir = cacheDir(root);
  mkdirSync(join(dir, "artifacts"), { recursive: true });
  mkdirSync(join(dir, "packages"), { recursive: true });
  const indexPath = join(dir, "index.json");
  if (!existsSync(indexPath)) writeJson(indexPath, { version: 1, packages: {} });
  return dir;
}

function cacheDir(root) {
  return join(ensureTraitWorkspace(root), "cache");
}

function readCacheIndex(root) {
  const path = join(ensureCache(root), "index.json");
  const index = readJson(path, "registry cache index");
  if (index?.version !== 1 || !index.packages || typeof index.packages !== "object") {
    throw new Error("Invalid registry cache index.");
  }
  return index;
}

function writeCacheIndex(root, index) {
  writeJson(join(ensureCache(root), "index.json"), index);
}

function readTrust(root) {
  const path = join(ensureTraitWorkspace(root), "trust.json");
  if (!existsSync(path)) return { version: 1, publishers: {} };
  const trust = readJson(path, "publisher trust store");
  if (trust?.version !== 1 || !trust.publishers || typeof trust.publishers !== "object") {
    throw new Error("Invalid .trait/trust.json.");
  }
  return trust;
}

function writeTrust(root, trust) {
  writeJson(join(ensureTraitWorkspace(root), "trust.json"), trust);
}

function assertPublisherTrusted(root, publisher) {
  const trust = readTrust(root);
  const entry = trust.publishers[publisher.id];
  const fingerprint = fingerprintPublicKey(publisher.publicKey);
  if (!entry) {
    throw new Error(
      `Publisher "${publisher.id}" is not trusted. Inspect the package, then run trait registry trust with fingerprint ${fingerprint}.`
    );
  }
  if (entry.status !== "trusted") {
    throw new Error(`Publisher "${publisher.id}" is revoked in this project's trust store.`);
  }
  if (entry.fingerprint !== fingerprint || entry.publicKey !== publisher.publicKey) {
    throw new Error(`Publisher "${publisher.id}" key does not match the trusted fingerprint.`);
  }
}

function cachedResult(parsed, entry) {
  return {
    name: parsed.name,
    version: parsed.version,
    artifactHash: entry.artifactHash,
    publisher: entry.publisher,
    source: `registry:${parsed.name}@${parsed.version}#${entry.artifactHash}`
  };
}

function parseRegistrySource(source) {
  const raw = String(source ?? "");
  if (!raw.startsWith("registry:")) throw new Error("Not a registry source.");
  const [spec, fragment] = raw.slice("registry:".length).split("#", 2);
  const parsed = parseRegistrySpec(spec);
  let artifactHash = null;
  if (fragment) {
    if (!HASH_RE.test(fragment)) throw new Error("Pinned registry source has an invalid artifact hash.");
    artifactHash = fragment;
  }
  return { ...parsed, artifactHash };
}

function packageKey(parsed) {
  return `${parsed.name}@${parsed.version}`;
}

function normalizeRegistryBase(value) {
  const input = String(value ?? "").trim();
  if (!input) throw new Error("Registry URL or path is required.");

  if (input.startsWith("https://")) return input.replace(/\/+$/, "") + "/";
  if (input.startsWith("http://localhost") || input.startsWith("http://127.0.0.1")) {
    return input.replace(/\/+$/, "") + "/";
  }
  if (input.startsWith("file://")) return input.replace(/\/+$/, "") + "/";
  if (isAbsolute(input) || input.startsWith(".")) return resolve(input);
  throw new Error("Remote registries must use HTTPS (localhost HTTP is allowed for development).");
}

async function readJsonResource(base, resource) {
  let bytes;

  if (base.startsWith?.("file://")) {
    bytes = readFileSync(join(fileURLToPath(base), ...resource.split("/")));
  } else if (!base.includes("://")) {
    bytes = readFileSync(join(base, ...resource.split("/")));
  } else {
    const response = await fetch(new URL(resource, base), { redirect: "follow" });
    if (!response.ok) throw new Error(`Registry request failed (${response.status}) for ${resource}.`);
    if (response.url.startsWith("http://") && !response.url.startsWith("http://localhost") && !response.url.startsWith("http://127.0.0.1")) {
      throw new Error("Registry redirected to insecure HTTP.");
    }
    bytes = Buffer.from(await response.arrayBuffer());
  }

  if (bytes.length > MAX_RESOURCE_BYTES) throw new Error(`Registry resource exceeds ${MAX_RESOURCE_BYTES} bytes.`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Registry resource ${resource} is not valid JSON: ${error.message}`);
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function isInside(root, target) {
  const fromRoot = relative(resolve(root), resolve(target));
  return fromRoot !== ".." && !fromRoot.startsWith("../") && !fromRoot.startsWith("..\\") && !isAbsolute(fromRoot);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label}: ${error.message}`);
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
