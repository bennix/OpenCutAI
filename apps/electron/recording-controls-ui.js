const options = new URLSearchParams(location.search);
const zh = options.get("language") !== "en";
const pause = document.getElementById("pause"), stop = document.getElementById("stop");
function render(paused) { pause.querySelector("span").textContent = paused ? (zh ? "继续录屏" : "Resume") : (zh ? "暂停录屏" : "Pause"); }
render(false);
stop.querySelector("span").textContent = zh ? "停止录屏" : "Stop";
const displayShortcut = (value) => (value || "").replace("CommandOrControl", /Mac/.test(navigator.platform) ? "⌘" : "Ctrl").replace("Command", "⌘").replace("Control", "Ctrl").replace("Shift", "⇧").replace("Alt", "⌥");
pause.querySelector("small").textContent = displayShortcut(options.get("pause"));
stop.querySelector("small").textContent = displayShortcut(options.get("stop"));
pause.onclick = () => window.recordingControls.action("pause");
stop.onclick = () => { pause.disabled = true; stop.disabled = true; window.recordingControls.action("stop"); };
window.recordingControls.onState(render);

window.recordingControls.onHealth(message=>{document.querySelector("i").title=message;document.querySelector("i").style.background=message?"#ffbd59":"#f45f6c";document.body.title=message;document.getElementById("health").textContent=message;});
