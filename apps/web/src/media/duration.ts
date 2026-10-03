import { ALL_FORMATS, BlobSource, Input } from "mediabunny";

export function requireMediaDuration(duration: number): number {
	if (!Number.isFinite(duration) || duration <= 0)
		throw new Error("Could not determine a finite media duration");
	return duration;
}

// MediaRecorder WebM often omits Duration. Demux packets instead of trusting
// HTMLMediaElement.duration, which reports Infinity for these files.
export async function readMediaDuration({ file }: { file: Blob }): Promise<number> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		return requireMediaDuration(await input.computeDuration());
	} finally {
		input.dispose();
	}
}
