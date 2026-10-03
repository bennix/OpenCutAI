import { expect, mock, test } from "bun:test";
import { getTimelineRows } from "@/timeline/track-style";
import type { SceneTracks } from "@/timeline/types";
mock.module("@/wasm", () => ({
 TICKS_PER_SECOND: 1000, ZERO_MEDIA_TIME: 0,
 mediaTime: ({ ticks }: { ticks: number }) => ticks,
 roundMediaTime: ({ time }: { time: number }) => Math.round(time),
 mediaTimeFromSeconds: ({ seconds }: { seconds: number }) => seconds * 1000,
 mediaTimeToSeconds: ({ time }: { time: number }) => time / 1000,
 addMediaTime: ({ a, b }: { a: number; b: number }) => a + b,
 subMediaTime: ({ a, b }: { a: number; b: number }) => a - b,
 maxMediaTime: ({ a, b }: { a: number; b: number }) => Math.max(a, b),
 minMediaTime: ({ a, b }: { a: number; b: number }) => Math.min(a, b),
 clampMediaTime: ({ time }: { time: number }) => time,
 roundFrameTime: ({ time }: { time: number }) => time,
 roundFrameTicks: ({ time }: { time: number }) => time,
 snapSeekMediaTime: ({ time }: { time: number }) => time,
 lastFrameMediaTime: ({ time }: { time: number }) => time,
 parseMediaTimecode: () => 0,
}));
let tracks: SceneTracks;
mock.module("@/core", () => ({ EditorCore: { getInstance: () => ({
 scenes: { getActiveScene: () => ({ tracks }) },
 timeline: { updateTracks: (value: SceneTracks) => { tracks = value; } },
}) } }));
const { RemoveTrackCommand } = await import("../remove-track");
for (const id of ["main", "video", "subtitles", "system", "microphone"]) {
 test(`delete, undo and redo ${id} track preserve all other media`, () => {
  tracks = {
   main: { id: "main", type: "video", elements: [{ id: "main-clip" }] },
   overlay: [{ id: "video", type: "video", elements: [{ id: "clip" }] }, { id: "subtitles", type: "text", elements: [{ id: "caption", params: { content: "字幕" } }] }],
   audio: [{ id: "system", type: "audio", elements: [{ id: "system-clip" }] }, { id: "microphone", type: "audio", elements: [{ id: "mic-clip" }] }],
  } as unknown as SceneTracks;
  const before = structuredClone(tracks);
  const command = new RemoveTrackCommand(id);
  command.execute();
  const after = structuredClone(tracks);
  expect(getTimelineRows(tracks).some(track => track.id === id)).toBe(false);
  if (id === "main") expect(tracks.main.elements).toEqual([]);
  else expect([...tracks.overlay, ...tracks.audio].some(track => track.id === id)).toBe(false);
  command.undo();
  expect(tracks).toEqual(before);
  expect(getTimelineRows(tracks).some(track => track.id === id)).toBe(true);
  command.redo();
  expect(tracks).toEqual(after);
  command.undo();
  expect(tracks).toEqual(before);
 });
}

test("subtitle track style edits preserve content/timing and undo together", async () => {
 const { UpdateElementsCommand } = await import("../../element/update-elements");
 tracks = {
  main: { id: "main", type: "video", elements: [] }, audio: [],
  overlay: [{ id: "captions", type: "text", elements: [
   { id: "one", type: "text", startTime: 0, duration: 1000, params: { content: "第一句", fontFamily: "Arial", color: "#ffffff", "transform.positionY": 100 } },
   { id: "two", type: "text", startTime: 1000, duration: 2000, params: { content: "第二句", fontFamily: "Arial", color: "#ffffff", "transform.positionY": 200 } },
  ] }],
 } as unknown as SceneTracks;
 const before = structuredClone(tracks);
 const command = new UpdateElementsCommand({ updates: tracks.overlay[0].elements.map(element => ({
  trackId: "captions", elementId: element.id, patch: { params: { fontFamily: "PingFang SC", color: "#ffff00", "shadow.enabled": true, "shadow.offsetX": -3 } },
 })) });
 command.execute();
 expect(tracks.overlay[0].elements.map(element => element.params.content)).toEqual(["第一句", "第二句"]);
 expect(tracks.overlay[0].elements.map(element => Number(element.startTime))).toEqual([0, 1000]);
 expect(tracks.overlay[0].elements.map(element => element.params["transform.positionY"])).toEqual([100, 200]);
 expect(tracks.overlay[0].elements.every(element => element.params.fontFamily === "PingFang SC")).toBe(true);
 const after = structuredClone(tracks);
 command.undo(); expect(tracks).toEqual(before);
 command.redo(); expect(tracks).toEqual(after);
});

test("inserting into a deleted main container restores its row", () => {
 const tracks = { overlay: [], audio: [], main: { id: "main", type: "video", removedFromTimeline: true, elements: [] } } as unknown as SceneTracks;
 expect(getTimelineRows(tracks)).toEqual([]);
 tracks.main.elements.push({ id: "new-clip" } as SceneTracks["main"]["elements"][number]);
 expect(getTimelineRows(tracks).map(track => track.id)).toEqual(["main"]);
});
