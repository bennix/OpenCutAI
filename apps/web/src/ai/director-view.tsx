"use client";
import { useEffect, useRef, useState } from "react";
import { UiText, useTranslation } from "@/i18n";
import { useEditor } from "@/editor/use-editor";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { TRANSITION_PRESETS } from "@/transitions/presets";
import { getDefaultModel, getVideoShotLimit } from "./settings";
import { useAiSettings } from "./use-settings";
import {
	planStoryboard,
	generateStoryboardAssets,
	prepareStoryboardTimeline,
	loadDirectorDraft,
	saveDirectorDraft,
	splitStoryboardForModel,
	generateCharacterCard,
	type DirectorDraft,
	type DirectorShot,
} from "./director";
import { listGeneratedAssets } from "./library";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";

export function DirectorView() {
	const t = useTranslation();
	const editor = useEditor();
	const settings = useAiSettings();
	const { models } = settings;
	const projectId = useEditor((e) => e.project.getActive().metadata.id);
	const sceneId = useEditor((e) => e.scenes.getActiveScene().id);
	const [brief, setBrief] = useState("");
	const [preset, setPreset] = useState("auto");
	const [ratio, setRatio] = useState("16:9");
	const [shotCount, setShotCount] = useState(6);
	const [plannerModel, setPlannerModel] = useState("");
	const [mediaModel, setMediaModel] = useState("");
	const [referenceModel, setReferenceModel] = useState("");
	const [kind, setKind] = useState<"image" | "video">("video");
	const [draft, setDraft] = useState<DirectorDraft | null>(null);
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState("");
	const [error, setError] = useState("");
	const controller = useRef<AbortController | null>(null);
	const selectedPlanner =
		models.find((model) => model.id === plannerModel && model.kind === "edit")
			?.id ??
		models.find((model) => model.kind === "edit")?.id ??
		"";
	const selectedMedia =
		models.find((model) => model.id === mediaModel && model.kind === kind)
			?.id ?? getDefaultModel({ settings, kind });
	const selectedReference =
		models.find(
			(model) =>
				model.id === referenceModel &&
				model.kind === "image" &&
				model.id.startsWith("google/"),
		)?.id ??
		models.find(
			(model) =>
				model.id === getDefaultModel({ settings, kind: "image" }) &&
				model.kind === "image" &&
				model.id.startsWith("google/"),
		)?.id ??
		models.find(
			(model) => model.kind === "image" && model.id.startsWith("google/"),
		)?.id ??
		"";
	const shotReady = (shot: DirectorShot) =>
		editor.media
			.getAssets()
			.some((asset) => asset.id === shot.mediaId && asset.type === kind);
	const maxShotSeconds = getVideoShotLimit(settings, selectedMedia);
	useEffect(() => {
		const refresh = () => {
			try {
				setDraft(loadDirectorDraft({ projectId, sceneId }));
			} catch {
				setError("Could not read the saved storyboard");
			}
		};
		refresh();
		window.addEventListener("opencut-director-change", refresh);
		return () => {
			controller.current?.abort();
			window.removeEventListener("opencut-director-change", refresh);
		};
	}, [projectId, sceneId]);
	const updateShot = ({
		index,
		patch,
	}: {
		index: number;
		patch: Partial<DirectorShot>;
	}) => {
		if (!draft) return;
		const next = {
			...draft,
			plan: {
				...draft.plan,
				shots: draft.plan.shots.map((shot, i) =>
					i === index ? { ...shot, ...patch } : shot,
				),
			},
		};
		setDraft(next);
		saveDirectorDraft(next);
	};
	const updateDraft = (next: DirectorDraft) => {
		setDraft(next);
		saveDirectorDraft(next);
	};
	const newShot = () => ({
		id: crypto.randomUUID(),
		title: t("New shot"),
		duration: maxShotSeconds ?? 5,
		prompt: brief || t("Describe the shot"),
		camera: "",
		motion: "",
		continuity: t("Preserve scene and character continuity"),
		transition: "cut",
		characterIds: [],
	});
	const run = async (action: (signal: AbortSignal) => Promise<void>) => {
		setBusy(true);
		setError("");
		controller.current = new AbortController();
		try {
			await action(controller.current.signal);
			setStatus("Completed");
		} catch (error) {
			setError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
			controller.current = null;
		}
	};
	const selectClass = "w-full rounded border bg-background p-2";
	return (
		<PanelView
			title="Storyboard director"
			actions={
				<Button
					variant="ghost"
					size="sm"
					onClick={() => useAssetsPanelStore.getState().openAiSettings()}
				>
					<UiText text="AI settings" />
				</Button>
			}
		>
			<div className="space-y-3 pb-4 text-sm">
				<p className="text-xs text-muted-foreground">
					<UiText text="Editorial Vision Studio · Style lock → storyboard → generated assets → timeline" />
				</p>
				<label className="block" htmlFor="director-brief">
					<UiText text="Director brief" />
					<Textarea
						id="director-brief"
						value={brief}
						onChange={(event) => setBrief(event.target.value)}
						placeholder={t(
							"Describe the story, characters, audience and desired look…",
						)}
						disabled={busy}
					/>
				</label>
				<label className="block">
					<UiText text="Visual preset" />
					<select
						className={selectClass}
						value={preset}
						disabled={busy}
						onChange={(event) => {
							setPreset(event.target.value);
							if (event.target.value === "papercraft-diorama-postcard")
								setRatio("1:1");
						}}
					>
						<option value="auto">{t("AI art direction")}</option>
						<option value="ivory-postcard">{t("Ivory postcard")}</option>
						<option value="vintage-travel-poster">
							{t("Vintage travel poster")}
						</option>
						<option value="papercraft-diorama-postcard">
							{t("Papercraft diorama postcard")}
						</option>
					</select>
				</label>
				<div className="grid grid-cols-2 gap-2">
					<label>
						<UiText text="Aspect ratio" />
						<select
							className={selectClass}
							disabled={busy || preset === "papercraft-diorama-postcard"}
							value={ratio}
							onChange={(event) => setRatio(event.target.value)}
						>
							{["16:9", "9:16", "1:1", "4:3", "3:4"].map((ratio) => (
								<option key={ratio}>{ratio}</option>
							))}
						</select>
					</label>
					<label htmlFor="director-shot-count">
						<UiText text="Shot count" />
						<Input
							id="director-shot-count"
							type="number"
							min={1}
							max={12}
							value={shotCount}
							disabled={busy}
							onChange={(event) =>
								setShotCount(
									Math.max(1, Math.min(12, Number(event.target.value) || 1)),
								)
							}
						/>
					</label>
				</div>
				<label className="block">
					<UiText text="Planning model" />
					<select
						className={selectClass}
						disabled={busy}
						value={selectedPlanner}
						onChange={(event) => setPlannerModel(event.target.value)}
					>
						{models
							.filter((model) => model.kind === "edit")
							.map((model) => (
								<option key={model.id}>{model.id}</option>
							))}
					</select>
				</label>
				<label className="block">
					<UiText text="Generate as" />
					<select
						className={selectClass}
						disabled={busy}
						value={kind}
						onChange={(event) => {
							if (
								event.target.value === "image" ||
								event.target.value === "video"
							)
								setKind(event.target.value);
						}}
					>
						<option value="image">{t("Images")}</option>
						<option value="video">{t("Videos")}</option>
					</select>
				</label>
				<label className="block">
					<UiText text="Generation model" />
					<select
						className={selectClass}
						disabled={busy}
						value={selectedMedia}
						onChange={(event) => setMediaModel(event.target.value)}
					>
						{models
							.filter((model) => model.kind === kind)
							.map((model) => (
								<option key={model.id}>{model.id}</option>
							))}
					</select>
				</label>
				{kind === "video" && (
					<p className="text-xs text-muted-foreground">
						{t("Model max shot seconds")}:{" "}
						{maxShotSeconds ?? t("Set in AI settings")}.{" "}
						{t(
							"Set the provider-supported duration; unlisted limits are not assumed.",
						)}
					</p>
				)}
				<label className="block">
					<UiText text="Character & scene image model" />
					<select
						className={selectClass}
						value={selectedReference}
						disabled={busy}
						onChange={(event) => setReferenceModel(event.target.value)}
					>
						{models
							.filter(
								(model) =>
									model.kind === "image" && model.id.startsWith("google/"),
							)
							.map((model) => (
								<option key={model.id}>{model.id}</option>
							))}
					</select>
				</label>
				<Button
					variant="outline"
					className="w-full"
					disabled={busy}
					onClick={() =>
						updateDraft({
							projectId,
							sceneId,
							ratio,
							plan: {
								title: t("Manual storyboard"),
								visualMemory: {
									ground: t("Consistent scene"),
									renderMode: preset,
									palette: ["natural"],
									characters: "",
									atmosphere: brief,
								},
								characters: [],
								shots: [newShot()],
							},
						})
					}
				>
					<UiText text="Create manual storyboard" />
				</Button>
				<Button
					className="w-full"
					disabled={
						busy ||
						!brief.trim() ||
						!selectedPlanner ||
						(kind === "video" && !maxShotSeconds)
					}
					onClick={() =>
						void run(async (signal) => {
							setStatus("Planning storyboard…");
							setDraft(
								await planStoryboard({
									editor,
									model: selectedPlanner,
									brief,
									preset,
									ratio,
									shotCount,
									maxShotSeconds: kind === "video" ? maxShotSeconds : undefined,
									videoModel: kind === "video" ? selectedMedia : undefined,
									outputKind: kind,
									signal,
								}),
							);
						})
					}
				>
					<UiText text="Generate storyboard · ZenMux usage charges" />
				</Button>
				{draft && (
					<>
						<h3 className="font-medium">{draft.plan.title}</h3>
						<h4>
							<UiText text="Character cards · up to 3" />
						</h4>
						<p className="text-xs text-muted-foreground">
							<UiText text="Create three-view cards first, then bind characters to shots. Scene frames use the cards as image references. Review identity before generating video." />
						</p>
						{(draft.plan.characters ?? []).map((card, index) => (
							<div key={card.id} className="border rounded p-2 space-y-2">
								<Input
									aria-label={t("Character name")}
									value={card.name}
									disabled={busy}
									onChange={(event) =>
										updateDraft({
											...draft,
											plan: {
												...draft.plan,
												characters: draft.plan.characters?.map((c, i) =>
													i === index ? { ...c, name: event.target.value } : c,
												),
											},
										})
									}
								/>
								<Textarea
									aria-label={t("Character specification")}
									value={card.description}
									disabled={busy}
									onChange={(event) =>
										updateDraft({
											...draft,
											plan: {
												...draft.plan,
												characters: draft.plan.characters?.map((c, i) =>
													i === index
														? { ...c, description: event.target.value }
														: c,
												),
											},
										})
									}
								/>
								{card.assetId && <LibraryImage assetId={card.assetId} />}
								<Button
									variant="outline"
									disabled={
										busy || !card.description.trim() || !selectedReference
									}
									onClick={() =>
										void run(async (signal) =>
											setDraft(
												await generateCharacterCard({
													editor,
													draft,
													characterId: card.id,
													model: selectedReference,
													signal,
													status: setStatus,
												}),
											),
										)
									}
								>
									<UiText
										text={
											card.assetId
												? "Regenerate character card · charges"
												: "Generate three-view card · charges"
										}
									/>
								</Button>
								<Button
									variant="ghost"
									disabled={busy}
									onClick={() =>
										updateDraft({
											...draft,
											plan: {
												...draft.plan,
												characters: draft.plan.characters?.filter(
													(c) => c.id !== card.id,
												),
												shots: draft.plan.shots.map((shot) => ({
													...shot,
													characterIds: shot.characterIds?.filter(
														(id) => id !== card.id,
													),
												})),
											},
										})
									}
								>
									<UiText text="Delete character" />
								</Button>
							</div>
						))}
						<Button
							variant="outline"
							disabled={busy || (draft.plan.characters?.length ?? 0) >= 3}
							onClick={() =>
								updateDraft({
									...draft,
									plan: {
										...draft.plan,
										characters: [
											...(draft.plan.characters ?? []),
											{
												id: crypto.randomUUID(),
												name: t("New character"),
												description: "",
											},
										],
									},
								})
							}
						>
							<UiText text="Add character" />
						</Button>
						{kind === "video" && (
							<Button
								variant="outline"
								disabled={busy || !maxShotSeconds}
								onClick={() => {
									try {
										setDraft(
											splitStoryboardForModel({ draft, model: selectedMedia }),
										);
									} catch (error) {
										setError(
											error instanceof Error ? error.message : String(error),
										);
									}
								}}
							>
								<UiText text="Split shots for selected model" />
							</Button>
						)}
						<Button
							variant="outline"
							disabled={busy || draft.plan.shots.length >= 100}
							onClick={() =>
								updateDraft({
									...draft,
									plan: {
										...draft.plan,
										shots: [...draft.plan.shots, newShot()],
									},
								})
							}
						>
							<UiText text="Add shot" />
						</Button>
						<details>
							<summary>
								<UiText text="Shared visual memory" />
							</summary>
							<p className="break-words mt-2 text-xs">
								{draft.plan.visualMemory.ground} ·{" "}
								{draft.plan.visualMemory.renderMode}
								<br />
								{draft.plan.visualMemory.palette.join(" / ")}
								<br />
								{draft.plan.visualMemory.characters}
								<br />
								{draft.plan.visualMemory.atmosphere}
							</p>
						</details>
						{kind === "image" &&
							!selectedMedia.startsWith("google/") &&
							draft.plan.shots.some((shot) => shot.characterIds?.length) && (
								<p className="text-xs text-muted-foreground">
									{t(
										"Shots with bound characters use the character image model",
									)}
									:{" "}
									{selectedReference ||
										t("Choose a Gemini image model for character scene frames")}
								</p>
							)}
						{draft.plan.shots.map((shot, index) => (
							<details
								key={shot.id}
								className="rounded border p-2"
								open={index === 0 || !!shot.error}
							>
								<summary>
									{index + 1}. {shot.title} · {shot.duration}s ·{" "}
									{shotReady(shot)
										? t("Ready")
										: shot.error
											? t("Generation failed")
											: t("Pending")}
								</summary>
								<div className="space-y-2 mt-2">
									{kind === "video" && index < draft.plan.shots.length - 1 && (
										<label className="flex items-start gap-2">
											<input
												type="checkbox"
												disabled={busy}
												checked={shot.continueToNext ?? false}
												onChange={(event) =>
													updateShot({
														index,
														patch: { continueToNext: event.target.checked },
													})
												}
											/>
											<span>
												<UiText text="Use this shot's last frame as the next shot's opening reference" />
												<span className="block text-xs text-muted-foreground">
													<UiText text="Applies when generating the next shot. Disable to generate it independently; existing videos are retained." />
												</span>
											</span>
										</label>
									)}
									{(draft.plan.characters ?? []).length > 0 && (
										<fieldset>
											<legend>
												<UiText text="Bound characters" />
											</legend>
											{draft.plan.characters?.map((card) => (
												<label key={card.id} className="flex gap-2">
													<input
														type="checkbox"
														disabled={
															busy || !!shot.mediaId || !!shot.firstFrameAssetId
														}
														checked={
															shot.characterIds?.includes(card.id) ?? false
														}
														onChange={(event) =>
															updateShot({
																index,
																patch: {
																	characterIds: event.target.checked
																		? [...(shot.characterIds ?? []), card.id]
																		: shot.characterIds?.filter(
																				(id) => id !== card.id,
																			),
																},
															})
														}
													/>
													{card.name}
												</label>
											))}
										</fieldset>
									)}
									{shot.firstFrameAssetId && (
										<LibraryImage assetId={shot.firstFrameAssetId} />
									)}
									{shot.error && (
										<p role="alert" className="text-destructive">
											{t(shot.error)}
										</p>
									)}
									<label htmlFor={`director-prompt-${shot.id}`}>
										<UiText text="Shot prompt" />
										<Textarea
											id={`director-prompt-${shot.id}`}
											value={shot.prompt}
											disabled={busy}
											onChange={(event) =>
												updateShot({
													index,
													patch: { prompt: event.target.value },
												})
											}
										/>
									</label>
									<label htmlFor={`director-duration-${shot.id}`}>
										<UiText text="Duration (seconds)" />
										<Input
											id={`director-duration-${shot.id}`}
											type="number"
											min={1}
											max={30}
											value={shot.duration}
											disabled={busy}
											onChange={(event) =>
												updateShot({
													index,
													patch: {
														duration: Math.max(
															1,
															Math.min(30, Number(event.target.value) || 1),
														),
													},
												})
											}
										/>
									</label>
									<p className="text-xs">
										{shot.camera} · {shot.motion}
										<br />
										{shot.continuity}
									</p>
									<label>
										<UiText text="Reuse project asset" />
										<select
											className={selectClass}
											value={shot.mediaId ?? ""}
											disabled={busy}
											onChange={(event) =>
												updateShot({
													index,
													patch: {
														mediaId: event.target.value || undefined,
														assetId: undefined,
													},
												})
											}
										>
											<option value="">{t("Generate new media")}</option>
											{editor.media
												.getAssets()
												.filter(
													(asset) =>
														asset.type === "image" || asset.type === "video",
												)
												.map((asset) => (
													<option key={asset.id} value={asset.id}>
														{asset.name}
													</option>
												))}
										</select>
									</label>
									<label>
										<UiText text="Transition" />
										<select
											className={selectClass}
											value={shot.transition}
											disabled={busy}
											onChange={(event) =>
												updateShot({
													index,
													patch: { transition: event.target.value },
												})
											}
										>
											{[
												["cut", "Cut"],
												...TRANSITION_PRESETS.filter(
													([id]) => !id.startsWith("dip-"),
												),
											].map(([id, label]) => (
												<option key={id} value={id}>
													{t(label)}
												</option>
											))}
										</select>
									</label>
									<Button
										variant="outline"
										className="w-full"
										disabled={busy || !selectedMedia || shotReady(shot)}
										onClick={() =>
											void run(async (signal) => {
												setDraft(
													await generateStoryboardAssets({
														editor,
														draft,
														kind,
														model: selectedMedia,
														signal,
														status: setStatus,
														onUpdate: setDraft,
														shotId: shot.id,
														referenceModel: selectedReference,
													}),
												);
											})
										}
									>
										<UiText
											text={
												shot.error
													? "Retry this shot · charges"
													: "Generate this shot · ZenMux usage charges"
											}
										/>
									</Button>
								</div>
							</details>
						))}
						<Button
							className="w-full"
							disabled={
								busy || !selectedMedia || draft.plan.shots.every(shotReady)
							}
							onClick={() =>
								void run(async (signal) => {
									setDraft(
										await generateStoryboardAssets({
											editor,
											draft,
											kind,
											model: selectedMedia,
											signal,
											status: setStatus,
											onUpdate: setDraft,
											referenceModel: selectedReference,
										}),
									);
								})
							}
						>
							<UiText text="Generate sequentially / retry missing shots · charges" />
						</Button>
						<Button
							className="w-full"
							variant="outline"
							disabled={busy || draft.plan.shots.length === 0}
							onClick={() => {
								void run(async () => {
									await prepareStoryboardTimeline({ editor, draft, kind });
									setDraft(structuredClone(draft));
									setStatus("Storyboard appended. Undo restores the timeline.");
								});
							}}
						>
							<UiText text="Place / sync storyboard on timeline" />
						</Button>
						<p className="text-xs text-muted-foreground">
							<UiText text="Shots are placed as placeholders before generation. Completed media replaces the same clip; failed shots keep their placeholders for retry." />
						</p>
					</>
				)}
				{busy && (
					<Button variant="outline" onClick={() => controller.current?.abort()}>
						<UiText text="Stop" />
					</Button>
				)}
				{status && <p role="status">{t(status)}</p>}
				{error && (
					<p role="alert" className="text-destructive break-words">
						{t(error)}
					</p>
				)}
				<a
					className="text-xs text-primary underline"
					href="https://github.com/Yu-0312/editorial-vision-studio"
					target="_blank"
					rel="noreferrer"
				>
					Editorial Vision Studio · MIT
				</a>
			</div>
		</PanelView>
	);
}

function LibraryImage({ assetId }: { assetId: string }) {
	const [url, setUrl] = useState("");
	useEffect(() => {
		let active = true,
			objectUrl = "";
		void listGeneratedAssets().then((assets) => {
			const asset = assets.find((asset) => asset.id === assetId);
			if (active && asset) {
				objectUrl = URL.createObjectURL(asset.blob);
				setUrl(objectUrl);
			}
		});
		return () => {
			active = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [assetId]);
	// Local Blob URLs cannot be optimized by the Next image server.
	// eslint-disable-next-line @next/next/no-img-element
	return url ? <img src={url} alt="" className="w-full rounded" /> : null;
}
