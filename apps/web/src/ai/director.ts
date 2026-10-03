import {loadTasks} from "./tasks";
import { previousShotReference } from "./continuity";
import { BatchCommand } from "@/commands/batch-command";
import { AddTrackCommand } from "@/commands/timeline/track/add-track";
import { InsertElementCommand } from "@/commands/timeline/element/insert-element";
import {
	buildStoryboardRequest,
	validateStoryboard,
	fitStoryboardToDuration,
	build_transition,
} from "opencut-ai";
import { generateUUID } from "@/utils/id";
import type { ElementAnimations } from "@/animation/types";
import type { EditorCore } from "@/core";
import { buildElementFromMedia } from "@/timeline/element-utils";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	roundMediaTime,
} from "@/wasm";
import { getLocale } from "@/i18n/locale";
import { zenmux } from "./transport";
import { loadSettings, getDefaultModel, getVideoShotLimit } from "./settings";
import {
	generate,
	resumeVideo,
	pendingJobs,
	importGenerated,
	assetMetadata,
} from "./editor-adapter";
import { listGeneratedAssets } from "./library";

export interface DirectorShot {
	id: string;
	title: string;
	duration: number;
	prompt: string;
	camera: string;
	characterIds?: string[];
	firstFrameAssetId?: string;
	continueToNext?: boolean;
 continuationFrameAssetId?:string;
 continuationTime?:number;
	error?: string;
	motion: string;
	continuity: string;
	transition: string;
	mediaId?: string;
	assetId?: string;
}
export interface CharacterCard {
	id: string;
	name: string;
	description: string;
	assetId?: string;
}
export interface Storyboard {
	characters?: CharacterCard[];
	title: string;
	visualMemory: {
		ground: string;
		renderMode: string;
		palette: string[];
		characters: string;
		atmosphere: string;
	};
	shots: DirectorShot[];
}
export interface DirectorDraft {
	projectId: string;
	sceneId: string;
	ratio: string;
	plan: Storyboard;
	placeholderMediaId?: string;
	timeline?: {
		trackId: string;
		startSeconds: number;
		elements: Record<string, string>;
	};
}
export const directorStorageKey = ({
	projectId,
	sceneId,
}: {
	projectId: string;
	sceneId: string;
}) => `opencut-director-${projectId}-${sceneId}`;
export function saveDirectorDraft(draft: DirectorDraft) {
	localStorage.setItem(directorStorageKey(draft), JSON.stringify(draft));
	window.dispatchEvent(new Event("opencut-director-change"));
}
export function loadDirectorDraft(context: {
	projectId: string;
	sceneId: string;
}): DirectorDraft | null {
	const value = localStorage.getItem(directorStorageKey(context));
	return value ? JSON.parse(value) : null;
}
function assertContext({
	editor,
	draft,
}: {
	editor: EditorCore;
	draft: DirectorDraft;
}) {
	if (
		editor.project.getActive().metadata.id !== draft.projectId ||
		editor.scenes.getActiveScene().id !== draft.sceneId
	)
		throw new Error(
			"Project or scene changed. Return to the original storyboard.",
		);
}
export async function planStoryboard({
	editor,
	model,
	brief,
	preset,
	ratio,
	shotCount,
	maxShotSeconds,
	videoModel,
	outputKind = "video",
	signal,
}: {
	editor: EditorCore;
	model: string;
	brief: string;
	preset: string;
	ratio: string;
	shotCount: number;
	maxShotSeconds?: number;
	videoModel?: string;
	outputKind?: "image" | "video";
	signal: AbortSignal;
}): Promise<DirectorDraft> {
	if (
		!loadSettings().models.some(
			(item) => item.id === model && item.kind === "edit",
		)
	)
		throw new Error("Model is not configured for this task");
	if (outputKind === "video") {
		const settings = loadSettings();
		maxShotSeconds = getVideoShotLimit(
			settings,
			videoModel ?? getDefaultModel({ settings, kind: "video" }),
		);
		if (!maxShotSeconds)
			throw new Error(
				"Configure model duration and split the storyboard first",
			);
	}
	const projectId = editor.project.getActive().metadata.id,
		sceneId = editor.scenes.getActiveScene().id;
	const request = JSON.parse(
		buildStoryboardRequest(
			JSON.stringify({
				model,
				brief,
				preset,
				ratio,
				shotCount,
				maxShotSeconds,
				language: getLocale(),
				assets: assetMetadata(editor),
			}),
		),
	);
	const result = await zenmux({
		path: request.path,
		body: request.body,
		signal,
	});
	const content = result.choices?.[0]?.message?.content;
	if (typeof content !== "string")
		throw new Error("Model did not return a storyboard");
	const plan: Storyboard = JSON.parse(
		validateStoryboard(content, JSON.stringify(assetMetadata(editor))),
	);
	if (plan.shots.length !== shotCount)
		throw new Error(
			"Storyboard shot count differs from the request. Retry planning.",
		);
	const draft = {
		projectId,
		sceneId,
		ratio,
		plan: maxShotSeconds
			? JSON.parse(
					fitStoryboardToDuration(JSON.stringify(plan), maxShotSeconds),
				)
			: plan,
	};
	assertContext({ editor, draft });
	saveDirectorDraft(draft);
	return draft;
}
export async function prepareStoryboardTimeline({
	editor,
	draft,
	kind,
}: {
	editor: EditorCore;
	draft: DirectorDraft;
	kind?: "image" | "video";
}) {
	assertContext({ editor, draft });
	if (
		!editor.media
			.getAssets()
			.some((asset) => asset.id === draft.placeholderMediaId)
	) {
		const canvas = document.createElement("canvas");
		canvas.width = 960;
		canvas.height = 540;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Cannot create storyboard placeholder");
		context.fillStyle = "#18212f";
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.fillStyle = "#94a3b8";
		context.font = "32px sans-serif";
		context.textAlign = "center";
		context.fillText(
			getLocale() === "zh"
				? "AI 镜头 · 等待生成"
				: "AI shot · awaiting generation",
			480,
			270,
		);
		const blob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(value) =>
					value
						? resolve(value)
						: reject(new Error("Cannot create storyboard placeholder")),
				"image/png",
			),
		);
		assertContext({ editor, draft });
		draft.placeholderMediaId = await importGenerated({
			editor,
			asset: {
				id: generateUUID(),
				name: `Storyboard-placeholder-${draft.sceneId}.png`,
				blob,
				prompt: "",
				model: "placeholder",
				created: Date.now(),
			},
		});
		assertContext({ editor, draft });
		saveDirectorDraft(draft);
	}
	applyStoryboard({ editor, draft, kind });
}

