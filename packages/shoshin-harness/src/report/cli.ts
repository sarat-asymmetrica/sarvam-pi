// Feature report CLI. Product-phase choice: turn trail + feature state into a
// compact user-facing run summary so blocked and successful runs are both easy
// to understand without reading JSONL.
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import kleur from "kleur";
import { getFeature } from "../features/store.js";
import { slugify } from "../features/types.js";
import { readTrail } from "../trail/reader.js";
import { TrailRecord } from "../trail/types.js";
import { shoshinDir } from "../util/paths.js";

interface ReportCliOptions {
  html?: boolean;
}

export interface FeatureReport {
  feature: {
    id: string;
    name: string;
    state: string;
    scopePath: string | null;
    updatedAt: string;
  };
  counts: {
    repairs: number;
    sessions: number;
    totalTokens: number;
    toolEchoSyntheses: number;
  };
  gates: Array<{ gate: string; status: string; reason: string | null }>;
  latestQualityBlock: {
    gate: string;
    reason: string;
    changedFiles: string[];
    repairAttempts: number;
    nextAction: string;
  } | null;
  artifacts: string[];
}

export async function runReport(featureName: string | undefined, opts: ReportCliOptions = {}): Promise<void> {
  if (!featureName) {
    console.error(kleur.red("usage: shoshin report <feature>"));
    process.exit(2);
  }
  const cwd = process.cwd();
  const feature = getFeature(slugify(featureName), cwd);
  if (!feature) {
    console.error(kleur.red(`feature not found: ${featureName}`));
    process.exit(2);
  }

  const report = buildFeatureReport(feature.id, cwd);
  if (!report) {
    console.error(kleur.red(`feature not found: ${featureName}`));
    process.exit(2);
  }
  if (opts.html) {
    const outPath = writeHtmlReport(report, cwd);
    printReport(report);
    console.log(kleur.green(`HTML report: ${outPath}`));
    return;
  }
  printReport(report);
}

export function buildFeatureReport(featureId: string, cwd = process.cwd()): FeatureReport | null {
  const feature = getFeature(featureId, cwd);
  if (!feature) return null;
  const allRecords = readTrail(cwd);
  const featureRecords = allRecords.filter((record) => record.feature === feature.id);
  const sessions = allRecords.filter((record) => record.kind === "session_summary");
  const repairs = featureRecords.filter((record) => record.kind === "repair_attempt");
  const toolEchoSyntheses = allRecords.filter((record) => record.kind === "process_hygiene" && record.action === "tool_echo_synthesis");
  const qualityBlocks = featureRecords.filter((record) => record.kind === "quality_block");
  const gates = featureRecords
    .filter((record) =>
      record.kind === "mutation_gate" ||
      record.kind === "html_static_gate" ||
      record.kind === "browser_check" ||
      record.kind === "compile_gate",
    )
    .map(gateDigest);

  return {
    feature: {
      id: feature.id,
      name: feature.name,
      state: feature.state,
      scopePath: feature.scopePath ?? null,
      updatedAt: feature.updatedAt,
    },
    counts: {
      repairs: repairs.length,
      sessions: uniqueSessions(sessions).length,
      totalTokens: sessions.reduce((sum, record) => sum + Number(record.tokens?.total ?? 0), 0),
      toolEchoSyntheses: toolEchoSyntheses.length,
    },
    gates,
    latestQualityBlock: qualityBlocks.length ? qualityBlockDigest(qualityBlocks[qualityBlocks.length - 1]!) : null,
    artifacts: listArtifacts(cwd, feature.scopePath),
  };
}

