"use client";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { clampDb, dBToLinear } from "@/timeline/audio-state";
import { VOLUME_DB_MIN, VOLUME_DB_MAX } from "@/timeline/audio-constants";
import { useTranslation, UiText } from "@/i18n";

import type {
	ParamDefinition,
	NumberParamDefinition,
	ParamValue,
} from "@/params";
import {
	formatNumberForDisplay,
	getFractionDigitsForStep,
	snapToStep,
} from "@/utils/math";
import { SectionField } from "@/components/section";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { FontPicker } from "@/components/ui/font-picker";
import { ColorPicker } from "@/components/ui/color-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { usePropertyDraft } from "../hooks/use-property-draft";
import { KeyframeToggle } from "./keyframe-toggle";
import { Textarea } from "@/components/ui/textarea";

export function PropertyParamField({
	param,
	value,
	onPreview,
	onCommit,
	onFocus,
	keyframe,
}: {
	param: ParamDefinition;
	value: ParamValue;
	onPreview: (value: ParamValue) => void;
	onCommit: () => void;
	onFocus?: () => void;
	keyframe?: {
		isActive: boolean;
		isDisabled: boolean;
		onToggle: () => void;
	};
}) {
	const t = useTranslation();
	return (
		<SectionField
			label={t(param.label)}
			beforeLabel={
				keyframe && param.keyframable !== false ? (
					<KeyframeToggle
						isActive={keyframe.isActive}
						isDisabled={keyframe.isDisabled}
						title={`Toggle ${param.label.toLowerCase()} keyframe`}
						onToggle={keyframe.onToggle}
					/>
				) : undefined
			}
		>
			<ParamInput
				param={param}
				value={value}
				onPreview={onPreview}
				onCommit={onCommit}
				onFocus={onFocus}
			/>
		</SectionField>
	);
}

