# OpenCut AI 0.1.11

- Edit subtitle content directly in the properties panel with immediate preview updates.
- Pause playback when editing content; seek to the selected subtitle when it is outside the current playhead range.
- Click outside to save the change as an undoable edit; saved content is used in exports.
- Keep the macOS microphone permission fix from 0.1.10.

支持在右侧“内容”区域直接编辑字幕，输入实时同步预览；编辑时暂停播放，必要时定位到所选字幕。点击外部保存，支持撤销，保存后的内容用于导出。

TypeScript checks and the production Web build passed. Windows x64 is unsigned and may show SmartScreen warnings. Linux x64 packages include DEB and RPM.

Validation records:
- [Windows and Linux builds](https://github.com/bennix/OpenCutAI/actions/runs/37110827526): passed.
- macOS packaged editor startup returned HTTP 200.
- Apple application notarization: Accepted (`d0fbdcbc-d97a-47d8-b5ba-8ce2c24e5472`); ticket stapled and validated; Gatekeeper accepted as Notarized Developer ID.
- [Windows installation/startup and Linux package/startup tests](https://github.com/bennix/OpenCutAI/actions/runs/37111156890): passed.
- Apple DMG notarization: Accepted (`c4bf3baa-6fb8-4f3b-aed8-89b8d09ef368`); ticket stapled and validated; Gatekeeper accepted as Notarized Developer ID.
- `OpenCutAI-SHA256SUMS.txt` records all four final installer checksums.
