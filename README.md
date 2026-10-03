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

## Implementation and verification are separate

Trait does not let the coding pass certify itself.

`trait add` first lets Codex adapt the contract to the repository. Trait then runs the host project's requested scripts. If those pass, a second Codex invocation runs **read-only** and evaluates every acceptance ID against the resulting repository.

A verifier result only counts as `pass` when it points to concrete repository evidence. Trait independently checks that the cited file exists, validates the line range, and records a SHA-256 of the file in `.trait/evidence/`. Bad or invented evidence becomes `unknown`, which prevents installation from being recorded as verified.

This is not a formal proof system. It is an inspectable evidence layer that is stricter than trusting an agent's completion message and can gradually be replaced by deterministic graders where a behavior allows it.

Generated run prompts and evidence receipts are ignored by `.trait/.gitignore`; `.trait/lock.json` is the small piece of project state intended to survive.

## Commands

```text
trait add <trait> [--plan] [--agent codex]
trait verify [trait] [--checks-only]
trait update [trait] [--plan] [--agent codex]
trait remove <trait> [--plan] [--agent codex]
trait list
```

`trait verify` reruns the host checks and evidence pass. `--checks-only` skips the model-assisted evidence pass when you only want the deterministic project scripts.

`remove` is also agent-driven. Trait deliberately does not pretend it can safely reverse an old patch after a codebase has evolved around it.

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

See [`docs/format.md`](docs/format.md) for the package contract and [`docs/design.md`](docs/design.md) for the reasoning behind the CLI.

## Why not just use an agent skill?

Skills are good at teaching an agent a workflow or giving it reusable expertise. Trait's target is narrower and more package-like: a **versioned behavior** that can be installed, updated, removed, locked, and verified against stable acceptance IDs across unrelated codebases.

The hard part is not prompting an agent to write code. The hard part is making reusable behavior specific enough to survive translation between stacks and verifiable enough that `installed` means more than "the model said it finished."

## Current limits

This is a `0.x` prototype, not a registry yet.

- Sources are bundled traits or local filesystem packages. A public registry needs provenance, immutable versions, reviewable contents, and signing before arbitrary remote contracts should become the default.
- Evidence verification is model-assisted when a criterion cannot be established by the host project's own scripts. A file citation and hash make the claim inspectable, not mathematically certain.
- Codex is the first execution and verification adapter. The agent boundary is intentionally small so other coding agents can be added without changing the package format.
- Trait does not yet understand behavioral dependencies or conflicts between traits.

The next milestones are deterministic acceptance graders where possible, then a signed registry and dependency/conflict semantics.
