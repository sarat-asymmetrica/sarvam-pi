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

const SARVAM_BASE_URL = process.env.SARVAM_BASE_URL ?? "https://api.sarvam.ai/v1";
const SARVAM_API_KEY =
	process.env.SARVAM_API_KEY ?? process.env.SARVAM_API_SUBSCRIPTION_KEY ?? process.env.SARVAM_SUBSCRIPTION_KEY;
if (!process.env.SARVAM_API_KEY && SARVAM_API_KEY) {
	process.env.SARVAM_API_KEY = SARVAM_API_KEY;
}

const PATH_TOOLS = new Set(["read", "grep", "find", "ls", "write", "edit"]);

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

function toOpenAIMessage(message: any): any | undefined {
	if (message.role === "user") {
		const content = textFromContent(message.content);
		return content ? { role: "user", content } : undefined;
	}

	if (message.role === "assistant") {
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
		"For bash, use command and optional timeout.",
		"After a tool result is returned, answer the user normally.",
	].join("\n");
}

function buildMessages(context: Context): any[] {
	const messages: any[] = [];
	const toolProtocolPrompt = buildToolProtocolPrompt(context.tools);
	const systemPrompt = [context.systemPrompt, toolProtocolPrompt].filter((part) => part?.trim()).join("\n\n");
	if (systemPrompt.trim()) {
		messages.push({ role: "system", content: systemPrompt });
	}
	for (const message of context.messages) {
		const converted = toOpenAIMessage(message);
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

			const response = await fetch(`${model.baseUrl}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"api-subscription-key": subscriptionKey,
				},
				body: JSON.stringify({
					model: model.id,
					messages: buildMessages(context),
					tools: buildTools(context.tools),
					max_tokens: options?.maxTokens ?? model.maxTokens,
					stream: false,
				}),
				signal: options?.signal,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Sarvam request failed with HTTP ${response.status}: ${errorText}`);
			}

			const payload = (await response.json()) as any;
			const text =
				payload.choices?.[0]?.message?.content ??
				payload.choices?.[0]?.message?.reasoning_content ??
				payload.output_text ??
				"";

			const toolCall = parseNativeToolCall(payload) ?? parseSarvamToolCall(text);
			if (toolCall) {
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
