# 0.1.7 verification

- Fixed Rust SceneEffect deserialization of browser effectPassGroups. The regression test checks both input and serialized output.
- Effect asset panel exposes editable controls for the selected effect layer, also available in the properties panel.
- Transition metadata persists entrance/exit settings and original animation/effects for removal. Rust resolves touching pairs on the same track and composes distinct edge animations. Timeline displays duration regions.
- Between-clips fade passes through the background; it is not an overlapping cross dissolve. Select the preceding clip to apply to the junction.
- Sound downloads stream through validated Commons proxy. Imported/downloaded sound files are stored in project media and added as upload audio clips.

Validation: cargo test -p opencut-ai -p compositor (19 tests), TypeScript, production build, isolated browser project. Changed black-white strength from 1 to 0.5 and back, applied between-clips fade and independent exit slide, removed exit and undid removal. Exported H.264/AAC MP4: sampled first segment had identical RGB channels, boundary was black, exit was partly slid offscreen; audio mean -19.8 dB. Sound import and persistence verified after reload.

DMG 0.1.7 signed with Developer ID, Apple notarization Accepted, stapler validate passed, spctl source Notarized Developer ID.
