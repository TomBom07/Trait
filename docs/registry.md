# Registry protocol

Trait's registry is intentionally simple enough to host as static files.

A registry root contains:

```text
v1/
  index.json
  packages/<namespace>/<name>/<version>.json
  artifacts/<sha256>.json
```

`index.json` is a discovery catalog for search. It is deliberately non-authoritative. The package descriptor maps an exact package version to a content hash and publisher, and the artifact at that hash contains the complete package payload and an Ed25519 signature.

## Artifact identity

The signed payload contains:

- registry format version;
- publisher id and public key;
- exact trait name and version;
- every package file, its SHA-256, and its bytes.

Trait canonicalizes that payload, hashes it with SHA-256, and verifies the Ed25519 signature. The descriptor's artifact hash must match the signed payload.

The local lockfile never pins a mutable registry tag. A registry-backed source is recorded as:

```text
registry:auth/passkeys@1.2.3#sha256:<artifact hash>
```

## Trust flow

Fetching code that will steer a coding agent is an explicit operation:

```bash
trait registry use https://traits.example/
trait registry search passkey
trait registry inspect auth/passkeys@1.2.3
trait registry trust auth/passkeys@1.2.3 --fingerprint sha256:<fingerprint> --label "Acme security"
trait registry trusted
trait registry fetch auth/passkeys@1.2.3
trait add registry:auth/passkeys@1.2.3
```

`search` reads the registry catalog so packages can be discovered by name, summary, or publisher. Catalog entries are hints only; they never bypass artifact verification. `inspect` validates the artifact's self-signature and prints its publisher fingerprint, current local trust state, hash, summary, and complete file list. It does not establish identity.

`trust` requires the expected fingerprint. That fingerprint should be checked through a channel independent of the registry when identity matters. An optional local label makes the trust store easier to audit; `trait registry trusted` prints every pinned publisher and whether it is trusted or revoked.

`fetch` only caches artifacts signed by a publisher already trusted in `.trait/trust.json`.

## Cache and offline behavior

Verified artifacts are stored under `.trait/cache/`, which is local and ignored. The cache index remembers the exact hash observed for each name/version pair.

`trait registry fetch <package> --offline` verifies and reuses that cache without network access.

If a registry later points an already-observed version at a different artifact hash, Trait rejects the change instead of silently moving the version.

## Publisher compromise and revocation

```bash
trait registry distrust <publisher>
```

This marks the publisher as revoked in the project trust store. New online or offline fetches from that publisher are rejected.

Existing lock entries are not rewritten. A previously installed package remains pinned to its exact signed artifact hash, so revoking a publisher does not mutate historical project state behind the developer's back.

## Building a registry

Trait can produce the static descriptor/artifact layout directly:

```bash
trait registry pack ./my-trait \
  --publisher alice \
  --key ./alice-ed25519-private.pem \
  --out ./registry
```

The output directory can be served by an ordinary HTTPS static host. Every pack updates `v1/index.json`, so a static host is enough for both package discovery and immutable artifact delivery.

Private keys are read only for packing and are never copied into the registry. The packer rejects a signing key stored inside the Trait package directory. Registry v1 artifacts contain only `trait.json` and the guidance file referenced by that manifest; unrelated local files are outside the distribution boundary. The artifact contains the corresponding public key.
