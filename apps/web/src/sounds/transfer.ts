import type { SoundEffect } from "./types";
import { EditorCore } from "@/core";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { addMediaTime, mediaTimeFromSeconds } from "@/wasm";

export async function fetchSoundFile(sound: SoundEffect): Promise<File> {
 const url = sound.downloadUrl || sound.previewUrl;
 if (!url) throw new Error("Sound file not available");
 const response = await fetch(`/api/sounds/download?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(65000) });
 if (!response.ok) {
  const data = await response.json().catch(() => null);
  throw new Error(data?.error ?? `Sound download failed (HTTP ${response.status})`);
 }
 const blob = await response.blob();
 if (!blob.size) throw new Error("The sound file is empty");
 const sourceName = decodeURIComponent(new URL(url).pathname.split("/").pop() || "sound.ogg");
 const name = sound.name.replace(/[\\/:*?"<>|]/g, "_");
 const extension = sourceName.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? ".ogg";
 return new File([blob], /\.[a-z0-9]{2,5}$/i.test(name) ? name : `${name}${extension}`, { type: blob.type === "application/octet-stream" ? (sound.type.startsWith("audio/") ? sound.type : "audio/ogg") : blob.type });
}

// Store the audio bytes with the project so reopening and exporting never depends on a remote URL.
export async function importSoundFiles(files: File[], sound?: SoundEffect): Promise<void> {
 const editor = EditorCore.getInstance();
 const project = editor.project.getActive();
 const projectId = project.metadata.id;
 const sceneId = editor.scenes.getActiveScene().id;
 let startTime = editor.playback.getCurrentTime();
 const context = new AudioContext();
 try {
  for (const file of files) {
   const buffer = await context.decodeAudioData(await file.arrayBuffer());
   if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error("The sound file could not be decoded");
   if (editor.project.getActive().metadata.id !== projectId || editor.scenes.getActiveScene().id !== sceneId) throw new Error("The active project changed. Try adding the sound again.");
   const asset = await editor.media.addMediaAsset({ projectId, asset: { name: file.name, type: "audio", file, duration: buffer.duration } });
   if (!asset) throw new Error("Unable to save this sound to the project");
   if (editor.project.getActive().metadata.id !== projectId || editor.scenes.getActiveScene().id !== sceneId) throw new Error("The active project changed. Try adding the sound again.");
   const duration = mediaTimeFromSeconds({ seconds: buffer.duration });
   const element = buildElementFromMedia({ mediaId: asset.id, mediaType: "audio", name: sound?.name ?? file.name, duration, startTime, buffer });
   if (sound) element.params = { ...element.params, "source.url": sound.url, "source.author": sound.username, "source.license": sound.license, "source.licenseUrl": sound.licenseUrl ?? "" };
   editor.timeline.insertElement({ placement: { mode: "auto", trackType: "audio" }, element });
   startTime = addMediaTime({ a: startTime, b: duration });
  }
 } finally { await context.close(); }
}
