# Editor behavior

**Available through TND-007:** plain-text CodeMirror editing, imported and opted-in personal sources, inline completions, source/N controls, explicit document saving, Unicode input, wrapping, selection, copy/paste, undo/redo, and keyboard-accessible dialogs. Tab traverses focus when no suggestion is available. The editor has an accessible name and visible focus. Unsaved changes remain in memory; Save persists text locally and optionally learns from that saved snapshot.

The MVP is a simple **plain-text** editor with CodeMirror 6. It is not a code IDE, rich-text document creator or global keyboard assistant.

## Core keyboard interactions

| Action | Key | Required behavior |
| --- | --- | --- |
| Accept next pending word | `Tab` | Insert one word or only its missing suffix; retain a valid remaining preview |
| Accept configured leading words | `Alt + Right` | Accept up to K pending words in one undo step |
| Accept complete preview | `Alt + Enter` | Insert all pending words without a newline |
| Next suggestion | `Alt + Down` | Request a new continuation; prefer a different first word when alternatives exist |
| Dismiss current suggestion | `Esc` | Clear ghost text; preserve the typed text |

When no suggestion exists, keyboard input must behave normally. Never interfere with IME composition, selection, undo/redo, standard accessibility commands or document editing shortcuts. Test at caret boundaries, line breaks and non-Latin input.

## Settings panel

- **Prediction sources:** Imported Texts, My Writing, Combined; individual imported sources can be enabled/disabled. If all are disabled, show an informative empty state.
- **Maximum N:** slider 1–7; selecting M always includes N=1 through M. Default 3.
- **N-gram multipliers:** one slider and editable number per N=1–7, integers 0–250×, default 1× each. Apply only to virtual admitted-count scores before final top X; no stored counts change or reindex is needed. 0× removes that N’s contribution; if all usable weights are zero there is no suggestion. Higher orders apply when Maximum N and context permit them.
- **Database storage:** measured DB/WAL/SHM file lengths and total in Settings; **Refresh size** remeasures them. This is separate from the retained-text quota.
- **Pool size X:** 1–100, default 10; top X per N after combining sources, then top X after word-score summation. Selection is weighted by final score.
- **Preview words:** 1–10, default 3; pending words extend virtual context for each later prediction.
- **Words with Alt+Right:** 1 through preview count, default 2; reducing preview count clamps this value.
- **Learn from my writing:** independent, explicit opt-in (default off). No keylogger; saving a document triggers an optional index update.
- **Visible guidance:** short explanation of offline prediction, source status and keyboard hints; no intrusive AI marketing claims.

**Settings** opens a dismissible right-side modal panel, closed by default. It grows to 840 px on wide windows, with general prediction options and N-gram multipliers in two parallel columns; below a 760 px viewport it stacks in one column with scrolling. Database size and its refresh action share a wrapping row. **?** opens keyboard/pool Help. Both support Escape, scrolling on small windows and focus restoration. **Sources** holds individual imported-file activation controls. Preferences and activation persist in SQLite. **Documents** contains saved notes, the learning checkbox and each personal note's **Use** flag. **My Writing** queries enabled learned notes only while learning is on; **Combined** also queries active imports. Empty/inactive corpora show guidance. Import, document and preference operations suspend suggestions until all pending operations finish; the editor remains available.

`suggestions.ts` provides a focused CodeMirror view plugin, noneditable `aria-hidden` widget and highest-precedence conditional keymap. Display text uses `textContent`; the widget never enters the editor document or clipboard. Each one/K/all-word acceptance is one isolated undo step. Partial acceptance preserves the displayed pending suffix; edits or invalidating settings/source/selection changes discard it. Preview text stays stable while paused. Pending words never enter saved text or learning. Selection, midword carets, blur and composition suppress suggestions; normal editing shortcuts pass through. Composition start/end is exercised with synthetic DOM events; physical IME and assistive-technology checks remain manual work.

The renderer reads at most 4,096 UTF-16 units before the caret on its current line, drops a truncated initial token, and uses the same sentence/word rules as the index. It sends only a partial prefix and the last six completed words. Extremely distant context is intentionally ignored. Matching and suffix slicing share Unicode NFC/case/apostrophe normalization; acceptance retains the writer's original prefix.

## State and persistence

**New** starts an untitled document; **Save** or **Ctrl/Cmd+S** persists its name and text. **Documents → Open** reopens a saved note; switching resets undo history so undo cannot insert another note's content. A title `*` and footer indicate unsaved changes. New/Open ask before discarding them; Delete confirms removal of stored text/counts. Window close offers Keep editing or explicit discard through Electron's [will-prevent-unload handler](https://www.electronjs.org/docs/latest/api/web-contents#event-will-prevent-unload). No draft is automatically restored after restart.

Saving uses the name/text snapshot present when Save was requested. Typing during pending IPC stays in the editor and remains dirty; a failed save leaves the text intact and shows a visible error beside the editor. A late open is canceled if the writer edited the current note while it loaded. Main-process revision checks reject stale overwrites. Only an explicit Save sends the document body for persistence; ordinary prediction requests still send only bounded prefix/context. Documents and preferences persist across restarts; ghost state does not.

Learning is off by default and separate from Save. Enabling never bulk-indexes notes. An enabled Save replaces one contribution; unchanged re-saves are idempotent. Turning learning off pauses personal predictions while retaining prior learned data. A save while off removes that note's old contribution, avoiding stale counts after later re-enabling. **Remove learning** keeps saved text; a later enabled Save may learn it again. **Reset personal learned data** clears all personal contributions and turns learning off, retaining notes and imports.

## Performance and errors

Never block the typing event loop on SQLite. Show a non-blocking import/reindex progress indicator and clear errors for invalid files. Drop stale suggestions on edits, source changes, cursor moves and updated settings. Test deterministic empty, loading and error states.

TND-004 uses a 60 ms trailing debounce and asynchronous named IPC. A monotonically increasing generation cancels display of old successes and failures after edits, cursor/selection/focus changes, source/settings operations, composition, dismissal or destruction. IPC work already sent cannot be aborted; late replies are ignored. A prediction failure leaves editing available and is retried after the next eligible edit or setting change. This design does not constitute an end-to-end latency measurement.

**About → Ways to support** lists ways to help the maintainer (stars, shares, contributions or financial support); it is not technical support. This action appears only in About, with no persistent footer button. Opening About does not launch a browser; clicking a configured link uses the existing named HTTPS allowlist.
