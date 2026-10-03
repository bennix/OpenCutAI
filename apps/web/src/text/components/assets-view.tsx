"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { UiText, useTranslation } from "@/i18n";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { DEFAULTS } from "@/timeline/defaults";
import { buildTextElement } from "@/timeline/element-utils";
import type { MediaTime } from "@/wasm";

export function TextView() {
	const t = useTranslation();
	const editor = useEditor();
	const [label, setLabel] = useState("");

	const handleAddToTimeline = ({ currentTime, content }: { currentTime: MediaTime; content?: string }) => {
		const activeScene = editor.scenes.getActiveScene();
		if (!activeScene) return;

		const element = buildTextElement({
			raw: { ...DEFAULTS.text.element, ...(content ? { name: content.slice(0, 24), params: { ...DEFAULTS.text.element.params, content } } : {}) },
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	return (
		<PanelView title="Text">
			<div className="mb-4 space-y-2">
				<Textarea aria-label={t("Text label")} placeholder={t("Enter a text label")} value={label} onChange={event => setLabel(event.target.value)} />
				<Button disabled={!label.trim()} onClick={() => handleAddToTimeline({ currentTime: editor.playback.getCurrentTime(), content: label.trim() })}>{t("Add text label")}</Button>
				<p className="text-xs text-muted-foreground">{t("Select an image or text label in the preview to drag, resize or rotate it. Transform properties also accept exact values.")}</p>
			</div>
			<DraggableItem
				name={t("Default text")}
				preview={
					<div className="bg-accent flex size-full items-center justify-center rounded">
						<span className="text-xs select-none"><UiText text="Default text" /></span>
					</div>
				}
				dragData={{
					id: "temp-text-id",
					type: DEFAULTS.text.element.type,
					name: DEFAULTS.text.element.name,
					content: "Default text",
				}}
				aspectRatio={1}
				onAddToTimeline={handleAddToTimeline}
				shouldShowLabel={false}
			/>
		</PanelView>
	);
}
