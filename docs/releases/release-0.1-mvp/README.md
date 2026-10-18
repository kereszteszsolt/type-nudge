# Release 0.1 — Offline Predictive Writing MVP

**Status:** In progress · **6 stories** · **TND-001–004 Implemented; TND-005–006 remain Planned.** See [verification](verification.md) for current evidence and platform limits.

## Goal

Build a minimal Electron/TypeScript desktop plain-text editor with opt-in local N-gram learning, editable active sources, N=1/2/3 fallback, ghost-text suggestions, local SQLite persistence, and tested Windows/Linux packaging where environments are available.

## Stories in dependency order

1. [TND-001 — Electron Foundation & Editor](stories/TND-001-electron-foundation-and-editor.md)
2. [TND-002 — SQLite Index & Text Import](stories/TND-002-sqlite-index-and-text-import.md)
3. [TND-003 — N-gram Prediction Engine](stories/TND-003-ngram-prediction-engine.md)
4. [TND-004 — Inline Suggestions & Settings](stories/TND-004-inline-suggestions-and-settings.md)
5. [TND-005 — Personal Writing & Learning](stories/TND-005-personal-writing-and-learning.md)
6. [TND-006 — Testing, Packaging & Documentation](stories/TND-006-testing-packaging-and-documentation.md)

## Release exit criteria

- Every acceptance criterion for TND-001–006 is satisfied or a blocker is explicitly recorded; no unchecked criterion is silently treated as complete.
- No hidden online calls, global keyboard hooks or unapproved personal learning.
- Real SQLite tests demonstrate independent source counts and idempotent reindex/save.
- Inline keybindings and stale-result handling are checked in a real Electron/browser environment.
- At least one actually packaged, launched OS target is documented honestly; unsupported OS targets remain `Not run`.
- Real commands, dates, results and risks are captured in [verification](verification.md), then release status updated truthfully.

## Scope exclusions

No cloud models, LLMs, auth, RAG, full rich-text editing, cross-application autocomplete, global keylogging or hypothetical optimization trees.
