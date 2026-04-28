// Feature report CLI. Product-phase choice: turn trail + feature state into a
// compact user-facing run summary so blocked and successful runs are both easy
// to understand without reading JSONL.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import kleur from "kleur";
import { getFeature } from "../features/store.js";
import { slugify } from "../features/types.js";
import { readTrail } from "../trail/reader.js";
import { TrailRecord } from "../trail/types.js";

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

export async function runReport(featureName: string | undefined): Promise<void> {
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
  console.log(`Tool echo syntheses: ${report.counts.toolEchoSyntheses}`);
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
    console.log(kleur.bold("Latest Quality Block"));
    console.log(`Gate: ${report.latestQualityBlock.gate}`);
    console.log(`Reason: ${report.latestQualityBlock.reason}`);
    console.log(`Repairs: ${report.latestQualityBlock.repairAttempts}`);
    console.log(`Changed files: ${report.latestQualityBlock.changedFiles.join(", ") || "(none)"}`);
    console.log(`Next: ${report.latestQualityBlock.nextAction}`);
  }
  console.log("");
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
