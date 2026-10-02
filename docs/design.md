# Design notes

Trait's unit of reuse is behavior.

Package managers are excellent at reusing implementations. Agent instruction files are useful for teaching an agent how a team likes to work. Neither is a clean fit for a behavior such as "make this operation idempotent" when the implementation has to become native to the host codebase.

The first CLI therefore does four things and little else:

1. resolve a behavior contract;
2. inspect enough of the host repository to avoid a context-free prompt;
3. hand the contract to a coding agent with explicit invariants and acceptance criteria;
4. run the repository's own checks and record the installed contract.

`.trait/lock.json` records what behavior contract was applied. It is not meant to claim ownership of the resulting source files. That distinction matters: once behavior is integrated into a codebase, normal developers should be able to refactor it without fighting a generated file boundary.

`remove` is intentionally an agent operation rather than a reverse patch. A reverse patch is only correct if no one has touched the code since installation. The removal contract instead tells the agent what behavior to unwind while preserving shared infrastructure and later work.

The next hard problem is verification. Running the host test suite protects regressions, but it does not prove every behavioral acceptance criterion. A later verifier should collect evidence per acceptance ID and make missing evidence explicit rather than pretending an agent exit code is proof.
