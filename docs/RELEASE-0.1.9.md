# OpenCut AI 0.1.9

- Persistent recording chunks, crash recovery and visible audio/video health feedback.
- Generation task center with resumable provider tasks and protection against duplicate paid submissions after an unknown result.
- Separate ZenMux management credentials, balance/monthly PAYG queries, configurable low-balance alerts and client budgets.
- OS-protected desktop credentials and main-process AI/media requests.
- Local space statistics, paginated cleanup, reference protection and backup downloads.
- Selectable PNG continuity frames; existing versions remain in the library.

macOS Apple Silicon DMG is Developer ID signed, Apple notarized and stapled. Windows x64 is unsigned and may show SmartScreen warnings. Linux x64 provides DEB and RPM. Cross-platform packages use the same tagged source.

Budget checks govern local submissions, not provider billing guarantees. No real paid AI generation or live management key was used in feature tests. Recording import still needs memory proportional to the final file; interrupted WebM recovery depends on decodability.

Validation: Rust AI tests, isolated AI/MCP/management/journal tests, recording tests, native persistence/credential tests, TypeScript and production Web build.

Package verification:
- macOS bundle and DMG: strict signature validation, stapled Apple tickets and Gatekeeper acceptance. Application submission `cecf7fc3-4d5b-4c0b-8c36-6d00d172189a`; DMG submission `df492d09-6841-4d21-88a0-6eee3af00fae`, both Accepted. Embedded editor startup returned HTTP 200.
- [Windows and Linux builds](https://github.com/bennix/OpenCutAI/actions/runs/37103309289) passed.
- [Linux package startup](https://github.com/bennix/OpenCutAI/actions/runs/37103591867) and [Windows package startup](https://github.com/bennix/OpenCutAI/actions/runs/37103669668) passed.
- `OpenCutAI-SHA256SUMS.txt` contains checksums for all four final installers.
