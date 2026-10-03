import type { GenerationInput, VideoJob } from "./editor-adapter";
export type TaskState =
	| "submitting"
	| "unknown"
	| "submitted"
	| "downloading"
	| "saved"
	| "completed"
	| "failed"
	| "acknowledged";
export interface GenerationTask {
	id: string;
	fingerprint: string;
	input: GenerationInput;
	projectId: string;
	state: TaskState;
	created: number;
	updated: number;
	providerId?: string;
	response?: unknown;
	assetId?: string;
	error?: string;
}
let cached: GenerationTask[] = [];
async function db() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const r = indexedDB.open("opencut-generation-tasks", 1);
		r.onupgradeneeded = () =>
			r.result.createObjectStore("tasks", { keyPath: "id" });
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}
async function op<T>(
	mode: IDBTransactionMode,
	fn: (s: IDBObjectStore) => IDBRequest<T>,
) {
	const database = await db();
	return new Promise<T>((resolve, reject) => {
		const tx = database.transaction("tasks", mode),
			r = fn(tx.objectStore("tasks"));
		tx.oncomplete = () => {
			database.close();
			resolve(r.result);
		};
		tx.onabort = () => {
			database.close();
			reject(tx.error);
		};
		tx.onerror = () => {
			database.close();
			reject(tx.error);
		};
	});
}
export async function saveTask(task: GenerationTask) {
	await op("readwrite", (s) => s.put(task));
	cached = [...cached.filter((t) => t.id !== task.id), task];
	if (typeof window !== "undefined")
		window.dispatchEvent(new Event("opencut-tasks"));
}
export async function loadTasks() {
	cached = await op<GenerationTask[]>("readonly", (s) => s.getAll());
	const legacy = localStorage.getItem("opencut-ai-jobs");
	if (legacy) {
		const jobs: VideoJob[] = JSON.parse(legacy);
		for (const job of jobs)
			if (!cached.some((t) => t.providerId === job.id)) {
				await saveTask({
					id: crypto.randomUUID(),
					fingerprint: "legacy-" + job.id,
					input: job.input,
					projectId: job.projectId,
					providerId: job.id,
					state: "submitted",
					created: Date.now(),
					updated: Date.now(),
				});
			}
		localStorage.removeItem("opencut-ai-jobs");
	}
	return cached;
}
export function cachedTasks() {
	return cached;
}
export async function updateTask(id: string, patch: Partial<GenerationTask>) {
	const row = cached.find((t) => t.id === id);
	if (!row) throw new Error("Generation task journal is unavailable");
	await saveTask({ ...row, ...patch, id: row.id, updated: Date.now() });
}
export async function fingerprint(input: GenerationInput, projectId: string) {
	const { newVersion: _, ...identity } = input;
	const hash = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(JSON.stringify({ projectId, input: identity })),
	);
	return Array.from(new Uint8Array(hash), (v) =>
		v.toString(16).padStart(2, "0"),
	).join("");
}
export async function attachProviderTask(id: string, providerId: string) {
	if (!/^[\w-]{1,200}$/.test(providerId))
		throw new Error("Invalid provider task ID");
	await updateTask(id, { providerId, state: "submitted", error: undefined });
}
