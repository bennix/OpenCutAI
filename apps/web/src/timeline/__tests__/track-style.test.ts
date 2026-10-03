import { expect, test } from "bun:test";
import { trackStylePreview } from "../track-style";
import type { TimelineElement } from "../types";

test("track preview keeps individual content, layout and unrelated animation", () => {
 const element = { id: "one", type: "text", startTime: 123, duration: 456, params: { content: "字幕", color: "#fff", fontFamily: "Arial", "transform.positionX": 20 }, animations: { color: { keys: [] }, "transform.positionX": { keys: [] } } } as unknown as TimelineElement;
 const patch = trackStylePreview(element, { color: "#ffff00", "shadow.offsetX": 3 });
 expect(patch.params).toEqual({ ...element.params, color: "#ffff00", "shadow.offsetX": 3 });
 expect(patch.animations?.color).toBeUndefined();
 expect(patch.animations?.["transform.positionX"]).toEqual(element.animations?.["transform.positionX"]);
 expect(element.params.color).toBe("#fff");
 expect(element.animations?.color).toBeDefined();
 expect(patch.startTime).toBeUndefined();
 expect(patch.duration).toBeUndefined();
});

test("image style changes preserve the source and all other image attributes", () => {
 const element = { type: "image", mediaId: "image-source", params: { opacity: 1, "transform.scaleX": 1, "transform.positionX": 50 } } as unknown as TimelineElement;
 const patch = trackStylePreview(element, { "transform.scaleX": 2 });
 expect({ ...element, ...patch }).toEqual({ ...element, params: { ...element.params, "transform.scaleX": 2 } });
});
