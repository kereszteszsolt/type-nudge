# TND-004: Inline suggestions and settings

## Status

Planned

## User story

As a writer, I want unobtrusive suggestions that I can accept, cycle through or dismiss while continuing normal editing.

## Goal

Connect prediction results to CodeMirror 6 ghost text, source selectors and N-size toggles, without disrupting keyboard behavior.

## Dependencies

TND-003 implemented and verified.

## Acceptance criteria

- [ ] Show a faint inline completion at the caret using a focused CodeMirror 6 extension; insert only the missing suffix when a partial word is already present.
- [ ] **Tab** accepts the current suggestion, **Alt+Down** cycles at most three candidates, **Esc** dismisses; normal Tab/IME/copy/undo/selection behavior works when no suggestion exists.
- [ ] Provide Imported Texts / My Writing / Combined prediction-source selection; let each imported source be enabled/disabled without reindexing other sources. Clearly handle no active corpus.
- [ ] Provide independent N=1/2/3 toggles with at least one selected; save UI preferences locally and make prediction queries respect them immediately.
- [ ] Keep typing smooth via asynchronous IPC and ignore stale prediction responses after edits, cursor movement, source/settings changes or newer requests. Show non-blocking import/reindex feedback.
- [ ] Add focused CodeMirror/IPC tests and an actual Electron UI smoke check for the three keyboard commands, partial-word completion and stale-result cancellation. Record evidence.

## Out of scope

No rich-text formatting, global OS shortcuts, automatic correction, personal writing save/index updates, or advanced theme system.
