Implement rate limiting at the narrowest server-side boundary that already owns the protected operation.

Prefer the host project's existing middleware, cache, datastore, or gateway conventions. Do not introduce a second infrastructure stack solely for the Trait unless the repository has no suitable primitive.

Choose identity from trusted context. For authenticated operations, an account or credential identifier is usually safer than an address-only limit. When an address is part of the key, honor forwarded headers only when the deployment already has a trusted-proxy configuration.

The implementation must remain correct under concurrency and, where relevant, multiple application instances. A process-local map is not sufficient for a distributed deployment unless the contract is explicitly scoped to one process.

Add focused tests around the limit boundary, caller isolation, and concurrent attempts. Avoid timing-fragile sleeps when a fake clock or deterministic store can express the window.
