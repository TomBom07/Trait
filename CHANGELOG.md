# Changelog

## 1.0.0

First stable Trait compatibility boundary.

### Reliability and portability

- added a full lifecycle integration fixture covering install, deterministic verification, drift failure, recovery, and removal;
- CI now runs on Linux and Windows across Node 20, 22, and 24;
- package artifacts include the public docs, security policy, schema, bundled Traits, and CLI runtime.

### Registry hardening

- registry discovery uses a static non-authoritative catalog;
- publisher trust state is inspectable and auditable with optional local labels;
- registry packing rejects private signing keys stored inside the package directory;
- registry artifacts include only the manifest and its referenced guidance file;
- exact package versions use strict semantic-version syntax.

### Compatibility

- documented the stable v1 behavior-contract, lock, evidence, registry, and network boundaries in `docs/v1.md`;
- schema version 1, lock version 1, and registry format v1 are the compatibility baseline for the 1.x line.

## 0.9.0

- added reference Traits for API rate limiting, CSRF protection, retry-safe jobs, and security audit logging;
- added catalog-wide validation so every bundled contract must load with guidance and meaningful acceptance coverage;
- documented the starter behavior catalog and the criteria for adding future bundled Traits.

## 0.8.0

- registry pack now maintains a static searchable `v1/index.json` catalog;
- added `trait registry search` for package discovery;
- `registry inspect` reports local publisher trust state;
- trusted publisher entries can carry a human label;
- added `trait registry trusted` for auditing pinned publishers.

## 0.7.0

First complete public prototype of Trait.

### Behavior contracts

- versioned `trait.json` format with rules, invariants, security constraints, acceptance criteria, and implementation guidance;
- `add`, `update`, `remove`, `verify`, `list`, and relation-ordering workflows;
- repository-aware implementation briefs rather than framework-specific patches.

### Verification

- host-project test/typecheck/lint/build checks;
- separate read-only acceptance verification;
- durable evidence receipts with file hashes and drift detection;
- safe deterministic `project-script` graders that can replace model judgment per criterion.

### Composition

- required traits and small semver-style ranges;
- forward and reverse conflicts;
- provided and required capabilities;
- safe removal blockers;
- dependency cycle detection and `trait order`.

### Agents

- Codex implementation and read-only verification behind an explicit adapter boundary;
- fake adapter coverage for integration tests.

### Registry

- static signed registry protocol;
- SHA-256 content-addressed artifacts;
- Ed25519 publisher signatures;
- explicit inspect, fingerprint trust, fetch, revocation, cache, and offline flows;
- exact artifact hashes pinned in registry-backed sources;
- static registry packer for HTTPS bucket/CDN hosting.
