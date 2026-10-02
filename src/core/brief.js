function bullets(items) {
  return items.map((item) => `- [${item.id}] ${item.text}`).join("\n");
}

function repoSummary(repo) {
  const lines = [];
  if (repo.projectName) lines.push(`Project: ${repo.projectName}`);
  if (repo.packageManager) lines.push(`Package manager: ${repo.packageManager}`);
  if (repo.frameworks.length) lines.push(`Detected stack: ${repo.frameworks.join(", ")}`);
  if (Object.keys(repo.scripts).length) lines.push(`Available scripts: ${Object.keys(repo.scripts).join(", ")}`);
  if (repo.topLevel.length) lines.push(`Top-level files: ${repo.topLevel.join(" ")}`);
  return lines.join("\n") || "No framework metadata was detected. Inspect the repository before changing it.";
}

export function buildAddBrief(loaded, repo) {
  const { manifest, guidance } = loaded;
  return `You are implementing the Trait behavior contract \`${manifest.name}@${manifest.version}\` in the current repository.

Trait contracts describe behavior, not a framework-specific patch. Fit the implementation into the architecture that is already here. Do not replace working subsystems just to match an example. Read the code before editing it, preserve public APIs where practical, and keep changes focused on this behavior.

## Repository context
${repoSummary(repo)}

## Intent
${manifest.intent}

## Required behavior
${bullets(manifest.rules)}

## Invariants
These must remain true after the implementation.
${bullets(manifest.invariants)}

${manifest.security?.length ? `## Security constraints\n${bullets(manifest.security)}\n\n` : ""}## Acceptance criteria
Add or update project-native tests where that is useful. Each criterion needs concrete evidence in the resulting code or tests.
${bullets(manifest.acceptance)}

${guidance ? `## Implementation notes\n${guidance}\n\n` : ""}## Working rules
- Follow the repository's existing naming, layout, formatting, and dependency choices.
- Prefer the smallest complete implementation over a parallel abstraction layer.
- Do not weaken existing tests, auth, validation, or error handling to make this pass.
- Run the relevant existing checks before you finish.
- If the contract conflicts with the repository, satisfy the intent while documenting the conflict in your final response.
`;
}

export function buildRemoveBrief(loaded, repo) {
  const { manifest } = loaded;
  return `Remove the behavior described by Trait \`${manifest.name}@${manifest.version}\` from the current repository.

This is not a blind revert. Inspect the repository first and remove only code, tests, configuration, dependencies, and migrations that exist specifically to support this behavior. Preserve unrelated work that may have changed since the trait was installed.

## Repository context
${repoSummary(repo)}

## Behavior being removed
${manifest.intent}

## Previously required behavior
${bullets(manifest.rules)}

## Working rules
- Keep the repository buildable and internally consistent.
- Do not remove shared infrastructure that other features now depend on.
- Clean up dead imports, flags, tests, routes, schema fields, and dependencies left behind by the removal.
- Run the relevant existing checks before you finish.
`;
}

export function buildUpdateBrief(previous, loaded, repo) {
  return `Update the installed Trait \`${loaded.manifest.name}\` from ${previous.version} to ${loaded.manifest.version}.

Treat this as a behavioral migration rather than a fresh rewrite. Inspect the implementation that already exists, preserve compatible choices, and make only the changes needed to satisfy the new contract.

${buildAddBrief(loaded, repo)}`;
}
