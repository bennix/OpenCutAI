"use client";
import { useTranslation } from "@/i18n";


import { useEffect, useRef, useCallback } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { effectsRegistry, EFFECT_TARGET_ELEMENT_TYPES } from "@/effects";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { useEditor } from "@/editor/use-editor";
import { buildEffectElement } from "@/timeline/element-utils";
import { StandaloneEffectTab } from "./effects-tab";
import type { EffectDefinition } from "@/effects/types";

export function EffectsView() {
	const t = useTranslation();
	const effects = effectsRegistry.getAll();
 const editor = useEditor();
 const selection = useEditor(e => e.selection.getSelectedElements());
 useEditor(e => e.scenes.getActiveScene().tracks);
 const selected = editor.timeline.getElementsWithTracks({elements:selection});
 const effect = selected.length === 1 && selected[0].element.type === "effect" ? selected[0] : undefined;

	return (
		<PanelView title={t("Effects")}>
			<p className="text-sm text-muted-foreground mb-3">点击 + 添加特效，选中特效轨道片段可自定义参数。特效作用于下方画面，可调整时长、删除或撤销。</p>
            {effect && effect.element.type === "effect" && <div className="mb-4 border rounded"><StandaloneEffectTab element={effect.element} trackId={effect.track.id} /></div>}
            <EffectsGrid effects={effects} />
		</PanelView>
	);
}

function EffectsGrid({ effects }: { effects: EffectDefinition[] }) {
	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{effects.map((effect) => (
				<EffectItem key={effect.type} effect={effect} />
			))}
		</div>
	);
}

function EffectPreviewCanvas({ effectType }: { effectType: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType,
					params: {},
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [effectType]);

	return <canvas ref={canvasRef} className="size-full" />;
}

function EffectItem({ effect }: { effect: EffectDefinition }) {
	const t = useTranslation();
	const editor = useEditor();

	const handleAddToTimeline = useCallback(() => {
		const currentTime = editor.playback.getCurrentTime();
		const element = buildEffectElement({
			effectType: effect.type,
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "effect" },
			element,
		});
	}, [editor, effect.type]);

	const preview = <EffectPreviewCanvas effectType={effect.type} />;

	return (
		<DraggableItem
			name={t(effect.name)}
			preview={preview}
			dragData={{
				id: effect.type,
				name: effect.name,
				type: "effect",
				effectType: effect.type,
				targetElementTypes: EFFECT_TARGET_ELEMENT_TYPES,
			}}
			onAddToTimeline={handleAddToTimeline}
			aspectRatio={1}
			isRounded
			variant="card"
			containerClassName="w-full"
		/>
	);
}
