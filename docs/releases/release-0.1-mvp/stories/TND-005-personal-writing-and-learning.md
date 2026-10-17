# TND-005: Personal writing and opt-in learning

## Status

Planned

## User story

As a writer, I want to save my text and optionally teach TypeNudge from it without unintentionally recording every keystroke.

## Goal

Persist editable personal documents and make local learning an explicit, reversible save-time operation.

## Dependencies

TND-002 and TND-004 implemented and verified.

## Acceptance criteria

- [ ] Enable creating, saving, reopening and deleting simple plain-text documents in local application storage, with a clear unsaved-change indication.
- [ ] Keep **Learn from my writing** disabled by default and separate from document saving. Saving while learning is disabled does not add N-gram contributions.
- [ ] When learning is explicitly enabled, saving a new/edited document **transactionally replaces** that document's previous contribution; repeated saves of unchanged content do not inflate frequencies.
- [ ] Let users deactivate personal-writing predictions, remove a personal document's learned contribution and reset personal learned data without deleting unrelated imported sources.
- [ ] Ensure source mode and per-source active flags determine whether personal writing affects predictions. No background filesystem crawling, clipboard capture or other application keystroke collection.
- [ ] Add tests for opt-in default, save/re-save idempotence, source-mode changes, deletion/reset, restart persistence and stale-cache invalidation; record the observed outcomes.

## Out of scope

No cloud sync, document sharing, version history, rich editing, automatic indexing on each keystroke or user accounts.
