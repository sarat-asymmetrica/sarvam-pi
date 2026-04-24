import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	type AssistantMessage,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	type Model,
	type SimpleStreamOptions,
	type Tool,
	type ToolCall,
} from "@mariozechner/pi-ai";
import { isAbsolute, resolve } from "node:path";

const SARVAM_BASE_URL = process.env.SARVAM_BASE_URL ?? "https://api.sarvam.ai/v1";
const SARVAM_API_KEY =
	process.env.SARVAM_API_KEY ?? process.env.SARVAM_API_SUBSCRIPTION_KEY ?? process.env.SARVAM_SUBSCRIPTION_KEY;
if (!process.env.SARVAM_API_KEY && SARVAM_API_KEY) {
	process.env.SARVAM_API_KEY = SARVAM_API_KEY;
}

const PATH_TOOLS = new Set(["read", "grep", "find", "ls", "write", "edit"]);
const READ_ONLY_TOOL_RESULT_LIMIT = 2;
const MUTATION_TOOL_RESULT_LIMIT = 4;
const STATE_TOOL_RESULT_LIMIT = 8;
const DEFAULT_MUTATION_ROOT = "experiments/002-tool-loop-smoke/fixture/";
const MUTATING_TOOLS = new Set(["edit", "write"]);

function textFromContent(content: any): string {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.filter((item: any) => item.type === "text")
		.map((item: any) => item.text)
		.filter(Boolean)
		.join("\n");
}

interface MessageBuildOptions {
	flattenToolHistory?: boolean;
}

function toOpenAIMessage(message: any, options: MessageBuildOptions = {}): any | undefined {
	if (message.role === "user") {
		const content = textFromContent(message.content);
		return content ? { role: "user", content } : undefined;
	}

	if (message.role === "assistant") {
		if (options.flattenToolHistory) {
			const textParts = message.content
				?.map((item: any) => {
					if (item.type === "text") return item.text;
					if (item.type === "thinking") return item.thinking;
					if (item.type === "toolCall") {
						return `Called tool ${item.name} with arguments ${JSON.stringify(item.arguments ?? {})}.`;
					}
					return "";
				})
				.filter(Boolean)
				.join("\n");
			return textParts ? { role: "assistant", content: textParts } : undefined;
		}

		const toolCalls = message.content
			?.filter((item: any) => item.type === "toolCall")
			.map((item: any) => ({
				id: item.id,
				type: "function",
				function: {
					name: item.name,
					arguments: JSON.stringify(item.arguments ?? {}),
				},
			}));
		const content = message.content
			?.filter((item: any) => item.type === "text" || item.type === "thinking")
			.map((item: any) => (item.type === "thinking" ? item.thinking : item.text))
			.filter(Boolean)
			.join("\n");
		if (toolCalls?.length) {
			return {
				role: "assistant",
				content: content || null,
				tool_calls: toolCalls,
			};
		}
		return content ? { role: "assistant", content } : undefined;
	}

	if (message.role === "toolResult") {
		const content = textFromContent(message.content);
		if (options.flattenToolHistory) {
			return content ? { role: "user", content: `Tool result from ${message.toolName}:\n${content}` } : undefined;
		}
		return content ? { role: "tool", tool_call_id: message.toolCallId, content } : undefined;
	}

	return undefined;
}

function buildToolProtocolPrompt(tools?: Tool[]): string {
	if (!tools?.length) {
		return "";
	}

	const toolNames = tools.map((tool) => tool.name).join(", ");
	return [
		"Tool protocol for this harness:",
		`Available tools: ${toolNames}.`,
		"When you need a tool, do not describe your intention in prose.",
		"Instead, output exactly one tool call in this format and nothing else:",
		"<tool_call>read",
		"<arg_key>path</arg_key>",
		"<arg_value>README.md</arg_value>",
		"</tool_call>",
		"Use arg_key path for file tools. Do not use file_path.",
		"For edit, use path and edits, where edits is an array of { oldText, newText }.",
		"For write, use path and content.",
		"For edit and write, read the target file first and verify by reading it afterward.",
		"During mutation smoke tests, edit/write only under experiments/002-tool-loop-smoke/fixture/ unless the user explicitly gives another write scope.",
		"For bash, use command and optional timeout.",
		"After tool results give enough context, answer the user normally.",
		"Do not read the same file repeatedly in the same turn.",
		"If you have already read the files the user asked for, stop using tools and synthesize the answer.",
	].join("\n");
}

