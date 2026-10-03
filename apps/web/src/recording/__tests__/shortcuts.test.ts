import { expect, test } from "bun:test";
import {
	recordingShortcutFromEvent,
	validRecordingShortcut,
} from "../shortcuts";
test("recording shortcuts capture modifiers and reject ordinary typing", () => {
	expect(
		recordingShortcutFromEvent({
			key: "p",
			metaKey: true,
			ctrlKey: false,
			altKey: false,
			shiftKey: true,
		} as KeyboardEvent),
	).toBe("Command+Shift+P");
	expect(
		recordingShortcutFromEvent({
			key: "p",
			metaKey: false,
			ctrlKey: false,
			altKey: false,
			shiftKey: false,
		} as KeyboardEvent),
	).toBeNull();
	expect(validRecordingShortcut("CommandOrControl+Shift+S")).toBe(true);
	expect(validRecordingShortcut("S")).toBe(false);
	expect(validRecordingShortcut("Control+Shift")).toBe(false);
});
