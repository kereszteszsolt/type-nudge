# Testing and evidence

The source includes TND-001–007. [Release verification](releases/release-0.1-mvp/verification.md) records actual commands/results and platform limits; historical TND-001–006 timings do not verify the extended N=7 algorithm. Hosted GitHub Actions, other OS/architectures, physical IME and installer/signing/publication remain unverified or unprovided.

## Local checks

```bash
npm run typecheck
npm test
npm run package
npm run test:desktop
npm run benchmark:prediction
npm run benchmark:import
```

Run focused tests first, then full regressions. There is no separate lint command. Node/dependencies are pinned in the lockfile; `better-sqlite3` ships Node-API prebuilds and does not need a legacy node-gyp rebuild on the verified targets. `allowScripts` and Forge's module-specific rebuild exclusion retain that policy. Recheck native loading when changing versions/platforms.

## Pool and storage checks

```bash
npm test -- tests/unit/prediction.test.ts tests/integration/prediction.test.ts tests/integration/pool.test.ts
npm test -- tests/integration/storage.test.ts tests/integration/personal.test.ts tests/integration/worker.test.ts
```

Pure tests exercise all seven contiguous maximum-N choices, each context suffix, both top-X cutoffs, admitted-count sums, BINARY ties and exact weighted-selection boundaries with injected random values. They cover short/empty context, empty/singleton pools, virtual-context rollout, first-position prefix handling, alternative requests, bounded validation, deterministic-pool caching and LRU eviction. Random preview output is not cached. A shared 128-entry LRU holds per-N and merged pools, allowing unchanged short contexts to be reused within a continuation.

