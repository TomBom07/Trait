import { satisfiesVersion } from "./semver.js";

export function checkTraitRelations(manifest, lock, { replacing = null } = {}) {
  const installed = new Map(Object.entries(lock?.traits ?? {}).filter(([name]) => name !== replacing));
  const errors = [];
  const relations = manifest.relations ?? {};

  for (const requirement of relations.requires ?? []) {
    const current = installed.get(requirement.name);
    if (!current) {
      errors.push(`${manifest.name} requires ${requirement.name} ${requirement.version ?? "*"}, but it is not installed.`);
      continue;
    }
    if (!satisfiesVersion(current.version, requirement.version ?? "*")) {
      errors.push(`${manifest.name} requires ${requirement.name} ${requirement.version}, but ${current.version} is installed.`);
    }
  }

  for (const conflict of relations.conflicts ?? []) {
    const current = installed.get(conflict.name);
    if (current && satisfiesVersion(current.version, conflict.version ?? "*")) {
      errors.push(`${manifest.name} conflicts with installed ${conflict.name}@${current.version} (${conflict.version ?? "*"}).`);
    }
  }

  for (const [name, current] of installed) {
    for (const conflict of current.relations?.conflicts ?? []) {
      if (conflict.name === manifest.name && satisfiesVersion(manifest.version, conflict.version ?? "*")) {
        errors.push(`Installed ${name}@${current.version} conflicts with ${manifest.name}@${manifest.version} (${conflict.version ?? "*"}).`);
      }
    }
  }

  const capabilities = providedCapabilities(installed);
  for (const capability of relations.requiresCapabilities ?? []) {
    if (!capabilities.has(capability)) {
      errors.push(`${manifest.name} requires capability "${capability}", but no installed trait provides it.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function checkTraitRemoval(name, lock) {
  const target = lock?.traits?.[name];
  if (!target) return { ok: true, errors: [] };

  const remaining = new Map(Object.entries(lock.traits).filter(([installed]) => installed !== name));
  const capabilitiesAfterRemoval = providedCapabilities(remaining);
  const errors = [];

  for (const [otherName, item] of remaining) {
    for (const requirement of item.relations?.requires ?? []) {
      if (requirement.name === name && satisfiesVersion(target.version, requirement.version ?? "*")) {
        errors.push(`${otherName}@${item.version} requires ${name} ${requirement.version ?? "*"}.`);
      }
    }

    for (const capability of item.relations?.requiresCapabilities ?? []) {
      const targetProvided = new Set(target.relations?.provides ?? []);
      if (targetProvided.has(capability) && !capabilitiesAfterRemoval.has(capability)) {
        errors.push(`${otherName}@${item.version} requires capability "${capability}", which only ${name} currently provides.`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function orderTraitManifests(manifests) {
  const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]));
  const temporary = new Set();
  const permanent = new Set();
  const order = [];
  const cycles = [];

  function visit(name, path = []) {
    if (permanent.has(name)) return;
    if (temporary.has(name)) {
      const start = path.indexOf(name);
      cycles.push([...path.slice(start), name]);
      return;
    }

    temporary.add(name);
    const manifest = byName.get(name);
    for (const requirement of manifest?.relations?.requires ?? []) {
      if (byName.has(requirement.name)) visit(requirement.name, [...path, name]);
    }
    temporary.delete(name);
    permanent.add(name);
    if (manifest) order.push(manifest);
  }

  for (const name of byName.keys()) visit(name, []);

  return {
    ok: cycles.length === 0,
    order,
    cycles
  };
}

function providedCapabilities(installed) {
  const capabilities = new Set();
  for (const [, item] of installed) {
    for (const capability of item.relations?.provides ?? []) capabilities.add(capability);
  }
  return capabilities;
}
