import { readApiKey } from "./settings";
export async function zenmux({
	path,
	body,
	signal,
}: {
	path: string;
	body?: unknown;
	signal?: AbortSignal;
}) {
	const key = await readApiKey();
	if (!key) throw new Error("请先在设置 → ZenMux AI 保存 API Key");
	const response = await fetch(`/api/zenmux`, {
		method: "POST",
		signal,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${key}`,
		},
		body: JSON.stringify({ path, body }),
	});
	const data = await response.json();
	if (!response.ok || data.error)
		throw new Error(data.error?.message ?? `ZenMux HTTP ${response.status}`);
	return data;
}
