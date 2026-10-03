import { describe, expect, test } from "bun:test";
import { translate } from "./messages";

describe("editor language", () => {
	test("translates editor labels and AI labels in both directions", () => {
		expect(translate({ text: "Settings", locale: "zh" })).toBe("设置");
		expect(translate({ text: "保存密钥", locale: "en" })).toBe("Save API key");
		expect(translate({ text: "Theme", locale: "en" })).toBe("Theme");
	});
	test("preserves model identifiers and arbitrary user prompts", () => {
		for (const locale of ["zh", "en"] as const) {
			expect(
				translate({ text: "google/gemini-3.1-flash-image", locale: locale }),
			).toBe("google/gemini-3.1-flash-image");
			expect(
				translate({ text: "My sunset scene at 30 fps", locale: locale }),
			).toBe("My sunset scene at 30 fps");
		}
	});
	test("keeps dynamic names intact while translating labels and progress", () => {
		expect(translate({ text: "Select My sunset track", locale: "zh" })).toBe(
			"选择 My sunset 轨道",
		);
		expect(
			translate({ text: "Processing your files (50%)", locale: "zh" }),
		).toBe("正在处理文件（50%）");
	});
});
