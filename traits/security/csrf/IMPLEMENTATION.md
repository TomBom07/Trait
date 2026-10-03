Start by identifying which routes actually authenticate through browser cookies and which of those can mutate state. Protect that boundary rather than applying a blanket check to every request.

Use the mechanism that fits the host stack: a framework's maintained CSRF primitive, a synchronizer token tied to the user's session, a well-designed signed double-submit token, or strict trusted-origin verification where that model is sufficient. Preserve the application's existing session and cookie architecture.

Do not use CORS as the only protection. Do not accept a token merely because it exists; verify the binding required by the chosen design. Do not derive trusted origins from an untrusted Host header.

Tests should prove both the positive path and that the protected side effect does not occur on missing or mismatched proof. Include at least one route or authentication path that should remain outside the CSRF mechanism.