Real temporary SQLite fixtures verify source SUM before LIMIT (including shared candidates below each file's individual top X), 7+4=11, the documented 18/12 mixture and 60% boundary, no N labels on final rows, source activation/selection/consent and prefix Unicode normalization. They check actual primary-key range query plans, source-state/read-snapshot consistency, mutation/cache invalidation and rollback.

Storage checks index N=1–7 with six-token suffixes and sentence/line/document boundaries, transactional import/reindex/save replacement, source-specific deletion across all seven orders, exact 500,000/500,001-word and byte limits, unchanged reimport/resave idempotence and retained-copy reindexing. Import controls/UTF-8/path/link rules and source availability/conditional cleanup remain covered. Personal storage tests verify default-off consent, no learning from ordinary typing/opt-in alone, save-time replacement, forgetting/reset/deletion and independent imported counts.

A real schema-3 fixture preserves N=1–3 rows, import paths, learned/unlearned notes and preferences through migrations to schemas 4 and 5. Sparse N selections migrate to their maximum. Explicit retained-copy reindex and unchanged consented Save upgrade index coverage; an unrelated unlearned note stays unlearned. A failing trigger proves migration rollback. Schemas 1/2 and future-schema refusal have separate regressions.

The real worker test builds the production worker entry, starts a 500,000-word replacement, observes numeric progress/continuing main-thread ticks, reads the old committed source from a second connection, terminates the worker and reopens the unchanged index. A subsequent successful replacement reaches N=7 without partial counts. Client unit tests verify serialized operations, coalesced obsolete predictions, the 32-waiter bound, safe errors and worker failure/cleanup.

## IPC and editor checks

Main/preload tests validate the trusted window/main frame/entry URL, exact argument shapes, bounded Unicode/context/settings, UUIDs and booleans before privileged work. Renderer cannot choose arbitrary source sets/N/X in prediction queries, inject SQL/paths/consent or access Node. Async storage failures are sanitized. Import mutations keep their lock while a picker or final file check is pending.

CodeMirror state tests cover six-word context extraction, Unicode suffix preservation, sentence/line boundaries, multiple selections, midword/overlong tokens and debounce/out-of-order/ABA/destruction handling. The actual desktop suite covers Tab/Alt+Right/Alt+Enter acceptance, valid remaining previews, one-step undo, Alt+Down alternatives/singletons, dismissal, copy excluding ghost text, stale delayed IPC and synthetic composition. It uses valid-pool membership instead of assuming a deterministic random continuation. Settings/Help are hidden by default, restore focus natively and fit 520×480 with scrolling. Normal editing and About/support/source/document flows remain covered.

The large-import desktop case selects three real synthetic files: 500 KiB with 100 FF boundaries, 500,000 varied unique words and an exact 5 MiB file. It types while indexing, checks a main-process IPC response, numeric progress, renderer heartbeat, stored bytes/hashes/N counts, unchanged reimport, retained-copy rebuild, suggestions and restart. Measurements are observations rather than total-app-memory, physical-keyboard or worst-case guarantees.

## Packaged graphical runs

Build first and run the real packaged executable with a temporary profile:

```bash
TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge" npm run test:desktop
```

```powershell
$env:TYPENUDGE_EXECUTABLE = "$PWD\out\TypeNudge-win32-x64\type-nudge.exe"
npm.cmd run test:desktop
Remove-Item Env:TYPENUDGE_EXECUTABLE
```

The harness uses `chromiumSandbox: true`, removes inherited `ELECTRON_RUN_AS_NODE`, checks renderer Node/isolated-world separation, restrictive CSP, blocked fetch/popups and platform sandbox evidence. It stubs only OS picker returns and deliberate external-browser dispatch; filesystem/IPC/SQLite/import/learning are real. Controlled delayed handlers are restored by restarting Electron. User data is isolated and synthetic originals are left unchanged except intentional deletion fixtures. Screenshots/traces stay under ignored `test-results/`.

Packaged runs must include `storage-worker.js`, the matching physically unpacked SQLite prebuild, resource Apache license and bundled dependency notices. A Node DB open alone is insufficient evidence. Do not package concurrently with `dev`, which rewrites `.vite/`. Native browser dispatch, physical IME, assistive technology and untested targets need separate manual checks.

## Benchmarks

`benchmark:prediction` uses two bounded-vocabulary synthetic sources at 600 and 30,000 total words. Five fresh databases measure initial indexing/reindexing; 100 LRU-cleared and 1,000 warm queries measure the actual engine/repository with deterministic injected RNG. Validation/snapshot/cache/SQL are included; fixture construction, DB opening, IPC, debounce and painting are excluded. Warm hits reuse pools while production requests can resample.

`benchmark:import` starts one fresh Node process/database per fixture: 500,000 repeated words, deterministic varied words, 500,000 unique words and an exact 5 MiB mostly-padding text. It measures real selected-file read/decode, indexing/write/commit, unchanged reimport and retained-copy reindex. It validates stored full bodies/hashes/all-N counts and measures five LRU-cleared all-usable-N queries at preview lengths 1/3/10. It reports input bounds, runtime/hardware, SQLite file size, observed WAL size and whole-process peak RSS. RSS includes fixture construction/assertions/all operations and excludes separate Electron renderer/GPU processes; WAL observation is taken before close/checkpoint cleanup.

LRU-cleared does not flush SQLite/OS pages. One import/reindex sample and five prediction probes per fixture do not establish population percentiles, worst-case limits or other-platform speed. Returned pool/batch bounds do not cap SQL scan cost or derived SQLite/WAL disk use. Record actual costs and limitations in verification.

## CI

`.github/workflows/checks.yml` uses commit-pinned actions, Node 24.18.0 on Ubuntu 24.04, read-only contents permission, no persisted Git credentials and a 15-minute timeout. It runs locked installation, typecheck and unit/SQLite tests with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`; no GUI/package/publish job is configured. Hosted execution remains **Not run** until observed.

TND-007 multiplier/size regressions cover exact seven-value integer bounds (0–250), copied/frozen settings, zero/250 boundary values, omitted zero-weight orders, all-zero cold/warm-cache results without random draws, scaled final-cutoff/RNG results, raw per-N cache reuse with scale-dependent merged keys, rare N=7 evidence summed across files, unchanged stored N-grams/source metadata/index revision, and rollback/defaults for schema 4→5. Storage tests compare real DB/WAL/SHM file lengths, missing sidecars and missing DB errors. Packaged controls exercise sliders, manual entries and invalid values, retained settings after restart, actual weighted predictions, measured size metadata and 520×480 overflow. See the follow-up verification for OS-specific evidence.
