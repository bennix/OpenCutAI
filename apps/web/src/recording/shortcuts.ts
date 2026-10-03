export interface RecordingShortcuts {
	pause: string;
	stop: string;
}
export const defaultRecordingShortcuts: RecordingShortcuts = {
	pause: "CommandOrControl+Shift+P",
	stop: "CommandOrControl+Shift+S",
};
export function readRecordingShortcuts(): RecordingShortcuts {
	try {
		const value = JSON.parse(
			localStorage.getItem("opencut-recording-shortcuts") ?? "null",
		);
		return value &&
			validRecordingShortcut(value.pause) &&
			validRecordingShortcut(value.stop) &&
			value.pause !== value.stop
			? value
			: defaultRecordingShortcuts;
	} catch {
		return defaultRecordingShortcuts;
	}
}
export function validRecordingShortcut(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^(?:(?:CommandOrControl|Command|Control|Alt|Shift)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(
			value,
		) &&
		/(?:CommandOrControl|Command|Control|Alt)\+/.test(value)
	);
}
export function recordingShortcutFromEvent(
	event: KeyboardEvent,
): string | null {
	if (!event.ctrlKey && !event.metaKey && !event.altKey) return null;
	const key = event.key.toUpperCase();
	if (!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(key)) return null;
	return [
		...(event.metaKey ? ["Command"] : event.ctrlKey ? ["Control"] : []),
		...(event.altKey ? ["Alt"] : []),
		...(event.shiftKey ? ["Shift"] : []),
		key,
	].join("+");
}
export function matchesRecordingShortcut(
	event: KeyboardEvent,
	shortcut: string,
): boolean {
	const mac = /Mac/.test(navigator.platform);
	return (
		recordingShortcutFromEvent(event) ===
		shortcut.replace("CommandOrControl", mac ? "Command" : "Control")
	);
}
