# Registry protocol

Trait's registry is intentionally simple enough to host as static files.

A registry root contains:

```text
v1/
  packages/<namespace>/<name>/<version>.json
  artifacts/<sha256>.json
```

The package descriptor maps an exact package version to a content hash and publisher. The artifact at that hash contains the complete package payload and an Ed25519 signature.

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
trait registry inspect auth/passkeys@1.2.3
trait registry trust auth/passkeys@1.2.3 --fingerprint sha256:<fingerprint>
trait registry fetch auth/passkeys@1.2.3
trait add registry:auth/passkeys@1.2.3
```

`inspect` validates the artifact's self-signature and prints its publisher fingerprint, hash, summary, and complete file list. It does not establish identity.

`trust` requires the expected fingerprint. That fingerprint should be checked through a channel independent of the registry when identity matters.

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

The output directory can be served by an ordinary HTTPS static host.

Private keys are read only for packing and are never copied into the registry. The artifact contains the corresponding public key.
