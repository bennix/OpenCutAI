import { expect, test } from "bun:test";
import { getDefaultModel, DEFAULT_MODELS, type AiSettings } from "../settings";
const settings: AiSettings = {
	models: DEFAULT_MODELS,
	mcpEnabled: false,
	mcpToken: "",
	defaultModels: {
		image: "google/gemini-3.1-flash-image",
		video: "google/gemini-omni-1.1-flash-preview",
	},
};
test("image and video defaults remain independent", () => {
	expect(getDefaultModel({ settings, kind: "image" })).toBe(
		settings.defaultModels!.image!,
	);
	expect(getDefaultModel({ settings, kind: "video" })).toBe(
		settings.defaultModels!.video!,
	);
});
test("legacy, deleted and wrong-kind defaults select an available model", () => {
	expect(
		getDefaultModel({
			settings: { ...settings, defaultModels: undefined },
			kind: "image",
		}),
	).toBe("openai/gpt-image-2.5-flare");
	expect(
		getDefaultModel({
			settings: {
				...settings,
				models: settings.models.filter(
					(model) => model.id !== settings.defaultModels!.video,
				),
			},
			kind: "video",
		}),
	).toBe("minimax/minimax-h3-max");
	expect(
		getDefaultModel({
			settings: {
				...settings,
				defaultModels: { image: "minimax/minimax-h3-max" },
			},
			kind: "image",
		}),
	).toBe("openai/gpt-image-2.5-flare");
	expect(
		getDefaultModel({ settings: { ...settings, models: [] }, kind: "video" }),
	).toBe("");
});
