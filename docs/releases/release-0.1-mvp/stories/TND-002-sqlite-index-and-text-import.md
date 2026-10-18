# TND-002: SQLite index and text import

## Status

Implemented — 2026-10-18. Real SQLite integration and Electron development/packaged-executable checks passed on Linux x64/WSLg. Windows/macOS and installers: Not run. See [verification](../verification.md#tnd-002--2026-10-18).

## User story

As a writer, I want to import text sources and manage each index independently so that TypeNudge can learn from material I choose.

## Goal

Create the local SQLite store, safe TXT/MD ingestion and per-source word N-gram indexing.

## Dependencies

TND-001 implemented and verified.

## Acceptance criteria

- [x] Store a single SQLite DB under Electron's OS-specific `userData` directory using a pinned, Electron-compatible `better-sqlite3` integration. Do not commit runtime data.
- [x] Define minimal document/source/settings/N-gram count storage and SQLite indexes for per-source N=1,2,3 and prefix lookups; keep database access in the main process.
- [x] Import explicitly selected UTF-8 `.txt` and `.md` files only; validate names/types/encodings, bound import file count and size, and present recoverable errors instead of arbitrary filesystem traversal.
- [x] Maintain source IDs, content hashes/revisions and separate N-gram contributions; a repeated import or updated file replaces its old contribution **transactionally** without increasing counts twice.
- [x] Support listing and deleting individual imported sources while preserving all others; retain enough local source content to reindex on request. No automatic directory scanning or network access.
- [x] Add deterministic real SQLite integration tests for Unicode, punctuation, malformed files, independent source deletion and repeat imports; record exact evidence.

## Out of scope

No CodeMirror ghost UX, ranking engine, personal writing learner, file watcher, directory recursion or cloud storage.
