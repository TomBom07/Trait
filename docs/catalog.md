# Bundled Trait catalog

The repository ships a deliberately small starter catalog. These are reference-quality behavior contracts, not a claim that every project should install all of them.

| Trait | Behavior |
| --- | --- |
| `auth/passkeys` | WebAuthn passkey registration, login, ownership, and revocation that preserves the host identity model. |
| `api/idempotency` | Safe retries for selected mutating API operations using scoped idempotency keys. |
| `api/rate-limit` | Server-enforced rate limits with caller isolation and concurrency-safe quota enforcement. |
| `security/csrf` | CSRF protection for cookie-authenticated state changes without coupling non-cookie API authentication. |
| `jobs/retry-safety` | Background-job behavior that survives duplicate delivery, retries, and partial failure. |
| `data/audit-log` | Append-oriented, access-controlled security audit events with explicit secret redaction. |

## What makes a useful Trait

A bundled Trait should describe a behavior that:

- appears across unrelated technology stacks;
- has important edge cases that generic code generation commonly misses;
- can be stated in observable rules and invariants;
- has meaningful acceptance evidence;
- does not require one framework-specific implementation.

The catalog intentionally avoids behaviors that are just dependency installation or boilerplate generation. Those already fit conventional package managers and templates well.

Use plan mode to inspect any contract before applying it:

```bash
trait add api/rate-limit --plan
trait add security/csrf --plan
trait add jobs/retry-safety --plan
trait add data/audit-log --plan
```
