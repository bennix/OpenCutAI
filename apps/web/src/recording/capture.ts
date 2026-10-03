import { screenFocusCrop } from "opencut-ai";
export interface CaptureRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface RecordingFile {
	file: File;
	primary: boolean;
}
export interface CaptureSession {
	pause(paused: boolean): void;
	stop(): Promise<RecordingFile[]>;
}
function recorder({
	stream,
	video,
	name,
}: {
	stream: MediaStream;
	video: boolean;
	name: string;
}) {
	const mime = (
		video
			? ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
			: ["audio/webm;codecs=opus", "audio/webm"]
	).find(MediaRecorder.isTypeSupported);
	if (!mime) throw new Error("Recording codec is unavailable");
	const capture = new MediaRecorder(stream, { mimeType: mime });
	const chunks: Blob[] = [];
	capture.ondataavailable = (event) => {
		if (event.data.size) chunks.push(event.data);
	};
	const file = new Promise<File>((resolve, reject) => {
		capture.onstop = () =>
			resolve(new File(chunks, `${name}.webm`, { type: mime }));
		capture.onerror = () => reject(new Error("Recording failed"));
	});
	// Failures are consumed again by stop(); avoid an unhandled rejection mid-capture.
	void file.catch(() => {});
	return { capture, file };
}
export async function startCapture({
	sourceId,
	systemAudio,
	microphone,
	smartFocus,
	region,
	onEnded,
}: {
	sourceId?: string;
	systemAudio: boolean;
	microphone: boolean;
	smartFocus: boolean;
	region: CaptureRegion;
	onEnded: () => void;
}): Promise<CaptureSession> {
	const desktop = window.opencutDesktop;
	const streams: MediaStream[] = [];
	let interval: ReturnType<typeof setInterval> | undefined;
	let cursorTimer: ReturnType<typeof setInterval> | undefined;
	let video: HTMLVideoElement | undefined;
	const cleanup = () => {
		clearInterval(interval);
		clearInterval(cursorTimer);
		streams.forEach((stream) =>
			stream.getTracks().forEach((track) => track.stop()),
		);
		if (video) {
			video.pause();
			video.srcObject = null;
		}
		void desktop?.endRecording();
	};
	try {
		if (desktop && sourceId)
			await desktop.selectRecordingSource({ id: sourceId, audio: systemAudio });
		const display = await navigator.mediaDevices.getDisplayMedia({
			video: { frameRate: 30 },
			audio: systemAudio,
		});
		streams.push(display);
		if (systemAudio && !display.getAudioTracks().length)
			throw new Error("System audio is unavailable for this capture source");
		let mic: MediaStream | undefined;
		if (microphone) {
			mic = await navigator.mediaDevices.getUserMedia({ audio: true });
			streams.push(mic);
		}
		video = document.createElement("video");
		video.muted = true;
		video.srcObject = display;
		await video.play();
		const width = Math.max(
			2,
			Math.round((video.videoWidth * region.width) / 2) * 2,
		);
		const height = Math.max(
			2,
			Math.round((video.videoHeight * region.height) / 2) * 2,
		);
		const raw = document.createElement("canvas");
		raw.width = width;
		raw.height = height;
		const focused = document.createElement("canvas");
		focused.width = width;
		focused.height = height;
		const rawContext = raw.getContext("2d")!,
			focusContext = focused.getContext("2d")!;
		let cursor = { x: 0.5, y: 0.5 },
			crop = { x: 0, y: 0, size: 1 };
		let polling = false;
		if (smartFocus && desktop)
			cursorTimer = setInterval(async () => {
				if (polling) return;
				polling = true;
				try {
					const point = await desktop.recordingCursor();
					if (point)
						cursor = {
							x: (point.x - region.x) / region.width,
							y: (point.y - region.y) / region.height,
						};
				} finally {
					polling = false;
				}
			}, 100);
		let last = performance.now();
		const draw = () => {
			if (!video) return;
			rawContext.drawImage(
				video,
				video.videoWidth * region.x,
				video.videoHeight * region.y,
				video.videoWidth * region.width,
				video.videoHeight * region.height,
				0,
				0,
				width,
				height,
			);
			const now = performance.now();
			if (smartFocus)
				crop = JSON.parse(
					screenFocusCrop(
						cursor.x,
						cursor.y,
						1.6,
						crop.x,
						crop.y,
						(now - last) / 1000,
					),
				);
			last = now;
			focusContext.drawImage(
				raw,
				width * crop.x,
				height * crop.y,
				width * crop.size,
				height * crop.size,
				0,
				0,
				width,
				height,
			);
		};
		draw();
		interval = setInterval(draw, 1000 / 30);
		const timestamp = Date.now();
		const rawStream = raw.captureStream(30);
		streams.push(rawStream);
		const records = [
			{
				...recorder({
					stream: rawStream,
					video: true,
					name: `Screen-${timestamp}`,
				}),
				primary: !smartFocus,
			},
		];
		if (smartFocus) {
			const stream = focused.captureStream(30);
			streams.push(stream);
			records.push({
				...recorder({ stream, video: true, name: `SmartFocus-${timestamp}` }),
				primary: true,
			});
		}
		if (systemAudio)
			records.push({
				...recorder({
					stream: new MediaStream(display.getAudioTracks()),
					video: false,
					name: `System-${timestamp}`,
				}),
				primary: true,
			});
		if (mic)
			records.push({
				...recorder({
					stream: mic,
					video: false,
					name: `Microphone-${timestamp}`,
				}),
				primary: true,
			});
		let completed: Promise<RecordingFile[]> | undefined;
		const session: CaptureSession = {
			pause(paused) {
				for (const { capture } of records) {
					if (paused && capture.state === "recording") capture.pause();
					else if (!paused && capture.state === "paused") capture.resume();
				}
			},
			stop() {
				if (!completed) {
					completed = Promise.all(
						records.map(async ({ capture, file, primary }) => {
							if (capture.state !== "inactive") capture.stop();
							return { file: await file, primary };
						}),
					).finally(cleanup);
					cleanup();
				}
				return completed;
			},
		};
		display.getVideoTracks()[0].onended = onEnded;
		for (const { capture } of records) capture.start(1000);
		return session;
	} catch (error) {
		cleanup();
		throw error;
	}
}
