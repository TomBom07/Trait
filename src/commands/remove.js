import { runAgent } from "../core/agent.js";
import { buildRemoveBrief } from "../core/brief.js";
import { loadManifest } from "../core/manifest.js";
import { inspectRepo } from "../core/repo.js";
import { forgetTrait, readLock } from "../core/state.js";
import { verifyProject } from "../core/verify.js";
import { sourceFromLock } from "./verify.js";

export function removeCommand(name, options, root) {
  const lock = readLock(root);
  const installed = lock.traits[name];
  if (!installed) throw new Error(`Trait "${name}" is not installed`);

  const loaded = loadManifest(sourceFromLock(installed.source), root);
  const repo = inspectRepo(root);
  const agent = options.agent ?? installed.agent ?? "codex";
  const plan = Boolean(options.plan);
  const result = runAgent({ agent, prompt: buildRemoveBrief(loaded, repo), cwd: root, dryRun: plan });

  if (plan) return 0;
  if (result.status !== 0) return result.status;

  const verification = verifyProject(root, loaded.manifest);
  if (!verification.ok) {
    process.stderr.write("\nProject checks failed after removal; lockfile was kept.\n");
    return 1;
  }

  forgetTrait(root, name);
  process.stdout.write(`\nRemoved ${name} from Trait state.\n`);
  return 0;
}
