import type { EffectDefinition } from "@/effects/types";

export const colorAdjustmentDefinition: EffectDefinition = {
	type: "color-adjustment",
	name: "Color adjustment",
	keywords: ["color", "brightness", "contrast", "saturation"],
	params: [
		{ key: "brightness", label: "Brightness", type: "number", default: 0, min: -1, max: 1, step: 0.01 },
		{ key: "contrast", label: "Contrast", type: "number", default: 1, min: 0, max: 3, step: 0.01 },
		{ key: "saturation", label: "Saturation", type: "number", default: 1, min: 0, max: 3, step: 0.01 },
		{ key: "temperature", label: "Temperature", type: "number", default: 0, min: -1, max: 1, step: 0.01 },
	],
	renderer: { passes: [{ shader: "color-adjustment", uniforms: ({ effectParams }) => ({
		u_brightness: Number(effectParams.brightness ?? 0),
		u_contrast: Number(effectParams.contrast ?? 1),
		u_saturation: Number(effectParams.saturation ?? 1),
		u_temperature: Number(effectParams.temperature ?? 0),
		u_style: 0, u_amount: 1,
	}) }] },
};

const styles = ["Black & white", "Sepia", "Invert", "Warm", "Cool", "Vignette", "Film grain", "Pixelate", "Mirror horizontal", "Mirror vertical", "Posterize", "Threshold"];
export const colorEffects: EffectDefinition[] = styles.map((name, index) => ({
	type: `color-style-${index + 1}`, name, keywords: ["color", name],
	params: [{ key: "amount", label: "Intensity", type: "number", default: index === 6 ? 0.5 : 1, min: 0, max: 1, step: 0.01 }],
	renderer: { passes: [{ shader: "color-adjustment", uniforms: ({ effectParams }) => ({
		u_brightness: 0, u_contrast: 1, u_saturation: 1, u_temperature: 0,
		u_style: index + 1, u_amount: Number(effectParams.amount ?? 1),
	}) }] },
}));
