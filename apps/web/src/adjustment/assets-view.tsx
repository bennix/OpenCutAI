"use client";
import { UiText } from "@/i18n";
import { useEditor } from "@/editor/use-editor";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { ClipEffectsTab } from "@/effects/components/effects-tab";
import { isVisualElement } from "@/timeline";

export function AdjustmentView() {
	const editor = useEditor();
	const selection = useEditor((e) => e.selection.getSelectedElements());
	useEditor((e) => e.scenes.getActiveScene().tracks);
	const selected = selection.length === 1 ? editor.timeline.getElementsWithTracks({ elements: selection })[0] : undefined;
	const element = selected?.element;
	const visual = element && isVisualElement(element) ? element : null;
	return <PanelView title="Adjustment">
		{visual && selected ? <>
			<p className="text-sm mb-3"><UiText text="Adjust the selected clip. Changes also apply to export." /></p>
			{!visual.effects?.some((effect) => effect.type === "color-adjustment") && <Button className="w-full mb-3" onClick={() => editor.timeline.addClipEffect({ trackId: selected.track.id, elementId: visual.id, effectType: "color-adjustment" })}><UiText text="Add color adjustment" /></Button>}
			<ClipEffectsTab key={visual.id} element={visual} trackId={selected.track.id} />
		</> : <p className="p-3 text-sm text-muted-foreground"><UiText text="Select a video or image on the timeline to adjust brightness, contrast, saturation and temperature." /></p>}
	</PanelView>;
}
