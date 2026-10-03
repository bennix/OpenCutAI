import { expect, mock, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
mock.module("@/wasm", () => ({
 TICKS_PER_SECOND: 1000, ZERO_MEDIA_TIME: 0,
 mediaTime: ({ ticks }: { ticks: number }) => ticks,
 roundMediaTime: ({ time }: { time: number }) => Math.round(time),
 mediaTimeFromSeconds: ({ seconds }: { seconds: number }) => seconds * 1000,
 mediaTimeToSeconds: ({ time }: { time: number }) => time / 1000,
 addMediaTime: ({ a, b }: { a: number; b: number }) => a + b,
 subMediaTime: ({ a, b }: { a: number; b: number }) => a - b,
 maxMediaTime: ({ a, b }: { a: number; b: number }) => Math.max(a, b),
 minMediaTime: ({ a, b }: { a: number; b: number }) => Math.min(a, b),
 clampMediaTime: ({ time }: { time: number }) => time,
 roundFrameTime: ({ time }: { time: number }) => time,
 roundFrameTicks: ({ time }: { time: number }) => time,
 snapSeekMediaTime: ({ time }: { time: number }) => time,
 lastFrameMediaTime: ({ time }: { time: number }) => time,
 parseMediaTimecode: () => 0,
}));

const { measureTextElement } = await import("@/text/measure-element");
const { renderTextToContext, TextNode } = await import("../nodes/text-node");
import { trackStylePreview } from "@/timeline/track-style";
import type { TextElement } from "@/timeline";

// Exercise the same text rasterization used by preview and the exported frames.
for (const height of [180, 1080]) {
 test(`subtitle color/font edits reach rendered pixels at canvas height ${height}`, () => {
  const before = { type: "text", params: { content: "Subtitle", fontFamily: "Arial", fontSize: 12, color: "#ffffff", "shadow.enabled": false } } as unknown as TextElement;
  const element = { ...before, ...trackStylePreview(before, { fontFamily: "Courier New", color: "#ff0000" }) } as unknown as TextElement;
  const canvas = createCanvas(height * 2, height);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const transform = { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 };
  const node = new TextNode({ ...element, transform, opacity: 1, canvasHeight: height, canvasCenter: { x: height, y: height / 2 } });
  const measuredText = measureTextElement({ element, canvasHeight: height, localTime: 0, ctx });
  expect(measuredText.fontString).toContain('"Courier New"');
  node.resolved = { transform, opacity: 1, textColor: element.params.color as string, backgroundColor: "transparent", effectPasses: [], measuredText };
  renderTextToContext({ node, ctx });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let painted = 0;
  let wrongColor = 0;
  for (let i = 0; i < data.length; i += 4) {
   if (data[i + 3] < 200) continue;
   painted++;
   if (data[i] < 200 || data[i + 1] !== 0 || data[i + 2] !== 0) wrongColor++;
  }
  expect(painted).toBeGreaterThan(20);
  expect(wrongColor).toBe(0);
  expect(element.params.content).toBe("Subtitle");
  expect(before.params.color).toBe("#ffffff");
 });
}
