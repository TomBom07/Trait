# Design notes

Trait's unit of reuse is behavior.

Package managers are excellent at reusing implementations. Agent instruction files are useful for teaching an agent how a team likes to work. Neither is a clean fit for a behavior such as "make this operation idempotent" when the implementation has to become native to the host codebase.

The CLI has two separate jobs:

1. resolve a behavior contract and inspect the host repository;
2. ask a coding agent to adapt that contract to the code that is already there;
3. run the repository's own deterministic checks;
4. run a second, read-only evaluation against the contract's acceptance criteria;
5. record the contract only when both layers pass.

The implementation agent is not allowed to certify its own work. The verifier gets a fresh prompt, runs without write permission, and has to return a structured result for every acceptance ID. A `pass` is only accepted when it points to a real repository file. Trait validates the path and line range itself and stores a SHA-256 of the cited file in the evidence receipt. Missing or invented evidence is downgraded to `unknown`.

That still does not turn a model judgment into a formal proof. The receipt is meant to be inspectable evidence: a deterministic test result plus a constrained claim about where the repository satisfies each behavioral requirement. As more criteria become machine-checkable, those checks should replace model judgment rather than sit beside it forever.

`.trait/lock.json` records what behavior contract was applied and the last successful verification. It is not meant to claim ownership of the resulting source files. Once behavior is integrated into a codebase, normal developers should be able to refactor it without fighting a generated file boundary.

The generated prompts and evidence receipts live under `.trait/runs/` and `.trait/evidence/`. Trait creates `.trait/.gitignore` for those directories; the lockfile remains the small piece of state worth committing.

`remove` is intentionally an agent operation rather than a reverse patch. A reverse patch is only correct if no one has touched the code since installation. The removal contract instead tells the agent what behavior to unwind while preserving shared infrastructure and later work.

The next trust problem is distribution. Arbitrary remote behavior contracts should not be treated like harmless prompt text: they steer an agent that can edit a repository. A public registry therefore needs provenance, immutable versions, reviewable package contents, and signing before it becomes the default source.
