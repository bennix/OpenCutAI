import type {
	TranscriptionModel,
	TranscriptionModelId,
} from "./types";

export const TRANSCRIPTION_MODELS: TranscriptionModel[] = [
	{
		id: "whisper-tiny",
		name: "Tiny",
		huggingFaceId: "onnx-community/whisper-tiny",
		description: "Fastest, lower accuracy",
		downloadSize: "96 MB",
	},
	{ id: "whisper-base", name: "Base", huggingFaceId: "onnx-community/whisper-base", description: "Fast, improved accuracy over Tiny", downloadSize: "143 MB" },
	{
		id: "whisper-small",
		name: "Small",
		huggingFaceId: "onnx-community/whisper-small",
		description: "Good balance of speed and accuracy",
		downloadSize: "300 MB",
	},
	{
		id: "whisper-medium",
		name: "Medium",
		huggingFaceId: "Xenova/whisper-medium",
		description: "Higher accuracy, slower",
		downloadSize: "777 MB", dtype: "q8",
	},
	{
		id: "whisper-large-v3-turbo",
		name: "Large v3 Turbo",
		huggingFaceId: "onnx-community/whisper-large-v3-turbo",
		description: "Best accuracy, requires WebGPU for good performance",
		downloadSize: "760 MB",
	},
	{ id: "whisper-large-v3", name: "Large v3", huggingFaceId: "Xenova/whisper-large-v3", description: "Highest accuracy, high memory usage", downloadSize: "1.56 GB", dtype: "q8" },
];

export const DEFAULT_TRANSCRIPTION_MODEL: TranscriptionModelId =
	"whisper-base";
