const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("opencutDesktop", {
	restartApp: () => ipcRenderer.invoke("opencut-restart"),
	openRecordingPermissions: () => ipcRenderer.invoke("opencut-capture-permissions"),
	recordingPermissionStatus: () => ipcRenderer.invoke("opencut-capture-status"),
	recordingSources: () => ipcRenderer.invoke("opencut-capture-sources"),
	selectRecordingSource: (input) => ipcRenderer.invoke("opencut-capture-select", input),
	recordingCursor: () => ipcRenderer.invoke("opencut-capture-cursor"),
	beginRecordingControls: (input) => ipcRenderer.invoke("opencut-recording-controls", input),
	setRecordingPaused: (paused) => ipcRenderer.send("opencut-recording-paused", paused),
	onRecordingAction(callback) {
		const listener = (_event, action) => { if (action === "pause" || action === "stop") callback(action); };
		ipcRenderer.on("opencut-recording-action", listener);
		return () => ipcRenderer.removeListener("opencut-recording-action", listener);
	},
	endRecording: () => ipcRenderer.invoke("opencut-capture-end"),
	setLanguage(language) {
		if (language === "zh" || language === "en")
			ipcRenderer.send("opencut-language", language);
	},
});
