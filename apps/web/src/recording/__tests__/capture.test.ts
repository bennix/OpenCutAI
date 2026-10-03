import { expect, mock, test } from "bun:test";
mock.module("opencut-ai", () => ({
	screenFocusCrop: () => JSON.stringify({ x: 0, y: 0, size: 1 }),
}));
const { startCapture } = await import("../capture");
class Track {
	stopped = false;
	onended: (() => void) | null = null;
	stop() {
		this.stopped = true;
	}
}
class Stream {
	constructor(public tracks: Track[] = []) {}
	getTracks() {
		return this.tracks;
	}
	getVideoTracks() {
		return this.tracks.slice(0, 1);
	}
	getAudioTracks() {
		return this.tracks.slice(1);
	}
}
class Recorder {
	static created: Recorder[] = [];
	static isTypeSupported() {
		return true;
	}
	state = "inactive";
	ondataavailable: ((event: { data: Blob }) => void) | null = null;
	onstop: (() => void) | null = null;
	onerror: (() => void) | null = null;
	// Match the browser MediaRecorder constructor.
	// eslint-disable-next-line opencut/prefer-object-params
	constructor(
		public stream: Stream,
		public options: { mimeType: string },
	) {
		Recorder.created.push(this);
	}
	start() {
		this.state = "recording";
	}
	pause() {
		this.state = "paused";
	}
	resume() {
		this.state = "recording";
	}
	stop() {
		this.state = "inactive";
		this.ondataavailable?.({
			data: new Blob(["recorded"], { type: this.options.mimeType }),
		});
		this.onstop?.();
	}
}
async function environment({
	run,
	system = true,
}: {
	run: (display: Stream, mic: Stream) => Promise<void>;
	system?: boolean;
}) {
	const display = new Stream([new Track(), ...(system ? [new Track()] : [])]),
		mic = new Stream([new Track()]);
	const values = {
		window: { opencutDesktop: undefined },
		navigator: {
			mediaDevices: {
				getDisplayMedia: async () => display,
				getUserMedia: async () => mic,
			},
		},
		MediaStream: Stream,
		MediaRecorder: Recorder,
		document: {
			createElement: (kind: string) =>
				kind === "video"
					? {
							videoWidth: 640,
							videoHeight: 360,
							muted: false,
							srcObject: null,
							play: async () => {},
							pause: () => {},
						}
					: {
							width: 0,
							height: 0,
							getContext: () => ({ drawImage: () => {} }),
							captureStream: () => new Stream([new Track()]),
						},
		},
	};
	const originals = new Map(
		Object.keys(values).map((key) => [
			key,
			Object.getOwnPropertyDescriptor(globalThis, key),
		]),
	);
	Recorder.created = [];
	for (const [key, value] of Object.entries(values))
		Object.defineProperty(globalThis, key, { configurable: true, value });
	try {
		await run(display, mic);
	} finally {
		for (const [key, descriptor] of originals) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else Reflect.deleteProperty(globalThis, key);
		}
	}
}
test("screen, microphone and system tracks pause together and stop once", async () => {
	await environment({
		run: async (display, mic) => {
			const session = await startCapture({
				systemAudio: true,
				microphone: true,
				smartFocus: false,
				region: { x: 0, y: 0, width: 1, height: 1 },
				onEnded: () => {},
			});
			expect(Recorder.created.length).toBe(3);
			session.pause(true);
			expect(Recorder.created.every((item) => item.state === "paused")).toBe(
				true,
			);
			session.pause(false);
			expect(Recorder.created.every((item) => item.state === "recording")).toBe(
				true,
			);
			const result = await session.stop();
			expect(result.length).toBe(3);
			expect(result.find((entry) => entry.file.name.startsWith("System-"))?.primary).toBe(true);
			expect(result.find((entry) => entry.file.name.startsWith("System-"))?.file.type).toContain("audio/webm");
			expect(result.map((entry) => entry.file.name.split("-")[0])).toEqual([
				"Screen",
				"System",
				"Microphone",
			]);
			expect(await session.stop()).toBe(result);
			expect(
				[...display.getTracks(), ...mic.getTracks()].every(
					(track) => track.stopped,
				),
			).toBe(true);
		},
	});
});
test("unavailable requested system audio reports failure and releases capture", async () => {
	await environment({
		run: async (display) => {
			await expect(
				startCapture({
					systemAudio: true,
					microphone: false,
					smartFocus: false,
					region: { x: 0, y: 0, width: 1, height: 1 },
					onEnded: () => {},
				}),
			).rejects.toThrow("System audio is unavailable");
			expect(display.getTracks().every((track) => track.stopped)).toBe(true);
		},
		system: false,
	});
});
