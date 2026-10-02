# Trait

**Distribute behavior, not framework code.**

Package managers distribute implementations. Agent instruction files distribute working context. Trait is an experiment in distributing a third thing: **behavior contracts** that a coding agent can adapt to the architecture already in a repository.

```text
$ trait add auth/passkeys
Trait auth/passkeys@0.1.0

→ codex implements the contract in this repository
→ npm run test
→ npm run typecheck
→ npm run lint

Installed auth/passkeys@0.1.0.
```

A passkey Trait does not ship a generic auth module and ask every project to bend around it. It says what registration and authentication must do, what security properties cannot be lost, what existing behavior must survive, and what evidence should exist when the change is finished. The agent chooses the implementation that belongs in the host project.

## Try the contract before letting an agent edit anything

Trait is early. Start with plan mode so you can see exactly what the agent would receive:

```bash
npm install
node src/cli.js add auth/passkeys --plan
```

The repository currently ships two example contracts:

```bash
trait add auth/passkeys --plan
trait add api/idempotency --plan
```

When the Codex CLI is installed and authenticated, omit `--plan` to apply the behavior. Trait writes the generated task to an ignored `.trait/runs/` file, invokes `codex exec --full-auto` against that task, then runs the relevant `test`, `typecheck`, `lint`, or `build` scripts requested by the contract when the host project actually defines them. The contract is only written to `.trait/lock.json` after that flow succeeds.

## Commands

```text
trait add <trait> [--plan] [--agent codex]
trait verify [trait]
trait update [trait] [--plan] [--agent codex]
trait remove <trait> [--plan] [--agent codex]
trait list
```

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
    { "id": "api.idempotency.replay", "text": "Repeating the same operation with the same key returns the stored result." }
  ],
  "invariants": [
    { "id": "api.transaction.atomic", "text": "The side effect and idempotency state cannot diverge in a way that causes duplicate execution." }
  ],
  "acceptance": [
    { "id": "accept.idempotency.concurrent", "text": "Concurrent requests racing on one key cannot both execute the protected operation." }
  ]
}
```

See [`docs/format.md`](docs/format.md) for the package contract and [`docs/design.md`](docs/design.md) for the reasoning behind the CLI.

## Why not just use an agent skill?

Skills are great at teaching an agent a workflow or giving it reusable expertise. Trait's target is narrower and more package-like: a versioned behavior that can be installed, updated, removed, locked, and eventually verified against stable acceptance IDs across unrelated codebases.

The hard part is not prompting an agent to write code. The hard part is making reusable behavior specific enough to survive translation between stacks and verifiable enough that `installed` means more than "the model said it finished." That is the problem this repository is trying to solve.

## Current limits

This is a `0.1` prototype, not a registry yet.

- Sources are bundled traits or local filesystem packages. A public registry needs provenance/signing before arbitrary remote contracts should become the default.
- Verification currently runs the host project's relevant scripts. It does not yet produce machine-checkable evidence for every acceptance ID.
- Codex is the first execution adapter. The agent boundary is intentionally small so other coding agents can be added without changing the package format.

Those are product boundaries, not README TODO decoration. The next milestone is an evidence model for acceptance criteria, then a registry built around signed, reviewable contracts.
