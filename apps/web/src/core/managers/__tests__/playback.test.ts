import { expect, mock, spyOn, test } from "bun:test";
mock.module("@/wasm", () => ({
	ZERO_MEDIA_TIME: 0,
	addMediaTime: ({ a, b }: { a: number; b: number }) => a + b,
	clampMediaTime: ({
		time,
		min,
		max,
	}: {
		time: number;
		min: number;
		max: number;
	}) => Math.max(min, Math.min(max, time)),
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) => seconds,
	roundFrameTime: ({ time }: { time: number }) => Math.floor(time * 30) / 30,
}));
const { PlaybackManager } = await import("../playback-manager");
import type { MediaTime } from "@/wasm";
import type { EditorCore } from "@/core";
test("playback stops at the end with a final position and no pending frame", () => {
	const originals = ["requestAnimationFrame", "cancelAnimationFrame"].map(
		(key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
	);
	let frame: (() => void) | undefined;
	let now = 0;
	const clock = spyOn(performance, "now").mockImplementation(() => now);
	Object.defineProperty(globalThis, "requestAnimationFrame", {
		configurable: true,
		value: (callback: () => void) => {
			frame = callback;
			return 1;
		},
	});
	Object.defineProperty(globalThis, "cancelAnimationFrame", {
		configurable: true,
		value: () => {
			frame = undefined;
		},
	});
	try {
		const playback = new PlaybackManager({
			timeline: { getTotalDuration: () => 1.01 },
			project: { getActive: () => ({ settings: { fps: 30 } }) },
		} as unknown as EditorCore);
		const positions: number[] = [];
		playback.onUpdate((time) => positions.push(time));
		playback.play();
		now = 1011;
		frame!();
		expect(playback.getIsPlaying()).toBe(false);
		expect(playback.getCurrentTime()).toBe(1.01 as MediaTime);
		expect(positions.at(-1)).toBe(1.01 as MediaTime);
		expect(frame).toBeUndefined();
		playback.play();
		expect(playback.getCurrentTime()).toBe(0 as MediaTime);
		playback.seek({ time: 1.01 as MediaTime });
		expect(playback.getIsPlaying()).toBe(false);
		expect(frame).toBeUndefined();
	} finally {
		clock.mockRestore();
		for (const [key, descriptor] of originals) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else Reflect.deleteProperty(globalThis, key);
		}
	}
});