function buildMessages(context: Context, options: MessageBuildOptions = {}): any[] {
	const messages: any[] = [];
	const toolProtocolPrompt = options.flattenToolHistory
		? [
				"Tool use is now closed for this turn.",
				"Synthesize the final answer from the tool results already provided.",
				"Do not request, mention, or emit another tool call.",
				"Do not output XML-like tool text such as <tool_call>.",
				"Do not output tool names as standalone text.",
			].join("\n")
		: buildToolProtocolPrompt(context.tools);
	const systemPrompt = [context.systemPrompt, toolProtocolPrompt].filter((part) => part?.trim()).join("\n\n");
	if (systemPrompt.trim()) {
		messages.push({ role: "system", content: systemPrompt });
	}
	for (const message of context.messages) {
		const converted = toOpenAIMessage(message, options);
		if (converted) {
			messages.push(converted);
		}
	}
	return messages;
}

function buildTools(tools?: Tool[]): any[] | undefined {
	if (!tools?.length) {
		return undefined;
	}

	return tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
		},
	}));
}

function toolResultsSinceLastUser(context: Context): number {
	let count = 0;
	for (let i = context.messages.length - 1; i >= 0; i--) {
		const message = context.messages[i];
		if (message.role === "user") {
			break;
		}
		if (message.role === "toolResult") {
			count++;
		}
	}
	return count;
}

function repeatedToolReadsSinceLastUser(context: Context): Map<string, number> {
	const reads = new Map<string, number>();
	for (let i = context.messages.length - 1; i >= 0; i--) {
		const message = context.messages[i];
		if (message.role === "user") {
			break;
		}
		if (message.role !== "assistant") {
			continue;
		}
		for (const item of message.content) {
			if (item.type !== "toolCall" || item.name !== "read") {
				continue;
			}
			const path = String(item.arguments?.path ?? "");
			if (path) {
				reads.set(path, (reads.get(path) ?? 0) + 1);
			}
		}
	}
	return reads;
}

function shouldForceSynthesis(context: Context): boolean {
	const hasMutationTools = context.tools?.some((tool) => ["edit", "write", "bash"].includes(tool.name)) ?? false;
	const hasStateTools = context.tools?.some((tool) => tool.name.startsWith("rlm_")) ?? false;
	const resultLimit = hasStateTools
		? STATE_TOOL_RESULT_LIMIT
		: hasMutationTools
			? MUTATION_TOOL_RESULT_LIMIT
			: READ_ONLY_TOOL_RESULT_LIMIT;
	if (toolResultsSinceLastUser(context) >= resultLimit) {
		return true;
	}
	for (const count of repeatedToolReadsSinceLastUser(context).values()) {
		if (count >= 2) {
			return true;
		}
	}
	return false;
}

function isUnknownToolCall(toolCall: ToolCall, tools?: Tool[]): boolean {
	if (!tools?.length) {
		return false;
	}
	return !tools.some((tool) => tool.name === toolCall.name);
}

async function requestSarvam(
	model: Model<any>,
	subscriptionKey: string,
	body: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<any> {
	const response = await fetch(`${model.baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"api-subscription-key": subscriptionKey,
		},
		body: JSON.stringify(body),
		signal,
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Sarvam request failed with HTTP ${response.status}: ${errorText}`);
	}

	return response.json();
}

function getPayloadText(payload: any): string {
	return (
		payload.choices?.[0]?.message?.content ??
		payload.choices?.[0]?.message?.reasoning_content ??
		payload.output_text ??
		""
	);
}

function lastUserPrompt(context: Context): string {
	for (let i = context.messages.length - 1; i >= 0; i--) {
		const message = context.messages[i];
		if (message.role === "user") {
			return textFromContent(message.content);
		}
	}
	return "";
}

