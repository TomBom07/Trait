export function satisfiesVersion(version, range = "*") {
  const parsed = parseVersion(version);
  if (!parsed) return false;

  const trimmed = String(range || "*").trim();
  if (!trimmed || trimmed === "*") return true;

  if (trimmed.startsWith("^")) {
    const base = parseVersion(trimmed.slice(1));
    if (!base) return false;
    const upper = base.major > 0
      ? { major: base.major + 1, minor: 0, patch: 0 }
      : base.minor > 0
        ? { major: 0, minor: base.minor + 1, patch: 0 }
        : { major: 0, minor: 0, patch: base.patch + 1 };
    return compare(parsed, base) >= 0 && compare(parsed, upper) < 0;
  }

  if (trimmed.startsWith("~")) {
    const base = parseVersion(trimmed.slice(1));
    if (!base) return false;
    const upper = { major: base.major, minor: base.minor + 1, patch: 0 };
    return compare(parsed, base) >= 0 && compare(parsed, upper) < 0;
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return parts.every((part) => satisfiesComparator(parsed, part));

  if (/^(>=|<=|>|<)/.test(trimmed)) return satisfiesComparator(parsed, trimmed);

  const exact = parseVersion(trimmed);
  return exact ? compare(parsed, exact) === 0 : false;
}

export function parseVersion(value) {
  const match = String(value ?? "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function satisfiesComparator(version, comparator) {
  const match = comparator.match(/^(>=|<=|>|<)(.+)$/);
  if (!match) return satisfiesVersion(`${version.major}.${version.minor}.${version.patch}`, comparator);
  const target = parseVersion(match[2]);
  if (!target) return false;
  const result = compare(version, target);
  if (match[1] === ">=") return result >= 0;
  if (match[1] === "<=") return result <= 0;
  if (match[1] === ">") return result > 0;
  return result < 0;
}

function compare(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}
