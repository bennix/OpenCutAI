# OpenCut AI 0.1.10

- Fix macOS microphone capture permissions under hardened runtime, including Electron helper processes.
- Report denied microphone access and missing live input tracks instead of silently continuing without microphone audio.
- Keep microphone and system sound as separate editing tracks.

修复 macOS 麦克风签名权限，新增权限拒绝与无有效输入音轨提示。麦克风和系统声音分别保存为独立音轨。

Recording regression tests, TypeScript checks and production Web build passed. Physical microphone input has not been verified with a live recording.

Windows x64 is unsigned and may show SmartScreen warnings. Linux x64 packages include DEB and RPM.

Validation records:
- [Windows and Linux package builds](https://github.com/bennix/OpenCutAI/actions/runs/37106870585): passed.
- [Windows install/startup and Linux package/startup checks](https://github.com/bennix/OpenCutAI/actions/runs/37107183670): passed.
- macOS packaged editor startup returned HTTP 200. Main application and renderer helper both include the audio-input entitlement.
- Apple application notarization: Accepted (`e97118b9-399b-407b-b73f-29693df4e003`); ticket stapled and validated.
- Apple DMG notarization: Accepted (`20a74235-f93a-4f16-90ec-62f68d6f9300`); ticket stapled and validated. Application and DMG passed Gatekeeper as Notarized Developer ID.
- `OpenCutAI-SHA256SUMS.txt` records all four final installer checksums.
