# TND-005: Personal writing and opt-in learning

## Status

Implemented — verified on Linux x64 / WSLg; see [verification](../verification.md#tnd-005--2026-10-18). Windows/macOS and physical IME remain Not run.

## User story

As a writer, I want to save my text and optionally teach TypeNudge from it without unintentionally recording every keystroke.

## Goal

Persist editable personal documents and make local learning an explicit, reversible save-time operation.

## Dependencies

TND-002 and TND-004 implemented and verified.

## Acceptance criteria

- [x] Enable creating, saving, reopening and deleting simple plain-text documents in local application storage, with a clear unsaved-change indication.
- [x] Keep **Learn from my writing** disabled by default and separate from document saving. Saving while learning is disabled does not add N-gram contributions.
- [x] When learning is explicitly enabled, saving a new/edited document **transactionally replaces** that document's previous contribution; repeated saves of unchanged content do not inflate frequencies.
- [x] Let users deactivate personal-writing predictions, remove a personal document's learned contribution and reset personal learned data without deleting unrelated imported sources.
- [x] Ensure source mode and per-source active flags determine whether personal writing affects predictions. No background filesystem crawling, clipboard capture or other application keystroke collection.
- [x] Add tests for opt-in default, save/re-save idempotence, source-mode changes, deletion/reset, restart persistence and stale-cache invalidation; record the observed outcomes.

Consent changes affect future explicit saves, never bulk-index existing notes. Turning learning off pauses personal predictions; saving while off removes that note's previous contribution. Forget keeps saved text; reset clears personal counts and turns consent off while keeping notes/imports. Schema 2 migrates existing schema-1 databases without reindexing imports. Unsaved-change guards, expected revisions and retained Save snapshots protect ordinary editing and delayed IPC.

## Out of scope

No cloud sync, document sharing, version history, rich editing, automatic indexing on each keystroke or user accounts.
