// Test driver — runs runSarvamInterview against a fixture's scriptedAnswers
// and dumps the result as JSON on stdout. Spawned by smoke.mjs via tsx.
//
// Args: <fixture-id>  <fixture-cwd>
//
// Writes to <fixture-cwd>/.shoshin/spec.json on success.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runSarvamInterview } from "../../packages/shoshin-harness/src/spec/sarvam_interview.js";
import { writeSpec } from "../../packages/shoshin-harness/src/spec/store.js";
import { ensureShoshinDir } from "../../packages/shoshin-harness/src/util/paths.js";
import { logTrail } from "../../packages/shoshin-harness/src/trail/writer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureId = process.argv[2];
const fixtureCwd = process.argv[3];
if (!fixtureId || !fixtureCwd) {
  console.error("usage: run_fixture.ts <fixture-id> <fixture-cwd>");
  process.exit(2);
}

interface Fixture {
  id: string;
  language: string;
  scriptName: string;
  userTurns: string[];
  expectedSpec: Record<string, unknown>;
  expectedHostMarkers: string[];
}

const data = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures.json"), "utf8"),
) as { fixtures: Fixture[] };

const fixture = data.fixtures.find((f) => f.id === fixtureId);
if (!fixture) {
  console.error(`fixture not found: ${fixtureId}`);
  process.exit(2);
}

async function main(): Promise<void> {
  // Critical: chdir so .shoshin/ + spec.json end up in the fixture dir.
  process.chdir(fixtureCwd);
  ensureShoshinDir();

  const result = await runSarvamInterview({
    cwd: fixtureCwd,
    scriptedAnswers: fixture!.userTurns,
    timeoutMsPerTurn: 90_000,
  });

  if (result.spec) {
    result.spec.source = "interview";
    writeSpec(result.spec, fixtureCwd);
    logTrail({
      kind: "spec_written",
      source: "interview",
      name: result.spec.name,
    });
  }

  // Dump the full result so smoke.mjs can inspect it.
  console.log("===FIXTURE_RESULT_BEGIN===");
  console.log(
    JSON.stringify(
      {
        fixtureId,
        reason: result.reason,
        turns: result.turns,
        detectedLanguage: result.language,
        expectedLanguage: fixture!.language,
        spec: result.spec,
        transcriptLines: result.transcript.length,
        hostTurns: result.transcript
          .filter((t) => t.who === "host")
          .map((t) => t.text),
        error: result.error,
      },
      null,
      2,
    ),
  );
  console.log("===FIXTURE_RESULT_END===");
}

main().catch((err) => {
  console.error("run_fixture failed:", err);
  process.exit(1);
});
