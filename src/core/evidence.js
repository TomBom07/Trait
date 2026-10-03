import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { runEvidenceAgent } from "./agent.js";
import { ensureTraitWorkspace } from "./state.js";

const STATUSES = new Set(["pass", "fail", "unknown"]);
const EVIDENCE_KINDS = new Set(["test", "code", "config", "migration", "other"]);

export function collectEvidence(
  root,
  loaded,
  projectVerification,
  { agent = "codex", graderResults = null } = {}
) {
  ensureTraitWorkspace(root);

  const deterministic = new Map((graderResults?.checks ?? []).map((check) => [check.id, check]));
  const pending = loaded.manifest.acceptance.filter((criterion) => {
    const check = deterministic.get(criterion.id);
    return !check || check.status === "pending";
  });
  const deterministicFailed = [...deterministic.values()].some((check) => check.status === "fail");

  let modelChecks = [];
  if (!deterministicFailed && pending.length > 0) {
    const modelResult = collectModelEvidence(root, loaded, pending, agent);
    if (!modelResult.ok) return modelResult;
    modelChecks = modelResult.checks;
  }

  const modelById = new Map(modelChecks.map((check) => [check.id, check]));
  const checks = loaded.manifest.acceptance.map((criterion) => {
    const graded = deterministic.get(criterion.id);
    if (graded && graded.status !== "pending") {
      return {
        id: criterion.id,
        status: graded.status,
        evidence: [],
        notes: graded.notes,
        grader: graded.grader
      };
    }

    const modelCheck = modelById.get(criterion.id);
    if (modelCheck) return modelCheck;

    return {
      id: criterion.id,
      status: "unknown",
      evidence: [],
      notes: deterministicFailed
        ? "Model verification was skipped because a deterministic grader failed."
        : "No verifier result was produced for this criterion."
    };
  });

  return writeReceipt(root, loaded, projectVerification, checks);
}

export function inspectEvidenceReceipt(root, name, locked, { graderResults = null } = {}) {
  if (locked.verification?.status !== "pass") {
    return { ok: false, status: "unverified", note: "no successful evidence receipt is recorded" };
  }

  const receiptPath = evidenceReceiptPath(root, name);
  if (!existsSync(receiptPath)) {
    return { ok: false, status: "stale", note: "the recorded evidence receipt is missing" };
  }

  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  } catch (error) {
    return { ok: false, status: "stale", note: `the evidence receipt is unreadable: ${error.message}` };
  }

  const currentGraders = new Map((graderResults?.checks ?? []).map((check) => [check.id, check]));
  const reasons = [];
  if (receipt.trait !== name) reasons.push("trait name does not match");
  if (receipt.version !== locked.version) reasons.push("trait version does not match");
  if (receipt.traitChecksum !== locked.checksum) reasons.push("trait contract checksum does not match");
  if (receipt.overall !== "pass") reasons.push("receipt is not a successful verification");
  if (!Array.isArray(receipt.checks) || receipt.checks.length === 0) reasons.push("receipt has no acceptance checks");

  for (const check of Array.isArray(receipt.checks) ? receipt.checks : []) {
    if (check?.status !== "pass") {
      reasons.push(`${check?.id ?? "unknown criterion"} is not recorded as pass`);
      continue;
    }

    if (check.grader) {
      if (graderResults) {
        const current = currentGraders.get(check.id);
        if (current?.status !== "pass") {
          reasons.push(`${check.id}: deterministic grader no longer passes`);
        } else if (current.grader?.script !== check.grader.script) {
          reasons.push(`${check.id}: deterministic grader configuration changed`);
        }
      }
      continue;
    }

    if (!Array.isArray(check.evidence) || check.evidence.length === 0) {
      reasons.push(`${check.id} has no repository evidence`);
      continue;
    }

    for (const item of check.evidence) {
      const normalized = normalizeEvidenceItem(item, root);
      if (!normalized.ok) {
        reasons.push(`${check.id}: ${normalized.reason}`);
        continue;
      }
      if (normalized.value.sha256 !== item.sha256) {
        reasons.push(`${check.id}: ${normalized.value.path} changed since verification`);
      }
    }
  }

  if (reasons.length) {
    return { ok: false, status: "stale", note: reasons[0], reasons, receiptPath };
  }

  return {
    ok: true,
    status: "verified",
    note: `${receipt.checks.length}/${receipt.checks.length} acceptance criteria still match their recorded evidence`,
    receiptPath
  };
}

