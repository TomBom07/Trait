import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NAME_RE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;

export function validateManifest(value) {
  const errors = [];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["manifest must be a JSON object"];
  }

  if (value.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!NAME_RE.test(value.name ?? "")) errors.push("name must look like namespace/name");
  if (typeof value.version !== "string" || !/^\d+\.\d+\.\d+/.test(value.version)) {
    errors.push("version must be semver-like (for example 0.1.0)");
  }
  if (typeof value.summary !== "string" || value.summary.trim().length < 12) {
    errors.push("summary must be a useful sentence");
  }
  if (typeof value.intent !== "string" || value.intent.trim().length < 20) {
    errors.push("intent must explain the behavior being installed");
  }

  for (const field of ["rules", "invariants", "acceptance", ...(value.security === undefined ? [] : ["security"])]) {
    if (!Array.isArray(value[field]) || value[field].length === 0) {
      errors.push(`${field} must contain at least one item`);
      continue;
    }

    const seen = new Set();
    for (const item of value[field]) {
      if (!item || typeof item !== "object") {
        errors.push(`${field} entries must be objects`);
        continue;
      }
      if (typeof item.id !== "string" || !item.id.includes(".")) {
        errors.push(`${field} entries need stable dotted ids`);
      } else if (seen.has(item.id)) {
        errors.push(`${field} contains duplicate id ${item.id}`);
      } else {
        seen.add(item.id);
      }
      if (typeof item.text !== "string" || item.text.trim().length < 8) {
        errors.push(`${field}.${item.id ?? "?"} needs text`);
      }

      if (item.grader !== undefined) {
        if (field !== "acceptance") {
          errors.push(`${field}.${item.id ?? "?"} cannot define a grader`);
        } else if (!item.grader || typeof item.grader !== "object" || Array.isArray(item.grader)) {
          errors.push(`acceptance.${item.id ?? "?"}.grader must be an object`);
        } else {
          if (item.grader.type !== "project-script") {
            errors.push(`acceptance.${item.id ?? "?"}.grader.type must be project-script`);
          }
          if (typeof item.grader.script !== "string" || !item.grader.script.trim()) {
            errors.push(`acceptance.${item.id ?? "?"}.grader.script must name a project script`);
          }
        }
      }
    }
  }

  if (value.guidance !== undefined && typeof value.guidance !== "string") {
    errors.push("guidance must be a relative file path");
  }

  if (value.verify !== undefined) {
    if (!value.verify || typeof value.verify !== "object" || Array.isArray(value.verify)) {
      errors.push("verify must be an object");
    } else if (value.verify.scripts !== undefined && !Array.isArray(value.verify.scripts)) {
      errors.push("verify.scripts must be an array");
    }
  }

  return errors;
}

export function loadManifest(source, cwd = process.cwd()) {
  const resolved = resolveSource(source, cwd);
  const raw = readFileSync(resolved.manifestPath, "utf8");
  let manifest;

  try {
    manifest = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${resolved.manifestPath}: ${error.message}`);
  }

  const errors = validateManifest(manifest);
  if (errors.length) {
    throw new Error(`Invalid Trait manifest:\n- ${errors.join("\n- ")}`);
  }

  let guidance = "";
  if (manifest.guidance) {
    const guidancePath = resolve(resolved.baseDir, manifest.guidance);
    const guidanceRelative = relative(resolve(resolved.baseDir), guidancePath);
    if (guidanceRelative.startsWith("..") || isAbsolute(guidanceRelative)) {
      throw new Error("guidance must stay inside the trait package");
    }
    if (!existsSync(guidancePath)) throw new Error(`Missing guidance file: ${manifest.guidance}`);
    guidance = readFileSync(guidancePath, "utf8").trim();
  }

  return {
    manifest,
    guidance,
    source: resolved.source,
    checksum: createHash("sha256").update(raw).update("\0").update(guidance).digest("hex")
  };
}

export function resolveSource(source, cwd = process.cwd()) {
  if (!source) throw new Error("Missing trait name or path");

  const looksLikePath = source.startsWith(".") || source.startsWith("/") || source.includes("\\");
  if (looksLikePath || isAbsolute(source)) {
    const candidate = resolve(cwd, source);
    const manifestPath = candidate.endsWith(".json") ? candidate : join(candidate, "trait.json");
    if (!existsSync(manifestPath)) throw new Error(`No trait.json found at ${candidate}`);
    return { manifestPath, baseDir: dirname(manifestPath), source: `file:${candidate}` };
  }

  if (!NAME_RE.test(source)) {
    throw new Error(`Unknown trait source "${source}". Use namespace/name or a local path.`);
  }

  const baseDir = join(PACKAGE_ROOT, "traits", ...source.split("/"));
  const manifestPath = join(baseDir, "trait.json");
  if (!existsSync(manifestPath)) throw new Error(`Trait "${source}" is not bundled in this build`);
  return { manifestPath, baseDir, source: `builtin:${source}` };
}
