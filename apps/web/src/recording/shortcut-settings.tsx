"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import {
	defaultRecordingShortcuts,
	readRecordingShortcuts,
	recordingShortcutFromEvent,
	type RecordingShortcuts,
} from "./shortcuts";
export function RecordingShortcutSettings() {
	const t = useTranslation();
	const [value, setValue] = useState(defaultRecordingShortcuts);
	const [error, setError] = useState("");
	useEffect(() => setValue(readRecordingShortcuts()), []);
	function save(next: RecordingShortcuts) {
		if (next.pause === next.stop) {
			setError(t("Recording shortcuts must be different"));
			return;
		}
		localStorage.setItem("opencut-recording-shortcuts", JSON.stringify(next));
		setValue(next);
		setError("");
	}
	return (
		<fieldset className="space-y-2 border-t pt-3">
			<legend>{t("Recording shortcuts")}</legend>
			{(["pause", "stop"] as const).map((action) => (
				<label key={action} className="block space-y-1">
					<span>
						{t(
							action === "pause"
								? "Pause / resume recording"
								: "Stop recording",
						)}
					</span>
					<input
						className="w-full rounded border bg-background p-2"
						readOnly
						value={value[action]}
						aria-label={t(
							action === "pause"
								? "Pause / resume recording"
								: "Stop recording",
						)}
						onKeyDown={(event) => {
							if (event.key === "Tab") return;
							event.preventDefault();
							event.stopPropagation();
							const shortcut = recordingShortcutFromEvent(event.nativeEvent);
							if (shortcut) save({ ...value, [action]: shortcut });
						}}
					/>
				</label>
			))}
			<p className="text-xs text-muted-foreground">
				{t(
					"Focus a field and press a key combination. Desktop shortcuts work while other apps are focused; browser shortcuts work only in this page.",
				)}
			</p>
			<Button
				variant="outline"
				size="sm"
				onClick={() => save(defaultRecordingShortcuts)}
			>
				{t("Restore default shortcuts")}
			</Button>
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
		</fieldset>
	);
}
