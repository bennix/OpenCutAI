import type { ParamValues } from "@/params";
import type { SceneTracks, TimelineTrack, TimelineElement } from "@/timeline/types";

export function trackStylePreview(element: TimelineElement, changes: ParamValues): Partial<TimelineElement> {
 // Preview overlays replace params, so preserve each clip's content and other styles.
 const animations = element.animations ? Object.fromEntries(Object.entries(element.animations).filter(([path]) => !(path in changes))) : undefined;
 return { params: { ...element.params, ...changes }, ...(element.animations ? { animations } : {}) };
}

export function getTimelineRows(tracks: SceneTracks): TimelineTrack[] {
 const main = tracks.main.removedFromTimeline && tracks.main.elements.length === 0 ? [] : [tracks.main];
 return [...tracks.overlay, ...main, ...tracks.audio];
}
