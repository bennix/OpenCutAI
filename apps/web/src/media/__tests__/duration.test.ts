import { expect, test } from "bun:test";
import { readMediaDuration, requireMediaDuration } from "../duration";

test("recorded WebM without Duration uses packet timestamps", async () => {
	const file = Bun.file(new URL("./fixtures/recording-no-duration.webm", import.meta.url));
	const duration = await readMediaDuration({ file: new Blob([await file.arrayBuffer()]) });
	expect(Number.isFinite(duration)).toBe(true);
	expect(duration).toBeGreaterThan(0.24);
	expect(duration).toBeLessThan(0.3);
});

test("unknown and invalid durations cannot enter media metadata", () => {
	for (const duration of [Infinity, -Infinity, NaN, 0, -1])
		expect(() => requireMediaDuration(duration)).toThrow("finite media duration");
	expect(requireMediaDuration(1.25)).toBe(1.25);
});
