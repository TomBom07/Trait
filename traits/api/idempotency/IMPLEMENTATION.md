Start with the smallest useful surface: opt specific mutating operations into idempotency instead of wrapping every request globally.

Build the request fingerprint from stable semantic input, not volatile headers. Persist the key together with its caller/operation scope, fingerprint, state, and replayable response data. The claim on a new key must be atomic. Use the database or transactional primitive the project already trusts; an in-memory mutex is not enough for a multi-process deployment.

If the protected side effect is external and cannot share the same transaction, model the intermediate state explicitly rather than pretending the write is atomic. Keep failure and retry semantics visible in the implementation and tests.
