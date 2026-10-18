# Release 0.1 — Offline Predictive Writing MVP

**Status:** Implemented; base verified on **Linux x64/WSL2 (WSLg/Xvfb) and Windows x64**, latest multiplier/size follow-up verified on **Windows x64** · **7 stories implemented.** See [verification](verification.md) for commands, measurements and platform limits. Hosted GitHub Actions is Not run; installers, signing and publication are not provided.

The original TND-001–006 MVP baseline is complete. [TND-007](stories/TND-007-prediction-controls-and-multiword-suggestions.md) is an **implemented follow-up** for Help/hidden settings, contiguous N=1–7, per-N top-X/merged-score final top-X sampling, multi-word previews and 500,000-word indexing. The base pool, migration, controls and large-input behavior have local Windows/Linux evidence in verification. The approved per-N 0–250× slider/manual multipliers and DB/WAL/SHM size display extend this story; their follow-up checks and delivery are recorded separately there.

## Goal

Build a minimal Electron/TypeScript desktop plain-text editor with opt-in local N-gram learning, editable active sources, contiguous N=1–7 pool mixing and multi-word preview, ghost-text suggestions, local SQLite persistence, and tested Windows/Linux packaging where environments are available.

## Stories in dependency order

1. [TND-001 — Electron Foundation & Editor](stories/TND-001-electron-foundation-and-editor.md)
2. [TND-002 — SQLite Index & Text Import](stories/TND-002-sqlite-index-and-text-import.md)
3. [TND-003 — N-gram Prediction Engine](stories/TND-003-ngram-prediction-engine.md)
4. [TND-004 — Inline Suggestions & Settings](stories/TND-004-inline-suggestions-and-settings.md)
5. [TND-005 — Personal Writing & Learning](stories/TND-005-personal-writing-and-learning.md)
6. [TND-006 — Testing, Packaging & Documentation](stories/TND-006-testing-packaging-and-documentation.md)
7. [TND-007 — Prediction Controls & Multi-word Suggestions](stories/TND-007-prediction-controls-and-multiword-suggestions.md) — **Implemented**

## Original MVP exit criteria

- Every acceptance criterion for TND-001–006 is satisfied or a blocker is explicitly recorded; no unchecked criterion is silently treated as complete.
- No hidden online calls, global keyboard hooks or unapproved personal learning.
- Real SQLite tests demonstrate independent source counts and idempotent reindex/save.
- Inline keybindings and stale-result handling are checked in a real Electron/browser environment.
- At least one actually packaged, launched OS target is documented honestly; unsupported OS targets remain `Not run`.
- Real commands, dates, results and risks are captured in [verification](verification.md), then release status updated truthfully.

## Scope exclusions

No cloud models, LLMs, auth, RAG, full rich-text editing, cross-application autocomplete, global keylogging or hypothetical optimization trees.
