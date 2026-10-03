"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { useEditor } from "@/editor/use-editor";
import { useTranslation } from "@/i18n";
import { getElementParams, readElementParamValue, type ElementParamDefinition } from "@/params/registry";
import type { ParamValues } from "@/params";
import { trackStylePreview } from "@/timeline/track-style";
import type { TimelineTrack } from "@/timeline";

export function TrackPropertiesDialog({ track, onClose }: { track: TimelineTrack; onClose: () => void }) {
 const editor = useEditor();
 const t = useTranslation();
 const [draft, setDraft] = useState<ParamValues>({});
 const pending = useRef<ParamValues>({});
 const first = track.elements[0];
 const params = first ? getElementParams({ element: first }).filter(param => param.key !== "content" && track.elements.every(element => getElementParams({ element }).some(other => other.key === param.key))) : [];
 const values = Object.fromEntries(params.map(param => [param.key, draft[param.key] ?? readElementParamValue({ element: first!, param }) ?? param.default]));
 const audioKeys = ["volume", "muted", "fadeIn", "fadeOut"];
 const groups = [
  { id: "text", label: "Text style", params: params.filter(param => !param.key.startsWith("transform.") && !["opacity", "blendMode", ...audioKeys].includes(param.key)) },
  { id: "visual", label: "Position & appearance", params: params.filter(param => param.key.startsWith("transform.") || ["opacity", "blendMode"].includes(param.key)) },
  { id: "audio", label: "Sound", params: params.filter(param => audioKeys.includes(param.key)) },
 ].filter(group => group.params.length);
 function preview(changes: ParamValues) {
  const next = { ...pending.current, ...changes };
  pending.current = next; setDraft(next);
  editor.timeline.previewElements({ updates: track.elements.map(element => ({ trackId: track.id, elementId: element.id, updates: trackStylePreview(element, next) })) });
 }
 function close() { editor.timeline.discardPreview(); onClose(); }
 function field(param: ElementParamDefinition) {
  if (param.dependencies?.some(dependency => values[dependency.param] !== dependency.equals)) return null;
  const mixed = !(param.key in draft) && track.elements.some(element => !Object.is(readElementParamValue({ element, param }), readElementParamValue({ element: first!, param })));
  return <div key={param.key} className="min-w-0">
   <PropertyParamField param={{ ...param, keyframable: false }} value={values[param.key]} onPreview={value => preview({ [param.key]: value })} onCommit={() => {}} />
   {mixed && <p className="mt-1 text-xs text-muted-foreground">{t("Mixed values · adjusting this property makes it uniform")}</p>}
  </div>;
 }
 return <Dialog open onOpenChange={open => { if (!open) close(); }}>
  <DialogContent className="max-w-2xl overflow-hidden">
   <DialogHeader><DialogTitle>{t("Track properties")} · {t(track.name)}</DialogTitle>
    <DialogDescription>{track.elements.length} {t("clips · preview changes live, then apply together")}</DialogDescription>
   </DialogHeader>
   {groups.length ? <Tabs defaultValue={groups[0].id} className="min-h-0">
    <TabsList className="mx-6 mb-3">{groups.map(group => <TabsTrigger key={group.id} value={group.id}>{t(group.label)}</TabsTrigger>)}</TabsList>
    <div className="max-h-[55vh] overflow-y-auto px-6 pb-5">
     {groups.map(group => <TabsContent key={group.id} value={group.id} className="space-y-5">
      {group.id === "visual" && <div className="flex flex-wrap gap-2">
       <Button variant="outline" size="sm" onClick={() => preview({ "transform.positionX": 0, "transform.positionY": 0 })}>{t("Center on canvas")}</Button>
       <Button variant="outline" size="sm" onClick={() => preview({ "transform.scaleX": 1, "transform.scaleY": 1, "transform.rotate": 0 })}>{t("Reset size & rotation")}</Button>
      </div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{group.params.filter(param => param.key.startsWith("transform.position")).map(field)}</div>
      {group.params.filter(param => !param.key.startsWith("transform.position") && !param.key.startsWith("background.") && param.key !== "blendMode" && !["letterSpacing", "lineHeight", "textDecoration"].includes(param.key)).map(field)}
      {group.params.some(param => param.key.startsWith("background.") || param.key === "blendMode" || ["letterSpacing", "lineHeight", "textDecoration"].includes(param.key)) && <details className="rounded border p-3">
       <summary className="cursor-pointer text-sm font-medium">{t("Advanced options")}</summary>
       <div className="mt-4 space-y-4">{group.params.filter(param => param.key.startsWith("background.") || param.key === "blendMode" || ["letterSpacing", "lineHeight", "textDecoration"].includes(param.key)).map(field)}</div>
      </details>}
     </TabsContent>)}
     {track.elements.some(element => Object.keys(draft).some(key => element.animations?.[key])) && <p className="mt-3 text-xs text-muted-foreground">{t("Keyframes for adjusted properties are replaced by the uniform value; other animations are preserved.")}</p>}
    </div>
   </Tabs> : <p className="px-6 py-4 text-sm text-muted-foreground">{t("This track has no shared editable properties yet.")}</p>}
   <div className="flex items-center justify-between gap-3 border-t p-4">
    <span className="text-xs text-muted-foreground">{t("Apply once · undo with ⌘Z")}</span>
    <div className="flex gap-2"><Button variant="outline" onClick={close}>{t("Cancel")}</Button>
    <Button disabled={!Object.keys(draft).length} onClick={() => { editor.timeline.commitPreview(); onClose(); }}>{t("Apply to track")}</Button></div>
   </div>
  </DialogContent>
 </Dialog>;
}
