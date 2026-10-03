# Trait

**Distribute behavior, not framework code.**

Package managers distribute implementations. Agent instruction files distribute working context. Trait is an experiment in distributing a third thing: **behavior contracts** that a coding agent can adapt to the architecture already in a repository.

```text
$ trait add auth/passkeys
Trait auth/passkeys@0.1.0

→ codex implements the contract in this repository
→ npm run test
→ npm run typecheck
→ codex verify (read-only)

verified: 4/4 acceptance criteria passed.
  ✓ accept.passkeys.registration-roundtrip
  ✓ accept.passkeys.login-roundtrip
  ✓ accept.passkeys.bad-challenge
  ✓ accept.passkeys.cross-account

Installed auth/passkeys@0.1.0.
```

A passkey Trait does not ship a generic auth module and ask every project to bend around it. It says what registration and authentication must do, what security properties cannot be lost, what existing behavior must survive, and what evidence should exist when the change is finished. The implementation becomes native to the host project.

## Install from the repository

Trait currently ships as a pre-1.0 repository package rather than a published npm release.

```bash
git clone https://github.com/TomBom07/Trait.git
cd Trait
npm install --ignore-scripts
npm link
trait --version
```

You can also run the CLI directly with `node src/cli.js` while developing.

## Try the contract before letting an agent edit anything

Trait is early. Start with plan mode so you can see exactly what the implementation agent would receive:

```bash
npm install
node src/cli.js add auth/passkeys --plan
```

The repository currently ships two example contracts:

```bash
trait add auth/passkeys --plan
trait add api/idempotency --plan
```

When the Codex CLI is installed and authenticated, omit `--plan` to apply the behavior.

Registry packages are intentionally not fetched implicitly. `registry search` discovers packages from a non-authoritative static catalog; a remote package still goes through `inspect → trust → fetch` before `trait add registry:…` can use the verified local cache.

## Implementation and verification are separate

Trait does not let the coding pass certify itself.

`trait add` first lets the selected coding agent adapt the contract to the repository. Trait then runs the host project's requested scripts. Acceptance criteria can opt into a safe deterministic grader that names an existing project script; those criteria are decided without a model. Only criteria that remain unresolved are sent to a second, **read-only** verifier pass.

A verifier result only counts as `pass` when it points to concrete repository evidence. Trait independently checks that the cited file exists, validates the line range, and records a SHA-256 of the file in `.trait/evidence/`. Bad or invented evidence becomes `unknown`, which prevents installation from being recorded as verified.

This is not a formal proof system. Deterministic project-script graders are preferred where a behavior can be exercised mechanically; the inspectable model-evidence layer is the fallback for criteria that cannot yet be graded that way.

Generated run prompts stay ignored under `.trait/runs/`. Evidence receipts under `.trait/evidence/` and `.trait/lock.json` are durable project state: commit them if you want verification history to survive clones and CI.

## Commands

```text
trait add <trait> [--plan] [--agent codex]
trait verify [trait] [--checks-only] [--agent codex]
trait update [trait] [--plan] [--agent codex]
trait remove <trait> [--plan] [--agent codex]
trait list
trait order <trait...>
trait registry use <url>
trait registry search [query]
trait registry inspect <trait@version>
trait registry trust <trait@version> --fingerprint sha256:... [--label name]
trait registry trusted
trait registry fetch <trait@version> [--offline]
trait registry distrust <publisher>
trait registry pack <path> --publisher <id> --key <pem> --out <dir>
```

`trait verify` reruns the host checks and evidence pass. `--checks-only` skips the new model call, reruns the deterministic project scripts, and checks whether the files cited by the last receipt still have the recorded hashes. `trait list` reports a previously verified trait as `stale` when that evidence has drifted.

`trait order` resolves a supplied batch in dependency order and validates version requirements, capabilities, and conflicts against the current lockfile. `remove` is also agent-driven, but Trait blocks removal when another installed behavior still depends on that trait or on a capability it uniquely provides.

## What is in a Trait?

A package is a small directory with a `trait.json` contract and, optionally, implementation guidance.

```json
{
  "schemaVersion": 1,
  "name": "api/idempotency",
  "version": "0.1.0",
  "intent": "Clients can retry selected writes without executing them twice.",
  "rules": [
    {
      "id": "api.idempotency.replay",
      "text": "Repeating the same operation with the same key returns the stored result."
    }
  ],
  "invariants": [
    {
      "id": "api.transaction.atomic",
      "text": "The side effect and idempotency state cannot diverge in a way that causes duplicate execution."
    }
  ],
  "acceptance": [
    {
      "id": "accept.idempotency.concurrent",
      "text": "Concurrent requests racing on one key cannot both execute the protected operation."
    }
  ]
}
```

See [`docs/format.md`](docs/format.md) for the package contract, [`docs/design.md`](docs/design.md) for the reasoning behind the CLI, [`docs/registry.md`](docs/registry.md) for the signed registry protocol, and [`SECURITY.md`](SECURITY.md) before changing trust or execution boundaries.

## Why not just use an agent skill?

Skills are good at teaching an agent a workflow or giving it reusable expertise. Trait's target is narrower and more package-like: a **versioned behavior** that can be installed, updated, removed, locked, and verified against stable acceptance IDs across unrelated codebases.

The hard part is not prompting an agent to write code. The hard part is making reusable behavior specific enough to survive translation between stacks and verifiable enough that `installed` means more than "the model said it finished."

## Current limits

This is still a `0.x` prototype, but the trust model now has a concrete registry protocol.

- Registry packages are explicit rather than the default source: exact versions are content-addressed, Ed25519-signed, fingerprint-pinned, fully reviewable before trust, and cached locally.
- Acceptance criteria can use deterministic `project-script` graders. A remote Trait cannot supply arbitrary shell commands; it can only require a named script in the host project. Model-assisted evidence is used only for remaining criteria.
- Codex is the first built-in execution and verification adapter. Agent-specific probing, implementation execution, read-only verification, sandbox flags, and structured-output handling live behind a small adapter interface, so adding another coding agent does not change the package format or verification receipts.
- Trait supports explicit trait requirements, semver-style ranges, conflicts, and capability requirements. The resolver is deliberately small rather than a general-purpose SAT solver.

The remaining work before a 1.0-style release is mostly hardening: broader integration fixtures, registry hosting/discovery, stronger publisher identity UX, and more real-world Trait packages.
