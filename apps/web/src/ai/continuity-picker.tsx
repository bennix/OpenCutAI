"use client";
import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getGeneratedAsset, saveGeneratedAsset } from "./library";
import { extractLastFrame } from "./continuity";
import type { DirectorShot } from "./director";
export function ContinuityPicker({
	shot,
	onChange,
	disabled,
}: {
	shot: DirectorShot;
	onChange: (patch: Partial<DirectorShot>) => void;
	disabled: boolean;
}) {
	const editor = useEditor();
	const [url, setUrl] = useState("");
	const [preview, setPreview] = useState("");
	const blob = useRef<Blob | undefined>(undefined);
	const video = useRef<HTMLVideoElement>(null);
	useEffect(() => {
		let disposed = false,
			objectUrl = "";
		void (async () => {
			const media = editor.media
				.getAssets()
				.find((asset) => asset.id === shot.mediaId);
			const file =
				media?.file ??
				(shot.assetId
					? (await getGeneratedAsset(shot.assetId))?.blob
					: undefined);
			if (disposed || !file) return;
			blob.current = file;
			objectUrl = URL.createObjectURL(file);
			setUrl(objectUrl);
		})();
		return () => {
			disposed = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [shot.assetId, shot.mediaId, editor]);
	if (!shot.continueToNext || !url) return null;
	return (
		<div className="space-y-2 border rounded p-2">
			<p className="text-xs">
				续接参考帧：播放并停在清晰画面，再选用此帧。默认使用最后可见帧。
			</p>
			<video
				ref={video}
				src={url}
				controls
				muted
				className="w-full max-h-48 object-contain"
			/>
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={disabled}
					onClick={async () => {
						if (!blob.current || !video.current) return;
						try {
							const time = video.current.currentTime;
							const frame = await extractLastFrame({
								blob: blob.current,
								duration: shot.duration,
								time,
								signal: new AbortController().signal,
							});
							setPreview(frame);
						} catch (e) {
							toast.error(String(e));
						}
					}}
				>
					预览当前帧
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={disabled}
					onClick={() => {
						onChange({
							continuationFrameAssetId: undefined,
							continuationTime: undefined,
						});
						setPreview("");
					}}
				>
					恢复默认末帧
				</Button>
			</div>
			{preview && (
				<>
					<img
						src={preview}
						alt="将发送的续接参考帧"
						className="w-full max-h-48 object-contain"
					/>
					<Button
						size="sm"
						disabled={disabled}
						onClick={async () => {
							const id = crypto.randomUUID();
							await saveGeneratedAsset({
								id,
								name: `continuity-${shot.id}.png`,
								model: "local-frame",
								prompt: "Selected continuity reference",
								created: Date.now(),
								blob: await (await fetch(preview)).blob(),
							});
							onChange({
								continuationFrameAssetId: id,
								continuationTime: video.current?.currentTime,
							});
							toast.success("已选用此帧作为下一段参考；生成时将上传至服务商");
						}}
					>
						选用此帧
					</Button>
				</>
			)}
			{shot.continuationFrameAssetId && (
				<p className="text-xs">
					已选用自定义参考帧（{shot.continuationTime?.toFixed(2)}{" "}
					秒）。请确认画面中没有需要保密的信息。
				</p>
			)}
		</div>
	);
}