export function buildEvidenceSchema(manifest, acceptance = manifest.acceptance) {
  const ids = acceptance.map((item) => item.id);
  return {
    type: "object",
    additionalProperties: false,
    required: ["checks"],
    properties: {
      checks: {
        type: "array",
        minItems: ids.length,
        maxItems: ids.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "status", "evidence", "notes"],
          properties: {
            id: { type: "string", enum: ids },
            status: { type: "string", enum: ["pass", "fail", "unknown"] },
            evidence: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["path", "kind", "reason"],
                properties: {
                  path: { type: "string", minLength: 1 },
                  kind: { type: "string", enum: ["test", "code", "config", "migration", "other"] },
                  lineStart: { type: "integer", minimum: 1 },
                  lineEnd: { type: "integer", minimum: 1 },
                  reason: { type: "string", minLength: 1 }
                }
              }
            },
            notes: { type: "string" }
          }
        }
      }
    }
  };
}

export function normalizeEvidence(raw, manifest, root, acceptance = manifest.acceptance) {
  const expected = new Map(acceptance.map((item) => [item.id, item]));
  const returned = new Map();

  for (const check of Array.isArray(raw?.checks) ? raw.checks : []) {
    if (!expected.has(check?.id) || returned.has(check.id)) continue;
    returned.set(check.id, check);
  }

  return acceptance.map((criterion) => {
    const rawCheck = returned.get(criterion.id);
    if (!rawCheck || !STATUSES.has(rawCheck.status)) {
      return {
        id: criterion.id,
        status: "unknown",
        evidence: [],
        notes: "The evaluator did not return a valid result for this criterion."
      };
    }

    const rejected = [];
    const evidence = [];
    for (const item of Array.isArray(rawCheck.evidence) ? rawCheck.evidence : []) {
      const normalized = normalizeEvidenceItem(item, root);
      if (normalized.ok) evidence.push(normalized.value);
      else rejected.push(normalized.reason);
    }

    let status = rawCheck.status;
    let notes = typeof rawCheck.notes === "string" ? rawCheck.notes.trim() : "";
    if (status === "pass" && evidence.length === 0) {
      status = "unknown";
      notes = appendNote(notes, "Pass was downgraded because no valid repository evidence was provided.");
    }
    if (rejected.length) {
      notes = appendNote(notes, `Ignored invalid evidence: ${rejected.join("; ")}`);
    }

    return { id: criterion.id, status, evidence, notes };
  });
}

export function buildEvidencePrompt(manifest, acceptance = manifest.acceptance) {
  const lines = acceptance.map((item) => `- [${item.id}] ${item.text}`).join("\n");
  const context = [
    ...manifest.rules.map((item) => `- [${item.id}] ${item.text}`),
    ...manifest.invariants.map((item) => `- [${item.id}] ${item.text}`),
    ...(manifest.security ?? []).map((item) => `- [${item.id}] ${item.text}`)
  ].join("\n");

  return `You are the read-only verifier for Trait ${manifest.name}@${manifest.version}.

Inspect the current repository and evaluate every acceptance criterion listed below exactly once. Criteria already established by deterministic graders are intentionally omitted. Do not edit files, install packages, or trust a previous agent's summary.

Status rules:
- pass: concrete repository evidence is sufficient to establish the criterion.
- fail: concrete repository evidence shows the criterion is not satisfied.
- unknown: the repository does not contain enough evidence to prove or disprove it.

A pass must cite at least one real repository file. Prefer tests when they exercise the behavior. Code, configuration, and migrations can be supporting evidence. Do not use README files or Trait's own .trait directory as proof of runtime behavior. Keep evidence paths relative to the repository root and include precise line ranges when practical.

## Behavior context
${context}

## Acceptance criteria
${lines}

Return only the structured result required by the supplied JSON schema.`;
}

