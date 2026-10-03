# Screen recording / 录屏

Open the editor's **Assets → Screen recording** button (素材库 → 录屏).
The desktop application supports full display capture, a region drawn on the selected display preview, and individual windows. For Apple mirroring, start iPhone Mirroring or AirPlay on macOS first, then choose its window in **Window / Apple mirroring**. This application captures the existing mirror; it does not initiate an AirPlay session.

Microphone and system sound can be selected independently or together. They are saved as separate audio assets and placed on separate audio tracks at the same start position as the video. Select an audio clip in the timeline to adjust volume, mute, or fades in Properties. System sound requires platform support and macOS screen/system audio permissions. The application reports an error if requested system audio is absent; it does not silently substitute microphone audio.

**Pause / Resume** applies to every recorder together. **Stop recording** releases capture streams, imports the files, and inserts them at the timeline playhead position captured when recording started. Recording files use WebM; the editor can export the final project to MP4 using its existing export flow.

Smart Focus follows the desktop mouse cursor with a smoothed 1.6× crop on screen/region recordings. Both the original capture and the focused version are retained in the asset library; only the focused version is automatically placed on the timeline. Focus is rendered into that version. Use the original recording to make different crop/zoom choices later. Mirror/window recordings preserve the full window and do not offer cursor focus.

Browser capture uses the browser's own source picker. Region selection, desktop window selection, and global mouse tracking require the desktop application.

Verification: Rust crop bounds/smoothing tests; mocked recording lifecycle tests for simultaneous pause/resume, stop idempotence, separate output files, and cleanup on absent requested system audio. Browser UI verified. Physical microphone/system loopback and Apple mirroring need real device verification.
