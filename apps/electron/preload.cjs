const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("opencutDesktop", {
	credentialStatus: kind => ipcRenderer.invoke("opencut-credential-status", kind),
 saveCredential: value => ipcRenderer.invoke("opencut-credential-save", value),
 aiManagement: input => ipcRenderer.invoke("opencut-ai-management", input),
 aiRequest: input => ipcRenderer.invoke("opencut-ai-request", input),
 aiCancel: id => ipcRenderer.invoke("opencut-ai-cancel", id),
 aiMedia: input => ipcRenderer.invoke("opencut-ai-media", input),
 recordingBegin: input => ipcRenderer.invoke("opencut-recording-begin", input),
 recordingAppend: input => ipcRenderer.invoke("opencut-recording-append", input),
 recordingFinish: id => ipcRenderer.invoke("opencut-recording-finish", id),
 recordingList: () => ipcRenderer.invoke("opencut-recording-list"),
 recordingRead: id => ipcRenderer.invoke("opencut-recording-read", id),
 recordingRemove: id => ipcRenderer.invoke("opencut-recording-remove", id),
	restartApp: () => ipcRenderer.invoke("opencut-restart"),
	openRecordingPermissions: () => ipcRenderer.invoke("opencut-capture-permissions"),
	recordingPermissionStatus: () => ipcRenderer.invoke("opencut-capture-status"),
	recordingSources: () => ipcRenderer.invoke("opencut-capture-sources"),
	selectRecordingSource: (input) => ipcRenderer.invoke("opencut-capture-select", input),
	recordingCursor: () => ipcRenderer.invoke("opencut-capture-cursor"),
	beginRecordingControls: (input) => ipcRenderer.invoke("opencut-recording-controls", input),
	setRecordingHealth: message => ipcRenderer.send("opencut-recording-health", message),
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