function toolResultDigest(context: Context): string {
	const results: string[] = [];
	for (const message of context.messages) {
		if (message.role !== "toolResult") {
			continue;
		}
		const content = textFromContent(message.content).trim();
		if (content) {
			results.push(`Result ${results.length + 1}:\n${content}`);
		}
	}
	return results.join("\n\n");
}

function buildCleanSynthesisMessages(context: Context): any[] {
	const prompt = lastUserPrompt(context);
	const digest = toolResultDigest(context);
	return [
		{
			role: "system",
			content: [
				"You are Sarvam in final-answer mode.",
				"No tools are available.",
				"Do not emit tool names, JSON tool calls, XML tool calls, or tool-call syntax.",
				"Use only the provided retrieved content to answer the user's request directly.",
			].join("\n"),
		},
		{
			role: "user",
			content: [
				`User request:\n${prompt}`,
				"Retrieved content:",
				digest || "(No retrieved content was provided.)",
				"Now provide the final answer directly in prose.",
			].join("\n\n"),
		},
	];
}

async function retrySynthesis(
	model: Model<any>,
	subscriptionKey: string,
	context: Context,
	maxTokens: number,
	signal?: AbortSignal,
): Promise<any> {
	return requestSarvam(
		model,
		subscriptionKey,
		{
			model: model.id,
			messages: buildCleanSynthesisMessages(context),
			max_tokens: maxTokens,
			stream: false,
		},
		signal,
	);
}

function normalizeToolArguments(toolName: string, args: Record<string, any>): Record<string, any> {
	const normalized = { ...args };
	if ("file_path" in normalized && !("path" in normalized)) {
		normalized.path = normalized.file_path;
		delete normalized.file_path;
	}
	if ("filePath" in normalized && !("path" in normalized) && PATH_TOOLS.has(toolName)) {
		normalized.path = normalized.filePath;
		delete normalized.filePath;
	}
	if ("filepath" in normalized && !("path" in normalized) && PATH_TOOLS.has(toolName)) {
		normalized.path = normalized.filepath;
		delete normalized.filepath;
	}
	if ("old_string" in normalized && !("oldText" in normalized)) {
		normalized.oldText = normalized.old_string;
		delete normalized.old_string;
	}
	if ("new_string" in normalized && !("newText" in normalized)) {
		normalized.newText = normalized.new_string;
		delete normalized.new_string;
	}
	if ("oldString" in normalized && !("oldText" in normalized)) {
		normalized.oldText = normalized.oldString;
		delete normalized.oldString;
	}
	if ("newString" in normalized && !("newText" in normalized)) {
		normalized.newText = normalized.newString;
		delete normalized.newString;
	}
	if (toolName === "edit" && !Array.isArray(normalized.edits) && "oldText" in normalized && "newText" in normalized) {
		normalized.edits = [{ oldText: normalized.oldText, newText: normalized.newText }];
		delete normalized.oldText;
		delete normalized.newText;
	}
	if ("cmd" in normalized && !("command" in normalized)) {
		normalized.command = normalized.cmd;
		delete normalized.cmd;
	}
	return normalized;
}

function normalizePathForPolicy(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+/, "/");
}

function absolutePolicyPath(path: string): string {
	const resolved = isAbsolute(path) ? resolve(path) : resolve(process.cwd(), path);
	return normalizePathForPolicy(resolved);
}

function mutationRoot(): string {
	return normalizePathForPolicy(process.env.SARVAM_PI_MUTATION_ROOT ?? DEFAULT_MUTATION_ROOT);
}

function isSensitiveMutationPath(path: string): boolean {
	const normalized = normalizePathForPolicy(path).toLowerCase();
	return (
		normalized.includes("/pi-mono/") ||
		normalized === "pi-mono" ||
		normalized.startsWith("pi-mono/") ||
		normalized.endsWith("/.env") ||
		normalized.includes("/.env.") ||
		normalized.includes("secret") ||
		normalized.includes("credential")
	);
}

