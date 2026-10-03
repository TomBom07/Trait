# Contributing

Trait is still small enough that changes should stay easy to audit.

## Development

Requirements:

- Node.js 20 or newer; CI covers Node 20, 22, and 24 on Linux and Windows
- npm
- Codex only for manual end-to-end agent runs; the unit suite does not require it

Run:

```bash
npm install --ignore-scripts
npm test
npm run smoke
npm run version
npm run packcheck
```

## Pull requests

Keep a pull request focused on one behavior or architectural decision. Include tests for new contract fields, resolver behavior, registry rules, or adapter capabilities.

For security-sensitive code, prefer an explicit failure over a permissive fallback. In particular:

- do not execute commands supplied directly by a remote Trait package;
- do not weaken registry signature, fingerprint, hash, or path validation;
- do not make remote fetching implicit;\n- do not broaden registry artifacts beyond manifest-referenced contract files without a security review;
- do not let an implementation agent certify its own work.

## Trait format changes

Stable IDs are part of a behavior contract's API. Avoid changing an ID merely to reword its description.

New package fields should have:

1. JSON schema coverage;
2. runtime validation;
3. CLI/runtime behavior;
4. tests;
5. format documentation.

## Style

Match the surrounding code. Prefer small modules and ordinary JavaScript over framework-heavy abstractions. Comments should explain non-obvious constraints rather than restating the code.
