import type { EditorCore } from "@/core";
import type { DirectorShot } from "./director";
import type { GeneratedAsset } from "./library";
export async function previousShotReference({
	editor,
	shots,
	index,
	library,
	signal,
}: {
	editor: EditorCore;
	shots: DirectorShot[];
	index: number;
	library: GeneratedAsset[];
	signal: AbortSignal;
}): Promise<string | undefined> {
	const previous = shots[index - 1];
	if (!previous?.continueToNext) return;
	signal.throwIfAborted();
	if (previous.continuationFrameAssetId) {
		const selected = library.find(
			(asset) => asset.id === previous.continuationFrameAssetId,
		);
		if (!selected)
			throw new Error("选定续接参考帧缺失，请重新选择或恢复默认末帧");
		return new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(selected.blob);
		});
	}
	const media = editor.media
		.getAssets()
		.find((asset) => asset.id === previous.mediaId && asset.type === "video");
	const saved = library.find(
		(asset) =>
			asset.id === previous.assetId && asset.blob.type.startsWith("video/"),
	);
	const blob = media?.file ?? saved?.blob;
	if (!blob)
		throw new Error("Generate the previous shot first to use its last frame");
	return extractLastFrame({
		blob,
		duration: previous.duration,
		time: previous.continuationTime,
		signal,
	});
}
export async function extractLastFrame({
	blob,
	duration,
	time,
	signal,
}: {
	blob: Blob;
	duration: number;
	time?: number;
	signal: AbortSignal;
}): Promise<string> {
	const { Input, ALL_FORMATS, BlobSource, VideoSampleSink } =
		await import("mediabunny");
	const input = new Input({
		source: new BlobSource(blob),
		formats: ALL_FORMATS,
	});
	try {
		signal.throwIfAborted();
		const track = await input.getPrimaryVideoTrack();
		if (!track || !(await track.canDecode()))
			throw new Error("Cannot decode the previous shot's last frame");
		const end = Math.min(duration, await input.computeDuration());
		if (!(end > 0)) throw new Error("The previous shot has no video frames");
		const frame = await new VideoSampleSink(track).getSample(
			time === undefined
				? Math.max(0, end - 0.000001)
				: Math.max(0, Math.min(time, end - 0.000001)),
		);
		if (!frame) throw new Error("Cannot decode the previous shot's last frame");
		try {
			signal.throwIfAborted();
			const canvas = document.createElement("canvas");
			const scale = Math.min(
				1,
				1920 / Math.max(track.displayWidth, track.displayHeight),
			);
			canvas.width = Math.max(1, Math.round(track.displayWidth * scale));
			canvas.height = Math.max(1, Math.round(track.displayHeight * scale));
			const context = canvas.getContext("2d");
			if (!context)
				throw new Error("Cannot decode the previous shot's last frame");
			frame.draw(context, 0, 0, canvas.width, canvas.height);
			return canvas.toDataURL("image/png");
		} finally {
			frame.close();
		}
	} finally {
		input.dispose();
	}
}
