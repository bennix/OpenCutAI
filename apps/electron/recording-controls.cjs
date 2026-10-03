const path = require("node:path");
function validShortcut(value) {
	return typeof value === "string" && /^(?:(?:CommandOrControl|Command|Control|Alt|Shift)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(value) && /(?:CommandOrControl|Command|Control|Alt)\+/.test(value);
}
function createRecordingControls({ BrowserWindow, screen, globalShortcut, getWindow }) {
	let panel;
	let shortcuts = [];
	let destroying = false;
	function send(action) {
		const main = getWindow();
		if (main && !main.isDestroyed()) main.webContents.send("opencut-recording-action", action);
	}
	function end() {
		for (const shortcut of shortcuts) globalShortcut.unregister(shortcut);
		shortcuts = [];
		if (panel) { destroying = true; panel.destroy(); panel = undefined; destroying = false;
			const main = getWindow();
			if (main && !main.isDestroyed()) { main.show(); main.focus(); }
		}
	}
	return {
		end,
		isSender: (event) => !!panel && event.sender === panel.webContents,
		send,
		setPaused(paused) { panel?.webContents.send("opencut-controls-state", !!paused); },
		async begin(input) {
			if (panel) return;
			if (!validShortcut(input?.pause) || !validShortcut(input?.stop) || input.pause === input.stop)
				throw new Error("Invalid recording shortcuts");
			try {
				for (const [key, action] of [[input.pause, "pause"], [input.stop, "stop"]]) {
					if (!globalShortcut.register(key, () => send(action)))
						throw new Error("Recording shortcut is unavailable. Change it in Settings.");
					shortcuts.push(key);
				}
				const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
				panel = new BrowserWindow({ width: 290, height: 74, x: area.x + area.width - 306, y: area.y + area.height - 90,
					frame: false, resizable: false, minimizable: false, maximizable: false, alwaysOnTop: true, skipTaskbar: true,
					backgroundColor: "#18212f", show: false,
					webPreferences: { preload: path.join(__dirname, "recording-controls-preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false },
				});
				panel.setContentProtection(true);
				panel.setAlwaysOnTop(true, "floating");
				panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
				panel.webContents.on("will-navigate", (event) => event.preventDefault());
				panel.on("close", (event) => { if (!destroying) { event.preventDefault(); send("stop"); } });
				await panel.loadFile(path.join(__dirname, "recording-controls.html"), { query: { language: input.language === "en" ? "en" : "zh", pause: input.pause, stop: input.stop } });
				panel.showInactive();
				getWindow().hide();
			} catch (error) { end(); throw error; }
		},
	};
}
module.exports = { createRecordingControls, validShortcut };
