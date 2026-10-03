import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { SoundEffect } from "../types";
const originalFetch = globalThis.fetch;
const originalAudio = globalThis.AudioContext;
let assets: Array<{ asset: { file: File; duration: number }; projectId: string }> = [];
let inserted: Array<{ element: { mediaId: string; startTime: number; duration: number; params: Record<string, string> }; placement: unknown }> = [];
let closed = 0;
let failSave = false;
mock.module("@/core", () => ({ EditorCore: { getInstance: () => ({
 project: { getActive: () => ({ metadata: { id: "project" } }) },
 scenes: { getActiveScene: () => ({ id: "scene" }) },
 playback: { getCurrentTime: () => 1000 },
 media: { addMediaAsset: async (entry: typeof assets[number]) => { if (failSave) return null; assets.push(entry); return { id: `asset-${assets.length}` }; } },
 timeline: { insertElement: (entry: typeof inserted[number]) => inserted.push(entry) },
}) } }));
mock.module("@/wasm", () => ({ mediaTimeFromSeconds: ({ seconds }: { seconds: number }) => seconds * 1000, addMediaTime: ({ a, b }: { a: number; b: number }) => a + b }));
mock.module("@/timeline/element-utils", () => ({ buildElementFromMedia: (args: unknown) => ({ ...(args as object), params: {} }) }));
const { fetchSoundFile, importSoundFiles } = await import("../transfer");
beforeEach(() => {
 assets = []; inserted = []; closed = 0; failSave = false;
 globalThis.AudioContext = class {
  async decodeAudioData() { return { duration: 2.5 }; }
  async close() { closed++; }
 } as unknown as typeof AudioContext;
});
afterEach(() => { globalThis.fetch = originalFetch; globalThis.AudioContext = originalAudio; });

test("prefers downloadable bytes and preserves an audio filename", async () => {
 let requested = "";
 globalThis.fetch = (async (url: string) => { requested = url; return new Response(new Uint8Array([1,2,3]), { headers: { "content-type": "audio/ogg" } }); }) as typeof fetch;
 const file = await fetchSoundFile({ name: "Bell: ringing", downloadUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Bell.ogg", previewUrl: "https://example.com/preview.mp3" } as SoundEffect);
 expect(requested).toContain(encodeURIComponent("https://upload.wikimedia.org/wikipedia/commons/a/ab/Bell.ogg"));
 expect(file.name).toBe("Bell_ ringing.ogg"); expect(file.size).toBe(3); expect(file.type).toBe("audio/ogg");
});
test("persists the files before insertion and places multiple imports consecutively", async () => {
 const files = [new File(["one"], "one.wav"), new File(["two"], "two.wav")];
 await importSoundFiles(files);
 expect(assets.map(item => item.asset.file)).toEqual(files);
 expect(assets.map(item => item.projectId)).toEqual(["project", "project"]);
 expect(inserted.map(item => item.element.mediaId)).toEqual(["asset-1", "asset-2"]);
 expect(inserted.map(item => item.element.startTime)).toEqual([1000, 3500]);
 expect(closed).toBe(1);
});
test("storage failures do not insert a broken remote clip and still close audio resources", async () => {
 failSave = true;
 await expect(importSoundFiles([new File(["one"], "one.wav")])).rejects.toThrow("Unable to save");
 expect(inserted).toHaveLength(0); expect(closed).toBe(1);
});
