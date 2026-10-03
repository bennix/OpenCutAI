import { TRANSCRIPTION_MODELS } from "./models";
import type { TranscriptionModelId } from "./types";

export async function getDownloadedModels(): Promise<TranscriptionModelId[]> {
	if (!("caches" in window)) return [];
	const cache = await caches.open("transformers-cache");
	const keys = (await cache.keys()).map((request) => request.url);
	return TRANSCRIPTION_MODELS.filter((model) =>
		(model.dtype === "q8" ? ["encoder_model_quantized.onnx", "decoder_model_merged_quantized.onnx"] : ["encoder_model_q4.onnx", "decoder_model_merged_q4.onnx"]).every((file) =>
			keys.some((url) => url.includes(`${model.huggingFaceId}/resolve/`) && url.endsWith(`/onnx/${file}`)),
		),
	).map((model) => model.id);
}
