const {
	app,
	BrowserWindow,
	dialog,
	shell,
	utilityProcess,
	Menu,
	ipcMain,
	desktopCapturer,
	screen,
	systemPreferences,
	globalShortcut,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");

const port = app.isPackaged ? 3002 : 3000;
const origin = `http://localhost:${port}`;
let server;
let window;
let stopping = false;

function setMenu(language) {
	const zh = language === "zh";
	Menu.setApplicationMenu(
		Menu.buildFromTemplate([
			{
				label: "OpenCut AI",
				submenu: [
					{ role: "about", label: zh ? "关于 OpenCut AI" : "About OpenCut AI" },
					{ type: "separator" },
					{ role: "hide", label: zh ? "隐藏" : "Hide" },
					{ role: "quit", label: zh ? "退出" : "Quit" },
				],
			},
			{
				label: zh ? "编辑" : "Edit",
				submenu: [
					{ role: "undo", label: zh ? "撤销" : "Undo" },
					{ role: "redo", label: zh ? "重做" : "Redo" },
					{ type: "separator" },
					{ role: "cut", label: zh ? "剪切" : "Cut" },
					{ role: "copy", label: zh ? "复制" : "Copy" },
					{ role: "paste", label: zh ? "粘贴" : "Paste" },
					{ role: "selectAll", label: zh ? "全选" : "Select all" },
				],
			},
			{
				label: zh ? "视图" : "View",
				submenu: [
					{ role: "reload", label: zh ? "刷新" : "Reload" },
					{ role: "togglefullscreen", label: zh ? "全屏" : "Full screen" },
				],
			},
			{
				label: zh ? "窗口" : "Window",
				submenu: [
					{ role: "minimize", label: zh ? "最小化" : "Minimize" },
					{ role: "close", label: zh ? "关闭" : "Close" },
				],
			},
		]),
	);
}
ipcMain.on("opencut-language", (event, language) => {
	if (
		window &&
		event.sender === window.webContents &&
		new URL(event.sender.getURL()).origin === origin &&
		["zh", "en"].includes(language)
	)
		setMenu(language);
});

const { createRecordingControls } = require("./recording-controls.cjs");
const recordingControls = createRecordingControls({ BrowserWindow, screen, globalShortcut, getWindow: () => window });
ipcMain.handle("opencut-recording-controls", (event, input) => { captureSender(event); if (!captureSelection) throw new Error("No active recording"); return recordingControls.begin(input); });
ipcMain.on("opencut-recording-paused", (event, paused) => { captureSender(event); recordingControls.setPaused(paused); });
ipcMain.on("opencut-controls-action", (event, action) => { if (recordingControls.isSender(event) && ["pause", "stop"].includes(action)) recordingControls.send(action); });
let captureSelection;
function captureSender(event) {
	if (!window || event.sender !== window.webContents || new URL(event.sender.getURL()).origin !== origin)
		throw new Error("Untrusted recording request");
}
ipcMain.handle("opencut-capture-status", (event) => {
	captureSender(event);
	return process.platform === "darwin" ? systemPreferences.getMediaAccessStatus("screen") : "granted";
});
ipcMain.handle("opencut-restart", (event) => {
	captureSender(event);
	if (captureSelection) throw new Error("Stop recording before restarting");
	app.relaunch();
	app.quit();
});
ipcMain.handle("opencut-capture-permissions", (event) => {
	captureSender(event);
	return shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
});
async function recordingSourcesWithTimeout(options) {
	let timer;
	try {
		return await Promise.race([
			desktopCapturer.getSources(options),
			new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Capture source check timed out")), 8000); }),
		]);
	} finally { clearTimeout(timer); }
}
ipcMain.handle("opencut-capture-sources", async (event) => {
	captureSender(event);
	try {
		const sources = await recordingSourcesWithTimeout({types: ["screen"], thumbnailSize: {width: 240, height: 135}});
		try { sources.push(...await recordingSourcesWithTimeout({types: ["window"], thumbnailSize: {width: 240, height: 135}})); } catch { /* Window enumeration must not block display recording. */ }
		return sources.map((source) => ({id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL(), kind: source.id.startsWith("screen:") ? "screen" : "window"}));
	} catch {
		throw new Error("Unable to list recording sources. Refresh or restart the app.");
	}
});
ipcMain.handle("opencut-capture-select", async (event, input) => {
	captureSender(event);
	const sources = await recordingSourcesWithTimeout({types: [typeof input?.id === "string" && input.id.startsWith("screen:") ? "screen" : "window"]});
	const source = sources.find((source) => source.id === input?.id);
	if (!source) throw new Error("Recording display is unavailable");
	captureSelection = {source, audio: input.audio === true};
	window.webContents.setBackgroundThrottling(false);
});
ipcMain.handle("opencut-capture-cursor", (event) => {
	captureSender(event);
	if (!captureSelection) return null;
	const display = screen.getAllDisplays().find((display) => String(display.id) === captureSelection.source.display_id);
	if (!display) return null;
	const cursor = screen.getCursorScreenPoint();
	return {x: (cursor.x - display.bounds.x) / display.bounds.width, y: (cursor.y - display.bounds.y) / display.bounds.height};
});
ipcMain.handle("opencut-capture-end", (event) => { captureSender(event); captureSelection = undefined; recordingControls.end(); window.webContents.setBackgroundThrottling(true); });

async function waitForServer() {
	for (let attempt = 0; attempt < 120; attempt++) {
		try {
			const response = await fetch(`${origin}/projects`);
			if (response.ok) return;
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error("本地编辑器服务未能启动，请检查终端或桌面服务日志。");
}

async function start() {
	setMenu("zh");
	if (app.isPackaged) {
		const { buildId } = JSON.parse(
			fs.readFileSync(
				path.join(process.resourcesPath, "web-build.json"),
				"utf8",
			),
		);
		const webRoot = path.join(app.getPath("userData"), `web-${buildId}`);
		if (!fs.existsSync(path.join(webRoot, ".ready"))) {
			fs.mkdirSync(webRoot, { recursive: true });
			const result = spawnSync(process.platform === "win32" ? "tar.exe" : "/usr/bin/tar", [
				"-xzf",
				path.join(process.resourcesPath, "web.tar.gz"),
				"-C",
				webRoot,
			]);
			if (result.status !== 0) throw new Error("无法解压本地编辑器服务。");
			fs.writeFileSync(path.join(webRoot, ".ready"), "");
		}
		const log = fs.openSync(
			path.join(app.getPath("userData"), "server.log"),
			"a",
		);
		server = utilityProcess.fork(path.join(webRoot, "apps/web/server.js"), [], {
			cwd: path.join(webRoot, "apps/web"),
			env: {
				DATABASE_URL: "postgres://localhost/opencut",
				BETTER_AUTH_SECRET: "desktop-local-placeholder",
				UPSTASH_REDIS_REST_URL: "https://example.invalid",
				UPSTASH_REDIS_REST_TOKEN: "unused",
				NEXT_PUBLIC_MARBLE_API_URL: "https://example.invalid",
				MARBLE_WORKSPACE_KEY: "unused",
				FREESOUND_CLIENT_ID: "unused",
				FREESOUND_API_KEY: "unused",
				...process.env,
				NODE_ENV: "production",
				PORT: String(port),
				HOSTNAME: "127.0.0.1",
			},
			stdio: "pipe",
		});
		server.stdout.on("data", (data) => fs.writeSync(log, data));
		server.stderr.on("data", (data) => fs.writeSync(log, data));
		server.on("exit", () => {
			fs.closeSync(log);
			if (!stopping) app.quit();
		});
	} else {
		try {
			await fetch(`${origin}/projects`);
		} catch {
			server = spawn(
				process.env.OPENCUT_BUN || "bun",
				["run", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
				{
					cwd: path.resolve(__dirname, "../web"),
					stdio: "inherit",
				},
			);
			server.on("error", (error) => {
				dialog.showErrorBox("OpenCut", error.message);
				app.quit();
			});
		}
	}
	window = new BrowserWindow({
		width: 1440,
		height: 960,
		minWidth: 1024,
		minHeight: 720,
		title: "OpenCut AI",
		backgroundColor: "#161616",
		show: false,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			preload: path.join(__dirname, "preload.cjs"),
		},
	});
	window.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
		if (request.frame?.url && new URL(request.frame.url).origin === origin && captureSelection) {
			callback({video: captureSelection.source, ...(captureSelection.audio ? {audio: "loopback"} : {})});
		} else callback({});
	});
	window.webContents.session.on("will-download", (_event, item) => {
		item.setSaveDialogOptions({ defaultPath: path.join(app.getPath("downloads"), item.getFilename()) });
	});
	window.on("closed", () => recordingControls.end());
	window.setMenuBarVisibility(false);
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//.test(url) && !url.startsWith(origin + "/"))
			shell.openExternal(url);
		return { action: "deny" };
	});
	window.webContents.on("will-navigate", (event, url) => {
		if (new URL(url).origin !== origin) {
			event.preventDefault();
			if (/^https?:\/\//.test(url)) shell.openExternal(url);
		}
	});
	await waitForServer();
	await window.loadURL(`${origin}/projects`);
	window.show();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
	app.on("second-instance", () => {
		if (window) {
			window.restore();
			window.focus();
		}
	});
	app
		.whenReady()
		.then(start)
		.catch((error) => {
			dialog.showErrorBox("OpenCut 启动失败", error.message);
			app.quit();
		});
	app.on("window-all-closed", () => app.quit());
	app.on("before-quit", () => {
		stopping = true;
		recordingControls.end();
		server?.kill();
	});
}
