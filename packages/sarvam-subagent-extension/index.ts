import { spawn } from "node:child_process";
import { join } from "node:path";
import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { createRlmStateStore } from "../rlm-state/index.ts";

type SubagentRole = "scout" | "worker" | "reviewer";

const ROLE_TOOLS: Record<SubagentRole, string> = {
	scout: "read,grep,find,ls",
	worker: "read,grep,find,ls,edit,write,bash",
	reviewer: "read,grep,find,ls,bash",
};

const ROLE_PROMPTS: Record<SubagentRole, string> = {
	scout:
		"You are the Sarvam 105B scout subagent. Inspect only the requested files/context. Do not edit files. Use the minimum necessary tool calls, then answer directly with concise findings, relevant paths, and open questions.",
	worker:
		"You are the Sarvam 105B worker subagent. Make only the assigned change inside the provided write scope. Read before editing and verify afterward.",
	reviewer:
		"You are the Sarvam 105B reviewer subagent. Review for bugs, regressions, unsafe edits, and missing tests. Lead with findings.",
};

const store = createRlmStateStore();

function text(value: string) {
	return [{ type: "text" as const, text: value }];
}

function runSubagent(role: SubagentRole, task: string, cwd: string, timeoutMs: number): Promise<string> {
	const cliPath = join(cwd, "pi-mono", "packages", "coding-agent", "dist", "cli.js");
	const providerPath = join(cwd, "packages", "sarvam-provider", "index.ts");
	const prompt = [
		ROLE_PROMPTS[role],
		"Child-agent protocol:",
		"- Complete this in print mode.",
		"- Do not wait for user input.",
		"- Do not start an interactive conversation.",
		"- Once you have enough context, stop using tools and provide the final answer.",
		"",
		`Task:\n${task}`,
	].join("\n");

	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[
				cliPath,
				"-e",
				providerPath,
				"--provider",
				"sarvam",
				"--model",
				"sarvam-105b",
				"--tools",
				ROLE_TOOLS[role],
				"--no-session",
				"--print",
				prompt,
			],
			{
				cwd,
				env: process.env,
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			},
		);

		let stdout = "";
		let stderr = "";
		const timeout = setTimeout(() => {
			child.kill();
			const partial = stdout.trim();
			if (partial) {
				resolve(`${partial}\n\n[Harness note: Sarvam subagent timed out after ${timeoutMs}ms; returning partial output.]`);
				return;
			}
			reject(new Error(`Sarvam subagent timed out after ${timeoutMs}ms. ${stderr.trim()}`.trim()));
		}, timeoutMs);

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timeout);
			if (code === 0) {
				resolve(stdout.trim() || "[subagent completed with empty stdout]");
				return;
			}
			reject(new Error(`Sarvam subagent exited with code ${code}.\n${stderr || stdout}`));
		});
	});
}

const sarvamSubagentTool = defineTool({
	name: "sarvam_subagent",
	label: "Sarvam Subagent",
	description: "Launch a child Pi process using Sarvam 105B as scout, worker, or reviewer.",
	promptSnippet: "Delegate a bounded task to a Sarvam 105B child agent",
	promptGuidelines: [
		"Use sarvam_subagent for bounded child-agent work that benefits from isolated context.",
		"Start with role scout for read-only reconnaissance.",
		"Pass sessionId when an RLM state session exists so the child call is recorded.",
	],
	parameters: Type.Object({
		role: Type.Union([Type.Literal("scout"), Type.Literal("worker"), Type.Literal("reviewer")], {
			description: "Subagent role. Use scout for the first smoke.",
		}),
		task: Type.String({ description: "Concrete bounded task for the child agent" }),
		sessionId: Type.Optional(Type.String({ description: "Optional RLM session id for child-call logging" })),
		timeoutSeconds: Type.Optional(Type.Number({ description: "Timeout in seconds. Defaults to 120." })),
	}),
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const timeoutMs = Math.max(10, params.timeoutSeconds ?? 240) * 1000;
		if (signal.aborted) {
			throw new Error("Sarvam subagent aborted before start.");
		}

		if (params.sessionId) {
			await store.appendChildCall(params.sessionId, {
				role: params.role,
				model: "sarvam/sarvam-105b",
				status: "running",
				input: { task: params.task },
			});
		}

		try {
			const output = await runSubagent(params.role as SubagentRole, params.task, ctx.cwd, timeoutMs);
			if (params.sessionId) {
				await store.appendChildCall(params.sessionId, {
					role: params.role,
					model: "sarvam/sarvam-105b",
					status: "completed",
					input: { task: params.task },
					output: { text: output },
				});
			}
			return {
				content: text(output),
				details: {
					role: params.role,
					model: "sarvam/sarvam-105b",
					output,
				},
			};
		} catch (error) {
			if (params.sessionId) {
				await store.appendChildCall(params.sessionId, {
					role: params.role,
					model: "sarvam/sarvam-105b",
					status: "failed",
					input: { task: params.task },
					output: { error: error instanceof Error ? error.message : String(error) },
				});
			}
			throw error;
		}
	},
});

export default function registerSarvamSubagent(pi: ExtensionAPI) {
	pi.registerTool(sarvamSubagentTool);
}
