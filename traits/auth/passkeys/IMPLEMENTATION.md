Use the host application's auth/session primitives instead of creating a second auth stack.

Keep the WebAuthn ceremony split into server-generated options and server-side verification. Store only what the server needs to verify future assertions: credential id, public key, user/account id, counter or equivalent authenticator state, transports when useful, and human-facing metadata such as a display name and creation time.

Do not invent a new database layer just for this trait. If the project already uses an ORM or migration system, extend that system. Likewise, use the project's existing validation, API error shape, CSRF strategy, and session creation path.

Prefer a maintained WebAuthn library already compatible with the project's runtime. Browser code should feature-detect passkey support and fail cleanly when WebAuthn is unavailable.
