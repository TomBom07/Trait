Treat duplicate delivery as normal queue behavior, not an exceptional edge case.

First identify the side effect that must not happen twice and the stable identity of the logical job. Prefer a transactional uniqueness constraint, an existing idempotency store, or a domain record that can atomically claim/completion-mark work. A process-memory "seen" set is not durable retry safety.

Use the queue library's existing retry and dead-letter concepts. Distinguish transient failures from permanent validation/business failures when the host stack supports that distinction.

Pay special attention to the crash window around external side effects. If the external system supports idempotency keys, propagate the stable logical job identity. If it does not, model the unavoidable failure window explicitly rather than claiming exactly-once delivery.

Tests should deliver the same logical job more than once and simulate a retry after a failure near the side effect boundary.