export async function generateStoryboardAssets({
	editor,
	draft,
	kind,
	model,
	signal,
	status,
	onUpdate,
	shotId,
	referenceModel,
}: {
	editor: EditorCore;
	draft: DirectorDraft;
	kind: "image" | "video";
	model: string;
	signal: AbortSignal;
	status: (status: string) => void;
	onUpdate?: (draft: DirectorDraft) => void;
	shotId?: string;
	referenceModel?: string;
}) {
	if (
		!loadSettings().models.some(
			(item) => item.id === model && item.kind === kind,
		)
	)
		throw new Error("Model is not configured for this task");
	validateStoryboard(
		JSON.stringify(draft.plan),
		JSON.stringify(assetMetadata(editor)),
	);
	const current = structuredClone(draft);
	try {
		signal.throwIfAborted();
		await prepareStoryboardTimeline({ editor, draft: current, kind });
		onUpdate?.(structuredClone(current));
		for (let index = 0; index < current.plan.shots.length; index++) {
			signal.throwIfAborted();
			assertContext({ editor, draft: current });
			const shot = current.plan.shots[index];
			if (shotId && shot.id !== shotId) continue;
			if (
				shot.mediaId &&
				editor.media
					.getAssets()
					.some((asset) => asset.id === shot.mediaId && asset.type === kind)
			) {
				applyStoryboard({ editor, draft: current, kind });
				onUpdate?.(structuredClone(current));
				continue;
			}
			try {
				shot.error = undefined;
				saveDirectorDraft(current);
				onUpdate?.(structuredClone(current));
				const maxSeconds = getVideoShotLimit(loadSettings(), model);
				if (kind === "video" && (!maxSeconds || shot.duration > maxSeconds))
					throw new Error(
						"Configure model duration and split the storyboard first",
					);
				await loadTasks();
    let library = await listGeneratedAssets();
				const previous = library.find((asset) => asset.id === shot.assetId);
				if (kind === "video" && previous?.blob.type.startsWith("image/")) {
					shot.firstFrameAssetId ??= previous.id;
				}
				let asset = previous?.blob.type.startsWith(`${kind}/`)
					? previous
					: undefined;
				if (!asset) {
					let prompt = `${shot.prompt}\nShared visual memory: ${JSON.stringify(current.plan.visualMemory)}\nCamera: ${shot.camera}\nMotion: ${shot.motion}\nContinuity: ${shot.continuity}\nTarget shot length: ${shot.duration} seconds. Do not add captions or production notes unless explicitly requested.`;
					const shotStatus = (value: string) =>
						status(`${index + 1}/${current.plan.shots.length} · ${value}`);
					const job =
						kind === "video"
							? pendingJobs().find(
									(job) =>
										job.projectId === current.projectId &&
										job.input.directorSceneId === current.sceneId &&
										job.input.directorShotId === shot.id,
								)
							: undefined;
					let referenceImages: string[] | undefined;
					let continuityFrame: string | undefined;
					if (
						kind === "video" &&
						!job &&
						current.plan.shots[index - 1]?.continueToNext
					) {
						if (model.startsWith("google/gemini-omni"))
							throw new Error(
								"This model route does not support last-frame references",
							);
						shotStatus("Extracting previous shot's last frame…");
						continuityFrame = await previousShotReference({
							editor,
							shots: current.plan.shots,
							index,
							library,
							signal,
						});
						assertContext({ editor, draft: current });
						prompt +=
							"\nUse the attached last frame of the previous shot as the exact opening frame. Preserve character identity, camera position, lighting and composition before continuing the action.";
					}
					if (
						kind === "video" &&
						!job &&
						!model.startsWith("google/gemini-omni")
					) {
						const frame = library.find(
							(asset) => asset.id === shot.firstFrameAssetId,
						);
						if (frame) referenceImages = [await blobDataUrl(frame.blob)];
					}
					const characters = (current.plan.characters ?? []).filter((card) =>
						shot.characterIds?.includes(card.id),
					);
					if (characters.length && !continuityFrame) {
						if (kind === "video" && model.startsWith("google/gemini-omni"))
							throw new Error(
								"This model route does not support character reference images",
							);
						const refs = await Promise.all(
							characters.map(async (card) => {
								const cardAsset = library.find(
									(asset) => asset.id === card.assetId,
								);
								if (!cardAsset)
									throw new Error("Generate all bound character cards first");
								return blobDataUrl(cardAsset.blob);
							}),
						);
						if (kind === "image") {
							if (
								!model.startsWith("google/") &&
								!referenceModel?.startsWith("google/")
							)
								throw new Error(
									"Choose a Gemini image model for character scene frames",
								);
							referenceImages = refs;
						} else if (!job) {
							if (!referenceModel?.startsWith("google/"))
								throw new Error(
									"Choose a Gemini image model for character scene frames",
								);
							let frame = library.find(
								(asset) => asset.id === shot.firstFrameAssetId,
							);
							if (!frame) {
								const id = await generate({
									editor,
									input: {
										kind: "image",
										model: referenceModel,
										ratio: current.ratio,
										prompt: `${prompt}\nUse the attached character turnaround cards only to preserve the identity of ${characters.map((c) => c.name).join(", ")}. Produce ONE full scene first frame, never a triptych or a character sheet.`,
										referenceImages: refs,
									},
									signal,
									status: shotStatus,
								});
								if (typeof id !== "string")
									throw new Error("No generated media returned");
								shot.firstFrameAssetId = id;
								saveDirectorDraft(current);
								onUpdate?.(structuredClone(current));
								library = await listGeneratedAssets();
								frame = library.find((asset) => asset.id === id);
							}
							if (!frame) throw new Error("Generated scene frame is missing");
							referenceImages = [await blobDataUrl(frame.blob)];
						}
					}
					if (continuityFrame) referenceImages = [continuityFrame];
					signal.throwIfAborted();
					const assetId = job
						? await resumeVideo({ editor, job, signal, status: shotStatus })
						: await generate({
								editor,
								input: {
									kind,
									model:
										kind === "image" &&
										characters.length &&
										!model.startsWith("google/")
											? referenceModel!
											: model,
									ratio: current.ratio,
									prompt,
									duration:
										kind === "video" ? Math.ceil(shot.duration) : undefined,
									referenceImages,
									directorShotId: shot.id,
									directorSceneId: current.sceneId,
								},
								signal,
								status: shotStatus,
							});
					if (typeof assetId !== "string")
						throw new Error("No generated media returned");
					shot.assetId = assetId;
					saveDirectorDraft(current);
					onUpdate?.(structuredClone(current));
					library = await listGeneratedAssets();
					asset = library.find((asset) => asset.id === assetId);
				}
				if (!asset)
					throw new Error("Generated asset is missing from the local library");
				assertContext({ editor, draft: current });
				const imported = editor.media
					.getAssets()
					.find((media) => media.name === asset.name);
				shot.mediaId =
					imported?.id ?? (await importGenerated({ editor, asset }));
				// Sync each completed shot before waiting for the next generation.
				applyStoryboard({ editor, draft: current, kind });
				saveDirectorDraft(current);
				onUpdate?.(structuredClone(current));
			} catch (error) {
				if (signal.aborted) throw error;
				shot.error = error instanceof Error ? error.message : String(error);
				saveDirectorDraft(current);
				onUpdate?.(structuredClone(current));
			}
		}
	} finally {
		if (
			editor.project.getActive().metadata.id === current.projectId &&
			editor.scenes.getActiveScene().id === current.sceneId &&
			current.plan.shots.some((shot) =>
				editor.media
					.getAssets()
					.some((asset) => asset.id === shot.mediaId && asset.type === kind),
			)
		) {
			applyStoryboard({ editor, draft: current, kind });
			onUpdate?.(structuredClone(current));
		}
	}

	if (
		current.plan.shots.some(
			(shot) => (!shotId || shot.id === shotId) && shot.error,
		)
	)
		throw new Error(
			"Some shots failed. Retry failed shots; completed assets are retained.",
		);
	return current;
}
export function applyStoryboard({
	editor,
	draft,
	kind,
}: {
	editor: EditorCore;
	draft: DirectorDraft;
	kind?: "image" | "video";
}) {
	assertContext({ editor, draft });
	const tracks = editor.scenes.getActiveScene().tracks;
	const allTracks = [tracks.main, ...tracks.overlay, ...tracks.audio];
	let newTrack: AddTrackCommand | undefined;
	if (
		!draft.timeline ||
		!allTracks.some((track) => track.id === draft.timeline!.trackId)
	) {
		const end = Math.max(
			0,
			...allTracks.flatMap((track) =>
				track.elements.map((element) =>
					mediaTimeToSeconds({
						time: roundMediaTime({
							time: element.startTime + element.duration,
						}),
					}),
				),
			),
		);
		// Commands prune empty tracks after execution. Create the track and
		// its first clip together so the track survives that cleanup.
		newTrack = new AddTrackCommand({ type: "video" });
		draft.timeline = {
			trackId: newTrack.getTrackId(),
			startSeconds: draft.timeline?.startSeconds ?? end,
			elements: {},
		};
		saveDirectorDraft(draft);
	}
	let start = draft.timeline.startSeconds;
	for (const shot of draft.plan.shots) {
		const position = start;
		start += shot.duration;
		const media = editor.media.getAssets();
		const generated = media.find(
			(asset) => asset.id === shot.mediaId && (!kind || asset.type === kind),
		);
		const asset =
			generated ?? media.find((asset) => asset.id === draft.placeholderMediaId);
		if (!asset) continue;
		const placeholder = !generated;
		const current = editor.scenes.getActiveScene().tracks;
		const track = [current.main, ...current.overlay].find(
			(track) => track.id === draft.timeline!.trackId,
		);
		if (!track && !newTrack)
			throw new Error("Storyboard timeline track was removed");
		const existing = track?.elements.find(
			(element) => element.id === draft.timeline!.elements[shot.id],
		);
		if (existing && "mediaId" in existing && existing.mediaId === asset.id) {
			if (shot.error === "Storyboard timeline track was removed") {
				delete shot.error;
				saveDirectorDraft(draft);
			}
			continue;
		}
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: placeholder
				? `${getLocale() === "zh" ? "待生成" : "Pending"} · ${shot.title}`
				: asset.name,
			duration: mediaTimeFromSeconds({
				seconds:
					asset.type === "video"
						? Math.min(shot.duration, asset.duration ?? shot.duration)
						: shot.duration,
			}),
			startTime: mediaTimeFromSeconds({ seconds: position }),
		});
		if (!placeholder && shot.transition && shot.transition !== "cut") {
			const channels: {
				path: string;
				keys: { time: number; value: number }[];
			}[] = JSON.parse(
				build_transition(
					JSON.stringify({
						mode: shot.transition,
						edge: "both",
						duration: Math.min(shot.duration, asset.duration ?? shot.duration),
						length: Math.min(
							0.5,
							Math.min(shot.duration, asset.duration ?? shot.duration) / 2,
						),
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
		if (existing) {
			editor.timeline.updateElements({
				updates: [
					{
						trackId: draft.timeline.trackId,
						elementId: existing.id,
						patch: {
							...element,
							id: existing.id,
							animations: element.animations,
						},
					},
				],
			});
			continue;
		}
		const trackId = draft.timeline.trackId;
		const previous = new Set(
			track?.elements.map((element) => element.id) ?? [],
		);
		if (newTrack) {
			editor.command.execute({
				command: new BatchCommand([
					newTrack,
					new InsertElementCommand({
						element,
						placement: { mode: "explicit", trackId },
					}),
				]),
			});
			newTrack = undefined;
		} else {
			editor.timeline.insertElement({
				element,
				placement: { mode: "explicit", trackId },
			});
		}
		const updated = editor.scenes.getActiveScene().tracks;
		const inserted = [updated.main, ...updated.overlay]
			.find((item) => item.id === trackId)
			?.elements.find((item) => !previous.has(item.id));
		if (!inserted)
			throw new Error(
				"Timeline insertion failed; generated media is retained in the asset library",
			);
		draft.timeline.elements[shot.id] = inserted.id;
		if (shot.error === "Storyboard timeline track was removed")
			delete shot.error;
		saveDirectorDraft(draft);
	}
}

export function splitStoryboardForModel({
	draft,
	model,
}: {
	draft: DirectorDraft;
	model: string;
}): DirectorDraft {
	const max = getVideoShotLimit(loadSettings(), model);
	if (!max)
		throw new Error("Configure model duration and split the storyboard first");
	if (draft.plan.shots.some((shot) => shot.mediaId || shot.assetId))
		throw new Error(
			"Split before generating shots to preserve completed assets",
		);
	const next = {
		...draft,
		plan: JSON.parse(fitStoryboardToDuration(JSON.stringify(draft.plan), max)),
	};
	saveDirectorDraft(next);
	return next;
}
function blobDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}
export async function generateCharacterCard({
	editor,
	draft,
	characterId,
	model,
	signal,
	status,
}: {
	editor: EditorCore;
	draft: DirectorDraft;
	characterId: string;
	model: string;
	signal: AbortSignal;
	status: (value: string) => void;
}) {
	assertContext({ editor, draft });
	const next = structuredClone(draft),
		card = next.plan.characters?.find((card) => card.id === characterId);
	if (!card) throw new Error("Unknown character ID");
	const id = await generate({
		editor,
		input: {
			kind: "image",
			model,
			ratio: "3:2",
			size: "1536x1024",
			prompt: `Create a production character turnaround card for ${card.name}. Script character specification: ${card.description}. Visual direction: ${JSON.stringify(draft.plan.visualMemory)}. Exactly three full body views of the SAME character: front, side and back, aligned at the same scale with consistent face, hair, proportions, clothing and accessories. Neutral plain background, soft even lighting, no captions, no text, no additional characters.`,
		},
		signal,
		status,
	});
	if (typeof id !== "string") throw new Error("No generated media returned");
	assertContext({ editor, draft });
	card.assetId = id;
	for (const shot of next.plan.shots) {
		if (!shot.mediaId && shot.characterIds?.includes(card.id))
			shot.firstFrameAssetId = undefined;
	}
	saveDirectorDraft(next);
	return next;
}