function printReport(report: FeatureReport): void {
  console.log(kleur.bold(`\n${report.feature.name} (${report.feature.id})`));
  console.log(`${kleur.gray("State:")} ${report.feature.state}`);
  console.log(`${kleur.gray("Scope:")} ${report.feature.scopePath ?? "(none)"}`);
  console.log(`${kleur.gray("Updated:")} ${report.feature.updatedAt}`);
  console.log("");
  console.log(kleur.bold("Run Summary"));
  console.log(`Repairs: ${report.counts.repairs}`);
  console.log(`Sessions: ${report.counts.sessions}`);
  console.log(`Tokens: ${report.counts.totalTokens}`);
  console.log(`Final answer cleanups: ${report.counts.toolEchoSyntheses}`);
  console.log("");
  console.log(kleur.bold("Gates"));
  if (report.gates.length) {
    for (const gate of report.gates.slice(-8)) {
      console.log(`- ${gate.gate}: ${gate.status}${gate.reason ? ` - ${gate.reason}` : ""}`);
    }
  } else {
    console.log(kleur.gray("(no gates recorded)"));
  }
  console.log("");
  console.log(kleur.bold("Artifacts"));
  if (report.artifacts.length) {
    for (const artifact of report.artifacts.slice(0, 12)) console.log(`- ${artifact}`);
    if (report.artifacts.length > 12) console.log(kleur.gray(`- ... ${report.artifacts.length - 12} more`));
  } else {
    console.log(kleur.gray("(no artifacts found in scope)"));
  }
  if (report.latestQualityBlock) {
    console.log("");
    console.log(kleur.bold("Latest Blocked Result"));
    console.log(`Gate: ${report.latestQualityBlock.gate}`);
    console.log(`Reason: ${report.latestQualityBlock.reason}`);
    console.log(`Repairs: ${report.latestQualityBlock.repairAttempts}`);
    console.log(`Changed files: ${report.latestQualityBlock.changedFiles.join(", ") || "(none)"}`);
    console.log(`Next: ${report.latestQualityBlock.nextAction}`);
  }
  console.log("");
}

export function writeHtmlReport(report: FeatureReport, cwd = process.cwd()): string {
  const reportDir = join(shoshinDir(cwd), "reports");
  mkdirSync(reportDir, { recursive: true });
  const outPath = join(reportDir, `${report.feature.id}.html`);
  writeFileSync(outPath, renderHtmlReport(report), "utf8");
  return outPath;
}

