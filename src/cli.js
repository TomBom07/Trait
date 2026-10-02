#!/usr/bin/env node

import { addCommand } from "./commands/add.js";
import { listCommand } from "./commands/list.js";
import { removeCommand } from "./commands/remove.js";
import { updateCommand } from "./commands/update.js";
import { verifyCommand } from "./commands/verify.js";
import { flag, parseArgs } from "./core/options.js";
import { findRepoRoot } from "./core/repo.js";

const HELP = `Trait — reusable behavior for codebases

Usage:
  trait add <namespace/name|path> [--agent codex] [--plan]
  trait verify [namespace/name]
  trait update [namespace/name] [--agent codex] [--plan]
  trait remove <namespace/name> [--agent codex] [--plan]
  trait list

Examples:
  trait add auth/passkeys --plan
  trait add auth/passkeys
  trait verify auth/passkeys
  trait update

A trait is a behavior contract: requirements, invariants, acceptance criteria and
implementation guidance. Trait asks an agent to adapt that contract to the code
that already exists, then runs the host project's relevant checks.
`;

function main(argv) {
  const [command = "help", ...rest] = argv;
  const parsed = parseArgs(rest);
  const root = findRepoRoot(process.cwd());
  const options = {
    agent: flag(parsed, "agent", undefined),
    plan: flag(parsed, "plan", false)
  };

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return 0;
    case "add":
      return addCommand(parsed.positionals[0], options, root);
    case "verify":
      return verifyCommand(parsed.positionals[0], root);
    case "list":
      return listCommand(root);
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
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`trait: ${error.message}\n`);
  process.exitCode = 1;
}
