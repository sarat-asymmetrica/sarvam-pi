// Pure tool-name normalization for Sarvam's Pi provider.
// Kept dependency-free so offline smokes can verify provider hygiene without
// loading Pi internals or making live model calls.
const CAPABILITY_TOOL_ALIASES: Record<string, string> = {
	bashcap: "bash",
	editcap: "edit",
	findcap: "find",
	grepcap: "grep",
	lscap: "ls",
	readcap: "read",
	testcap: "bash",
	writecap: "write",
};

export interface ToolNameLike {
	name: string;
}

export function normalizeToolName(name: string, tools?: ToolNameLike[]): string {
	// Sarvam occasionally returns CamelCase variants ("Bash", "Read") even when the
	// tool catalog advertises lowercase names. Normalize against the available
	// catalog by case-insensitive match. It can also confuse capability labels
	// with executable tool names ("bashcap"); fold those to the actual tool only
	// when the active catalog supports that tool.
	const trimmed = name.trim();
	if (!tools?.length) return trimmed.toLowerCase();
	const lowered = trimmed.toLowerCase();
	const match = tools.find((t) => t.name.toLowerCase() === lowered);
	if (match) return match.name;
	const alias = CAPABILITY_TOOL_ALIASES[lowered];
	if (alias) {
		const aliasMatch = tools.find((t) => t.name.toLowerCase() === alias);
		if (aliasMatch) return aliasMatch.name;
	}
	return lowered;
}
