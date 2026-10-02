import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

export function findRepoRoot(start = process.cwd()) {
  let current = resolve(start);
  const root = parse(current).root;

  while (true) {
    if (existsSync(join(current, ".git")) || existsSync(join(current, "package.json"))) return current;
    if (current === root) return resolve(start);
    current = dirname(current);
  }
}

export function inspectRepo(root) {
  const packageJson = readJson(join(root, "package.json"));
  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {})
  };

  return {
    root,
    packageManager: detectPackageManager(root, packageJson),
    frameworks: detectFrameworks(dependencies),
    scripts: packageJson?.scripts ?? {},
    projectName: packageJson?.name ?? null,
    topLevel: safeList(root)
  };
}

export function defaultVerificationScripts(repo, requested = []) {
  const preferred = requested.length ? requested : ["test", "lint", "typecheck", "build"];
  return preferred.filter((name) => typeof repo.scripts[name] === "string");
}

function detectPackageManager(root, packageJson) {
  if (packageJson?.packageManager) return String(packageJson.packageManager).split("@")[0];
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  return packageJson ? "npm" : null;
}

function detectFrameworks(deps) {
  const checks = [
    ["next", "Next.js"],
    ["react", "React"],
    ["expo", "Expo"],
    ["@nestjs/core", "NestJS"],
    ["express", "Express"],
    ["fastify", "Fastify"],
    ["hono", "Hono"],
    ["@supabase/supabase-js", "Supabase"],
    ["prisma", "Prisma"],
    ["@prisma/client", "Prisma"],
    ["drizzle-orm", "Drizzle"]
  ];

  return [...new Set(checks.filter(([pkg]) => pkg in deps).map(([, label]) => label))];
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function safeList(root) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules")
      .slice(0, 30)
      .map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`);
  } catch {
    return [];
  }
}
