import { expect, mock, test } from "bun:test";
mock.module("opencut-ai", () => ({
	buildStoryboardRequest: () => "{}",
	validateStoryboard: (input: string) => input,
	fitStoryboardToDuration: (input: string) => input,
	build_transition: () => "[]",
}));
mock.module("@/timeline/element-utils", () => ({
	buildElementFromMedia: (input: Record<string, unknown>) => ({
		...input,
		type: input.mediaType,
		params: {},
	}),
}));
mock.module("@/wasm", () => ({
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) => seconds,
	mediaTimeToSeconds: ({ time }: { time: number }) => time,
	roundMediaTime: ({ time }: { time: number }) => time,
}));
let generateForTest = async (_input: unknown): Promise<string> => "unused";
let libraryForTest: import("../library").GeneratedAsset[] = [];
mock.module("../library", () => ({
	listGeneratedAssets: async () => libraryForTest,
}));
mock.module("../continuity", () => ({
	previousShotReference: async () => "data:image/png;base64,lastframe",
}));
mock.module("../editor-adapter", () => ({
	generate: async ({ input }: { input: unknown }) => generateForTest(input),
	resumeVideo: async () => "unused",
	pendingJobs: () => [],
	importGenerated: async () => "unused",
	assetMetadata: () => [],
}));
// Empty tracks are pruned after top-level commands, as in EditorCore.
let activeFixture: ReturnType<typeof fixture>;
mock.module("@/commands/timeline/track/add-track", () => ({
	AddTrackCommand: class {
		private id = `track-${Math.random()}`;
		getTrackId() {
			return this.id;
		}
		execute() {
			activeFixture.tracks.overlay.push({ id: this.id, elements: [] });
		}
	},
}));
mock.module("@/commands/timeline/element/insert-element", () => ({
	InsertElementCommand: class {
		constructor(
			private input: Parameters<
				ReturnType<typeof fixture>["editor"]["timeline"]["insertElement"]
			>[0],
		) {}
		execute() {
			activeFixture.editor.timeline.insertElement(this.input);
		}
	},
}));
const { applyStoryboard, generateStoryboardAssets } =
	await import("../director");
import type { EditorCore } from "@/core";
import type { DirectorDraft } from "../director";
function fixture() {
	const tracks = {
		main: {
			id: "main",
			elements: [] as {
				id: string;
				mediaId: string;
				startTime: number;
				duration: number;
			}[],
		},
		overlay: [] as {
			id: string;
			elements: {
				id: string;
				mediaId: string;
				startTime: number;
				duration: number;
			}[];
		}[],
		audio: [],
	};
	const media = [
		{ id: "video1", type: "video", duration: 3 },
		{ id: "video3", type: "video", duration: 7 },
		{ id: "placeholder", type: "image", duration: 0 },
	];
	const editor = {
		command: {
			execute: ({ command }: { command: { execute: () => unknown } }) => {
				command.execute();
				tracks.overlay = tracks.overlay.filter(
					(track) => track.elements.length > 0,
				);
			},
		},
		project: {
			getActive: () => ({
				metadata: { id: "project" },
				settings: { canvasSize: { width: 1920, height: 1080 } },
			}),
		},
		scenes: { getActiveScene: () => ({ id: "scene", tracks }) },
		media: { getAssets: () => media },
		timeline: {
			addTrack: () => {
				const id = `track${tracks.overlay.length}`;
				tracks.overlay.push({ id, elements: [] });
				tracks.overlay = tracks.overlay.filter(
					(track) => track.elements.length > 0,
				);
				return id;
			},
			insertElement: ({
				element,
				placement,
			}: {
				element: { mediaId: string; startTime: number; duration: number };
				placement: { trackId: string };
			}) => {
				tracks.overlay
					.find((track) => track.id === placement.trackId)!
					.elements.push({ ...element, id: `element${Math.random()}` });
			},
			updateElements: ({
				updates,
			}: {
				updates: {
					trackId: string;
					elementId: string;
					patch: Record<string, unknown>;
				}[];
			}) => {
				for (const update of updates) {
					const element = tracks.overlay
						.find((track) => track.id === update.trackId)
						?.elements.find((element) => element.id === update.elementId);
					if (element) Object.assign(element, update.patch);
				}
			},
		},
	};
	const draft: DirectorDraft = {
		projectId: "project",
		sceneId: "scene",
		ratio: "16:9",
		placeholderMediaId: "placeholder",
		plan: {
			title: "Test",
			visualMemory: {
				ground: "",
				renderMode: "",
				palette: [],
				characters: "",
				atmosphere: "",
			},
			shots: [
				{
					id: "one",
					title: "one",
					duration: 3,
					prompt: "",
					camera: "",
					motion: "",
					continuity: "",
					transition: "cut",
					mediaId: "video1",
				},
				{
					id: "two",
					title: "two",
					duration: 5,
					prompt: "",
					camera: "",
					motion: "",
					continuity: "",
					transition: "cut",
				},
				{
					id: "three",
					title: "three",
					duration: 7,
					prompt: "",
					camera: "",
					motion: "",
					continuity: "",
					transition: "cut",
					mediaId: "video3",
				},
			],
		},
	};
	const result = { editor, draft, tracks, media };
	activeFixture = result;
	return result;
}
async function environment(run: () => Promise<void>) {
	const originals = new Map(
		["localStorage", "window"].map((key) => [
			key,
			Object.getOwnPropertyDescriptor(globalThis, key),
		]),
	);
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: () =>
				JSON.stringify({
					models: [
						{ id: "minimax/minimax-h3-max", kind: "video", maxShotSeconds: 15 },
					],
				}),
			setItem: () => {},
		},
	});
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { dispatchEvent: () => {} },
	});
	try {
		await run();
	} finally {
		for (const [key, value] of originals) {
			if (value) Object.defineProperty(globalThis, key, value);
			else Reflect.deleteProperty(globalThis, key);
		}
	}
}
test("failed shot retains a placeholder; retry replaces it without duplicates", async () => {
	await environment(async () => {
		const { editor, draft, tracks, media } = fixture();
		applyStoryboard({
			editor: editor as unknown as EditorCore,
			draft,
			kind: "video",
		});
		expect(
			tracks.overlay[0].elements.map((element) => element.startTime),
		).toEqual([0, 3, 8]);
		const placeholder = tracks.overlay[0].elements.find(
			(element) => element.mediaId === "placeholder",
		)!;
		expect(placeholder.duration).toBe(5);
		media.push({ id: "video2", type: "video", duration: 5 });
		draft.plan.shots[1].mediaId = "video2";
		applyStoryboard({
			editor: editor as unknown as EditorCore,
			draft,
			kind: "video",
		});
		expect(
			tracks.overlay[0].elements
				.map((element) => element.startTime)
				.sort((a, b) => a - b),
		).toEqual([0, 3, 8]);
		applyStoryboard({
			editor: editor as unknown as EditorCore,
			draft,
			kind: "video",
		});
		expect(tracks.overlay[0].elements.length).toBe(3);
		expect(
			tracks.overlay[0].elements.find(
				(element) => element.id === placeholder.id,
			)?.mediaId,
		).toBe("video2");
	});
});
test("stopping a batch still synchronizes completed shots", async () => {
	await environment(async () => {
		const { editor, draft, tracks } = fixture();
		const controller = new AbortController();
		controller.abort();
		await expect(
			generateStoryboardAssets({
				editor: editor as unknown as EditorCore,
				draft,
				kind: "video",
				model: "minimax/minimax-h3-max",
				signal: controller.signal,
				status: () => {},
			}),
		).rejects.toThrow();
		expect(
			tracks.overlay[0].elements.map((element) => element.startTime),
		).toEqual([0, 3, 8]);
	});
});

