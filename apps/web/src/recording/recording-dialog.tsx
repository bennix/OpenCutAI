"use client";
import { listSpools, readSpool, removeSpool, type SpoolEntry } from "./spool";
import { createPortal } from "react-dom";
import { getLocale } from "@/i18n/locale";
import { readRecordingShortcuts, matchesRecordingShortcut } from "./shortcuts";
import {
	BatchCommand,
	AddTrackCommand,
	InsertElementCommand,
} from "@/commands";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import {
	startCapture,
	type CaptureRegion,
	type CaptureSession,
} from "./capture";
const full: CaptureRegion = { x: 0, y: 0, width: 1, height: 1 };
export function RecordingDialog() {
	const t = useTranslation(),
		editor = useEditor();
	const isDesktop = useSyncExternalStore(
		() => () => {},
		() => !!window.opencutDesktop,
		() => false,
	);
	const [open, setOpen] = useState(false),
		[mode, setMode] = useState("screen");
	const [sources, setSources] = useState<
		{ id: string; name: string; thumbnail: string; kind: "screen" | "window" }[]
	>([]);
	const [sourceId, setSourceId] = useState(""),
		[region, setRegion] = useState(full);
	const [mic, setMic] = useState(false),
		[system, setSystem] = useState(true),
		[focus, setFocus] = useState(false);
	const [state, setState] = useState<
		"idle" | "starting" | "recording" | "paused" | "saving"
	>("idle");
	const [error, setError] = useState("");
	const [health, setHealth] = useState("");
	const [recoveries, setRecoveries] = useState<SpoolEntry[]>([]);
	useEffect(() => {
		void listSpools()
			.then(setRecoveries)
			.catch(() => {});
	}, []);
	async function recover(entry: SpoolEntry) {
		setState("saving");
		try {
			const targetProject = editor.project.getActive().metadata.id,
				targetScene = editor.scenes.getActiveScene().id,
				targetTime = editor.playback.getCurrentTime();
			const file = await readSpool(entry.id),
				assets = await processMediaAssets({ files: [file] });
			if (
				editor.project.getActive().metadata.id !== targetProject ||
				editor.scenes.getActiveScene().id !== targetScene
			)
				throw new Error("项目或场景已切换，恢复文件保留，请在目标项目重试");
			if (assets.length !== 1)
				throw new Error("恢复文件无法解码，文件仍保留，可下载备份");
			const saved = await editor.media.addMediaAsset({
				projectId: targetProject,
				asset: assets[0],
			});
			if (!saved) throw new Error("恢复素材保存失败");
			if (!Number.isFinite(saved.duration) || !(saved.duration! > 0))
				throw new Error("恢复素材时长无效，原文件保留，可下载备份");
			if (
				editor.project.getActive().metadata.id !== targetProject ||
				editor.scenes.getActiveScene().id !== targetScene
			)
				throw new Error("项目或场景已切换，恢复文件保留");
			const track = new AddTrackCommand({
				type: saved.type === "audio" ? "audio" : "video",
			});
			const element = buildElementFromMedia({
				mediaId: saved.id,
				mediaType: saved.type,
				name: saved.name,
				duration: mediaTimeFromSeconds({ seconds: saved.duration ?? 0 }),
				startTime: targetTime,
			});
			editor.command.execute({
				command: new BatchCommand([
					track,
					new InsertElementCommand({
						element,
						placement: { mode: "explicit", trackId: track.getTrackId() },
					}),
				]),
			});
			await editor.save.flush();
			await removeSpool(entry.id);
			setRecoveries(await listSpools());
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setState("idle");
		}
	}
	async function backupRecovery(entry: SpoolEntry) {
		const targetProject = editor.project.getActive().metadata.id,
			targetScene = editor.scenes.getActiveScene().id,
			targetTime = editor.playback.getCurrentTime();
		const file = await readSpool(entry.id),
			url = URL.createObjectURL(file),
			a = document.createElement("a");
		a.href = url;
		a.download = file.name;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 60000);
	}

	const [availability, setAvailability] = useState<
		"checking" | "ready" | "permission" | "restart" | "error"
	>("checking");
	const checkingSources = useRef(false);
	const knownSources = useRef(false);
	const session = useRef<CaptureSession | null>(null),
		stopping = useRef(false);
	const dragStart = useRef<{ x: number; y: number } | null>(null);
	const context = useRef<{
		projectId: string;
		sceneId: string;
		start: number;
	} | null>(null);
	const choices = sources.filter(
		(source) => source.kind === (mode === "mirror" ? "window" : "screen"),
	);
	const selected =
		choices.find((source) => source.id === sourceId) ?? choices[0];
	const busy = state !== "idle";
	useEffect(
		() => () => {
			void session.current?.stop();
		},
		[],
	);
	function pause() {
		if (!session.current || stopping.current) return;
		const paused = state !== "paused";
		if (state !== "recording" && state !== "paused") return;
		session.current.pause(paused);
		window.opencutDesktop?.setRecordingPaused?.(paused);
		setState(paused ? "paused" : "recording");
	}
	const actions = useRef({ pause, stop });
	actions.current = { pause, stop };
	useEffect(() => {
		const desktop = window.opencutDesktop;
		if (desktop?.onRecordingAction)
			return desktop.onRecordingAction((action) => {
				if (action === "pause") actions.current.pause();
				else void actions.current.stop();
			});
		const handle = (event: KeyboardEvent) => {
			if (!session.current || event.repeat) return;
			const keys = readRecordingShortcuts();
			if (matchesRecordingShortcut(event, keys.pause)) {
				event.preventDefault();
				event.stopPropagation();
				actions.current.pause();
			} else if (matchesRecordingShortcut(event, keys.stop)) {
				event.preventDefault();
				event.stopPropagation();
				void actions.current.stop();
			}
		};
		window.addEventListener("keydown", handle, true);
		return () => window.removeEventListener("keydown", handle, true);
	}, []);
	async function checkAvailability(refresh = false) {
		const desktop = window.opencutDesktop;
		if (!desktop || checkingSources.current) return;
		checkingSources.current = true;
		if (refresh) {
			setAvailability("checking");
			setError("");
		}
		try {
			const permission = await desktop.recordingPermissionStatus?.();
			if (
				permission === "restricted" ||
				(permission === "not-determined" && !refresh)
			) {
				knownSources.current = false;
				setSources([]);
				setAvailability("permission");
				setError("");
				return;
			}
			if (!refresh && knownSources.current) {
				setAvailability("ready");
				return;
			}
			const available = await desktop.recordingSources();
			const confirmed = await desktop.recordingPermissionStatus?.();
			if (confirmed && confirmed !== "granted" && confirmed !== "unknown") {
				setSources([]);
				knownSources.current = false;
				setAvailability("permission");
				setError("");
				return;
			}
			setSources(available);
			knownSources.current = available.length > 0;
			setAvailability(available.length ? "ready" : "restart");
			setError("");
		} catch (error) {
			knownSources.current = false;
			setSources([]);
			const permission = await desktop
				.recordingPermissionStatus?.()
				.catch(() => "unknown");
			if (
				permission === "denied" ||
				permission === "restricted" ||
				permission === "not-determined"
			) {
				setAvailability("permission");
				setError("");
			} else {
				setAvailability(permission === "granted" ? "restart" : "error");
				setError(
					"Unable to list recording sources. Refresh or restart the app.",
				);
			}
		} finally {
			checkingSources.current = false;
		}
	}
	const checkAvailabilityRef = useRef(checkAvailability);
	checkAvailabilityRef.current = checkAvailability;
	useEffect(() => {
		if (!open || !isDesktop || state !== "idle") return;
		const check = () => {
			void checkAvailabilityRef.current();
		};
		check();
		window.addEventListener("focus", check);
		const timer = setInterval(check, 2000);
		return () => {
			window.removeEventListener("focus", check);
			clearInterval(timer);
		};
	}, [open, isDesktop, state]);
	async function show() {
		setOpen(true);
		setError("");
		await checkAvailability(true);
		void listSpools()
			.then(setRecoveries)
			.catch(() => {});
	}
	async function stop() {
		if (!session.current || stopping.current) return;
		stopping.current = true;
		setState("saving");
		setOpen(true);
		try {
			const files = await session.current.stop();
			session.current = null;
			const target = context.current!;
			const processed = await processMediaAssets({
				files: files.map((entry) => entry.file),
			});
			if (processed.length !== files.length)
				throw new Error("Some recording files could not be imported");
			for (const asset of processed) {
				const saved = await editor.media.addMediaAsset({
					projectId: target.projectId,
					asset,
				});
				if (!saved) throw new Error("Recording could not be saved");
				if (!files.find((entry) => entry.file.name === saved.name)?.primary)
					continue;
				if (
					editor.project.getActive().metadata.id !== target.projectId ||
					editor.scenes.getActiveScene().id !== target.sceneId
				)
					continue;
				const element = buildElementFromMedia({
					mediaId: saved.id,
					mediaType: saved.type,
					name: saved.name,
					duration: mediaTimeFromSeconds({ seconds: saved.duration ?? 0 }),
					startTime: mediaTimeFromSeconds({ seconds: target.start }),
				});
				const track = new AddTrackCommand({
					type: saved.type === "audio" ? "audio" : "video",
				});
				editor.command.execute({
					command: new BatchCommand([
						track,
						new InsertElementCommand({
							element,
							placement: { mode: "explicit", trackId: track.getTrackId() },
						}),
					]),
				});
			}
			await editor.save.flush();
			for (const entry of files)
				if (entry.recoveryId) await removeSpool(entry.recoveryId);
			setRecoveries(await listSpools());
			setOpen(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setError(
				message.includes("Screen recording permission is required")
					? "Screen recording permission is required. Enable OpenCut AI in macOS Privacy & Security, then restart the app."
					: message,
			);
		} finally {
			session.current = null;
			stopping.current = false;
			void listSpools()
				.then(setRecoveries)
				.catch(() => {});
			setState("idle");
		}
	}
	async function start() {
		setError("");
		setState("starting");
		try {
			context.current = {
				projectId: editor.project.getActive().metadata.id,
				sceneId: editor.scenes.getActiveScene().id,
				start: mediaTimeToSeconds({ time: editor.playback.getCurrentTime() }),
			};
			session.current = await startCapture({
				sourceId: selected?.id,
				systemAudio: system,
				microphone: mic,
				smartFocus: focus && mode !== "mirror" && !!window.opencutDesktop,
				region: mode === "region" ? region : full,
				onHealth: (message, fatal) => {
					setHealth(message);
					window.opencutDesktop?.setRecordingHealth?.(message);
					if (fatal) {
						setError(message);
						setOpen(true);
						queueMicrotask(() => {
							void actions.current.stop();
						});
					}
				},
				onEnded: () => {
					void stop();
				},
			});
			setState("recording");
			try {
				if (
					window.opencutDesktop &&
					!window.opencutDesktop.beginRecordingControls
				)
					throw new Error(
						"Restart the desktop app to enable mini recording controls",
					);
				await window.opencutDesktop?.beginRecordingControls({
					...readRecordingShortcuts(),
					language: getLocale(),
				});
				setOpen(false);
			} catch (controlsError) {
				const message =
					controlsError instanceof Error
						? controlsError.message
						: String(controlsError);
				setError(
					message.includes("Recording shortcut is unavailable")
						? "Recording shortcut is unavailable. Change it in Settings."
						: message,
				);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setError(
				message.includes("Screen recording permission is required")
					? "Screen recording permission is required. Enable OpenCut AI in macOS Privacy & Security, then restart the app."
					: message,
			);
			setState("idle");
		}
	}
	return (
		<>
			<Button
				variant="outline"
				size="sm"
				disabled={busy}
				onClick={() => void show()}
			>
				{t("Screen recording")}
			</Button>
			{!isDesktop &&
				(state === "recording" || state === "paused") &&
				createPortal(
					<div
						id="recording-mini"
						className="fixed bottom-4 right-4 z-[9999] flex gap-2 rounded-xl border bg-background p-3 shadow-xl"
					>
						<style>{`body > :not(#recording-mini) { visibility: hidden; } #recording-mini { visibility: visible; }`}</style>
						<Button variant="outline" onClick={pause}>
							{t(state === "paused" ? "Resume recording" : "Pause recording")}
						</Button>
						<Button onClick={() => void stop()}>{t("Stop recording")}</Button>
					</div>,
					document.body,
				)}
			<Dialog
				open={open}
				onOpenChange={(value) => {
					if (!busy) setOpen(value);
				}}
			>
				<DialogContent
					className="max-w-2xl max-h-[90vh] overflow-y-auto"
					aria-describedby={undefined}
				>
					<DialogHeader>
						<DialogTitle>{t("Screen recording")}</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 p-6">
						{isDesktop && (
							<div
								role="status"
								aria-live="polite"
								className={`rounded border p-3 text-sm ${availability === "ready" ? "border-green-500 text-green-600" : "border-amber-500 text-amber-700"}`}
							>
								{t(
									availability === "checking"
										? "Checking recording availability…"
										: availability === "ready"
											? "Ready to record · screen permission is enabled"
											: availability === "permission"
												? "Screen recording is unavailable in this process. If OpenCut AI is already enabled in System Settings, fully quit and restart the app. Otherwise enable permission first."
												: availability === "restart"
													? "Permission enabled, but no capture source is available. Restart the app to activate it."
													: "Recording unavailable · source check failed",
								)}
							</div>
						)}
						<label className="block">
							{t("Recording source")}
							<select
								className="w-full rounded border bg-background p-2"
								disabled={busy}
								value={mode}
								onChange={(event) => {
									setMode(event.target.value);
									setSourceId("");
									setRegion(full);
								}}
							>
								<option value="screen">{t("Entire screen")}</option>
								<option value="region" disabled={!isDesktop}>
									{t("Selected region")}
								</option>
								{isDesktop && (
									<option value="mirror">
										{t("Window / Apple mirroring")}
									</option>
								)}
							</select>
						</label>
						{isDesktop && (
							<label className="block">
								{t("Display or window")}
								<select
									className="w-full rounded border bg-background p-2"
									disabled={busy}
									value={selected?.id ?? ""}
									onChange={(event) => {
										setSourceId(event.target.value);
										setRegion(full);
									}}
								>
									{choices.map((source) => (
										<option key={source.id} value={source.id}>
											{source.name}
										</option>
									))}
								</select>
							</label>
						)}
						{mode === "mirror" && (
							<p className="text-xs text-muted-foreground">
								{t(
									"Start iPhone Mirroring or AirPlay on macOS, then select its window. Smart Focus is available for screen and region capture.",
								)}
							</p>
						)}
						{mode === "region" && selected && (
							<>
								<p className="text-sm">
									{t("Drag on the preview to select a recording region")}
								</p>
								<div
									className="relative touch-none overflow-hidden"
									onPointerDown={(event) => {
										if (busy) return;
										event.currentTarget.setPointerCapture(event.pointerId);
										const rect = event.currentTarget.getBoundingClientRect();
										dragStart.current = {
											x: (event.clientX - rect.left) / rect.width,
											y: (event.clientY - rect.top) / rect.height,
										};
									}}
									onPointerMove={(event) => {
										if (!dragStart.current || busy) return;
										const rect = event.currentTarget.getBoundingClientRect();
										const x = Math.max(
												0,
												Math.min(1, (event.clientX - rect.left) / rect.width),
											),
											y = Math.max(
												0,
												Math.min(1, (event.clientY - rect.top) / rect.height),
											);
										setRegion({
											x: Math.min(x, dragStart.current.x),
											y: Math.min(y, dragStart.current.y),
											width: Math.abs(x - dragStart.current.x),
											height: Math.abs(y - dragStart.current.y),
										});
									}}
									onPointerUp={() => {
										dragStart.current = null;
									}}
									onPointerCancel={() => {
										dragStart.current = null;
									}}
								>
									{/* Local desktop capture thumbnail. */}
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src={selected.thumbnail}
										alt={t("Recording region preview")}
										className="pointer-events-none w-full"
									/>
									<div
										className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/15"
										style={{
											left: `${region.x * 100}%`,
											top: `${region.y * 100}%`,
											width: `${region.width * 100}%`,
											height: `${region.height * 100}%`,
										}}
									/>
								</div>
							</>
						)}
						{!isDesktop && (
							<p>
								{t(
									"The browser picker controls the source. Region capture and cursor focus require the desktop app.",
								)}
							</p>
						)}
						{[
							{ checked: mic, setChecked: setMic, label: "Microphone" },
							{ checked: system, setChecked: setSystem, label: "System sound" },
							{ checked: focus, setChecked: setFocus, label: "Smart Focus" },
						].map(({ checked, setChecked, label }) => (
							<label className="flex gap-2" key={label}>
								<input
									type="checkbox"
									checked={checked}
									disabled={
										busy ||
										(label === "Smart Focus" &&
											(mode === "mirror" || !isDesktop))
									}
									onChange={(event) => setChecked(event.target.checked)}
								/>
								{t(label)}
							</label>
						))}
						<p className="text-xs text-muted-foreground">
							{t(
								"After stopping, recordings enter the asset library and timeline. Microphone and system sound remain separate editable tracks. Smart Focus also preserves the original capture.",
							)}
						</p>
						{isDesktop && !sources.length && (
							<div className="flex gap-2">
								<Button
									variant="outline"
									onClick={() =>
										void window.opencutDesktop?.openRecordingPermissions()
									}
								>
									{t("Open screen recording permissions")}
								</Button>
								<Button variant="outline" onClick={() => void show()}>
									{t("Refresh capture sources")}
								</Button>
								<Button
									variant="outline"
									onClick={() => void window.opencutDesktop?.restartApp()}
								>
									{t("Restart OpenCut AI")}
								</Button>
							</div>
						)}
						{health && (
							<p role="status" className="text-amber-500 text-sm">
								{health}
							</p>
						)}
						{!busy && recoveries.length > 0 && (
							<section className="border rounded p-3 space-y-2">
								<h3>可恢复的录屏</h3>
								<p className="text-xs text-muted-foreground">
									录屏中断或导入失败的数据保留在本机；恢复后可继续编辑。
								</p>
								{recoveries.map((entry) => (
									<div
										key={entry.id}
										className="flex flex-wrap gap-2 items-center text-xs"
									>
										<span>
											{entry.name} · {(entry.bytes / 1048576).toFixed(1)} MB
										</span>
										<Button size="sm" onClick={() => void recover(entry)}>
											恢复到当前项目
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => void backupRecovery(entry)}
										>
											下载备份
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												if (
													window.confirm(
														"删除这份录屏恢复文件？请先备份，此操作不可撤销。",
													)
												)
													void removeSpool(entry.id)
														.then(() => listSpools())
														.then(setRecoveries);
											}}
										>
											删除恢复文件
										</Button>
									</div>
								))}
							</section>
						)}
						{error && (
							<p role="alert" className="text-destructive">
								{t(error)}
							</p>
						)}
						<div className="flex gap-2">
							{state === "idle" ? (
								<Button
									disabled={
										(!!isDesktop && (availability !== "ready" || !selected)) ||
										(mode === "region" &&
											(region.width < 0.05 || region.height < 0.05))
									}
									onClick={() => void start()}
								>
									{t("Start recording")}
								</Button>
							) : (
								<>
									<Button
										disabled={state !== "recording" && state !== "paused"}
										onClick={pause}
									>
										{t(
											state === "paused"
												? "Resume recording"
												: "Pause recording",
										)}
									</Button>
									<Button
										disabled={state === "starting" || state === "saving"}
										onClick={() => void stop()}
									>
										{t(
											state === "saving"
												? "Saving recording…"
												: "Stop recording",
										)}
									</Button>
								</>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
