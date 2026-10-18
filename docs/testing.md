# Testing and evidence plan

TND-001–005 have focused runnable tests. Later-story items below remain planned. The authoritative runtime evidence and platform limits are in [Release 0.1 verification](releases/release-0.1-mvp/verification.md).

## Foundation checks

```bash
npm test
npm run typecheck
npm run package
npm run test:desktop
```

Vitest checks IPC argument/sender validation, empty/unsafe brand links, the named preload surface, and development/production request policies. Desktop tests use the installed Electron binary with `chromiumSandbox: true`, an isolated temporary user-data directory, and a real graphical session. Build first using `package`; the smoke harness then loads `.vite/build/main.js` without Vite. Do not run packaging concurrently with `dev`, which rewrites that same build directory.

TND-002 adds real temporary-file SQLite integration tests, with no mocked database: Unicode/NFC/apostrophe counts, sentence boundaries, source IDs/hashes/revisions, idempotent reimports, transactional replacement and rollback via a deliberately failing SQL trigger, retained-copy reindexing, independent cascading deletion, reopen/persistence, indexed prefix ranges, future-schema rejection, and import/storage resource limits. Malformed UTF-8, UTF-16, binary controls, unsupported extensions, missing files, directories, links, and traversal-style selections are covered. Focused IPC tests reject renderer paths/SQL, wrong sender frames and invalid IDs, and exercise dialog cancellation, serialized writes and recoverable failures.

The desktop suite checks startup, renderer Node isolation, isolated-world separation, sandbox evidence (Linux `/proc` seccomp/no-new-privileges; Electron process metrics on other systems), CSP, Unicode lines, selection, real clipboard copy/paste, undo/redo, Tab, About/Escape/focus restoration, named external-link dispatch, rejected URL injection, blocked remote fetch/popups, and a 520 × 480 window. It captures the actual editor under ignored `test-results/`. External browser launch is stubbed in the Electron main process so no support page is opened during automated checks. Native OS browser launching and physical IME composition require manual checks.

To exercise a packaged app directory with the same suite on Linux:

```bash
TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge" npm run test:desktop
```

Use the actual output path for your OS/architecture; this example is not a cross-platform packaging claim. A development smoke can also run after `npm run dev` builds the app, while its local Vite server remains running.

The TND-002 desktop flow stubs only the OS picker's return value; ingestion and SQLite are real. It imports valid and malformed synthetic files, repeats/updates an import, reindexes after removing the original, verifies one-source deletion, restarts Electron with the same temporary `userData`, and inspects the persisted DB. The packaged-executable run is required to catch missing native dependencies/unpacked files. The Node and Electron runtimes both opened the pinned native module; other OS/architectures remain unverified until actually run.

## Prediction core checks (TND-003)

```bash
npm test -- tests/unit/prediction.test.ts tests/integration/prediction.test.ts
npm run typecheck
npm run benchmark:prediction
```

The 48 pure/unit cases cover all seven nonempty N selections, disabled/unusable-order skipping, longest-context backoff, input bounds, Unicode normalization, equivalent cache keys, LRU eviction, empty/failed queries, revision/source/settings changes and immutable results. The 22 real SQLite integration cases cover exact cross-source aggregation, binary ties/top-three uniqueness, multilingual/supplementary prefixes, apostrophes, completed-word exclusion, sentence/document boundaries, disabled/unselected sources at all orders, primary-key query plans, source mutation/cache invalidation, rollback and read-snapshot consistency. The full `npm test` also runs the import/IPC regression suites.

The benchmark builds the actual core into ignored `.cache/prediction-benchmark/` and uses temporary DBs/synthetic text, never user data. It checks outputs and unchanged source metadata, then removes the temporary data. Desktop/packaging checks were not repeated for the main-process-only TND-003 story. TND-004 adds the editor-facing path and its own desktop evidence below.

## Inline suggestions and settings (TND-004)

