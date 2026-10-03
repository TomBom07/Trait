import { loadManifest } from "../core/manifest.js";
import { checkTraitRelations, orderTraitManifests } from "../core/relations.js";
import { readLock } from "../core/state.js";

export function orderCommand(sources, root) {
  if (!sources.length) throw new Error("order needs at least one trait name or path");

  const loaded = sources.map((source) => loadManifest(source, root));
  const planned = orderTraitManifests(loaded.map((item) => item.manifest));

  if (!planned.ok) {
    for (const cycle of planned.cycles) {
      process.stderr.write(`relation: dependency cycle: ${cycle.join(" -> ")}\n`);
    }
    return 1;
  }

  const sourceByName = new Map(loaded.map((item) => [item.manifest.name, item.source]));
  const virtualLock = structuredClone(readLock(root));

  for (const manifest of planned.order) {
    const replacing = virtualLock.traits[manifest.name] ? manifest.name : null;
    const check = checkTraitRelations(manifest, virtualLock, { replacing });
    if (!check.ok) {
      for (const error of check.errors) process.stderr.write(`relation: ${error}\n`);
      return 1;
    }

    virtualLock.traits[manifest.name] = {
      version: manifest.version,
      source: sourceByName.get(manifest.name),
      relations: manifest.relations ?? {}
    };
  }

  for (const manifest of planned.order) process.stdout.write(`${manifest.name}@${manifest.version}\n`);
  return 0;
}
