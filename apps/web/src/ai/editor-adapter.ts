import { getLocale } from "@/i18n/locale";
import {
	buildGenerationRequest,
	validateEditPlan,
	decodeGenerationResponse,
	build_transition,
} from "opencut-ai";
import type { TimelineElement } from "@/timeline/types";
import { roundMediaTime } from "@/wasm";
import type { EditorCore } from "@/core";
import { processMediaAssets } from "@/media/processing";
import { BatchCommand, InsertElementCommand } from "@/commands";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import type { ElementAnimations } from "@/animation/types";
import { generateUUID } from "@/utils/id";
import { zenmux } from "./transport";
import { saveGeneratedAsset, type GeneratedAsset } from "./library";
import type { AiKind } from "./settings";
export interface EditPlan {
	summary: string;
	clips: {
		mediaId: string;
		in: number;
		duration: number;
		transition?: string;
	}[];
}
export interface GenerationInput {
	referenceImages?: string[];
	directorShotId?: string;
	directorSceneId?: string;
	kind: AiKind;
	model: string;
	prompt: string;
	ratio?: string;
	size?: string;
	duration?: number;
	resolution?: string;
	includePreviews?: boolean;
}
export function assetMetadata(editor: EditorCore) {
	return editor.media
		.getAssets()
		.map(({ id, name, type, duration, width, height }) => ({
			id,
			name,
			type,
			duration,
			width,
			height,
		}));
}
export async function importGenerated({
	editor,
	asset,
}: {
	editor: EditorCore;
	asset: GeneratedAsset;
}) {
	const projectId = editor.project.getActive().metadata.id;
	const processed = await processMediaAssets({
		files: [new File([asset.blob], asset.name, { type: asset.blob.type })],
	});
	if (processed.length !== 1)
		throw new Error("素材导入失败，生成文件已保留在 AI 素材库");
	if (editor.project.getActive().metadata.id !== projectId)
		throw new Error("项目已切换，请在目标项目复用该素材");
	const saved = await editor.media.addMediaAsset({
		projectId,
		asset: processed[0],
	});
	if (!saved) throw new Error("素材保存失败，请检查本地存储空间");
	return saved.id;
}
function decodeBlob({ data, mime }: { data: string; mime: string }) {
	const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
	return new Blob([bytes], { type: mime });
}
async function download({
	url,
	signal,
}: {
	url: string;
	signal?: AbortSignal;
}) {
	let lastError: unknown;
	for (let attempt = 0; attempt < 3; attempt++) {
		signal?.throwIfAborted();
		try {
			const response = await fetch(url, {
				signal: AbortSignal.any([
					...(signal ? [signal] : []),
					AbortSignal.timeout(120_000),
				]),
			});
			if (response.ok) return await response.blob();
			lastError = new Error(`素材 CDN 下载失败 (${response.status})`);
		} catch (error) {
			if (signal?.aborted) throw error;
			lastError = error;
		}
		try {
			const { readApiKey } = await import("./settings");
			const response = await fetch("/api/zenmux/media", {
				method: "POST",
				signal,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${await readApiKey()}`,
				},
				body: JSON.stringify({ url }),
			});
			if (response.ok) return await response.blob();
			const detail = (await response.text()).slice(0, 200);
			lastError = new Error(
				`素材下载失败 (${response.status})${detail ? `：${detail}` : ""}`,
			);
			if (
				response.status >= 400 &&
				response.status < 500 &&
				response.status !== 429
			)
				throw lastError;
		} catch (error) {
			if (signal?.aborted) throw error;
			lastError = error;
		}
	}
	throw lastError instanceof Error
		? lastError
		: new Error("素材下载失败，可重试下载已生成的视频");
}
export interface VideoJob {
	id: string;
	input: GenerationInput;
	projectId: string;
}
export function pendingJobs(): VideoJob[] {
	return JSON.parse(localStorage.getItem("opencut-ai-jobs") ?? "[]");
}
function storeJob({
	job,
	remove = false,
}: {
	job: VideoJob;
	remove?: boolean;
}) {
	const jobs = pendingJobs().filter((j) => j.id !== job.id);
	localStorage.setItem(
		"opencut-ai-jobs",
		JSON.stringify(remove ? jobs : [...jobs, job]),
	);
}
async function finishAsset({
	editor,
	input,
	blob,
	projectId,
}: {
	editor: EditorCore;
	input: GenerationInput;
	blob: Blob;
	projectId: string;
}) {
	if (input.kind === "video" && blob.type.startsWith("image/"))
		throw new Error("Video generation returned an image instead of a video");
	const mime = blob.type.startsWith(`${input.kind}/`)
		? blob.type
		: input.kind === "video"
			? "video/mp4"
			: "image/png";
	const extension = mime.includes("video")
		? "mp4"
		: mime.includes("jpeg")
			? "jpg"
			: mime.includes("webp")
				? "webp"
				: "png";
	const asset: GeneratedAsset = {
		id: crypto.randomUUID(),
		name: `AI-${Date.now()}.${extension}`,
		prompt: input.prompt,
		model: input.model,
		created: Date.now(),
		blob: new Blob([blob], { type: mime }),
	};
	await saveGeneratedAsset(asset);
	if (editor.project.getActive().metadata.id === projectId)
		await importGenerated({ editor, asset });
	return asset.id;
}
export async function resumeVideo({
	editor,
	job,
	signal,
	status,
}: {
	editor: EditorCore;
	job: VideoJob;
	signal: AbortSignal;
	status: (s: string) => void;
}) {
	for (let attempt = 0; attempt < 120; attempt++) {
		signal.throwIfAborted();
		status(`视频生成中 · ${job.id} · 第 ${attempt + 1} 次查询`);
		let data;
		try {
			data = await zenmux({
				path: `/api/v1/videos/${encodeURIComponent(job.id)}`,
				signal,
			});
		} catch (error) {
			// Definitive parameter failures cannot recover by polling the same task.
			if (
				error instanceof Error &&
				/invalid params|does not support resolution|does not support duration/i.test(
					error.message,
				)
			)
				storeJob({ job, remove: true });
			throw error;
		}
		let output;
		try {
			output = JSON.parse(
				decodeGenerationResponse(JSON.stringify(data), "video"),
			);
		} catch (error) {
			if (data.status === "failed") storeJob({ job, remove: true });
			throw error;
		}
		if (output.status === "succeeded") {
			const blob = output.media.base64
				? decodeBlob({ data: output.media.base64, mime: output.media.mime })
				: await download({ url: output.media.url, signal });
			const id = await finishAsset({
				editor,
				input: job.input,
				blob,
				projectId: job.projectId,
			});
			storeJob({ job, remove: true });
			return id;
		}
		await new Promise<void>((resolve, reject) => {
			const abort = () => {
				clearTimeout(timer);
				reject(signal.reason);
			};
			const timer = setTimeout(() => {
				signal.removeEventListener("abort", abort);
				resolve();
			}, 15000);
			signal.addEventListener("abort", abort, { once: true });
		});
	}
	throw new Error("轮询已超时；任务保留，可稍后继续查询");
}
export async function generate({
	editor,
	input,
	signal,
	status,
}: {
	editor: EditorCore;
	input: GenerationInput;
	signal: AbortSignal;
	status: (s: string) => void;
}): Promise<EditPlan | string> {
	const projectId = editor.project.getActive().metadata.id;
	const metadata = assetMetadata(editor);
	const spec = JSON.parse(
		buildGenerationRequest(
			JSON.stringify({
				...input,
				language: getLocale(),
				assets: metadata,
				previews:
					input.kind === "edit" && input.includePreviews
						? editor.media
								.getAssets()
								.filter((a) => a.thumbnailUrl?.startsWith("data:image/"))
								.slice(0, 12)
								.map((a) => ({ mediaId: a.id, url: a.thumbnailUrl }))
						: [],
			}),
		),
	);
	status("正在调用 ZenMux…");
	const data = await zenmux({ path: spec.path, body: spec.body, signal });
	const output = JSON.parse(
		decodeGenerationResponse(JSON.stringify(data), input.kind),
	);
	if (input.kind === "edit") {
		return JSON.parse(validateEditPlan(output.plan, JSON.stringify(metadata)));
	}
	if (spec.pollPath) {
		if (typeof data.id !== "string") throw new Error("视频任务没有返回 ID");
		const job = { id: data.id, input, projectId };
		storeJob({ job });
		return resumeVideo({ editor, job, signal, status });
	}
	if (!output.media)
		throw new Error("模型尚未返回素材，请在平台查看交互任务状态");
	const blob = output.media.base64
		? decodeBlob({ data: output.media.base64, mime: output.media.mime })
		: await download({ url: output.media.url, signal });
	status("正在保存到本地素材库…");
	return finishAsset({ editor, input, blob, projectId });
}
export function applyEditPlan({
	editor,
	plan,
}: {
	editor: EditorCore;
	plan: EditPlan;
}) {
	const checked: EditPlan = JSON.parse(
		validateEditPlan(
			JSON.stringify(plan),
			JSON.stringify(assetMetadata(editor)),
		),
	);
	const tracks = editor.scenes.getActiveScene().tracks;
	const elements = [
		...tracks.main.elements,
		...tracks.overlay.flatMap<TimelineElement>((t) => t.elements),
		...tracks.audio.flatMap((t) => t.elements),
	];
	let start = Math.max(
		0,
		...elements.map((e) =>
			mediaTimeToSeconds({
				time: roundMediaTime({ time: e.startTime + e.duration }),
			}),
		),
	);
	const commands = checked.clips.map((clip) => {
		const asset = editor.media.getAssets().find((a) => a.id === clip.mediaId)!;
		const duration = mediaTimeFromSeconds({ seconds: clip.duration });
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration,
			startTime: mediaTimeFromSeconds({ seconds: start }),
		});
		if (clip.transition && clip.transition !== "cut") {
			const channels: {
				path: string;
				keys: { time: number; value: number }[];
			}[] = JSON.parse(
				build_transition(
					JSON.stringify({
						mode: clip.transition,
						edge: "both",
						duration: clip.duration,
						length: Math.min(0.5, clip.duration / 2),
						...editor.project.getActive().settings.canvasSize,
						params: element.params,
					}),
				),
			);
			const animations: ElementAnimations = {};
			for (const channel of channels)
				animations[channel.path] = {
					keys: channel.keys.map((key) => ({
						id: generateUUID(),
						time: mediaTimeFromSeconds({ seconds: key.time }),
						value: key.value,
						segmentToNext: "linear" as const,
						tangentMode: "auto" as const,
					})),
				};
			element.animations = animations;
		}
		element.trimStart = mediaTimeFromSeconds({ seconds: clip.in });
		element.trimEnd = mediaTimeFromSeconds({
			seconds: Math.max(
				0,
				(asset.duration ?? clip.duration) - clip.in - clip.duration,
			),
		});
		if ("sourceDuration" in element)
			element.sourceDuration = mediaTimeFromSeconds({
				seconds: asset.duration ?? clip.duration,
			});
		start += clip.duration;
		return new InsertElementCommand({ element, placement: { mode: "auto" } });
	});
	const { canvasSize, originalCanvasSize, fps } =
		editor.project.getActive().settings;
	editor.command.execute({ command: new BatchCommand(commands) });
	// The ordinary importer adopts the first asset's canvas. AI plans use the
	// project's chosen canvas so generated landscape/portrait assets fit it.
	editor.project.updateSettings({
		settings: { canvasSize, originalCanvasSize, fps },
		pushHistory: false,
	});
}
