// Static quality gate for vanilla HTML/SPAs.
// Foundation-phase choice: encode the first dogfood failures as cheap checks
// before investing in browser automation or full semantic UI review.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve, relative } from "node:path";
import { ProjectSpec } from "../spec/types.js";

export interface HtmlStaticGateIssue {
  file: string;
  code: "mojibake" | "unsafe_template_interpolation" | "missing_storage" | "missing_event_handler";
  message: string;
}

export interface HtmlStaticGateResult {
  ok: boolean;
  status: "passed" | "failed" | "skipped";
  root: string;
  filesChecked: number;
  issues: HtmlStaticGateIssue[];
  reason?: string;
}

export function runHtmlStaticGate(
  cwd: string,
  scopePath: string | undefined,
  spec: ProjectSpec | null,
): HtmlStaticGateResult {
  const stack = (spec?.primaryStack.lang ?? "").toLowerCase();
  const shape = (spec?.appShape ?? "").toLowerCase();
  const shouldRun = stack === "html" || stack === "javascript" || shape === "web";
  const root = resolve(cwd, scopePath ?? ".");
  if (!shouldRun) {
    return { ok: true, status: "skipped", root, filesChecked: 0, issues: [], reason: "not a web/html stack" };
  }
  if (!existsSync(root)) {
    return { ok: true, status: "skipped", root, filesChecked: 0, issues: [], reason: "scope path missing" };
  }

  const files = listHtmlFiles(root);
  if (files.length === 0) {
    return { ok: false, status: "failed", root, filesChecked: 0, issues: [{
      file: ".",
      code: "missing_event_handler",
      message: "web/html feature produced no .html files",
    }] };
  }

  const issues = files.flatMap((file) => checkHtmlFile(root, file));
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? "passed" : "failed",
    root,
    filesChecked: files.length,
    issues,
  };
}

function checkHtmlFile(root: string, file: string): HtmlStaticGateIssue[] {
  const text = readFileSync(file, "utf8");
  const name = relative(root, file).replace(/\\/g, "/");
  const issues: HtmlStaticGateIssue[] = [];

  if (/[ÃÂâ][\u0080-\u00bf]?|â‚¹|â€”|âœ|�/.test(text)) {
    issues.push({
      file: name,
      code: "mojibake",
      message: "file contains mojibake/replacement characters; check UTF-8 output fidelity",
    });
  }

  const templateInsertions = [...text.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1] ?? "");
  const riskyInsertions = templateInsertions.filter((expr) => {
    const trimmed = expr.trim();
    if (/^(this\.)?escapeHtml\(/.test(trimmed)) return false;
    if (/\.toFixed\(|Number\(|parseFloat\(|parseInt\(|Math\.|Date\(|new Date\(/.test(trimmed)) return false;
    if (/\.length$/.test(trimmed)) return false;
    if (/(\.|^)(id|index|quantity|qty|unitPrice|price|total|amount|count)$/i.test(trimmed)) return false;
    return /(note|name|item|description|text|label|title|user)/i.test(trimmed);
  });
  for (const expr of riskyInsertions) {
    issues.push({
      file: name,
      code: "unsafe_template_interpolation",
      message: `template interpolation may render user text without escaping: \${${expr}}`,
    });
  }

  if (!/localStorage\.(getItem|setItem)|indexedDB|sessionStorage\.(getItem|setItem)/.test(text)) {
    issues.push({
      file: name,
      code: "missing_storage",
      message: "SPA has no browser persistence call",
    });
  }

  if (!/addEventListener\s*\(\s*['"`](submit|click|input|change)/.test(text)) {
    issues.push({
      file: name,
      code: "missing_event_handler",
      message: "SPA has no visible form/click/input/change event handler",
    });
  }

  return issues;
}

function listHtmlFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (path: string): void => {
    const st = statSync(path);
    if (st.isFile()) {
      if (extname(path).toLowerCase() === ".html") out.push(path);
      return;
    }
    if (!st.isDirectory()) return;
    for (const entry of readdirSync(path)) {
      if (entry === ".git" || entry === "node_modules" || entry === ".shoshin") continue;
      visit(join(path, entry));
    }
  };
  visit(root);
  return out;
}
