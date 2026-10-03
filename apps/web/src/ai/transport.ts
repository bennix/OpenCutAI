import { guardGeneration } from "./budget";
import { readApiKey, migrateDesktopCredential } from "./settings";
export async function generationPreflight(model: string, seconds?: number) {
	await guardGeneration(model, seconds);
	if (window.opencutDesktop) {
		await migrateDesktopCredential();
		const state = await window.opencutDesktop.credentialStatus("generation");
		if (!state.available)
			throw new Error("系统凭据存储不可用，请配置系统钥匙串后再生成");
		if (!state.saved) throw new Error("请先在设置保存生成 API Key");
	} else if (!(await readApiKey()))
		throw new Error("请先在设置保存生成 API Key");
}
export async function zenmux({
	path,
	body,
	signal,
	preflightDone = false,
}: {
	path: string;
	body?: unknown;
	preflightDone?: boolean;
	signal?: AbortSignal;
}) {
	if (body !== undefined && !preflightDone) {
		const input = body as { model?: string; duration?: number };
		await guardGeneration(input.model ?? "", input.duration);
	}
	const desktop =
		typeof window !== "undefined" ? window.opencutDesktop : undefined;
	if (desktop) {
		if (!desktop.aiRequest)
			throw new Error("Restart the desktop app to enable secure AI requests");
		await migrateDesktopCredential();
		signal?.throwIfAborted();
		const id = crypto.randomUUID();
		const cancel = () => {
			void desktop.aiCancel(id);
		};
		signal?.addEventListener("abort", cancel, { once: true });
		try {
			const response = await desktop.aiRequest({ id, path, body });
			signal?.throwIfAborted();
			if (response.status >= 400 || response.data.error)
				throw new ZenmuxError(
					response.data.error?.message ?? `ZenMux HTTP ${response.status}`,
					response.status,
					response.retryAfter,
				);
			return response.data;
		} finally {
			signal?.removeEventListener("abort", cancel);
		}
	}
	const key = await readApiKey();
	if (!key) throw new Error("请先在设置 → ZenMux AI 保存 API Key");
	const response = await fetch(`/api/zenmux`, {
		method: "POST",
		signal: AbortSignal.any([
			...(signal ? [signal] : []),
			AbortSignal.timeout(610000),
		]),
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${key}`,
		},
		body: JSON.stringify({ path, body }),
	});
	const data = await response.json();
	if (!response.ok || data.error)
		throw new ZenmuxError(
			data.error?.message ?? `ZenMux HTTP ${response.status}`,
			response.status,
			response.headers.get("retry-after"),
		);
	return data;
}

export class ZenmuxError extends Error {
	constructor(
		message: string,
		public status: number,
		public retryAfter: string | null,
	) {
		super(message);
	}
}
