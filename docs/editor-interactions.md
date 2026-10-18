# Editor behavior

**Available through TND-005:** plain-text CodeMirror editing, imported and opted-in personal sources, inline completions, source/N controls, explicit document saving, Unicode input, wrapping, selection, copy/paste, undo/redo, and keyboard-accessible dialogs. Tab traverses focus when no suggestion is available. The editor has an accessible name and visible focus. Unsaved changes remain in memory; Save persists text locally and optionally learns from that saved snapshot.

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

Source mode and N checkboxes are visible above the editor; **Sources** holds individual imported-file activation controls. The final selected N checkbox is disabled until another N is enabled. Preferences and activation persist in SQLite. **Documents** contains saved notes, the learning checkbox and each personal note's **Use** flag. **My Writing** queries enabled learned notes only while learning is on; **Combined** also queries active imports. Empty/inactive corpora show guidance. Import, document and preference operations suspend suggestions until all pending operations finish; the editor remains available.

`suggestions.ts` provides a focused CodeMirror view plugin, noneditable `aria-hidden` widget and highest-precedence conditional keymap. Display text uses `textContent`; the widget never enters the editor document or clipboard. Acceptance is one isolated undo step. Selection, midword carets, blur and composition suppress suggestions; normal editing shortcuts pass through. Composition start/end is exercised with synthetic DOM events; physical IME and assistive-technology checks remain manual work.

The renderer reads at most 4,096 UTF-16 units before the caret on its current line, drops a truncated initial token, and uses the same sentence/word rules as the index. It sends only a partial prefix and the last two completed words. Extremely distant context is intentionally ignored. Matching and suffix slicing share Unicode NFC/case/apostrophe normalization; acceptance retains the writer's original prefix.

## State and persistence

**New** starts an untitled document; **Save** or **Ctrl/Cmd+S** persists its name and text. **Documents → Open** reopens a saved note; switching resets undo history so undo cannot insert another note's content. A title `*` and footer indicate unsaved changes. New/Open ask before discarding them; Delete confirms removal of stored text/counts. Window close offers Keep editing or explicit discard through Electron's [will-prevent-unload handler](https://www.electronjs.org/docs/latest/api/web-contents#event-will-prevent-unload). No draft is automatically restored after restart.

Saving uses the name/text snapshot present when Save was requested. Typing during pending IPC stays in the editor and remains dirty; a failed save leaves the text intact and shows a visible error beside the editor. A late open is canceled if the writer edited the current note while it loaded. Main-process revision checks reject stale overwrites. Only an explicit Save sends the document body for persistence; ordinary prediction requests still send only bounded prefix/context. Documents and preferences persist across restarts; ghost state does not.

Learning is off by default and separate from Save. Enabling never bulk-indexes notes. An enabled Save replaces one contribution; unchanged re-saves are idempotent. Turning learning off pauses personal predictions while retaining prior learned data. A save while off removes that note's old contribution, avoiding stale counts after later re-enabling. **Remove learning** keeps saved text; a later enabled Save may learn it again. **Reset personal learned data** clears all personal contributions and turns learning off, retaining notes and imports.

## Performance and errors

Never block the typing event loop on SQLite. Show a non-blocking import/reindex progress indicator and clear errors for invalid files. Drop stale suggestions on edits, source changes, cursor moves and updated settings. Test deterministic empty, loading and error states.

TND-004 uses a 60 ms trailing debounce and asynchronous named IPC. A monotonically increasing generation cancels display of old successes and failures after edits, cursor/selection/focus changes, source/settings operations, composition, dismissal or destruction. IPC work already sent cannot be aborted; late replies are ignored. A prediction failure leaves editing available and is retried after the next eligible edit or setting change. This design does not constitute an end-to-end latency measurement.
