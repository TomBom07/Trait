# Changelog

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

This remains a pre-1.0 project. The package format and registry protocol may still evolve.
