import { expect, test } from "bun:test";
const { createRecordingControls } = require("../recording-controls.cjs");
function fixture(unavailable = "") {
	const bindings = new Map<string, () => void>();
	const messages: string[] = [];
	let visible = true;
	let options: Record<string, number> = {};
	class Panel {
		webContents = { send() {}, setWindowOpenHandler() {}, on() {} };
		constructor(input: Record<string, number>) {
			options = input;
		}
		setContentProtection() {}
		setAlwaysOnTop() {}
		on() {}
		destroy() {}
		showInactive() {}
		async loadFile() {}
	}
	const main = {
		isDestroyed: () => false,
		webContents: { send: (_: string, action: string) => messages.push(action) },
		hide: () => {
			visible = false;
		},
		show: () => {
			visible = true;
		},
		focus() {},
	};
	const controls = createRecordingControls({
		BrowserWindow: Panel,
		getWindow: () => main,
		screen: {
			getCursorScreenPoint: () => ({}),
			getDisplayNearestPoint: () => ({
				workArea: { x: 100, y: 20, width: 1280, height: 720 },
			}),
		},
		globalShortcut: {
			register: (key: string, callback: () => void) => {
				if (key === unavailable) return false;
				bindings.set(key, callback);
				return true;
			},
			unregister: (key: string) => bindings.delete(key),
		},
	});
	return {
		controls,
		bindings,
		messages,
		visible: () => visible,
		options: () => options,
	};
}
test("mini controls hide the editor, use the display corner and restore on stop", async () => {
	const f = fixture();
	await f.controls.begin({
		pause: "Control+Shift+P",
		stop: "Control+Shift+S",
		language: "zh",
	});
	expect(f.visible()).toBe(false);
	expect(f.options().x).toBe(1074);
	expect(f.options().y).toBe(650);
	f.bindings.get("Control+Shift+P")!();
	f.bindings.get("Control+Shift+S")!();
	expect(f.messages).toEqual(["pause", "stop"]);
	f.controls.end();
	expect(f.visible()).toBe(true);
	expect(f.bindings.size).toBe(0);
	f.controls.end();
	expect(f.visible()).toBe(true);
});
test("shortcut conflicts roll back registrations without hiding the editor", async () => {
	const f = fixture("Control+Shift+S");
	await expect(
		f.controls.begin({ pause: "Control+Shift+P", stop: "Control+Shift+S" }),
	).rejects.toThrow("unavailable");
	expect(f.bindings.size).toBe(0);
	expect(f.visible()).toBe(true);
});
test("invalid shortcuts do not create controls", async () => {
	const f = fixture();
	await expect(f.controls.begin({ pause: "P", stop: "S" })).rejects.toThrow(
		"Invalid",
	);
	expect(f.visible()).toBe(true);
	expect(f.bindings.size).toBe(0);
});
