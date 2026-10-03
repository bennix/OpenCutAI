export interface TextShadow {
	enabled: boolean;
	color: string;
	offsetX: number;
	offsetY: number;
	blur: number;
}
export const SUBTITLE_SHADOW: TextShadow = {
	enabled: true, color: "#000000", offsetX: 2, offsetY: 2, blur: 3,
};
export function readTextShadow(params: Record<string, unknown>): TextShadow {
	const number = (key: string, fallback: number) =>
		typeof params[key] === "number" && Number.isFinite(params[key]) ? params[key] as number : fallback;
	return {
		enabled: params["shadow.enabled"] !== false,
		color: typeof params["shadow.color"] === "string" ? params["shadow.color"] : "#000000",
		offsetX: number("shadow.offsetX", 2), offsetY: number("shadow.offsetY", 2),
		blur: Math.max(0, number("shadow.blur", 3)),
	};
}
export function applyTextShadow(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, shadow: TextShadow, scale: number): void {
	ctx.shadowColor = shadow.enabled ? shadow.color : "transparent";
	ctx.shadowOffsetX = shadow.enabled ? shadow.offsetX * scale : 0;
	ctx.shadowOffsetY = shadow.enabled ? shadow.offsetY * scale : 0;
	ctx.shadowBlur = shadow.enabled ? shadow.blur * scale : 0;
}
