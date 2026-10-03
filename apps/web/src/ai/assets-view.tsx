"use client";
import { getDefaultModel } from "./settings";
import { UiText, useTranslation } from "@/i18n";

import { useAiSettings } from "./use-settings";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { isAiKind, type AiKind } from "./settings";
import {
	generate,
	applyEditPlan,
	importGenerated,
	resumeVideo,
	pendingJobs,
	type EditPlan,
	type VideoJob,
} from "./editor-adapter";
import {
	listGeneratedAssets,
	deleteGeneratedAsset,
	type GeneratedAsset,
} from "./library";
import { toast } from "sonner";
function AssetPreview({ asset }: { asset: GeneratedAsset }) {
	const mediaRef = useRef<HTMLVideoElement & HTMLImageElement>(null);
	useEffect(() => {
		const node = mediaRef.current;
		if (!node) return;
		const url = URL.createObjectURL(asset.blob);
		node.src = url;
		return () => {
			node.removeAttribute("src");
			URL.revokeObjectURL(url);
		};
	}, [asset.blob]);
	return asset.blob.type.startsWith("video/") ? (
		<video
			ref={mediaRef}
			controls
			muted
			className="w-full max-h-40 object-contain"
		/>
	) : (
		// Blob previews are local and cannot use the Next.js image optimizer.
		// eslint-disable-next-line @next/next/no-img-element
		<img
			ref={mediaRef}
			alt={asset.prompt}
			className="w-full max-h-40 object-contain"
		/>
	);
}
export function AiAssetsView() {
	const t = useTranslation();
	const editor = useEditor();
	const settings = useAiSettings();
	const { models } = settings;
	const [kind, setKind] = useState<AiKind>("edit");
	const [model, setModel] = useState("");
	const [includePreviews, setIncludePreviews] = useState(true);
	const [prompt, setPrompt] = useState("");
	const [ratio, setRatio] = useState("");
	const [size, setSize] = useState("");
	const [duration, setDuration] = useState("");
	const [resolution, setResolution] = useState("");
	const [status, setStatus] = useState("");
	const [busy, setBusy] = useState(false);
	const [plan, setPlan] = useState<{
		value: EditPlan;
		projectId: string;
		sceneId: string;
	} | null>(null);
	const [library, setLibrary] = useState<GeneratedAsset[]>([]);
	const [jobs, setJobs] = useState<VideoJob[]>([]);
	const abort = useRef<AbortController | null>(null);
	const refresh = async () => {
		setLibrary(
			(await listGeneratedAssets()).sort((a, b) => b.created - a.created),
		);
		setJobs(pendingJobs());
	};
	useEffect(() => {
		void listGeneratedAssets().then((assets) => {
			setLibrary(assets.sort((a, b) => b.created - a.created));
			setJobs(pendingJobs());
		});
		return () => {
			abort.current?.abort();
		};
	}, []);
	const choices = models.filter((m) => m.kind === kind);
	const chosen = choices.some((m) => m.id === model)
		? model
		: getDefaultModel({ settings, kind });
	async function run(job?: VideoJob) {
		const controller = new AbortController();
		abort.current = controller;
		setBusy(true);
		setPlan(null);
		const projectId = editor.project.getActive().metadata.id,
			sceneId = editor.scenes.getActiveScene().id;
		try {
			const result = job
				? await resumeVideo({
						editor,
						job,
						signal: controller.signal,
						status: setStatus,
					})
				: await generate({
						editor,
						input: {
							kind,
							includePreviews,
							model: chosen,
							prompt,
							ratio,
							size,
							duration: duration ? Number(duration) : undefined,
							resolution,
						},
						signal: controller.signal,
						status: setStatus,
					});
			if (typeof result !== "string") {
				setPlan({ value: result, projectId, sceneId });
				setStatus(t("剪辑方案已生成，请预览后应用"));
			} else {
				if (
					editor.project.getActive().metadata.id === projectId &&
					editor.scenes.getActiveScene().id === sceneId
				) {
					const generated = (await listGeneratedAssets()).find(
						(asset) => asset.id === result,
					);
					const media = editor.media
						.getAssets()
						.find((asset) => asset.name === generated?.name);
					if (media)
						applyEditPlan({
							editor,
							plan: {
								summary: media.name,
								clips: [
									{
										mediaId: media.id,
										in: 0,
										duration:
											media.type === "image" ? 5 : (media.duration ?? 5),
									},
								],
							},
						});
				}
				setStatus(t("素材已保存，可在任何项目复用"));
				toast.success(t("素材生成完成"));
			}
		} catch (e) {
			setStatus(
				controller.signal.aborted
					? t("已停止等待；已提交的视频任务仍可继续查询")
					: e instanceof Error
						? e.message
						: t("操作失败"),
			);
		} finally {
			setBusy(false);
			abort.current = null;
			await refresh();
		}
	}
	const omni = chosen.startsWith("google/gemini-omni");
	return (
		<PanelView
			title={t("AI 剪辑与素材")}
			actions={
				<Button
					variant="ghost"
					size="sm"
					onClick={() => useAssetsPanelStore.getState().openAiSettings()}
				>
					<UiText text="设置" />
				</Button>
			}
		>
			<div className="space-y-3 pb-4 text-sm">
				<label className="block">
					<UiText text="任务" />
					<select
						className="bg-background border rounded w-full p-2"
						value={kind}
						disabled={busy}
						onChange={(e) => {
							if (isAiKind(e.target.value)) setKind(e.target.value);
							setPlan(null);
							setRatio("");
							setSize("");
							setDuration("");
							setResolution("");
						}}
					>
						<option value="edit">
							<UiText text="AI 剪辑方案" />
						</option>
						<option value="image">
							<UiText text="生成图片" />
						</option>
						<option value="video">
							<UiText text="生成视频" />
						</option>
					</select>
				</label>
				<label className="block">
					<UiText text="模型" />
					<select
						className="bg-background border rounded w-full p-2"
						value={chosen}
						disabled={busy}
						onChange={(e) => {
							setModel(e.target.value);
							setRatio("");
							setSize("");
							setDuration("");
							setResolution("");
						}}
					>
						{choices.map((m) => (
							<option key={m.id} value={m.id}>
								{m.id}
							</option>
						))}
					</select>
				</label>
				<label htmlFor="ai-prompt" className="block">
					<UiText text={kind === "edit" ? t("剪辑要求") : t("素材描述")} />
					<Textarea
						id="ai-prompt"
						value={prompt}
						disabled={busy}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder={
							kind === "edit"
								? t("将素材按故事顺序剪成 30 秒短片…")
								: t("描述主体、场景、动作、光线与镜头…")
						}
					/>
				</label>
				{kind === "edit" ? (
					<div className="space-y-2">
						<label className="flex gap-2">
							<input
								type="checkbox"
								checked={includePreviews}
								onChange={(e) => setIncludePreviews(e.target.checked)}
							/>
							<UiText text="发送最多 12 张素材缩略图到 ZenMux 辅助剪辑" />
						</label>
						<p className="text-xs text-muted-foreground">
							<UiText text="根据名称、时长和可选缩略图排列与裁剪片段，预览后追加到时间线，支持一次撤销。不能分析完整视频或语音内容。" />
						</p>
					</div>
				) : (
					<>
						{kind === "image" && !chosen.startsWith("google/") ? (
							<label htmlFor="ai-size" className="block">
								<UiText text="尺寸（留空使用模型默认值）" />
								<Input
									id="ai-size"
									value={size}
									onChange={(e) => setSize(e.target.value)}
									placeholder={t("例如 1536x1024")}
								/>
							</label>
						) : (
							<label htmlFor="ai-ratio" className="block">
								<UiText text="比例（留空使用模型默认值）" />
								<Input
									id="ai-ratio"
									value={ratio}
									onChange={(e) => setRatio(e.target.value)}
									placeholder={t("例如 16:9、9:16、1:1")}
								/>
							</label>
						)}
						{kind === "video" && (
							<>
								<label htmlFor="ai-duration" className="block">
									<UiText text="时长 / 秒（留空使用默认值）" />
									<Input
										id="ai-duration"
										type="number"
										min={1}
										max={120}
										value={duration}
										onChange={(e) => setDuration(e.target.value)}
									/>
								</label>
								{!omni && (
									<label htmlFor="ai-resolution" className="block">
										<UiText text="分辨率" />
										<Input
											id="ai-resolution"
											value={resolution}
											onChange={(e) => setResolution(e.target.value)}
											placeholder={
												chosen === "minimax/minimax-h3-max"
													? t("480p 或 768p；可留空")
													: t("留空使用默认值")
											}
										/>
									</label>
								)}
							</>
						)}
						<p className="text-xs text-muted-foreground">
							<UiText
								text={
									omni
										? t(
												"Omni 使用 Interactions；比例和时长仅作为提示词偏好，不保证输出一致。",
											)
										: t(
												"各模型支持的比例、尺寸和时长不同；未公布完整范围的参数默认不传，由平台校验。",
											)
								}
							/>{" "}
							<UiText text="生成文件会保存在本地 AI 素材库，复用到项目时按画布比例适配。" />
						</p>
					</>
				)}
				<div className="flex gap-2">
					<Button
						disabled={busy || !prompt.trim() || !chosen}
						onClick={() => void run()}
					>
						<UiText
							text={
								busy
									? t("处理中…")
									: kind === "edit"
										? t("生成剪辑方案")
										: t("生成素材")
							}
						/>
					</Button>
					{busy && (
						<Button variant="outline" onClick={() => abort.current?.abort()}>
							<UiText text="停止等待" />
						</Button>
					)}
				</div>
				{status && (
					<p role="status" className="text-xs break-all">
						<UiText text={status} />
					</p>
				)}
				{plan && (
					<div className="space-y-2 rounded border p-2">
						<p>{plan.value.summary}</p>
						<ol className="list-decimal pl-5">
							{plan.value.clips.map((c, i) => (
								<li key={i}>
									{editor.media.getAssets().find((a) => a.id === c.mediaId)
										?.name ?? c.mediaId}{" "}
									· {c.in}s → {c.in + c.duration}s
								</li>
							))}
						</ol>
						<Button
							onClick={() => {
								try {
									if (
										editor.project.getActive().metadata.id !== plan.projectId ||
										editor.scenes.getActiveScene().id !== plan.sceneId
									)
										throw new Error(t("项目或场景已切换，请重新生成方案"));
									applyEditPlan({ editor, plan: plan.value });
									setPlan(null);
									toast.success(t("已追加到时间线，可撤销"));
								} catch (e) {
									toast.error(e instanceof Error ? e.message : t("应用失败"));
								}
							}}
						>
							<UiText text="应用剪辑方案" />
						</Button>
					</div>
				)}
				{jobs.length > 0 && (
					<div className="space-y-2">
						<h3 className="font-medium">
							<UiText text="待完成视频" />
						</h3>
						{jobs.map((j) => (
							<Button
								key={j.id}
								variant="outline"
								disabled={busy}
								onClick={() => void run(j)}
							>
								<UiText text="继续查询" />
								{j.id.slice(0, 12)}
							</Button>
						))}
					</div>
				)}
				<div className="flex justify-between items-center">
					<h3 className="font-medium">
						<UiText text="本地 AI 素材库" />
					</h3>
					<Button variant="ghost" size="sm" onClick={() => void refresh()}>
						<UiText text="刷新" />
					</Button>
				</div>
				{library.length === 0 && (
					<p className="text-muted-foreground text-xs">
						<UiText text="生成素材后，可跨项目重复使用。清除浏览器站点数据会删除本地素材。" />
					</p>
				)}
				{library.map((asset) => (
					<div key={asset.id} className="border rounded p-2 space-y-2">
						<AssetPreview asset={asset} />
						<p className="truncate" title={asset.prompt}>
							{asset.prompt}
						</p>
						<p className="text-xs text-muted-foreground break-all">
							{asset.model}
						</p>
						<div className="flex gap-2">
							<Button
								size="sm"
								disabled={busy}
								onClick={async () => {
									try {
										await importGenerated({ editor, asset });
										toast.success(t("已加入当前项目素材库"));
									} catch (e) {
										toast.error(e instanceof Error ? e.message : t("导入失败"));
									}
								}}
							>
								<UiText text="复用到项目" />
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={async () => {
									await deleteGeneratedAsset(asset.id);
									await refresh();
								}}
							>
								<UiText text="移出 AI 库" />
							</Button>
						</div>
					</div>
				))}
			</div>
		</PanelView>
	);
}
