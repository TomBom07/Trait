#!/usr/bin/env node

import { addCommand } from "./commands/add.js";
import { listCommand } from "./commands/list.js";
import { orderCommand } from "./commands/order.js";
import { registryCommand } from "./commands/registry.js";
import { removeCommand } from "./commands/remove.js";
import { updateCommand } from "./commands/update.js";
import { verifyCommand } from "./commands/verify.js";
import { flag, parseArgs } from "./core/options.js";
import { findRepoRoot } from "./core/repo.js";
import { VERSION } from "./core/version.js";

const HELP = `Trait — reusable behavior for codebases

Usage:
  trait add <namespace/name|path> [--agent codex] [--plan]
  trait verify [namespace/name] [--checks-only] [--agent codex]
  trait update [namespace/name] [--agent codex] [--plan]
  trait remove <namespace/name> [--agent codex] [--plan]
  trait list\n  trait order <trait...>
  trait registry use <url|path>
  trait registry search [query] [--registry url]\n  trait registry inspect <trait@version> [--registry url]
  trait registry trust <trait@version> --fingerprint sha256:... [--label name] [--registry url]\n  trait registry trusted
  trait registry fetch <trait@version> [--registry url] [--offline]
  trait registry distrust <publisher>
  trait registry pack <path> --publisher <id> --key <pem> --out <dir>

Examples:
  trait add auth/passkeys --plan
  trait add auth/passkeys
  trait verify auth/passkeys
  trait verify --checks-only
  trait update

A trait is a behavior contract: requirements, invariants, acceptance criteria and
implementation guidance. Trait adapts that contract to the code that already
exists, runs the host project's checks, then verifies each acceptance criterion
against concrete repository evidence.
`;

async function main(argv) {
  const [command = "help", ...rest] = argv;
  const parsed = parseArgs(rest);
  const root = findRepoRoot(process.cwd());
  const options = {
    agent: flag(parsed, "agent", undefined),
    plan: flag(parsed, "plan", false),
    checksOnly: flag(parsed, "checks-only", false),
    registry: flag(parsed, "registry", undefined),
    fingerprint: flag(parsed, "fingerprint", undefined),
    publisher: flag(parsed, "publisher", undefined),
    key: flag(parsed, "key", undefined),
    out: flag(parsed, "out", undefined),
    offline: flag(parsed, "offline", false),
    label: flag(parsed, "label", undefined)
  };

  switch (command) {
    case "version":
    case "--version":
    case "-v":
      process.stdout.write(`${VERSION}\n`);
      return 0;
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return 0;
    case "add":
      return addCommand(parsed.positionals[0], options, root);
    case "verify":
      return verifyCommand(parsed.positionals[0], options, root);
    case "list":
      return listCommand(root);
    case "order":
      return orderCommand(parsed.positionals, root);
    case "registry":
      return registryCommand(parsed.positionals, options, root);
    case "remove":
      if (!parsed.positionals[0]) throw new Error("remove needs a trait name");
      return removeCommand(parsed.positionals[0], options, root);
    case "update":
      return updateCommand(parsed.positionals[0], options, root);
    default:
      throw new Error(`Unknown command "${command}". Run trait help.`);
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`trait: ${error.message}\n`);
  process.exitCode = 1;
}