function validateToolCall(toolCall: ToolCall): void {
	if (!MUTATING_TOOLS.has(toolCall.name)) {
		return;
	}

	const path = typeof toolCall.arguments?.path === "string" ? toolCall.arguments.path : "";
	if (!path) {
		throw new Error(`Mutation tool "${toolCall.name}" requires a path argument.`);
	}

	const normalized = normalizePathForPolicy(path);
	if (isSensitiveMutationPath(normalized)) {
		throw new Error(`Blocked unsafe mutation path "${path}". Do not edit pi-mono, env files, secrets, or credentials.`);
	}

	if (process.env.SARVAM_PI_ALLOW_ANY_MUTATION_PATH === "1") {
		return;
	}

	const root = mutationRoot();
	const absolutePath = absolutePolicyPath(path);
	const absoluteRoot = absolutePolicyPath(root);
	const isInsideRoot = absolutePath === absoluteRoot || absolutePath.startsWith(`${absoluteRoot}/`);
	if (!isInsideRoot) {
		throw new Error(
			`Blocked mutation path "${path}". Current mutation scope is "${root}". Set SARVAM_PI_MUTATION_ROOT to change the scope or SARVAM_PI_ALLOW_ANY_MUTATION_PATH=1 to disable this guard.`,
		);
	}
}

function parseSarvamToolCall(text: string): ToolCall | undefined {
	const toolMatch = text.match(/<tool_call>\s*([A-Za-z0-9_-]+)([\s\S]*?)(?:<\/tool_call>|$)/i);
	if (!toolMatch) {
		return undefined;
	}

	const name = toolMatch[1].trim();
	const body = toolMatch[2] ?? "";
	const args: Record<string, any> = {};
	const argPattern = /<arg_key>\s*([\s\S]*?)\s*<\/arg_key>\s*<arg_value>\s*([\s\S]*?)\s*<\/arg_value>/gi;
	for (const match of body.matchAll(argPattern)) {
		args[match[1].trim()] = match[2].trim();
	}

	return {
		type: "toolCall",
		id: `sarvam_tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
		name,
		arguments: normalizeToolArguments(name, args),
	};
}

function parseNativeToolCall(payload: any): ToolCall | undefined {
	const nativeToolCall = payload.choices?.[0]?.message?.tool_calls?.[0];
	if (!nativeToolCall?.function?.name) {
		return undefined;
	}

	let args: Record<string, any> = {};
	const rawArgs = nativeToolCall.function.arguments;
	if (typeof rawArgs === "string" && rawArgs.trim()) {
		try {
			args = JSON.parse(rawArgs);
		} catch {
			throw new Error(
				`Sarvam returned invalid JSON tool arguments for ${nativeToolCall.function.name}: ${rawArgs.slice(0, 500)}`,
			);
		}
	} else if (rawArgs && typeof rawArgs === "object") {
		args = rawArgs;
	}

	return {
		type: "toolCall",
		id: nativeToolCall.id ?? `sarvam_tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
		name: nativeToolCall.function.name,
		arguments: normalizeToolArguments(nativeToolCall.function.name, args),
	};
}

