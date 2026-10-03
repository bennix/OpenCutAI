import { expect, test } from "bun:test";
import { loadSettings, getVideoShotLimit } from "../settings";
test("legacy invalid MiniMax limits recover without changing other settings", () => {
	const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
	try {
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: () =>
					JSON.stringify({
						models: [
							{
								id: "minimax/minimax-h3-max",
								kind: "video",
								maxShotSeconds: 3,
							},
							{ id: "custom/video", kind: "video", maxShotSeconds: 3 },
						],
						mcpEnabled: true,
						mcpToken: "test-token",
					}),
			},
		});
		const settings = loadSettings();
		expect(settings.models.map((model) => model.maxShotSeconds)).toEqual([
			15, 3,
		]);
		expect(settings.mcpEnabled).toBe(true);
		expect(settings.mcpToken).toBe("test-token");
	} finally {
		if (previous) Object.defineProperty(globalThis, "localStorage", previous);
		else Reflect.deleteProperty(globalThis, "localStorage");
	}
});

test("all configured video limits share one resolver", () => {
	const settings = {
		models: [
			{
				id: "minimax/minimax-h3-max",
				kind: "video" as const,
				maxShotSeconds: 3,
			},
			{ id: "custom/video", kind: "video" as const, maxShotSeconds: 8 },
			{ id: "unconfigured/video", kind: "video" as const },
		],
		mcpEnabled: false,
		mcpToken: "",
	};
	expect(getVideoShotLimit(settings, "minimax/minimax-h3-max")).toBe(15);
	expect(getVideoShotLimit(settings, "custom/video")).toBe(8);
	expect(getVideoShotLimit(settings, "unconfigured/video")).toBeUndefined();
});