```bash
npm test -- tests/unit/suggestions.test.ts tests/unit/prediction-ipc.test.ts tests/unit/sources-ipc.test.ts tests/unit/preload.test.ts tests/integration/storage.test.ts
npm run typecheck
npm run package
TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge" npm run test:desktop
```

Pure CodeMirror state tests exercise bounded caret/context extraction, sentence/line boundaries, selections/multiple carets/midword suppression, Unicode suffix preservation and long input. The async gate tests cover debounce, out-of-order/ABA replies, cancellation, failed replies and destruction. Main/preload tests reject renderer-selected SQL, paths, source IDs, N overrides, malformed/overlong words, nonempty-N violations, extra settings and untrusted senders. Real SQLite tests exercise transactional preference writes/rollback, persistence, source modes, idempotent activation and unchanged counts/other sources.

The real packaged Electron suite adds prefix/next-word/Unicode completion, all three keys, cycling wraparound, copy excluding ghost text, completion undo, persistent mode/N/activation, empty corpus and immediate N behavior. Controlled delayed IPC handlers exercise out-of-order typing replies, cursor movement, settings/source changes, dismissal while pending, failure/retry and synthetic IME composition. A delayed dialog plus delayed preference reply verifies that editing stays available and suggestions remain suspended until both operations finish. Those controlled handlers are test-only and restored by restarting Electron. Physical IME, accessibility hardware and other OS targets remain separately unverified.

## Personal documents and opt-in learning (TND-005)

```bash
npm test -- tests/integration/personal.test.ts tests/unit/documents-ipc.test.ts tests/unit/preload.test.ts
npm run typecheck
npm run package
TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge" npm run test:desktop
```

Thirteen real SQLite cases cover default-off/save-only behavior, unchanged saves, replacement counts, consent/activation/source modes, forget/reset/delete, restart persistence, shared resource budgets, schema-1 migration, stale revisions and rollback on a deliberately rejected N-gram write. Sixteen IPC cases validate the eight named operations, trusted sender, bounded document fields, UUIDs, exact boolean preferences, rejected path/SQL/consent injection and sanitized errors; the existing preload check includes their named bridge methods.

The packaged suite adds real Save/Ctrl+S/Open/New/Delete/Remove learning/Reset flows, stored text/count inspections, no indexing on ordinary typing or opt-in alone, off-state saves removing prior counts, personal prefix suggestions/deactivation, restart persistence and unchanged imported data. It checks discard cancellation, per-document undo isolation and a real window-close attempt with Keep editing. Controlled test-only delayed Save/Open replies prove later typing is retained and dirty; a failed Save leaves a visible error and preserves text. These last fixture handlers do not commit data and are separate from the production SQLite persistence checks.

## Later release test plan

| Scope | Planned approach | Story |
| --- | --- | --- |
| Electron main/preload boundary | Mocked IPC input validation, no Node/SQLite access in renderer, deny unexpected filesystem requests | TND-001 |
| Text ingestion/SQLite | Temp DBs, Unicode TXT/MD, safe limits, repeat import, per-source enable/delete/reindex | TND-002 |
| N-gram calculations | Deterministic fixtures for N=1/2/3, prefix, backoff, source filters, top 3 | TND-003 |
| Inline editor UX | CodeMirror tests/smoke for Tab, Alt+Down, Esc, stale requests, IME and normal shortcuts | TND-004 |
| Personal learning | Opt-in default off; save, resave without double count, disable learning and reset | TND-005 |
| Desktop delivery | Vitest, Electron smoke, packaged app launch and native `better-sqlite3` DB open on each verified OS, CI | TND-006 |

## Performance checks

Use reproducible small and medium corpora with documented word counts, number of sources, input prefix length, hardware and runtime. Capture warm/cold prediction latency and indexing time. Set sensible targets only after measuring a real application; **do not claim a benchmark or fast response from planned documentation**.

## Recording rules

Record actual OS, commands, result summaries and failures for the current story. If a target platform, packaging action or test was not run, write `Not run`. No paid services or secrets are needed; network access is not a feature requirement. Capture failures and limitations plainly.
