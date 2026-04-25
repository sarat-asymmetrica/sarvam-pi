// Compile/import gate for the Feature Done Contract.
// Foundation-phase choice: use cheap local project commands before claiming VERIFIED,
// and skip only when the current stack has no trustworthy local gate yet.
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { ProjectSpec } from "../spec/types.js";

export type CompileGateStatus = "passed" | "failed" | "skipped";

export interface CompileGateResult {
  status: CompileGateStatus;
  ok: boolean;
  language: string;
  command: string | null;
  cwd: string;
  durationMs: number;
  stdout: string;
  stderr: string;
  reason?: string;
}

export interface CompileGateOptions {
  cwd: string;
  scopePath?: string;
  spec: ProjectSpec | null;
  timeoutMs?: number;
}

export function runCompileOrImportGate(opts: CompileGateOptions): CompileGateResult {
  const started = Date.now();
  const language = normalizeLanguage(opts.spec?.primaryStack.lang);
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const scopedPath = opts.scopePath ? resolve(opts.cwd, opts.scopePath) : opts.cwd;

  const planned = planGate(language, opts.cwd, scopedPath);
  if (!planned) {
    return {
      status: "skipped",
      ok: true,
      language,
      command: null,
      cwd: opts.cwd,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: "",
      reason: `no compile/import gate configured for ${language}`,
    };
  }

  if (planned.skipReason) {
    return {
      status: "skipped",
      ok: true,
      language,
      command: null,
      cwd: planned.cwd,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: "",
      reason: planned.skipReason,
    };
  }

  const child = spawnSync(planned.command, planned.args, {
    cwd: planned.cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    shell: process.platform === "win32",
  });
  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  const timedOut = child.error?.message.toLowerCase().includes("timed out") ?? false;
  const ok = child.status === 0 && !child.error;

  return {
    status: ok ? "passed" : "failed",
    ok,
    language,
    command: commandText(planned.command, planned.args),
    cwd: planned.cwd,
    durationMs: Date.now() - started,
    stdout,
    stderr,
    reason: ok
      ? undefined
      : timedOut
        ? `gate timed out after ${timeoutMs}ms`
        : child.error
          ? child.error.message
          : `gate exited with code ${child.status}`,
  };
}

interface GatePlan {
  command: string;
  args: string[];
  cwd: string;
  skipReason?: string;
}

function planGate(language: string, cwd: string, scopedPath: string): GatePlan | null {
  if (language === "go") {
    const root = findUp(scopedPath, cwd, "go.mod");
    return root
      ? { command: "go", args: ["build", "./..."], cwd: root }
      : { command: "go", args: [], cwd, skipReason: "no go.mod found" };
  }

  if (language === "typescript" || language === "javascript") {
    const root = findUp(scopedPath, cwd, "package.json");
    if (!root) return { command: "npm", args: [], cwd, skipReason: "no package.json found" };
    if (!existsSync(join(root, "tsconfig.json"))) {
      return { command: "npm", args: [], cwd: root, skipReason: "no tsconfig.json found" };
    }
    const tsc = process.platform === "win32"
      ? join(root, "node_modules", ".bin", "tsc.cmd")
      : join(root, "node_modules", ".bin", "tsc");
    return existsSync(tsc)
      ? { command: tsc, args: ["--noEmit"], cwd: root }
      : { command: "npx", args: ["tsc", "--noEmit"], cwd: root };
  }

  if (language === "python") {
    const files = listPythonFiles(scopedPath, cwd).slice(0, 200);
    if (files.length === 0) {
      return { command: "python", args: [], cwd, skipReason: "no Python files found" };
    }
    return { command: "python", args: ["-m", "py_compile", ...files], cwd };
  }

  return null;
}

function normalizeLanguage(value: string | undefined): string {
  const raw = (value ?? "unknown").trim().toLowerCase();
  if (["ts", "typescript", "node-ts"].includes(raw)) return "typescript";
  if (["js", "javascript", "node"].includes(raw)) return "javascript";
  if (["py", "python", "python3"].includes(raw)) return "python";
  if (["golang", "go"].includes(raw)) return "go";
  return raw || "unknown";
}

function findUp(start: string, boundary: string, marker: string): string | null {
  let current = existsSync(start) && statSync(start).isFile() ? dirname(start) : start;
  const stop = resolve(boundary);
  while (true) {
    if (existsSync(join(current, marker))) return current;
    if (current === stop) return null;
    const parent = dirname(current);
    if (parent === current || !current.startsWith(stop)) return null;
    current = parent;
  }
}

function listPythonFiles(start: string, cwd: string): string[] {
  const root = existsSync(start) ? start : cwd;
  const files: string[] = [];
  const visit = (path: string): void => {
    const st = statSync(path);
    if (st.isFile()) {
      if (extname(path) === ".py") files.push(path);
      return;
    }
    for (const entry of readdirSync(path)) {
      if (entry === ".git" || entry === "node_modules" || entry === "__pycache__") continue;
      visit(join(path, entry));
    }
  };
  visit(root);
  return files;
}

function commandText(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}