function collectModelEvidence(root, loaded, acceptance, agent) {
  const stamp = runStamp();
  const promptPath = join(root, ".trait", "runs", `${stamp}-verify.md`);
  const schemaPath = join(root, ".trait", "runs", `${stamp}-verify.schema.json`);
  const outputPath = join(root, ".trait", "runs", `${stamp}-verify.json`);
  const promptRelative = relative(root, promptPath).replaceAll("\\", "/");
  const schemaRelative = relative(root, schemaPath).replaceAll("\\", "/");
  const outputRelative = relative(root, outputPath).replaceAll("\\", "/");

  writeFileSync(promptPath, `${buildEvidencePrompt(loaded.manifest, acceptance).trim()}\n`, "utf8");
  writeFileSync(schemaPath, `${JSON.stringify(buildEvidenceSchema(loaded.manifest, acceptance), null, 2)}\n`, "utf8");

  const result = runEvidenceAgent({
    agent,
    cwd: root,
    promptPath: promptRelative,
    schemaPath: schemaRelative,
    outputPath: outputRelative
  });

  if (result.status !== 0) {
    return { ok: false, note: `Evidence evaluator exited with status ${result.status}.`, receipt: null };
  }
  if (!existsSync(outputPath)) {
    return { ok: false, note: "Evidence evaluator did not produce a result.", receipt: null };
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(outputPath, "utf8"));
  } catch (error) {
    return { ok: false, note: `Evidence output was not valid JSON: ${error.message}`, receipt: null };
  }

  return {
    ok: true,
    checks: normalizeEvidence(raw, loaded.manifest, root, acceptance)
  };
}

function writeReceipt(root, loaded, projectVerification, checks) {
  const receipt = {
    trait: loaded.manifest.name,
    version: loaded.manifest.version,
    traitChecksum: loaded.checksum,
    verifiedAt: new Date().toISOString(),
    overall: checks.every((check) => check.status === "pass") ? "pass" : "incomplete",
    projectChecks: projectVerification.results,
    checks
  };
  const receiptPath = evidenceReceiptPath(root, loaded.manifest.name);
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  return {
    ok: receipt.overall === "pass",
    note: summarizeEvidence(receipt),
    receipt,
    receiptPath: relative(root, receiptPath).replaceAll("\\", "/")
  };
}

function normalizeEvidenceItem(item, root) {
  if (!item || typeof item !== "object" || typeof item.path !== "string") {
    return { ok: false, reason: "missing path" };
  }

  const cleaned = item.path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!cleaned || cleaned === ".trait" || cleaned.startsWith(".trait/") || isAbsolute(cleaned)) {
    return { ok: false, reason: `${item.path} is not an allowed repository evidence path` };
  }

  const absolute = resolve(root, cleaned);
  const fromRoot = relative(root, absolute);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRoot)) {
    return { ok: false, reason: `${item.path} escapes the repository` };
  }
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    return { ok: false, reason: `${cleaned} does not exist` };
  }

  const content = readFileSync(absolute);
  const lineCount = content.toString("utf8").split("\n").length;
  const lineStart = validLine(item.lineStart, lineCount) ? item.lineStart : undefined;
  const lineEnd = validLine(item.lineEnd, lineCount) ? item.lineEnd : undefined;
  if (item.lineStart !== undefined && lineStart === undefined) {
    return { ok: false, reason: `${cleaned} has an invalid start line` };
  }
  if (item.lineEnd !== undefined && lineEnd === undefined) {
    return { ok: false, reason: `${cleaned} has an invalid end line` };
  }
  if (lineStart && lineEnd && lineEnd < lineStart) {
    return { ok: false, reason: `${cleaned} has a reversed line range` };
  }

  return {
    ok: true,
    value: {
      path: cleaned,
      kind: EVIDENCE_KINDS.has(item.kind) ? item.kind : "other",
      ...(lineStart ? { lineStart } : {}),
      ...(lineEnd ? { lineEnd } : {}),
      reason: typeof item.reason === "string" ? item.reason.trim() : "",
      sha256: createHash("sha256").update(content).digest("hex")
    }
  };
}

function validLine(value, lineCount) {
  return Number.isInteger(value) && value >= 1 && value <= lineCount;
}

export function evidenceReceiptPath(root, name) {
  const filename = `${name.replaceAll("/", "--")}.json`;
  return join(root, ".trait", "evidence", filename);
}

function summarizeEvidence(receipt) {
  const passed = receipt.checks.filter((check) => check.status === "pass").length;
  const failed = receipt.checks.filter((check) => check.status === "fail").length;
  const unknown = receipt.checks.length - passed - failed;
  return `${passed}/${receipt.checks.length} acceptance criteria passed${failed ? `, ${failed} failed` : ""}${unknown ? `, ${unknown} unknown` : ""}.`;
}

function appendNote(current, next) {
  return current ? `${current} ${next}` : next;
}

function runStamp() {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
}