function streamSarvam(model: Model<any>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();

	(async () => {
		const output: AssistantMessage = {
			role: "assistant",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};

		try {
			const subscriptionKey = SARVAM_API_KEY ?? options?.headers?.["api-subscription-key"];
			if (!subscriptionKey) {
				throw new Error("Set SARVAM_API_KEY or SARVAM_API_SUBSCRIPTION_KEY before starting Pi.");
			}

			stream.push({ type: "start", partial: output });
			const forceSynthesis = shouldForceSynthesis(context);

			let payload = await requestSarvam(
				model,
				subscriptionKey,
				{
					model: model.id,
					messages: buildMessages(context, { flattenToolHistory: forceSynthesis }),
					tools: forceSynthesis ? undefined : buildTools(context.tools),
					tool_choice: forceSynthesis ? undefined : "auto",
					max_tokens: options?.maxTokens ?? model.maxTokens,
					stream: false,
				},
				options?.signal,
			);

			let text = getPayloadText(payload);

			const toolCall = parseNativeToolCall(payload) ?? parseSarvamToolCall(text);
			if (toolCall) {
				if (forceSynthesis) {
					payload = await retrySynthesis(
						model,
						subscriptionKey,
						context,
						options?.maxTokens ?? model.maxTokens,
						options?.signal,
					);
					text = getPayloadText(payload);
					const retryToolCall = parseNativeToolCall(payload);
					if (!retryToolCall && text.trim()) {
						output.content.push({ type: "text", text });
						output.usage.input = payload.usage?.prompt_tokens ?? 0;
						output.usage.output = payload.usage?.completion_tokens ?? 0;
						output.usage.totalTokens = payload.usage?.total_tokens ?? output.usage.input + output.usage.output;
						stream.push({ type: "text_start", contentIndex: 0, partial: output });
						stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: output });
						stream.push({ type: "text_end", contentIndex: 0, content: text, partial: output });
						stream.push({ type: "done", reason: "stop", message: output });
						stream.end();
						return;
					}
					const fallbackText = [
						"Sarvam gathered the requested context but kept attempting another tool call after the harness closed tool use.",
						"Please ask the same question again with 'answer from the already-read results' if you want a model-written synthesis.",
						"",
						"Harness note: the provider suppressed the extra tool call to avoid a loop.",
					].join("\n");
					output.content.push({ type: "text", text: fallbackText });
					stream.push({ type: "text_start", contentIndex: 0, partial: output });
					stream.push({ type: "text_delta", contentIndex: 0, delta: fallbackText, partial: output });
					stream.push({ type: "text_end", contentIndex: 0, content: fallbackText, partial: output });
					stream.push({ type: "done", reason: "stop", message: output });
					stream.end();
					return;
				}
				if (isUnknownToolCall(toolCall, context.tools)) {
					throw new Error(`Sarvam returned unavailable tool call "${toolCall.name}". Available tools: ${context.tools?.map((tool) => tool.name).join(", ") ?? "none"}.`);
				}
				validateToolCall(toolCall);
				output.content.push(toolCall);
				output.stopReason = "toolUse";
				stream.push({ type: "toolcall_start", contentIndex: 0, partial: output });
				stream.push({ type: "toolcall_delta", contentIndex: 0, delta: JSON.stringify(toolCall.arguments), partial: output });
				stream.push({ type: "toolcall_end", contentIndex: 0, toolCall, partial: output });
				stream.push({ type: "done", reason: "toolUse", message: output });
				stream.end();
				return;
			}

			if (!text.trim()) {
				throw new Error(`Sarvam returned no text or tool call. Response shape: ${JSON.stringify(payload).slice(0, 2000)}`);
			}

			output.content.push({ type: "text", text });
			output.usage.input = payload.usage?.prompt_tokens ?? 0;
			output.usage.output = payload.usage?.completion_tokens ?? 0;
			output.usage.totalTokens = payload.usage?.total_tokens ?? output.usage.input + output.usage.output;

			stream.push({ type: "text_start", contentIndex: 0, partial: output });
			stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: output });
			stream.push({ type: "text_end", contentIndex: 0, content: text, partial: output });
			stream.push({ type: "done", reason: "stop", message: output });
			stream.end();
		} catch (error) {
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = error instanceof Error ? error.message : String(error);
			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		}
	})();

	return stream;
}

export default function registerSarvamProvider(pi: ExtensionAPI) {
	pi.registerProvider("sarvam", {
		baseUrl: SARVAM_BASE_URL,
		apiKey: "SARVAM_API_KEY",
		api: "sarvam-chat-completions" as any,
		streamSimple: streamSarvam,
		models: [
			{
				id: "sarvam-105b",
				name: "Sarvam 105B",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
				compat: {
					supportsDeveloperRole: false,
					supportsReasoningEffort: false,
					maxTokensField: "max_tokens",
				},
			},
			{
				id: "sarvam-30b",
				name: "Sarvam 30B",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
				compat: {
					supportsDeveloperRole: false,
					supportsReasoningEffort: false,
					maxTokensField: "max_tokens",
				},
			},
		],
	});
}
