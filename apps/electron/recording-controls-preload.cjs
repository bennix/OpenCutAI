const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("recordingControls", {
	action: (action) => { if (action === "pause" || action === "stop") ipcRenderer.send("opencut-controls-action", action); },
	onHealth: callback => ipcRenderer.on("opencut-controls-health", (_event,message)=>callback(message)),
	onState: (callback) => ipcRenderer.on("opencut-controls-state", (_event, paused) => callback(!!paused)),
});
