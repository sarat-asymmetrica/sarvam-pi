// Pure bash-policy checks for the Sarvam Pi provider.
// This keeps command allowlist enforcement testable without loading Pi internals.
const LONG_LIVED_BASH_PATTERNS = [
	/\bpython(?:3)?\s+-m\s+http\.server\b/i,
	/\bnpm\s+run\s+dev\b/i,
	/\bnpm\s+start\b/i,
	/\bnpx\s+vite\b/i,
	/\bvite\s+(?:--host\b|--port\b|$)/i,
	/\bnext\s+dev\b/i,
	/\bserve\s+(?:-s\s+)?\S+/i,
];

export interface BashPolicy {
	allowedCommands: string[];
}

export interface BashPolicyResult {
	ok: boolean;
	reason?: string;
}

export function bashPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): BashPolicy {
	const raw = env.SARVAM_PI_BASH_ALLOWED_COMMANDS ?? "";
	return {
		allowedCommands: raw
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean),
	};
}

export function validateBashCommand(command: string, policy: BashPolicy = bashPolicyFromEnv()): BashPolicyResult {
	if (!command.trim()) {
		return { ok: false, reason: 'Bash tool requires a "command" argument.' };
	}
	if (LONG_LIVED_BASH_PATTERNS.some((pattern) => pattern.test(command))) {
		return {
			ok: false,
			reason: `Blocked long-lived bash command "${command}". Use one-shot checks that terminate; do not start dev servers or background HTTP servers in Builder dispatches.`,
		};
	}
	if (!policy.allowedCommands.length) {
		return { ok: true };
	}
	const root = commandRoot(command);
	if (policy.allowedCommands.includes(root)) {
		return { ok: true };
	}
	return {
		ok: false,
		reason: `Blocked bash command "${command}". Allowed command roots: ${policy.allowedCommands.join(", ")}.`,
	};
}

export function commandRoot(command: string): string {
	const normalized = stripShellPrefix(command.trim());
	const tokens = normalized.split(/\s+/).filter(Boolean);
	if (!tokens.length) return "";
	if (tokens[0] === "npx" && tokens[1]) return `npx ${tokens[1]}`;
	if (tokens[0] === "npm" && tokens[1] === "run" && tokens[2]) return `npm run ${tokens[2]}`;
	if (tokens[0] === "git" && tokens[1]) return `git ${tokens[1]}`;
	return tokens[0];
}

function stripShellPrefix(command: string): string {
	const parts = command
		.split(/&&|;/)
		.map((part) => part.trim())
		.filter(Boolean);
	for (const part of parts) {
		if (!/^cd\s+/i.test(part)) return part;
	}
	return parts[0] ?? command;
}
