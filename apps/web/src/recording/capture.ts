import { beginSpool, appendSpool, finishSpool, readSpool } from "./spool";
import { screenFocusCrop, recordingHealth } from "opencut-ai";
export interface CaptureRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface RecordingFile {
	file: File;
	primary: boolean;
	recoveryId?: string;
}
export interface CaptureSession {
	pause(paused: boolean): void;
	stop(): Promise<RecordingFile[]>;
}
async function recorder({
	stream,
	video,
	name,
	primary,
	onFailure,
}: {
	stream: MediaStream;
	video: boolean;
	name: string;
	primary: boolean;
	onFailure: (message: string) => void;
}) {
	const mime = (
		video
			? ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
			: ["audio/webm;codecs=opus", "audio/webm"]
	).find(MediaRecorder.isTypeSupported);
	if (!mime) throw new Error("Recording codec is unavailable");
	const capture = new MediaRecorder(stream, { mimeType: mime });
	const recoveryId = await beginSpool({ name, mime, primary });
	let queue = Promise.resolve(),
		count = 0,
		queuedBytes = 0,
		failed: unknown;
	const fail = (error: unknown) => {
		if (failed) return;
		failed = error;
		onFailure(
			"录屏写入或编码失败，已写入的数据保留在恢复列表：" +
				(error instanceof Error ? error.message : String(error)),
		);
	};
	capture.ondataavailable = (event) => {
		if (!event.data.size || failed) return;
		queuedBytes += event.data.size;
		if (queuedBytes > 32 * 1024 * 1024) {
			fail(new Error("磁盘写入过慢，请停止录屏后恢复"));
			return;
		}
		const index = count++,
			blob = event.data;
		queue = queue
			.then(() => appendSpool(recoveryId, index, blob))
			.catch(fail)
			.finally(() => {
				queuedBytes -= blob.size;
			});
	};
	const file = new Promise<File>((resolve, reject) => {
		capture.onstop = () => {
			void queue
				.then(async () => {
					if (failed) throw failed;
					await finishSpool(recoveryId);
					const value = await readSpool(recoveryId);
					if (!value.size) throw new Error("录屏未产生有效数据");
					return value;
				})
				.then(resolve, reject);
		};
		capture.onerror = () => {
			fail(new Error("Recording encoder failed"));
		};
	});
	// Failures are consumed again by stop(); avoid an unhandled rejection mid-capture.
	void file.catch(() => {});
	return { capture, file, recoveryId };
}
export async function startCapture({
	sourceId,
	systemAudio,
	microphone,
	smartFocus,
	region,
	onEnded,
	onHealth,
}: {
	sourceId?: string;
	systemAudio: boolean;
	microphone: boolean;
	smartFocus: boolean;
	region: CaptureRegion;
	onEnded: () => void;
	onHealth?: (message: string, fatal?: boolean) => void;
}): Promise<CaptureSession> {
	const desktop = window.opencutDesktop;
	const streams: MediaStream[] = [];
	let interval: ReturnType<typeof setInterval> | undefined;
	let healthTimer: ReturnType<typeof setInterval> | undefined;
	let audioContext: AudioContext | undefined;
	let paused = false;
	let cursorTimer: ReturnType<typeof setInterval> | undefined;
	let video: HTMLVideoElement | undefined;
	const cleanup = () => {
		clearInterval(interval);
		clearInterval(cursorTimer);
		clearInterval(healthTimer);
		void audioContext?.close();
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
			for (const track of mic.getAudioTracks())
				track.onended = () =>
					onHealth?.("麦克风音轨已断开，已录内容仍可保存", true);
		}
		video = document.createElement("video");
		video.muted = true;
		video.srcObject = display;
		await video.play();
		if (
			!video.videoWidth ||
			!video.videoHeight ||
			!display.getVideoTracks().length
		)
			throw new Error("没有有效屏幕画面，请检查录屏权限与来源");
		for (const track of display.getTracks()) {
			track.onmute = () =>
				onHealth?.("录制来源暂时没有数据，请检查屏幕权限或音频设备");
			track.onunmute = () => onHealth?.("");
			if (track.kind === "audio")
				track.onended = () =>
					onHealth?.("系统音轨已断开，已录内容仍可保存", true);
		}
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
				...(await recorder({
					stream: rawStream,
					video: true,
					name: `Screen-${timestamp}`,
					primary: !smartFocus,
					onFailure: (message) => onHealth?.(message, true),
				})),
				primary: !smartFocus,
			},
		];
		if (smartFocus) {
			const stream = focused.captureStream(30);
			streams.push(stream);
			records.push({
				...(await recorder({
					stream,
					video: true,
					name: `SmartFocus-${timestamp}`,
					primary: true,
					onFailure: (message) => onHealth?.(message, true),
				})),
				primary: true,
			});
		}
		if (systemAudio)
			records.push({
				...(await recorder({
					stream: new MediaStream(display.getAudioTracks()),
					video: false,
					name: `System-${timestamp}`,
					primary: true,
					onFailure: (message) => onHealth?.(message, true),
				})),
				primary: true,
			});
		if (mic)
			records.push({
				...(await recorder({
					stream: mic,
					video: false,
					name: `Microphone-${timestamp}`,
					primary: true,
					onFailure: (message) => onHealth?.(message, true),
				})),
				primary: true,
			});
		let blackSeconds = 0,
			silentSeconds = 0,
			lastHealth = "";
		const healthCanvas = document.createElement("canvas");
		healthCanvas.width = 32;
		healthCanvas.height = 18;
		const healthContext = healthCanvas.getContext("2d", {
			willReadFrequently: true,
		});
		const meters: { analyser: AnalyserNode; name: string; silent: number }[] =
			[];
		if (typeof AudioContext !== "undefined" && (systemAudio || mic)) {
			audioContext = new AudioContext();
			await audioContext.resume();
			for (const audio of [
				systemAudio ? new MediaStream(display.getAudioTracks()) : undefined,
				mic,
			])
				if (audio?.getAudioTracks().length) {
					const analyser = audioContext.createAnalyser();
					analyser.fftSize = 512;
					audioContext.createMediaStreamSource(audio).connect(analyser);
					meters.push({
						analyser,
						name: audio === mic ? "麦克风" : "系统音轨",
						silent: 0,
					});
				}
		}
		healthTimer = setInterval(() => {
			if (paused) return;
			if (healthContext?.getImageData) {
				healthContext.drawImage(raw, 0, 0, 32, 18);
				const data = healthContext.getImageData(0, 0, 32, 18).data;
				let total = 0;
				for (let i = 0; i < data.length; i += 4)
					total += data[i] + data[i + 1] + data[i + 2];
				blackSeconds = total / (32 * 18 * 3) < 8 ? blackSeconds + 1 : 0;
			}
			for (const meter of meters) {
				const values = new Uint8Array(meter.analyser.fftSize);
				meter.analyser.getByteTimeDomainData(values);
				meter.silent = values.some((v) => Math.abs(v - 128) > 2)
					? 0
					: meter.silent + 1;
			}
			silentSeconds = Math.max(0, ...meters.map((m) => m.silent));
			const silentTrack = meters.find((m) => m.silent >= 10);
			const message =
				recordingHealth(
					blackSeconds,
					silentSeconds,
					display.getTracks().some((track) => track.muted),
				) + (silentTrack ? `（${silentTrack.name}）` : "");
			if (message !== lastHealth) {
				lastHealth = message;
				onHealth?.(message);
			}
		}, 1000);
		let completed: Promise<RecordingFile[]> | undefined;
		const session: CaptureSession = {
			pause(value) {
				paused = value;
				for (const { capture } of records) {
					if (value && capture.state === "recording") capture.pause();
					else if (!value && capture.state === "paused") capture.resume();
				}
			},
			stop() {
				if (!completed) {
					completed = Promise.all(
						records.map(async ({ capture, file, primary, recoveryId }) => {
							if (capture.state !== "inactive") capture.stop();
							return { file: await file, primary, recoveryId };
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
