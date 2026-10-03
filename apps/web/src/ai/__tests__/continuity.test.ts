import { expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import type { DirectorShot } from "../director";
let sampledAt = -1,
	closed = 0,
	disposed = 0;
mock.module("mediabunny", () => ({
	ALL_FORMATS: [],
	BlobSource: class {
		constructor(public blob: Blob) {}
	},
	Input: class {
		async getPrimaryVideoTrack() {
			return {
				displayWidth: 1920,
				displayHeight: 1080,
				canDecode: async () => true,
			};
		}
		async computeDuration() {
			return 5;
		}
		dispose() {
			disposed++;
		}
	},
	VideoSampleSink: class {
		async getSample(time: number) {
			sampledAt = time;
			return {
				draw() {},
				close() {
					closed++;
				},
			};
		}
	},
}));
const { previousShotReference } = await import("../continuity");
const shot = (extra: Partial<DirectorShot> = {}): DirectorShot => ({
	id: "first",
	title: "first",
	duration: 3,
	prompt: "",
	camera: "",
	motion: "",
	continuity: "",
	transition: "cut",
	...extra,
});
function editor(withVideo: boolean) {
	return {
		media: {
			getAssets: () =>
				withVideo
					? [
							{
								id: "video",
								type: "video",
								file: new File(["video"], "test.mp4", { type: "video/mp4" }),
							},
						]
					: [],
		},
	} as unknown as EditorCore;
}
test("disabled continuity never requires previous media", async () => {
	expect(
		await previousShotReference({
			editor: editor(false),
			shots: [shot()],
			index: 1,
			library: [],
			signal: new AbortController().signal,
		}),
	).toBeUndefined();
});
test("enabled continuity blocks generation if the previous shot is missing", async () => {
	await expect(
		previousShotReference({
			editor: editor(false),
			shots: [shot({ continueToNext: true })],
			index: 1,
			library: [],
			signal: new AbortController().signal,
		}),
	).rejects.toThrow("Generate the previous shot first");
});
test("reference uses the final visible frame and releases decoder resources", async () => {
	const original = Object.getOwnPropertyDescriptor(globalThis, "document");
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			createElement: () => ({
				getContext: () => ({}),
				toDataURL: () => "data:image/png;base64,lastframe",
			}),
		},
	});
	try {
		const reference = await previousShotReference({
			editor: editor(true),
			shots: [shot({ continueToNext: true, mediaId: "video" })],
			index: 1,
			library: [],
			signal: new AbortController().signal,
		});
		expect(reference).toBe("data:image/png;base64,lastframe");
		expect(sampledAt).toBeCloseTo(3 - 0.000001, 6);
		expect(closed).toBe(1);
		expect(disposed).toBe(1);
	} finally {
		if (original) Object.defineProperty(globalThis, "document", original);
		else Reflect.deleteProperty(globalThis, "document");
	}
});
test("cancelled extraction never proceeds to decode", async () => {
	const controller = new AbortController();
	controller.abort();
	await expect(
		previousShotReference({
			editor: editor(true),
			shots: [shot({ continueToNext: true, mediaId: "video" })],
			index: 1,
			library: [],
			signal: controller.signal,
		}),
	).rejects.toThrow();
});