function ParamInput({
	param,
	value,
	onPreview,
	onCommit,
	onFocus,
}: {
	param: ParamDefinition;
	value: ParamValue;
	onPreview: (value: ParamValue) => void;
	onCommit: () => void;
	onFocus?: () => void;
}) {
	if (param.type === "number" && param.key === "volume") {
		return <VolumeParamField param={param} value={Number(value)} onPreview={onPreview} onCommit={onCommit} />;
	}
	if (param.type === "number" && ["opacity", "transform.scaleX", "transform.scaleY", "transform.rotate"].includes(param.key)) {
		return <VisualNumberField param={param} value={Number(value)} onPreview={onPreview} onCommit={onCommit} />;
	}
	if (param.type === "number") {
		return (
			<NumberParamField
				param={param.key.startsWith("transform.position") ? { ...param, shortLabel: "px" } : param}
				value={typeof value === "number" ? value : Number(value)}
				onPreview={onPreview}
				onCommit={onCommit}
			/>
		);
	}

	if (param.type === "boolean") {
		return (
			<Switch
				checked={Boolean(value)}
				onCheckedChange={(checked) => {
					onPreview(checked);
					onCommit();
				}}
			/>
		);
	}

	if (param.type === "select") {
		return (
			<Select
				value={String(value)}
				onValueChange={(selected) => {
					onPreview(selected);
					onCommit();
				}}
			>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{param.options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							<UiText text={option.label} />
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		);
	}

	if (param.type === "color") {
		return (
			<ColorPicker
				value={String(value).replace(/^#/, "").toUpperCase()}
				onChange={(color) => onPreview(`#${color}`)}
				onChangeEnd={(color) => {
					onPreview(`#${color}`);
					onCommit();
				}}
			/>
		);
	}

	if (param.type === "text") {
		return (
			<Textarea
				aria-label={param.label}
				value={String(value)}
				onFocus={onFocus}
				onChange={(event) => onPreview(event.currentTarget.value)}
				onBlur={onCommit}
			/>
		);
	}

	if (param.type === "font") {
		return (
			<FontPicker
				defaultValue={String(value)}
				onValueChange={(family) => { onPreview(family); onCommit(); }}
			/>
		);
	}

	return null;
}

function NumberParamField({
	param,
	value,
	onPreview,
	onCommit,
}: {
	param: NumberParamDefinition;
	value: number;
	onPreview: (value: number) => void;
	onCommit: () => void;
}) {
	const { min, max, step, displayMultiplier = 1 } = param;
	const displayValue = value * displayMultiplier;
	const clampDisplayValue = (nextDisplayValue: number) =>
		Math.max(
			min,
			max !== undefined ? Math.min(max, nextDisplayValue) : nextDisplayValue,
		);

	const previewFromDisplay = (displayVal: number) => {
		const clamped = clampDisplayValue(
			snapToStep({ value: displayVal, step }),
		);
		onPreview(clamped / displayMultiplier);
	};

	const maxFractionDigits = getFractionDigitsForStep({ step });

	const draft = usePropertyDraft({
		displayValue: formatNumberForDisplay({
			value: displayValue,
			maxFractionDigits,
		}),
		parse: (input) => {
			const parsed = parseFloat(input);
			if (Number.isNaN(parsed)) return null;
			return clampDisplayValue(snapToStep({ value: parsed, step }));
		},
		onPreview: previewFromDisplay,
		onCommit,
	});

	const handleReset = () => {
		onPreview(param.default);
		onCommit();
	};

	return (
		<NumberField
			icon={param.shortLabel}
			value={draft.displayValue}
			dragSensitivity="slow"
			isDefault={value === param.default}
			onFocus={draft.onFocus}
			onChange={draft.onChange}
			onBlur={draft.onBlur}
			onScrub={previewFromDisplay}
			onScrubEnd={onCommit}
			onReset={handleReset}
		/>
	);
}

function VolumeParamField({ param, value, onPreview, onCommit }: {
 param: NumberParamDefinition; value: number;
 onPreview: (value: ParamValue) => void; onCommit: () => void;
}) {
 const t = useTranslation();
 const db = clampDb(value);
 const percent = Math.round(dBToLinear(db) * 1000) / 10;
 return <div className="space-y-3">
  <div className="flex items-center gap-3">
   <Slider aria-label={t("Volume (dB)")} min={VOLUME_DB_MIN} max={VOLUME_DB_MAX} step={0.5} value={[db]} onValueChange={values => onPreview(values[0])} onValueCommit={onCommit} />
   <div className="w-28 shrink-0"><NumberParamField param={{ ...param, shortLabel: "dB", step: 0.1 }} value={db} onPreview={onPreview} onCommit={onCommit} /></div>
  </div>
  <div className="flex justify-between text-xs text-muted-foreground"><span>−60 dB</span><span>{t("Original volume")} · 0 dB = 100%</span><span>+20 dB</span></div>
  <p className="text-sm">{db === 0 ? t("Original volume") : db < 0 ? t("Reduced volume") : t("Amplified volume")} · {percent}%</p>
  <div className="flex gap-2">{[-12, -6, 0, 6].map(preset => <Button key={preset} variant="outline" size="sm" onClick={() => { onPreview(preset); onCommit(); }}>{preset === 0 ? t("Reset to original") : `${preset > 0 ? "+" : ""}${preset} dB`}</Button>)}</div>
  <p className="text-xs text-muted-foreground">{t("0 dB preserves the original level. Negative values reduce it; positive values amplify it. Use Mute for complete silence.")}</p>
  {db > 0 && <p className="text-xs text-amber-700">{t("Amplification can cause clipping if the source is already loud.")}</p>}
 </div>;
}

function VisualNumberField({ param, value, onPreview, onCommit }: {
 param: NumberParamDefinition; value: number;
 onPreview: (value: ParamValue) => void; onCommit: () => void;
}) {
 const t = useTranslation();
 const percent = param.key !== "transform.rotate";
 const opacity = param.key === "opacity";
 const min = opacity ? 0 : percent ? param.min : -360;
 const max = opacity ? 1 : percent ? 4 : 360;
 const shownParam = percent ? { ...param, displayMultiplier: 100, min: param.min * 100, max: param.max === undefined ? undefined : param.max * 100, step: 1, shortLabel: "%" } : { ...param, shortLabel: "°" };
 return <div className="space-y-2">
  <div className="flex items-center gap-3">
   <Slider aria-label={t(param.label)} value={[Math.max(min, Math.min(max, value))]} min={min} max={max} step={percent ? 0.01 : 1} onValueChange={values => onPreview(values[0])} onValueCommit={onCommit} />
   <div className="w-28 shrink-0"><NumberParamField param={shownParam} value={value} onPreview={onPreview} onCommit={onCommit} /></div>
  </div>
  <div className="flex flex-wrap gap-2">{(opacity ? [0, 0.5, 1] : percent ? [0.5, 1, 2] : [-90, 0, 90]).map(preset => <Button key={preset} size="sm" variant="outline" onClick={() => { onPreview(preset); onCommit(); }}>{percent ? `${preset * 100}%` : `${preset}°`}</Button>)}</div>
 </div>;
}
