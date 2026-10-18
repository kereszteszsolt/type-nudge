# Editor behavior

**TND-001 available now:** plain-text CodeMirror editing, Unicode input, wrapping, selection, copy/paste, undo/redo, a keyboard-accessible About dialog, and normal Tab focus traversal. The editor has an accessible name and visible focus. Text remains in memory for the current session only; the footer explicitly explains that closing the window discards it. Save, import, predictions, settings and learning below remain planned.

The MVP is a simple **plain-text** editor with CodeMirror 6. It is not a code IDE, rich-text document creator or global keyboard assistant.

## Core keyboard interactions

| Action | Key | Required behavior |
| --- | --- | --- |
| Accept current ghost suggestion | `Tab` | Insert only the untyped suffix; do not insert a duplicate prefix |
| Cycle to next suggestion | `Alt + Down` | Rotate among up to three valid suggestions, with no document modification |
| Dismiss current suggestion | `Esc` | Clear ghost text; preserve the typed text |

When no suggestion exists, keyboard input must behave normally. Never interfere with IME composition, selection, undo/redo, standard accessibility commands or document editing shortcuts. Test at caret boundaries, line breaks and non-Latin input.

## Settings panel

- **Prediction sources:** Imported Texts, My Writing, Combined; individual imported sources can be enabled/disabled. If all are disabled, show an informative empty state.
- **N-gram sizes:** N=1, N=2, N=3 as independent toggles. At least one must stay enabled.
- **Learn from my writing:** independent, explicit opt-in (default off). No keylogger; saving a document triggers an optional index update.
- **Visible guidance:** short explanation of offline prediction, source status and keyboard hints; no intrusive AI marketing claims.

## State and persistence

Editor text should be maintained without surprise auto-rewriting. User intentionally saves a document. Preserve the saved document separately from its learned contribution; re-saving must not inflate frequencies. Preferences persist locally across restarts, while ephemeral ghost suggestions do not.

## Performance and errors

Never block the typing event loop on SQLite. Show a non-blocking import/reindex progress indicator and clear errors for invalid files. Drop stale suggestions on edits, source changes, cursor moves and updated settings. Test deterministic empty, loading and error states.
