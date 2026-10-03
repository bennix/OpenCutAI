"use client";
import { useState } from "react";
import { compose_transitions, transition_targets } from "opencut-ai";
import { useTranslation } from "@/i18n";
import { useEditor } from "@/editor/use-editor";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { VISUAL_ELEMENT_TYPES, type ClipTransitions } from "@/timeline";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import type { ElementAnimations } from "@/animation/types";
import { buildDefaultEffectInstance } from "@/effects";
import { generateUUID } from "@/utils/id";
import { TRANSITION_PRESETS } from "./presets";

export function TransitionsView() {
 const t = useTranslation();
 const editor = useEditor();
 const selection = useEditor(e => e.selection.getSelectedElements());
 const tracks = useEditor(e => e.scenes.getActiveScene().tracks);
 const [edge, setEdge] = useState("between");
 const [length, setLength] = useState(0.5);
 const [error, setError] = useState("");
 const [status, setStatus] = useState("");
 const all = [tracks.main, ...tracks.overlay].flatMap(track => track.elements.filter(element => VISUAL_ELEMENT_TYPES.some(type => type === element.type)).map(element => ({track, element})));
 const selected = all.filter(({element}) => selection.some(item => item.elementId === element.id));
 const apply = (mode?: string) => {
  setStatus("");
  try {
   const fps = editor.project.getActive().settings.fps;
   const targets: {id:string;edge:string;neighbor?:string}[] = JSON.parse(transition_targets(JSON.stringify({edge, frame_duration:fps.denominator / fps.numerator, clips: all.map(({element, track}) => ({id:element.id,track:track.id,start:mediaTimeToSeconds({time:element.startTime}),duration:mediaTimeToSeconds({time:element.duration}),selected:selected.some(item => item.element.id === element.id)}))})));
   if (!targets.length) { setError("未应用：同一轨道上没有相邻片段。请将两段靠近至一帧以内，或选择片段结束。"); return; }
   const canvas = editor.project.getActive().settings.canvasSize;
   editor.timeline.updateElements({updates: all.filter(({element}) => targets.some(target => target.id === element.id)).map(({element,track}) => {
    const transitions: ClipTransitions = {...element.transitions, originalAnimations:element.transitions?.originalAnimations ?? element.animations ?? {}, originalEffects:element.transitions?.originalEffects ?? ("effects" in element ? element.effects ?? [] : [])};
    let effects = [...transitions.originalEffects ?? []];
    for (const target of targets.filter(target => target.id === element.id)) {
     const key = target.edge === "in" ? "entrance" : "exit";
     if (!mode) { delete transitions[key]; continue; }
     const effect = mode.startsWith("dip-") ? buildDefaultEffectInstance({effectType:"color-adjustment"}) : undefined;
     transitions[key] = {mode,length,neighbor:target.neighbor,effect_id:effect?.id};
    }
    for (const config of [transitions.entrance, transitions.exit]) if(config?.effect_id) effects.push({...buildDefaultEffectInstance({effectType:"color-adjustment"}), id:config.effect_id});
    const channels: {path:string;keys:{time:number;value:number}[]}[] = JSON.parse(compose_transitions(JSON.stringify({...canvas,params:element.params,duration:mediaTimeToSeconds({time:element.duration}),entrance:transitions.entrance,exit:transitions.exit})));
    const animations: ElementAnimations = {...transitions.originalAnimations};
    for (const channel of channels) animations[channel.path] = {keys:channel.keys.map(key => ({id:generateUUID(),time:mediaTimeFromSeconds({seconds:key.time}),value:key.value,segmentToNext:"linear" as const,tangentMode:"auto" as const}))};
    return {trackId:track.id,elementId:element.id,patch:{animations,transitions:transitions.entrance || transitions.exit ? transitions : undefined,...("effects" in element ? {effects} : {})}};
   })});
   setError("");
   setStatus(mode ? `已应用${t(TRANSITION_PRESETS.find(([id]) => id === mode)?.[1] ?? mode)} · ${length} 秒，轨道上显示紫色转场标记` : "已移除转场，可按 ⌘Z 撤销");
  } catch (error) {setError(error instanceof Error ? error.message : String(error));}
 };
 return <PanelView title="Transitions"><div className="space-y-3 text-sm">
 <div className="sticky top-0 z-20 bg-background py-2 border-b">{error ? <p role="alert" className="text-destructive">{error}</p> : <p role="status" className="text-sm">{status || (selected.length ? "已选择片段，请点击转场样式" : "请先选择视频或图片片段")}</p>}</div>
 <p className="text-muted-foreground">选择片段，再选择转场。片段间转场同时应用到前一段的结尾和后一段的开头，时间线上显示紫色标记。</p>
 <label className="block">转场位置<select className="w-full bg-background border rounded p-2 mt-1" value={edge} onChange={event => setEdge(event.target.value)}><option value="between">片段与片段之间</option><option value="out">片段结束</option><option value="in">片段开始</option></select></label>
 <label className="block">转场时长（秒）<input className="w-full border rounded p-2 mt-1 bg-background" type="number" min={0.1} max={5} step={0.1} value={length} onChange={event => setLength(Math.max(0.1,Math.min(5,Number(event.target.value)||0.5)))} /></label>
 <div className="grid grid-cols-2 gap-2">{TRANSITION_PRESETS.map(([id,label]) => <Button key={id} variant="outline" disabled={!selected.length} onClick={() => apply(id)}>{t(label)}</Button>)}</div>
 <Button className="w-full" variant="outline" disabled={!selected.length} onClick={() => apply()}>移除此位置转场</Button>
 {selected.map(({element}) => <p key={element.id} className="text-muted-foreground">{element.name}：{[element.transitions?.entrance && "片头",element.transitions?.exit && "片尾"].filter(Boolean).join("、") || "尚未设置转场"}</p>)}

 <p className="text-muted-foreground">再次选择样式可替换转场，修改或移除均支持撤销。淡入淡出在接点经过背景色。</p>
 </div></PanelView>;
}
