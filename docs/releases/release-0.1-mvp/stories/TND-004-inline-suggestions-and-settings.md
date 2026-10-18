# TND-004: Inline suggestions and settings

## Status

Implemented — verified on Linux x64 / WSLg; see [verification](../verification.md#tnd-004--2026-10-18). Physical IME, Windows and macOS checks remain Not run.

## User story

As a writer, I want unobtrusive suggestions that I can accept, cycle through or dismiss while continuing normal editing.

## Goal

Connect prediction results to CodeMirror 6 ghost text, source selectors and N-size toggles, without disrupting keyboard behavior.

## Dependencies

TND-003 implemented and verified.

## Acceptance criteria

- [x] Show a faint inline completion at the caret using a focused CodeMirror 6 extension; insert only the missing suffix when a partial word is already present.
- [x] **Tab** accepts the current suggestion, **Alt+Down** cycles at most three candidates, **Esc** dismisses; normal Tab/IME/copy/undo/selection behavior works when no suggestion exists.
- [x] Provide Imported Texts / My Writing / Combined prediction-source selection; let each imported source be enabled/disabled without reindexing other sources. Clearly handle no active corpus.
- [x] Provide independent N=1/2/3 toggles with at least one selected; save UI preferences locally and make prediction queries respect them immediately.
- [x] Keep typing smooth via asynchronous IPC and ignore stale prediction responses after edits, cursor movement, source/settings changes or newer requests. Show non-blocking import/reindex feedback.
- [x] Add focused CodeMirror/IPC tests and an actual Electron UI smoke check for the three keyboard commands, partial-word completion and stale-result cancellation. Record evidence.

My Writing explicitly has no learned corpus until TND-005; source selection does not enable learning. IME guards are checked with synthetic composition events, not a physical IME. Responsiveness evidence covers non-blocking editing during pending IPC; no end-to-end latency guarantee is claimed.

## Out of scope

No rich-text formatting, global OS shortcuts, automatic correction, personal writing save/index updates, or advanced theme system.
