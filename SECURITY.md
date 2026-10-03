# Security

Trait lets behavior packages steer coding agents, so package trust is part of the security boundary.

## Reporting a vulnerability

Please do not publish exploitable security details in a public issue before there is a fix or mitigation.

If the repository has GitHub private vulnerability reporting enabled, use that channel. Otherwise open a minimal issue asking for a private security contact without including exploit details.

Useful reports include:

- affected Trait version;
- the command or registry flow involved;
- whether arbitrary repository writes, trust bypass, signature bypass, path traversal, or cache poisoning is possible;
- a minimal reproduction that does not contain secrets.

## Registry trust model

Remote Trait packages are never fetched implicitly by `trait add`.

The expected flow is:

1. inspect the exact package version;
2. verify the publisher fingerprint through a trusted channel;
3. explicitly trust that fingerprint;
4. fetch and verify the signed, content-addressed artifact;
5. install from the verified local cache.

Registry-backed lock entries pin the exact artifact hash. Publisher revocation blocks future fetches but does not silently rewrite historical lock state.

## Package authoring

A Trait package must not rely on arbitrary shell commands from the package itself. Deterministic graders can only name scripts that exist in the host project.

Treat implementation guidance as security-sensitive input. Keep it specific to the declared behavior and avoid instructions unrelated to the package contract.
