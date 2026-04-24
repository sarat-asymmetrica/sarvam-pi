import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { createRlmStateStore } from "../rlm-state/index.ts";

const store = createRlmStateStore();

function text(content: string) {
	return [{ type: "text" as const, text: content }];
}

function json(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

const createSessionTool = defineTool({
	name: "rlm_create_session",
	label: "RLM Create Session",
	description: "Create a new file-backed RLM state session and return its manifest.",
	promptSnippet: "Create an external RLM state session",
	promptGuidelines: [
		"Use rlm_create_session once when starting a task that should persist trajectory, context, compaction, or child-call state.",
		"Keep the returned sessionId and pass it to other rlm_* tools.",
	],
	parameters: Type.Object({
		title: Type.Optional(Type.String({ description: "Short human-readable title for this RLM session" })),
	}),
	async execute(_toolCallId, params) {
		const manifest = await store.createSession(params.title);
		return {
			content: text(`Created RLM session ${manifest.id}`),
			details: manifest,
		};
	},
});

const appendTrajectoryTool = defineTool({
	name: "rlm_append_trajectory",
	label: "RLM Append Trajectory",
	description: "Append a JSON event to an RLM session trajectory log.",
	promptSnippet: "Append an event to external RLM trajectory state",
	promptGuidelines: [
		"Use rlm_append_trajectory to record important task events, tool milestones, decisions, and verification outcomes.",
	],
	parameters: Type.Object({
		sessionId: Type.String({ description: "RLM session id returned by rlm_create_session" }),
		type: Type.String({ description: "Event type, such as user_prompt, tool_result, decision, verification, or summary" }),
		summary: Type.String({ description: "Compact event summary" }),
		data: Type.Optional(Type.Any({ description: "Optional structured event data" })),
	}),
	async execute(_toolCallId, params) {
		await store.appendTrajectory(params.sessionId, {
			type: params.type,
			summary: params.summary,
			data: params.data,
		});
		return { content: text(`Appended trajectory event ${params.type}`) };
	},
});

const readContextTool = defineTool({
	name: "rlm_read_context",
	label: "RLM Read Context",
	description: "Read the active compact context for an RLM session.",
	promptSnippet: "Read active external RLM context",
	promptGuidelines: ["Use rlm_read_context before updating context so you preserve existing active files, invariants, and open questions."],
	parameters: Type.Object({
		sessionId: Type.String({ description: "RLM session id" }),
	}),
	async execute(_toolCallId, params) {
		const context = await store.readContext(params.sessionId);
		return {
			content: text(json(context)),
			details: context,
		};
	},
});

const writeContextTool = defineTool({
	name: "rlm_write_context",
	label: "RLM Write Context",
	description: "Replace the active compact context for an RLM session.",
	promptSnippet: "Write active external RLM context",
	promptGuidelines: [
		"Use rlm_write_context to maintain a compact active state: summary, activeFiles, openQuestions, and invariants.",
	],
	parameters: Type.Object({
		sessionId: Type.String({ description: "RLM session id" }),
		summary: Type.String({ description: "Compact active context summary" }),
		activeFiles: Type.Array(Type.String(), { description: "Files currently relevant to the task" }),
		openQuestions: Type.Array(Type.String(), { description: "Unresolved questions or risks" }),
		invariants: Type.Array(Type.String(), { description: "Constraints that must remain true" }),
	}),
	async execute(_toolCallId, params) {
		const context = {
			summary: params.summary,
			activeFiles: params.activeFiles,
			openQuestions: params.openQuestions,
			invariants: params.invariants,
		};
		await store.writeContext(params.sessionId, context);
		return {
			content: text(`Updated RLM context for ${params.sessionId}`),
			details: context,
		};
	},
});

const writeCompactionTool = defineTool({
	name: "rlm_write_compaction",
	label: "RLM Write Compaction",
	description: "Write a markdown compaction summary for an RLM session.",
	promptSnippet: "Write external RLM compaction summary",
	promptGuidelines: ["Use rlm_write_compaction when a task has enough history that a prompt-facing summary would help future turns."],
	parameters: Type.Object({
		sessionId: Type.String({ description: "RLM session id" }),
		markdown: Type.String({ description: "Markdown compaction summary" }),
	}),
	async execute(_toolCallId, params) {
		await store.writeCompaction(params.sessionId, params.markdown);
		return { content: text(`Wrote compaction summary for ${params.sessionId}`) };
	},
});

const appendChildCallTool = defineTool({
	name: "rlm_append_child_call",
	label: "RLM Append Child Call",
	description: "Append a planned or completed child/subagent call record to an RLM session.",
	promptSnippet: "Record a child/subagent call in external RLM state",
	promptGuidelines: [
		"Use rlm_append_child_call to record scout, worker, and reviewer subagent plans or results.",
		"For now, use model sarvam/sarvam-105b for all child roles.",
	],
	parameters: Type.Object({
		sessionId: Type.String({ description: "RLM session id" }),
		role: Type.String({ description: "Child role, such as scout, worker, or reviewer" }),
		model: Type.Optional(Type.String({ description: "Model used by the child call. Defaults to sarvam/sarvam-105b" })),
		status: Type.Union(
			[Type.Literal("planned"), Type.Literal("running"), Type.Literal("completed"), Type.Literal("failed")],
			{ description: "Child call status" },
		),
		input: Type.Optional(Type.Any({ description: "Optional child task/input payload" })),
		output: Type.Optional(Type.Any({ description: "Optional child result/output payload" })),
	}),
	async execute(_toolCallId, params) {
		const record = {
			role: params.role,
			model: params.model ?? "sarvam/sarvam-105b",
			status: params.status,
			input: params.input,
			output: params.output,
		};
		await store.appendChildCall(params.sessionId, record);
		return {
			content: text(`Appended ${record.role} child-call record with status ${record.status}`),
			details: record,
		};
	},
});

export default function registerRlmStateTools(pi: ExtensionAPI) {
	pi.registerTool(createSessionTool);
	pi.registerTool(appendTrajectoryTool);
	pi.registerTool(readContextTool);
	pi.registerTool(writeContextTool);
	pi.registerTool(writeCompactionTool);
	pi.registerTool(appendChildCallTool);
}
