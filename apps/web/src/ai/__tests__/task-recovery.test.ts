import { expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
mock.module("opencut-ai", () => ({
	buildGenerationRequest: () =>
		JSON.stringify({
			path: "/api/v1/videos",
			pollPath: "/api/v1/videos/",
			body: {},
		}),
	decodeGenerationResponse: () => {
		throw new Error("Queued response has no media");
	},
	validateEditPlan: () => "{}",
	build_transition: () => "[]",
}));
mock.module("@/wasm", () => ({
	roundMediaTime: () => 0,
	mediaTimeFromSeconds: () => 0,
	mediaTimeToSeconds: () => 0,
}));
mock.module("@/i18n/locale", () => ({ getLocale: () => "en" }));
mock.module("@/media/processing", () => ({
	processMediaAssets: async () => [],
}));
mock.module("@/commands", () => ({
	BatchCommand: class {},
	InsertElementCommand: class {},
}));
mock.module("@/timeline/element-utils", () => ({
	buildElementFromMedia: () => ({}),
}));
let calls = 0;
mock.module("../transport", () => ({
	zenmux: async () => {
		if (++calls === 1) return { id: "paid-task", status: "queued" };
		throw new Error("Polling connection failed");
	},
}));
const { generate, pendingJobs } = await import("../editor-adapter");
test("a submitted task survives a polling failure without decoding its queued submission", async () => {
	const descriptor = Object.getOwnPropertyDescriptor(
		globalThis,
		"localStorage",
	);
	const values = new Map<string, string>();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		},
	});
	calls = 0;
	try {
		const editor = {
			project: { getActive: () => ({ metadata: { id: "project" } }) },
			media: { getAssets: () => [] },
		} as unknown as EditorCore;
		await expect(
			generate({
				editor,
				input: {
					kind: "video",
					model: "minimax/minimax-h3-max",
					prompt: "scene",
				},
				signal: new AbortController().signal,
				status: () => {},
			}),
		).rejects.toThrow("Polling connection failed");
		expect(calls).toBe(2);
		expect(pendingJobs()).toMatchObject([
			{ id: "paid-task", projectId: "project" },
		]);
	} finally {
		if (descriptor)
			Object.defineProperty(globalThis, "localStorage", descriptor);
		else Reflect.deleteProperty(globalThis, "localStorage");
	}
});
