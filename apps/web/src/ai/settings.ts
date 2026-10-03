// Browser persistence is a platform concern. The key never enters project exports.
export type AiKind = "edit" | "image" | "video";
export interface AiModel {
	id: string;
	kind: AiKind;
	maxShotSeconds?: number;
}
export interface AiSettings {
	models: AiModel[];
	defaultModels?: Partial<Record<"image" | "video", string>>;
	mcpEnabled: boolean;
	mcpToken: string;
}
export const DEFAULT_MODELS: AiModel[] = [
	{ id: "openai/gpt-6.1-sol", kind: "edit" },
	{ id: "anthropic/claude-sonnet-5.5", kind: "edit" },
	{ id: "openai/gpt-image-2.5-flare", kind: "image" },
	{ id: "openai/gpt-image-2.5-sunburst", kind: "image" },
	{ id: "google/gemini-3.1-flash-image", kind: "image" },
	{ id: "minimax/minimax-h3-max", kind: "video", maxShotSeconds: 15 },
	{ id: "google/gemini-omni-1.1-flash-preview", kind: "video" },
];
export function loadSettings(): AiSettings {
	const stored = localStorage.getItem("opencut-ai-settings");
	const settings: AiSettings = stored
		? JSON.parse(stored)
		: { models: DEFAULT_MODELS, mcpEnabled: false, mcpToken: "" };
	settings.models = settings.models.map((model) =>
		model.kind === "video" &&
		model.id === "minimax/minimax-h3-max" &&
		(!model.maxShotSeconds ||
			model.maxShotSeconds < 5 ||
			model.maxShotSeconds > 15)
			? { ...model, maxShotSeconds: 15 }
			: model,
	);
	return settings;
}
// Shared persisted limit used by planning, splitting and generation.
export function getVideoShotLimit(
	settings: AiSettings,
	modelId: string,
): number | undefined {
	const model = settings.models.find(
		(item) => item.kind === "video" && item.id === modelId,
	);
	if (!model) return undefined;
	const value = model.maxShotSeconds;
	if (modelId === "minimax/minimax-h3-max")
		return value && Number.isInteger(value) && value >= 5 && value <= 15
			? value
			: 15;
	return value && Number.isInteger(value) && value >= 1 && value <= 30
		? value
		: undefined;
}
export function getDefaultModel({
	settings,
	kind,
}: {
	settings: AiSettings;
	kind: AiKind;
}): string {
	const preferred =
		kind === "edit" ? undefined : settings.defaultModels?.[kind];
	return (
		settings.models.find(
			(model) => model.kind === kind && model.id === preferred,
		)?.id ??
		settings.models.find((model) => model.kind === kind)?.id ??
		""
	);
}
export function saveSettings(settings: AiSettings) {
	const saved = {
		...settings,
		defaultModels: {
			image: getDefaultModel({ settings, kind: "image" }),
			video: getDefaultModel({ settings, kind: "video" }),
		},
	};
	localStorage.setItem("opencut-ai-settings", JSON.stringify(saved));
	window.dispatchEvent(new Event("opencut-ai-settings"));
}
function database(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open("opencut-ai-vault", 1);
		request.onupgradeneeded = () => request.result.createObjectStore("vault");
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}
async function vault<T>({
	mode,
	action,
}: {
	mode: IDBTransactionMode;
	action: (store: IDBObjectStore) => IDBRequest<T>;
}): Promise<T> {
	const db = await database();
	return new Promise((resolve, reject) => {
		const tx = db.transaction("vault", mode);
		const request = action(tx.objectStore("vault"));
		tx.oncomplete = () => {
			resolve(request.result);
			db.close();
		};
		tx.onabort = () => {
			reject(tx.error);
			db.close();
		};
		tx.onerror = () => {
			reject(tx.error);
			db.close();
		};
	});
}
interface Secret {
	key: CryptoKey;
	iv: Uint8Array<ArrayBuffer>;
	encrypted: ArrayBuffer;
}
export async function saveApiKey(value: string,kind:"generation"|"management"="generation") {
 const desktop = typeof window !== "undefined" ? window.opencutDesktop : undefined;
 if (desktop) { if (!desktop.saveCredential) throw new Error("Restart the desktop app to enable system credential storage"); await desktop.saveCredential({kind,value}); await vault({mode:"readwrite",action:s=>s.delete(kind==="management"?"management-secret":"secret")}); return; }
	if (!value.trim()) {
		await vault({ mode: "readwrite", action: (s) => s.delete(kind==="management"?"management-secret":"secret") });
		return;
	}
	const key = await crypto.subtle.generateKey(
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		new TextEncoder().encode(value.trim()),
	);
	await vault({
		mode: "readwrite",
		action: (s) => s.put({ key, iv, encrypted }, kind==="management"?"management-secret":"secret"),
	});
	await navigator.storage?.persist?.();
}
export async function readApiKey(kind:"generation"|"management"="generation"): Promise<string> {
 if (typeof window !== "undefined" && window.opencutDesktop) throw new Error("Desktop credentials are available only to the main process");
 return readLegacyApiKey(kind);
}
export async function migrateDesktopCredential(): Promise<void> {
 const desktop = typeof window !== "undefined" ? window.opencutDesktop : undefined;
 if (!desktop?.credentialStatus) return;
 const status = await desktop.credentialStatus();
 const legacy = await readLegacyApiKey();
 if (legacy && !status.saved) await desktop.saveCredential(legacy);
 if (legacy) await vault({mode:"readwrite",action:s=>s.delete("secret")});
}
async function readLegacyApiKey(kind:"generation"|"management"="generation"): Promise<string> {
	const secret = await vault<Secret | undefined>({
		mode: "readonly",
		action: (s) => s.get(kind==="management"?"management-secret":"secret"),
	});
	if (!secret) return "";
	return new TextDecoder().decode(
		await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: secret.iv },
			secret.key,
			secret.encrypted,
		),
	);
}

export function isAiKind(value: string): value is AiKind {
	return value === "edit" || value === "image" || value === "video";
}
