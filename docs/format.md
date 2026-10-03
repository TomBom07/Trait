# Trait package format

A trait is deliberately smaller than a framework plugin. The package describes a behavior contract and gives an implementation agent enough context to adapt that contract to an existing repository.

Every package starts with `trait.json`. The stable pieces are:

- `name` and `version`: package identity.
- `intent`: what outcome the behavior exists to produce.
- `rules`: observable behavior the implementation must provide.
- `invariants`: things in the host application that must remain true.
- `security`: security constraints that are easy to lose when translating between stacks.
- `acceptance`: evidence a maintainer should be able to point to after the change. An acceptance item may declare a deterministic `grader`.
- `guidance`: optional implementation notes. Guidance can suggest techniques, but it should not turn the trait into a framework-specific patch.
- `verify.scripts`: ordinary host-project scripts Trait should run after an agent finishes, when those scripts exist.

## Why contracts instead of patches?

A patch encodes one implementation against one tree. A Trait package is useful when the same behavior needs to land in a Next.js app using Prisma, a Fastify service using Drizzle, or a codebase that did not exist when the package was authored.

That flexibility only works when the contract is specific about behavior. Vague instructions such as "add secure auth" are not traits. Good contracts name failure cases, ownership boundaries, invariants, and acceptance evidence.

## Stable IDs

Rule IDs are part of the package API. Keep an ID stable when wording improves but meaning does not. Add a new ID when the behavior changes materially. This makes future update tooling able to explain contract deltas rather than diffing prose blindly.

## Trust

Trait packages can influence an agent that edits the current repository. Treat packages like executable development dependencies: review unknown sources before applying them. Version 0 only resolves bundled packages and local filesystem packages on purpose; a public registry needs provenance and signing before it should become the default path.


## Deterministic graders

An acceptance criterion can declare a host-project script as its grader:

```json
{
  "id": "accept.idempotency.concurrent",
  "text": "Concurrent requests racing on one key cannot both execute the protected operation.",
  "grader": {
    "type": "project-script",
    "script": "trait:idempotency:concurrent"
  }
}
```

Trait never executes a shell command supplied by the behavior package. The grader can only name a script that exists in the host project's own `package.json`. The implementation agent is told to create or maintain that host-native script when needed.

A passing deterministic grader is recorded directly in the evidence receipt and skips model judgment for that acceptance ID. A missing or failing configured grader is an explicit verification failure; Trait does not silently fall back to a model pass.
