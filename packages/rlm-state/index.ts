import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface RlmStateStoreOptions {
	rootDir?: string;
	now?: () => Date;
}

export interface RlmSessionManifest {
	id: string;
	createdAt: string;
	updatedAt: string;
	title?: string;
}

export interface RlmTrajectoryEvent {
	type: string;
	timestamp?: string;
	[key: string]: unknown;
}

export interface RlmContextState {
	summary: string;
	activeFiles: string[];
	openQuestions: string[];
	invariants: string[];
	updatedAt?: string;
}

export interface RlmChildCall {
	id?: string;
	role: "scout" | "worker" | "reviewer" | string;
	model: string;
	status: "planned" | "running" | "completed" | "failed";
	input?: unknown;
	output?: unknown;
	timestamp?: string;
}

const DEFAULT_CONTEXT: RlmContextState = {
	summary: "",
	activeFiles: [],
	openQuestions: [],
	invariants: [],
};

export class RlmStateStore {
	private readonly rootDir: string;
	private readonly now: () => Date;

	constructor(options: RlmStateStoreOptions = {}) {
		this.rootDir = options.rootDir ?? join(process.cwd(), ".sarvam-pi", "rlm-state");
		this.now = options.now ?? (() => new Date());
	}

	async createSession(title?: string): Promise<RlmSessionManifest> {
		const timestamp = this.isoNow();
		const manifest: RlmSessionManifest = {
			id: randomUUID(),
			createdAt: timestamp,
			updatedAt: timestamp,
			title,
		};
		await this.ensureSessionDir(manifest.id);
		await this.writeJson(this.manifestPath(manifest.id), manifest);
		await this.writeContext(manifest.id, DEFAULT_CONTEXT);
		await this.writeCompaction(manifest.id, "");
		return manifest;
	}

	async readManifest(sessionId: string): Promise<RlmSessionManifest> {
		return this.readJson<RlmSessionManifest>(this.manifestPath(sessionId));
	}

	async appendTrajectory(sessionId: string, event: RlmTrajectoryEvent): Promise<void> {
		await this.appendJsonl(this.trajectoryPath(sessionId), {
			...event,
			timestamp: event.timestamp ?? this.isoNow(),
		});
		await this.touchManifest(sessionId);
	}

	async readTrajectory(sessionId: string): Promise<RlmTrajectoryEvent[]> {
		return this.readJsonl<RlmTrajectoryEvent>(this.trajectoryPath(sessionId));
	}

	async writeContext(sessionId: string, context: RlmContextState): Promise<void> {
		await this.writeJson(this.contextPath(sessionId), {
			...context,
			updatedAt: context.updatedAt ?? this.isoNow(),
		});
		await this.touchManifest(sessionId);
	}

	async readContext(sessionId: string): Promise<RlmContextState> {
		return this.readJson<RlmContextState>(this.contextPath(sessionId));
	}

	async writeCompaction(sessionId: string, markdown: string): Promise<void> {
		await this.writeText(this.compactionPath(sessionId), markdown);
		await this.touchManifest(sessionId);
	}

	async readCompaction(sessionId: string): Promise<string> {
		return this.readText(this.compactionPath(sessionId));
	}

	async appendChildCall(sessionId: string, childCall: RlmChildCall): Promise<void> {
		await this.appendJsonl(this.childrenPath(sessionId), {
			id: childCall.id ?? randomUUID(),
			...childCall,
			timestamp: childCall.timestamp ?? this.isoNow(),
		});
		await this.touchManifest(sessionId);
	}

	async readChildCalls(sessionId: string): Promise<RlmChildCall[]> {
		return this.readJsonl<RlmChildCall>(this.childrenPath(sessionId));
	}

	sessionDir(sessionId: string): string {
		return join(this.rootDir, "sessions", sessionId);
	}

	private manifestPath(sessionId: string): string {
		return join(this.sessionDir(sessionId), "manifest.json");
	}

	private trajectoryPath(sessionId: string): string {
		return join(this.sessionDir(sessionId), "trajectory.jsonl");
	}

	private contextPath(sessionId: string): string {
		return join(this.sessionDir(sessionId), "context.json");
	}

	private compactionPath(sessionId: string): string {
		return join(this.sessionDir(sessionId), "compaction.md");
	}

	private childrenPath(sessionId: string): string {
		return join(this.sessionDir(sessionId), "children.jsonl");
	}

	private async ensureSessionDir(sessionId: string): Promise<void> {
		await mkdir(this.sessionDir(sessionId), { recursive: true });
	}

	private async touchManifest(sessionId: string): Promise<void> {
		try {
			const manifest = await this.readManifest(sessionId);
			await this.writeJson(this.manifestPath(sessionId), {
				...manifest,
				updatedAt: this.isoNow(),
			});
		} catch {
			// createSession writes the manifest after initializing session files.
		}
	}

	private async writeJson(path: string, value: unknown): Promise<void> {
		await this.writeText(path, `${JSON.stringify(value, null, 2)}\n`);
	}

	private async readJson<T>(path: string): Promise<T> {
		return JSON.parse(await this.readText(path)) as T;
	}

	private async appendJsonl(path: string, value: unknown): Promise<void> {
		await mkdir(dirname(path), { recursive: true });
		const existing = await this.readText(path).catch(() => "");
		await writeFile(path, `${existing}${JSON.stringify(value)}\n`, "utf-8");
	}

	private async readJsonl<T>(path: string): Promise<T[]> {
		const text = await this.readText(path).catch(() => "");
		return text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => JSON.parse(line) as T);
	}

	private async writeText(path: string, text: string): Promise<void> {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, text, "utf-8");
	}

	private async readText(path: string): Promise<string> {
		return readFile(path, "utf-8");
	}

	private isoNow(): string {
		return this.now().toISOString();
	}
}

export function createRlmStateStore(options?: RlmStateStoreOptions): RlmStateStore {
	return new RlmStateStore(options);
}