export function renderHtmlReport(report: FeatureReport): string {
  const stateClass = report.latestQualityBlock ? "blocked" : report.feature.state === "MODEL_DONE" || report.feature.state === "DONE" ? "done" : "active";
  const gates = report.gates.length
    ? report.gates.slice(-12).map((gate) => `<li><span class="pill ${escapeAttr(gate.status)}">${escapeHtml(gate.status)}</span><strong>${escapeHtml(gate.gate)}</strong>${gate.reason ? `<span>${escapeHtml(gate.reason)}</span>` : ""}</li>`).join("")
    : `<li class="muted">No gates recorded yet.</li>`;
  const artifacts = report.artifacts.length
    ? report.artifacts.slice(0, 20).map((artifact) => `<li><a href="../../${escapeAttr(artifact)}">${escapeHtml(artifact)}</a></li>`).join("")
    : `<li class="muted">No artifacts found in scope.</li>`;
  const block = report.latestQualityBlock
    ? `<section>
        <h2>Latest Blocked Result</h2>
        <dl>
          <dt>Gate</dt><dd>${escapeHtml(report.latestQualityBlock.gate)}</dd>
          <dt>Reason</dt><dd>${escapeHtml(report.latestQualityBlock.reason)}</dd>
          <dt>Repairs</dt><dd>${report.latestQualityBlock.repairAttempts}</dd>
          <dt>Changed files</dt><dd>${escapeHtml(report.latestQualityBlock.changedFiles.join(", ") || "(none)")}</dd>
          <dt>Next</dt><dd>${escapeHtml(report.latestQualityBlock.nextAction)}</dd>
        </dl>
      </section>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.feature.name)} report</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1d2528; background: #f6f7f4; }
    body { margin: 0; }
    main { max-width: 980px; margin: 0 auto; padding: 32px 20px 48px; }
    header { border-bottom: 1px solid #d9ded7; padding-bottom: 18px; margin-bottom: 22px; }
    h1 { margin: 0 0 8px; font-size: 32px; line-height: 1.1; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 18px; letter-spacing: 0; }
    section { background: #ffffff; border: 1px solid #dfe4dd; border-radius: 8px; padding: 18px; margin: 14px 0; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; color: #566165; }
    .status { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: 13px; font-weight: 700; }
    .status.done { background: #dcefe3; color: #15572c; }
    .status.blocked { background: #f8ded9; color: #8a1f12; }
    .status.active { background: #e4edf7; color: #164b7a; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .metric { border: 1px solid #e2e6df; border-radius: 8px; padding: 12px; background: #fbfcfa; }
    .metric span { display: block; color: #667277; font-size: 13px; }
    .metric strong { display: block; font-size: 24px; margin-top: 4px; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 8px 0; }
    a { color: #0f5d73; }
    .pill { display: inline-block; min-width: 58px; text-align: center; border-radius: 999px; padding: 2px 8px; margin-right: 8px; font-size: 12px; font-weight: 700; background: #e8ece8; color: #354044; }
    .pill.passed { background: #dcefe3; color: #15572c; }
    .pill.failed { background: #f8ded9; color: #8a1f12; }
    .pill.skipped { background: #ece8dc; color: #695118; }
    dl { display: grid; grid-template-columns: 130px 1fr; gap: 8px 12px; margin: 0; }
    dt { color: #667277; }
    dd { margin: 0; }
    .muted { color: #667277; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(report.feature.name)}</h1>
      <div class="meta">
        <span class="status ${stateClass}">${escapeHtml(report.feature.state)}</span>
        <span>${escapeHtml(report.feature.id)}</span>
        <span>Scope: ${escapeHtml(report.feature.scopePath ?? "(none)")}</span>
        <span>Updated: ${escapeHtml(report.feature.updatedAt)}</span>
      </div>
    </header>
    <section>
      <h2>Run Summary</h2>
      <div class="grid">
        <div class="metric"><span>Repairs</span><strong>${report.counts.repairs}</strong></div>
        <div class="metric"><span>Sessions</span><strong>${report.counts.sessions}</strong></div>
        <div class="metric"><span>Tokens</span><strong>${report.counts.totalTokens}</strong></div>
        <div class="metric"><span>Final answer cleanups</span><strong>${report.counts.toolEchoSyntheses}</strong></div>
      </div>
    </section>
    <section>
      <h2>Gates</h2>
      <ul>${gates}</ul>
    </section>
    <section>
      <h2>Artifacts</h2>
      <ul>${artifacts}</ul>
    </section>
    ${block}
  </main>
</body>
</html>`;
}

function uniqueSessions(records: Extract<TrailRecord, { kind: "session_summary" }>[]): string[] {
  return [...new Set(records.map((record) => record.piSessionId).filter((id): id is string => Boolean(id)))];
}

function gateDigest(record: TrailRecord): { gate: string; status: string; reason: string | null } {
  switch (record.kind) {
    case "mutation_gate":
      return { gate: "mutation", status: record.status, reason: record.reason };
    case "html_static_gate":
      return { gate: "html_static", status: record.status, reason: record.reason ?? `${record.issueCount} issue(s)` };
    case "browser_check":
      return { gate: "browser", status: record.status, reason: record.reason };
    case "compile_gate":
      return { gate: "compile", status: record.status, reason: record.reason };
    default:
      return { gate: record.kind, status: "recorded", reason: null };
  }
}

function qualityBlockDigest(record: Extract<TrailRecord, { kind: "quality_block" }>): FeatureReport["latestQualityBlock"] {
  return {
    gate: record.gate,
    reason: record.reason,
    changedFiles: record.changedFiles,
    repairAttempts: record.repairAttempts,
    nextAction: record.nextAction,
  };
}

function listArtifacts(cwd: string, scopePath?: string): string[] {
  if (!scopePath) return [];
  const root = resolve(cwd, scopePath);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const visit = (path: string): void => {
    const st = statSync(path);
    if (st.isFile()) {
      out.push(path.replace(resolve(cwd), "").replace(/^[/\\]/, "").replace(/\\/g, "/"));
      return;
    }
    if (!st.isDirectory()) return;
    for (const entry of readdirSync(path)) {
      if (entry === ".git" || entry === "node_modules" || entry === ".shoshin") continue;
      visit(join(path, entry));
    }
  };
  visit(root);
  return out.sort();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
