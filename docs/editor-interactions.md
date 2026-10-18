# Editor behavior

**Available through TND-004:** plain-text CodeMirror editing, imported text sources, inline word completions, source/N controls, Unicode input, wrapping, selection, copy/paste, undo/redo, and a keyboard-accessible About dialog. Tab traverses focus when no suggestion is available. The editor has an accessible name and visible focus. Text remains in memory for the current session only; the footer explicitly explains that closing the window discards it. Saving and personal learning remain TND-005 work.

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

Source mode and N checkboxes are visible above the editor; **Sources** holds individual imported-file activation controls. The final selected N checkbox is disabled until another N is enabled. Preferences and activation persist in SQLite. **My Writing** currently shows an explicit empty state; no personal learning control or save operation is implemented in this story. **Combined** currently uses active imported files, with personal data to follow in TND-005. Import/reindex status does not lock the editor, and suggestions are suspended while a source operation is pending.

`suggestions.ts` provides a focused CodeMirror view plugin, noneditable `aria-hidden` widget and highest-precedence conditional keymap. Display text uses `textContent`; the widget never enters the editor document or clipboard. Acceptance is one isolated undo step. Selection, midword carets, blur and composition suppress suggestions; normal editing shortcuts pass through. Composition start/end is exercised with synthetic DOM events; physical IME and assistive-technology checks remain manual work.

The renderer reads at most 4,096 UTF-16 units before the caret on its current line, drops a truncated initial token, and uses the same sentence/word rules as the index. It sends only a partial prefix and the last two completed words. Extremely distant context is intentionally ignored. Matching and suffix slicing share Unicode NFC/case/apostrophe normalization; acceptance retains the writer's original prefix.

## State and persistence

Editor text should be maintained without surprise auto-rewriting. User intentionally saves a document. Preserve the saved document separately from its learned contribution; re-saving must not inflate frequencies. Preferences persist locally across restarts, while ephemeral ghost suggestions do not.

## Performance and errors

Never block the typing event loop on SQLite. Show a non-blocking import/reindex progress indicator and clear errors for invalid files. Drop stale suggestions on edits, source changes, cursor moves and updated settings. Test deterministic empty, loading and error states.

TND-004 uses a 60 ms trailing debounce and asynchronous named IPC. A monotonically increasing generation cancels display of old successes and failures after edits, cursor/selection/focus changes, source/settings operations, composition, dismissal or destruction. IPC work already sent cannot be aborted; late replies are ignored. A prediction failure leaves editing available and is retried after the next eligible edit or setting change. This design does not constitute an end-to-end latency measurement.
