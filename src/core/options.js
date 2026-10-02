export function parseArgs(argv) {
  const positionals = [];
  const flags = new Map();

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const [rawKey, inline] = value.slice(2).split("=", 2);
    if (inline !== undefined) {
      flags.set(rawKey, inline);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--") && ["agent"].includes(rawKey)) {
      flags.set(rawKey, next);
      i += 1;
    } else {
      flags.set(rawKey, true);
    }
  }

  return { positionals, flags };
}

export function flag(options, name, fallback) {
  return options.flags.has(name) ? options.flags.get(name) : fallback;
}
