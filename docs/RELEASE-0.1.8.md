# 0.1.8

User project reproducer: two duplicated screen recording clips look adjacent, but transition_targets returns no targets and the diagnostic is below the preset grid.

Changed Rust target resolution to allow a single project frame of endpoint rounding error. Resolve the nearest following clip, falling back to the preceding clip when selecting the second clip. Deduplicate paired targets when both sides are selected. Larger gaps and cross-track candidates are still rejected.

The transition panel displays sticky application status/errors above presets. Successful application reports style and duration.

Validation: 19 Rust AI tests including subframe recording-duration case, selection of either/both sides, rejection of a 100 ms gap; TypeScript and production build.

Verified in the user's original desktop project 14762a1d-bae9-469f-9c3d-074e580f0d03 after upgrading installed app: the two SmartFocus recording segments now resolve successfully, both purple timeline markers appear and panel reports applied fade 0.5 s. Existing application backed up at /tmp/OpenCut-AI-backup-0.1.7.app before replacement.