test("completed shots reach the timeline before the next shot starts", async () => {
	await environment(async () => {
		const { editor, draft, tracks } = fixture();
		const controller = new AbortController();
		let observed = false;
		await expect(
			generateStoryboardAssets({
				editor: editor as unknown as EditorCore,
				draft,
				kind: "video",
				model: "minimax/minimax-h3-max",
				signal: controller.signal,
				status: () => {},
				onUpdate: (updated) => {
					if (observed) return;
					observed = true;
					expect(
						tracks.overlay[0].elements.map((element) => element.startTime),
					).toEqual([0, 3, 8]);
					expect(updated.timeline?.elements.one).toBeDefined();
					controller.abort();
				},
			}),
		).rejects.toThrow();
		expect(observed).toBe(true);
		expect(tracks.overlay[0].elements.length).toBe(3);
	});
});

test("all pending shots occupy their slots before any generation succeeds", async () => {
	await environment(async () => {
		const { editor, draft, tracks } = fixture();
		for (const shot of draft.plan.shots) delete shot.mediaId;
		applyStoryboard({
			editor: editor as unknown as EditorCore,
			draft,
			kind: "video",
		});
		expect(
			tracks.overlay[0].elements.map((element) => element.startTime),
		).toEqual([0, 3, 8]);
		expect(
			tracks.overlay[0].elements.map((element) => element.duration),
		).toEqual([3, 5, 7]);
		expect(
			tracks.overlay[0].elements.every(
				(element) => element.mediaId === "placeholder",
			),
		).toBe(true);
		const ids = tracks.overlay[0].elements.map((element) => element.id);
		applyStoryboard({
			editor: editor as unknown as EditorCore,
			draft,
			kind: "video",
		});
		expect(tracks.overlay[0].elements.map((element) => element.id)).toEqual(
			ids,
		);
	});
});

test("outgoing continuity switch controls the next generation's first-frame reference", async () => {
	await environment(async () => {
		for (const enabled of [true, false]) {
			const { editor, draft, media } = fixture();
			draft.plan.shots[0].continueToNext = enabled;
			let received: import("../editor-adapter").GenerationInput | undefined;
			libraryForTest = [
				{
					id: "generated-two",
					name: "second.mp4",
					blob: new Blob(["video"], { type: "video/mp4" }),
					prompt: "",
					model: "test",
					created: 0,
				},
			];
			generateForTest = async (input) => {
				received = input as import("../editor-adapter").GenerationInput;
				media.push({
					id: "video2",
					type: "video",
					duration: 5,
					name: "second.mp4",
				} as (typeof media)[number]);
				return "generated-two";
			};
			await generateStoryboardAssets({
				editor: editor as unknown as EditorCore,
				draft,
				kind: "video",
				model: "minimax/minimax-h3-max",
				signal: new AbortController().signal,
				status: () => {},
			});
			expect(received?.referenceImages).toEqual(
				enabled ? ["data:image/png;base64,lastframe"] : undefined,
			);
			if (enabled) expect(received?.prompt).toContain("exact opening frame");
		}
		libraryForTest = [];
	});
});
