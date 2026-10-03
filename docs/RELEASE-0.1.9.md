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
