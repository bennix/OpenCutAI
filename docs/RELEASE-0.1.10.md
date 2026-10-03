# OpenCut AI 0.1.10

- Fix macOS microphone capture permissions under hardened runtime, including Electron helper processes.
- Report denied microphone access and missing live input tracks instead of silently continuing without microphone audio.
- Keep microphone and system sound as separate editing tracks.

修复 macOS 麦克风签名权限，新增权限拒绝与无有效输入音轨提示。麦克风和系统声音分别保存为独立音轨。

Recording regression tests, TypeScript checks and production Web build passed. Physical microphone input has not been verified with a live recording.

Windows x64 is unsigned and may show SmartScreen warnings. Linux x64 packages include DEB and RPM.
