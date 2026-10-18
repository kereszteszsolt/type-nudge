# Release 0.1 — Verification evidence

## State

**MVP implementation complete; locally verified on Linux x64/WSLg.** TND-001–006 have implementation and available-environment evidence below. Hosted CI, other native OS targets, installers/signing and publication remain outside that proof. Each section records the state when that story was verified.

| Story | Status | Source / unit checks | Desktop / packaging checks | Notes |
| --- | --- | --- | --- | --- |
| TND-001 | Implemented | 32 Vitest tests passed; typecheck passed | 5/5 desktop tests in each mode: development, production build, Linux x64 packaged executable (WSLg) | Foundation scope; see TND-002 for SQLite/import evidence; Windows/macOS Not run |
| TND-002 | Implemented | 67 tests passed, including 22 real SQLite integration tests and 13 source IPC tests; typecheck passed | 6/6 desktop tests passed in development and on the actual Linux x64 packaged executable (WSLg) | SQLite 3.53.4 through better-sqlite3 13.0.3; native files unpacked; Windows/macOS Not run |
| TND-003 | Implemented | 137 tests passed (70 focused prediction cases); typecheck and synthetic benchmark passed | Not run for this core-only story | Source-filtered prefix/backoff/ranking and bounded cache; no editor/IPC integration yet |
| TND-004 | Implemented | 167 tests passed (66 focused); typecheck passed | 10/10 tests passed on the actual Linux x64 packaged executable (WSLg) | Inline commands, persisted source/N controls, delayed-reply cancellation and synthetic composition; physical IME/Windows/macOS Not run |
| TND-005 | Implemented | 196 tests passed (30 focused); typecheck passed | 13/13 tests passed on the actual Linux x64 packaged executable (WSLg) | Local documents, default-off save-time learning, schema-1 migration, rollback/reset/deletion and unsaved/stale-IPC protection; Windows/macOS Not run |
| TND-006 | Implemented | 196 tests/typecheck and fresh-install CI commands passed; indexing/prediction benchmark recorded | 13/13 final packaged and 13/13 development checks; native SQLite/license audit passed | CI workflow configured; hosted CI/Windows/macOS/installers Not run; initial input discrepancy recorded below |

## Recording conventions

For each story, append a date, OS/runtime, exact command, fixture data, observed result, failures and blockers. Distinguish unit, real SQLite integration, Electron editor smoke, and packaged app launch. Benchmark measurements include input size and hardware. Any unrun environment remains **Not run**.

A successful git commit hash is recorded **only after** a commit is explicitly approved and actually created. Do not infer release readiness from this documentation baseline.

## TND-001 — 2026-10-18

Implementation was explicitly approved by the user's request to start TND-001. The worktree was clean before implementation. Separate approval to commit this implementation was received on 2026-10-18; the evidence below was recorded before that commit.

### Environment and dependencies

- Ubuntu 26.04 LTS, x86_64, WSL2 kernel `6.6.87.2-microsoft-standard-WSL2`, real WSLg display `:0` / `wayland-0`.
- Node `24.18.0` from `/home/zsolti-wsl/.nvm/versions/node/v24.18.0/bin`, npm `11.16.0`.
- Exact direct pins: Electron `44.9.0`, Forge CLI/Vite plugin `8.0.1`, Vite `8.3.4`, TypeScript `7.0.2`, Vitest `5.0.5`, Playwright `1.64.1`, CodeMirror state `6.7.6`, view `6.43.14`, commands `6.11.1`, Node types `24.19.2`. `package-lock.json` records resolved transitives and integrity hashes.
- `npm install --cache /tmp/type-nudge-npm-cache --no-fund --fetch-retries=1`: passed; 179 packages added, audit reported 0 vulnerabilities. Registry metadata was checked before choosing the pins. Installing dependencies requires network access; application editing does not.
- Electron's on-demand binary was fetched with `ELECTRON_CACHE=/tmp/type-nudge-electron-cache node node_modules/electron/install.js` (the Electron installer actually uses its default cache unless `electron_config_cache` is set).

### Local environment preparation and initial failures

The default shell had no Node on PATH. Subsequent commands used:

```bash
export PATH=/home/zsolti-wsl/.nvm/versions/node/v24.18.0/bin:$PATH
```

The first unprepared launch could not run: the execution sandbox denied binding `127.0.0.1:5173` (`listen EPERM`), and `ldd node_modules/electron/dist/electron` found missing `libnspr4`, `libnss3`, `libnssutil3`, `libsmime3`, and `libasound.so.2`. Network access and the graphical/local-port checks were run outside the execution sandbox after automatic approval. Electron's own renderer/Chromium sandbox stayed enabled throughout successful UI checks; no `--no-sandbox` workaround was used.

The missing Ubuntu packages were downloaded and extracted only into `/tmp`, without installing system packages:

```bash
mkdir -p /tmp/type-nudge-linux-deps
cd /tmp/type-nudge-linux-deps
apt-get download libnspr4 libnss3 libasound2t64
for package_file in ./*.deb; do dpkg-deb -x "$package_file" extracted; done
```

Downloaded versions: `libnspr4 2:4.38.2-1ubuntu1`, `libnss3 2:3.120-1ubuntu2.1`, `libasound2t64 1.2.15.3-1ubuntu1.1`. Back in the repository, GUI commands used:

```bash
export LD_LIBRARY_PATH=/tmp/type-nudge-linux-deps/extracted/usr/lib/x86_64-linux-gnu
```

### Checks and observed behavior

| Exact command | Observed result |
| --- | --- |
| `npm test` | Passed: 3 test files, 32 tests. Validates the two-operation preload, main-frame/window/URL sender checks, argument counts/types, allowlisted HTTPS link IDs, hidden empty/unsafe links, restricted bundled assets, and loopback-only development requests. |
| `npm run typecheck` | Passed. Application source, bridge types and unit/desktop tests checked with strict TypeScript. |
| `npm run dev` | Passed after the environment preparation above. Forge built main/preload and launched the real single-window CodeMirror editor on WSLg. Closed deliberately with Ctrl+C after smoke verification. |
| `npm run test:desktop` while `dev` was running | Passed: all 5 tests on the freshly restarted final development build, including CSS/typography checks and actual editor screenshot inspection. |
| `npm run package` | Passed: final Linux x64 app directory at `out/TypeNudge-linux-x64`, using ASAR, the completed theme and license resources. No installer was created. |
| `npm run test:desktop` after the final `package`, with Vite stopped | Passed: all 5 tests against the production main/preload/renderer (`file:` entry), with real Electron and Chromium sandbox enabled. |
| `TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge" npm run test:desktop` | Passed: all 5 tests against the actual packaged executable, with Vite stopped. |
| `cmp LICENSE out/TypeNudge-linux-x64/resources/LICENSE` | Passed. ASAR inspection also confirmed main/preload plus `/.vite/renderer/main_window/third-party-licenses.md` (10,411 bytes, including CodeMirror/MIT notices). |
| `git diff --check` | Passed. Final diff reviewed; generated builds, dependencies, test results and runtime data remain ignored. |

Desktop fixtures are synthetic: `Árvíztűrő tükörfúrógép — 日本語` and `A second line`. Tests exercise Enter, selection, real clipboard copy/paste, undo/redo, Tab focus traversal, About keyboard activation/Escape/focus restoration, package-sourced version `0.1.0`, hidden empty project website, support click dispatch, rejection of a URL passed instead of a link ID, blocked remote fetch/popups, and a 520 × 480 window. The first test also checks that Node/`process` are absent in the renderer, an isolated-world probe is absent from the page world, Linux renderer `/proc` reports `Seccomp: 2` and `NoNewPrivs: 1`, the CSP excludes inline-script/eval permissions, and both application CSS and CodeMirror theme are active. Tests use temporary user data and `chromiumSandbox: true`.

Early smoke attempts exposed incorrect test assumptions (a nonpublic preferences API, Linux-only absence of Electron's OS sandbox metric, CodeMirror's line DOM and hidden widget-buffer image, and lowercase simulated Shift+z). Those checks were corrected to public isolation APIs, Linux `/proc`, per-line/clipboard text, actual branding image selectors and Shift+Z. Visual inspection also found Vite's style nonce attribute was wrong and CodeMirror base CSS overrode initial loose typography selectors; the nonce was corrected and editor styles moved into `EditorView.theme`. Windows-mounted WSL file notifications then served an older module until `dev` was restarted; the final development run used a fresh process and passed all checks.

Actual screenshots are generated under ignored `test-results/`; no screenshot or generated runtime/build data is committed. The app package includes the unchanged Apache license plus generated bundled dependency notices, alongside Electron's own notices.

### Limits and Not run

- Verified environment is Linux x64 under WSLg. Native Windows, native Linux outside WSL, macOS, other architectures, installers, signing and release distribution: **Not run**.
- External-link dispatch is tested with `shell.openExternal` stubbed in the main process; no real browser/support website was opened. Native browser launch: **Not run**.
- Unicode text input is exercised; physical IME composition and assistive-technology testing: **Not run**.
- No prediction benchmark, SQLite/native-module test, import, save or learning check applied to TND-001. Those features were unimplemented at that story's verification point.

## TND-002 — 2026-10-18

Implementation approved by the user's request to continue with TND-002. Starting point: clean `dev_r0.1` at committed TND-001 (`6e0cfb7`). Separate approval to commit TND-002 after review was received on 2026-10-18; the evidence below was recorded before that commit. No TND-003 work was started.

### Environment, dependencies and checks

Same Ubuntu 26.04 x64 / WSL2 / WSLg environment, Node 24.18.0, npm 11.16.0, and temporary GUI library preparation as the TND-001 section. Direct pins added: `better-sqlite3@13.0.3`, `@types/better-sqlite3@9.6.0`, and `@electron-forge/plugin-auto-unpack-natives@8.0.1`.

Commands used the Node PATH and (for Electron) `LD_LIBRARY_PATH` exports recorded above. The graphical/local-port/package commands required the same execution-sandbox escalation; Electron's own sandbox remained enabled.

| Exact command | Observed result |
| --- | --- |
| `npm install --save-exact better-sqlite3@13.0.3 --cache /tmp/type-nudge-npm-cache --no-fund --fetch-retries=1` | Passed. Native package's published binary opened a real database. |
| `npm install --save-dev --save-exact @types/better-sqlite3@9.6.0 @electron-forge/plugin-auto-unpack-natives@8.0.1 --cache /tmp/type-nudge-npm-cache --no-fund --fetch-retries=1` | Passed; final dependency audit reported 0 vulnerabilities. npm emitted a pending install-script notice for better-sqlite3; no script approval was needed to use its included prebuild. |
| `node -e 'const Sqlite=require("better-sqlite3");const db=new Sqlite(":memory:");console.log(db.prepare("select sqlite_version() as sqlite").get());db.close()'` | Passed under Node 24.18.0; SQLite `3.53.4`. |
| `ELECTRON_RUN_AS_NODE=1 LD_LIBRARY_PATH=/tmp/type-nudge-linux-deps/extracted/usr/lib/x86_64-linux-gnu node_modules/.bin/electron -e 'const Sqlite=require("better-sqlite3");const db=new Sqlite(":memory:");console.log({electron:process.versions.electron,sqlite:db.prepare("select sqlite_version() as version").get()});db.close()'` | Passed under Electron 44.9.0; SQLite `3.53.4`. |
| `npm test` | Passed: 5 test files, 67 tests. Includes 22 integration cases with real temporary SQLite files, 13 source IPC cases, and the foundation regression checks. |
| `npm run typecheck` | Passed after implementation and desktop-flow additions. |
| `npm run dev` | Passed; real WSLg window with Sources dialog and native SQLite import. Stopped deliberately before packaging. |
| `npm run test:desktop` while `dev` was running | Passed: 6/6, including import, repeated/updated import, reindex from retained text, independent deletion and reopen persistence. Actual editor/source screenshots inspected. |
| `npm run package` | Passed: `out/TypeNudge-linux-x64`, native dependency preparation 1/1. Vite keeps SQLite external; Forge includes its runtime packages and auto-unpacks native binaries. |
| `TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge" npm run test:desktop` | Passed: 6/6 against the actual packaged executable with Vite stopped. Real SQLite import, counts, deletion and persistence survived the complete packaged flow. |
| `git diff --check` | Passed. Runtime databases, build output, synthetic inputs and screenshots remain ignored. |

ASAR inspection through `@electron/asar` found the `better-sqlite3` package/license and eight native prebuilds, all marked unpacked; Linux x64 was the one actually loaded/tested. No `.sqlite`, `.sqlite3` or `.db` runtime file was included. `resources/LICENSE` matched the unchanged project license. Presence of other OS prebuilds is not runtime verification for those OSes.

### Functional evidence and boundaries

The DB is `path.join(app.getPath('userData'), 'typenudge.sqlite3')`, initialized on first Sources access. Desktop checks compared `app.getPath('userData')` against the test's isolated temporary directory and inspected that exact DB. The renderer receives source summaries and safe operation results, never SQLite handles, raw paths, stored bodies or unrestricted SQL/FS calls.

Integration fixtures cover NFC accents (Hungarian/Romanian), apostrophes, punctuation, CJK runs, empty/BOM text, literal markup, malformed UTF-8, UTF-16, binary controls, unsupported extensions, missing files, directories, links, traversal, size/count/token limits, independent same-name sources, stable reimport identity, no inflated counts, edited-file replacement preserving activation flags, source deletion/cascades, retained-copy reindexing, reopen persistence, schema defaults/newer-version refusal, and indexed Unicode prefix ranges. A real SQLite trigger deliberately rejected a new count to prove rollback of old body/hash/revision/counts and index revision.

The Electron fixture selected `chosen-hu.txt` (`Árvíz árvíz tükör.`), `chosen-en.md` (`Other text.`), and malformed UTF-8. It observed recoverable errors, unchanged reimport, replacement with `Új szöveg.`, reindex after removal of the original file, rejection of 11 files, deletion of only the Hungarian source, preservation of the English source after restarting Electron, consent still `false`, and `PRAGMA integrity_check = ok`. Source operations did not weaken the editor isolation/CSP/clipboard/keyboard checks. The screenshot also verified the source dialog at the existing 520 × 480 test window.

Native OS file-picker return values were stubbed for deterministic selection; ingestion and DB operations were real. Manual file-picker interaction, native Windows/macOS, other architectures, native Linux outside WSL, release installers/signing and physical IME/assistive-technology checks: **Not run**. Ranking, source activation UI, cache, ghost text, editor saving and personal learning remain unimplemented later-story work. No prediction latency is claimed.

### One-pass indexing measurement

Synthetic fixtures only, one temporary on-disk SQLite DB, AMD Ryzen 9 3900X 12-Core Processor, WSL2 Linux x64, Node 24.18.0. Each fixture has unique `szó` + base-36 numeric suffix words, a sentence/line boundary after every 20 words, and one selected file. Times include file ingestion, hashing, tokenization and the transaction; they exclude Vite bundling and initial DB creation. The 25,000-word fixture was imported after the small fixture into the same DB. Inputs were checked unchanged using SHA-256 and removed afterwards.

| Tokens | UTF-8 bytes | Initial import | Identical reimport |
| --- | --- | --- | --- |
| 500 | 3,489 | 13.46 ms | 3.60 ms |
| 25,000 | 199,918 | 398.32 ms | 75.66 ms |

These are single local observations, not a latency target or a prediction benchmark. Exact measurement command (from the repository, after the PATH export above):

```bash
node --input-type=module <<'JS'
import { build } from 'vite';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
await build({configFile:false,logLevel:'silent',build:{outDir:'.cache/tnd002-benchmark',lib:{entry:{store:'src/main/storage/store.ts',ingest:'src/main/storage/import.ts'},formats:['cjs'],fileName:(_format,name)=>name+'.cjs'},rollupOptions:{external:(id)=>id.startsWith('node:')||id==='better-sqlite3'}}});
const require=createRequire(import.meta.url);
const { SourceStore }=require('./.cache/tnd002-benchmark/store.cjs');
const { importSelectedFiles }=require('./.cache/tnd002-benchmark/ingest.cjs');
const directory=await mkdtemp(path.join(os.tmpdir(),'typenudge-benchmark-'));
const store=new SourceStore(path.join(directory,'index.sqlite3'));
const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
try {
 console.log(JSON.stringify({cpu:os.cpus()[0].model,node:process.version,platform:os.platform(),architecture:os.arch()}));
 for(const tokens of [500,25000]) {
  const text=Array.from({length:tokens},(_,index)=>'szó'+index.toString(36)+(index%20===19?'.\n':' ')).join('');
  const filename=path.join(directory,tokens+'.txt');
  await writeFile(filename,text);
  const original=hash(await readFile(filename));
  let start=performance.now();
  const imported=await importSelectedFiles([filename],store);
  const importMs=performance.now()-start;
  start=performance.now();
  const repeated=await importSelectedFiles([filename],store);
  console.log(JSON.stringify({tokens,bytes:Buffer.byteLength(text),importMs:+importMs.toFixed(2),unchangedMs:+(performance.now()-start).toFixed(2),imported:imported.imported,unchanged:repeated.unchanged,inputUnchanged:hash(await readFile(filename))===original}));
 }
} finally {store.close();await rm(directory,{recursive:true,force:true});}
JS
```

## TND-003 — 2026-10-18

Implementation approved by the user's request to implement TND-003. Starting point: clean `dev_r0.1` at TND-002 commit `872c516`. Separate approval to commit TND-003 after review was received on 2026-10-18; the evidence below was recorded before that commit. The active scope is the main-process prediction core, not the TND-004 editor/IPC/ghost-text path.

### Environment and commands

Ubuntu 26.04 LTS x64 under WSL2, kernel `6.6.87.2-microsoft-standard-WSL2`, Node 24.18.0 / npm 11.16.0. SQLite is the existing `better-sqlite3` 13.0.3 native module (SQLite 3.53.4); no dependencies or schema versions changed. The shared normalization refactor preserves the stored token/count format. Test/benchmark databases were temporary files under the OS temp directory and were removed afterwards.

Commands from the repository used:

```bash
export PATH=/home/zsolti-wsl/.nvm/versions/node/v24.18.0/bin:$PATH
npm test -- tests/unit/prediction.test.ts tests/integration/prediction.test.ts
npm test
npm run typecheck
npm run benchmark:prediction
git diff --check
```

| Check | Observed result |
| --- | --- |
| Focused prediction tests | Passed: 48 unit cases and 22 real SQLite integration cases, 70 total. |
| Full `npm test` | Passed: 7 files, 137 tests, including the previous 67 import/IPC/storage tests. |
| `npm run typecheck` | Passed for application code, all tests and the new TypeScript benchmark. |
| `npm run benchmark:prediction` | Passed, with output/corpus invariants checked. Actual results below. The runner bundles into ignored `.cache/prediction-benchmark/` and measures the real core against on-disk SQLite. |
| `git diff --check` | Passed; only source/config/focused documentation and tests are candidates for version control. |
| Desktop / package / native OS targets | Not run for TND-003. No renderer/preload/IPC or native packaging configuration was changed. Earlier Electron/Linux package evidence belongs to TND-001/002. |

The first focused test attempts uncovered two test-harness issues: a generic Vitest spy did not preserve the repository callback's TypeScript return type, and the SQL-plan spy initially saved its original method after patching it, causing recursion. The harness was corrected; the final focused and regression suites passed. No failed check remains outstanding.

### What the tests prove

All seven nonempty N selections, insufficient-context skipping, longest-context preference, enabled-only backoff and no lower-order slot filling are checked. A real fixture has a bigram match that is deliberately bypassed when N=2 is disabled. Every N filters both requested IDs and persisted enabled flags. Frequencies are aggregated across sources before limiting, including a shared word outside each source's individual top three that becomes the global winner. Output is unique, at most three, with deterministic binary ties and display spellings.

Unicode checks cover Hungarian/Romanian accents, NFC decompositions, curly/straight apostrophes, expanding lowercase (`İ`) and supplementary Deseret letters. A fully typed word is not returned as an empty completion. Empty/unknown/disabled-only selections and empty corpora yield no candidates. Sentence, line and document boundaries remain unbridged in the existing counts; raw punctuation inside a completed context word is rejected.

Cache checks exercise normalized equivalent requests, context/prefix/source/N differences, empty-result caching, frozen output, failed-query retry, least-recently-used eviction, explicit clearing, unchanged imports, replacement/reindex/delete invalidation, and source activation changes even without an incremented index revision. A real WAL concurrency test changes activation on a second connection after snapshot creation and proves the current request still sees one consistent snapshot. A failed transactional replacement leaves cached previous counts/revisions valid.

`EXPLAIN QUERY PLAN` on the actual ranking statement confirmed a `SEARCH g USING PRIMARY KEY` with source/N/context equality and both candidate range bounds; no `SCAN g` was used. SQL returns `LIMIT 3`, source metadata is limited to 100 rows, and at most three enabled-order candidate queries execute. Exact aggregation still processes all matching indexed rows inside SQLite; this is not a constant-work or fixed-latency claim. Neither the full index nor stored source bodies enter the renderer.

### Reproducible prediction measurements

Run **`npm run benchmark:prediction`**. Environment reported by the runner: **AMD Ryzen 9 3900X 12-Core Processor**, Linux x64 / WSL2, **Node v24.18.0**. The two source bodies are synthetic `we write wordX.` sentences with a newline between sentences and `X = sentenceIndex % 500`. The small fixture has 100 sentences per source (600 tokens / 3,378 UTF-8 bytes total); the medium fixture has 5,000 per source (30,000 tokens / 177,798 bytes). There are two sources in each temporary DB, with at most 500 distinct `wordX` continuations; token count alone does not represent a high-vocabulary corpus.

Each case records **100 LRU-cleared samples** and **1,000 warm-LRU samples**, using `performance.now()` around the complete `engine.predict()` call. Times include input normalization, source/revision read transaction, cache lookup, and (on misses) SQLite aggregation/backoff. They exclude Vite bundling, fixture creation/indexing, assertions, and all Electron IPC/UI/painting. SQLite/OS pages were not flushed: “LRU cleared” does **not** mean cold disk/startup. Warm calls still refresh metadata. Result invariants and unchanged source metadata are checked; only synthetic input is used.

| Total tokens | Case | LRU cleared median / p95 (ms) | Warm LRU median / p95 (ms) |
| --- | --- | --- | --- |
| 600 | unigram | 0.1346 / 0.2452 | 0.0259 / 0.0600 |
| 600 | prefix | 0.1252 / 0.2329 | 0.0246 / 0.0435 |
| 600 | bigram | 0.1281 / 0.2421 | 0.0254 / 0.0361 |
| 600 | trigram | 0.1258 / 0.1635 | 0.0253 / 0.0317 |
| 600 | enabled-only backoff | 0.1354 / 0.1825 | 0.0251 / 0.0359 |
| 30,000 | unigram | 0.4891 / 0.6172 | 0.0255 / 0.0475 |
| 30,000 | prefix | 0.4792 / 0.5707 | 0.0241 / 0.0349 |
| 30,000 | bigram | 0.4699 / 0.5512 | 0.0244 / 0.0379 |
| 30,000 | trigram | 0.4746 / 0.5204 | 0.0252 / 0.0347 |
| 30,000 | enabled-only backoff | 0.4786 / 0.5248 | 0.0250 / 0.0349 |

Unigram uses no context/prefix; prefix uses `wo` and no context; bigram uses `['write']` + `wo`; trigram uses `['we','write']` + `wo`; backoff uses `['missing','write']` + `wo` with only N=1/3 enabled. Every fixture returned three expected candidates at the expected order. These are one local run's observations, not an end-to-end typing measurement, quality evaluation, worst-case corpus measurement or platform latency guarantee. Windows/macOS, editor/IME integration, source/settings controls, stale UI requests, personal learning and release delivery remain outside this story's proof.

## TND-004 — 2026-10-18

Implementation approved by the user's request to continue with TND-004. Starting point: clean `dev_r0.1` at TND-003 commit `c39892f`. Separate approval to commit TND-004 after review was received on 2026-10-18; the evidence below was recorded before that commit. Scope: connect the existing prediction core to CodeMirror, source activation and persistent source/N preferences. Document saving and personal learning remain unimplemented TND-005 work.

### Environment and commands

Ubuntu 26.04 LTS x64 / WSL2 kernel `6.6.87.2-microsoft-standard-WSL2`, WSLg `:0` / `wayland-0`, Node 24.18.0, npm 11.16.0. Existing pinned Electron 44.9.0, CodeMirror 6 and `better-sqlite3` 13.0.3; no dependencies, lockfile, packaging configuration or schema version changed. Shared prediction DTOs and pure Unicode helpers now live under `src/shared/`; index/backoff/ranking semantics are preserved.

```bash
export PATH=/home/zsolti-wsl/.nvm/versions/node/v24.18.0/bin:$PATH
npm test -- tests/unit/suggestions.test.ts tests/unit/prediction-ipc.test.ts tests/unit/sources-ipc.test.ts tests/unit/preload.test.ts tests/integration/storage.test.ts
npm test
npm run typecheck
export LD_LIBRARY_PATH=/tmp/type-nudge-linux-deps/extracted/usr/lib/x86_64-linux-gnu
npm run package
TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge" npm run test:desktop
git diff --check
```

The temporary Linux GUI libraries are the preparation documented under TND-001. The first sandboxed package attempt built all production Vite bundles, then failed with `TypeError: fetch failed` during Forge's copy/download stage. Packaging passed outside the execution sandbox after automatic approval, as did graphical checks. Electron's own Chromium sandbox stayed enabled; no `--no-sandbox` flag was used. After the final UI concurrency refinement, the package was rebuilt and all final checks passed. No failed check remains unresolved.

| Check | Observed result |
| --- | --- |
| Focused Vitest command above | Passed: 5 files, 66 tests, including existing boundary/storage regression cases. |
| Full `npm test` | Passed: 9 files, 167 tests. |
| `npm run typecheck` | Passed, including application and desktop harness. |
| `npm run package` | Passed: actual Linux x64 app directory under `out/TypeNudge-linux-x64`, native dependency prepared successfully. No installer was produced. |
| Packaged executable desktop command above | Passed: 10/10 tests in 13.7 seconds on the final build; real SQLite/import/prediction and restart paths exercised. |
| `git diff --check` | Passed. Generated packages, screenshots, dependencies and runtime databases remain ignored. |

### Behavior proved and fixture boundaries

- Focused CodeMirror state tests cover current-sentence/line context, at most two prior words, Unicode/apostrophe/NFC suffixes, 4,096-unit bounded extraction, long-word rejection, selections/multiple carets and midword suppression. Pure async tests cover debounce, out-of-order/ABA responses, cancellation, failures and destruction.
- Main/preload tests verify the named bridge, trusted window/frame/entry checks, bounded prefix/context and exact argument shapes. Renderer-supplied source IDs, N overrides, SQL/paths, unknown settings and an empty N set are rejected before storage. Recoverable DB errors are sanitized.
- Real SQLite tests verify mode/N persistence across reopen, transactional two-field rollback, personal consent still off, all source modes, idempotent one-source activation and unchanged content revisions/counts/other-source contributions. Source toggles advance the global prediction revision without reindexing.
- The packaged UI imports a synthetic corpus: `we write words. we write world. we write work. Árvíz árnyék.` Typing `we write wo` shows `rds`; Alt+Down cycles `rk`, `rld`, then wraps; Esc clears it; Tab inserts only the suffix. Clipboard checks exclude ghost text, and one undo restores the typed prefix. Next-word prediction and accented completion are also exercised against the real engine/SQLite.
- Actual UI checks cover independent N controls (last selected N cannot be disabled), immediate unigram/trigram behavior, Imported Texts/My Writing/Combined, explicit personal/empty corpus states, per-import activation, restart persistence and normal Tab traversal with no suggestion.
- Test-only delayed prediction handlers exercise newer typing, cursor movement, source/N changes, dismissal while pending, failure/retry and synthetic composition start/end through real IPC and CodeMirror. A controlled delayed preference response overlaps a pending picker; closing the Sources dialog leaves editing responsive, with suggestions/settings suspended until both complete. Those test handlers are restored by restarting Electron. Normal prediction/import/persistence tests use the production handlers; the OS picker selection alone is stubbed.
- Existing security/clipboard/editor/small-window/import checks remain passing. The Linux renderer still reports `Seccomp: 2` and `NoNewPrivs: 1`; Node/`process` remain absent, the bridge is frozen/narrow, remote fetch/popups stay blocked and CSP excludes inline script/eval permissions.

Actual screenshots under ignored `test-results/` include `inline-suggestions.png`; the completed editor/settings/ghost-text screenshot was visually inspected. No user documents, imported runtime files, screenshots or generated packages are added to version control.

### Limits and Not run

Native Windows, macOS, Linux outside WSLg, other architectures, installers/signing, physical IME input and assistive-technology hardware: **Not run**. Composition coverage uses synthetic DOM events, not a physical IME. Development-server mode was not repeated for this story; final UI proof uses the actual packaged production executable. External-browser dispatch remains stubbed as in earlier stories.

No new latency benchmark or worst-case typing/corpus measurement was run. The 60 ms debounce is an implementation setting, not a performance result; existing TND-003 measurements exclude IPC/UI. Already-sent IPC work cannot be aborted, and synchronous bounded database/index work still runs in main, outside the renderer event loop. My Writing has no learned corpus until TND-005; choosing it does not enable learning or persist session text.

## TND-005 — 2026-10-18

Implementation approved by the user's request to continue with TND-005. Starting point: clean `dev_r0.1` at TND-004 commit `78381a9`. Separate approval to commit TND-005 after review was received on 2026-10-18; the evidence below was recorded before that commit. Scope: local plain-text documents, unsaved-change protection and explicit opt-in save-time learning; CI/installers/release delivery remain TND-006 work.

### Environment and commands

Ubuntu 26.04 LTS x64 / WSL2 kernel `6.6.87.2-microsoft-standard-WSL2`, WSLg `:0` / `wayland-0`, Node 24.18.0 / npm 11.16.0, existing Electron 44.9.0 / `better-sqlite3` 13.0.3. No dependencies, lockfile or packaging configuration changed. SQLite schema advances to version 2 with a transactional `personal_documents` addition. Existing imported source identities, counts, stored text and settings are preserved.

```bash
export PATH=/home/zsolti-wsl/.nvm/versions/node/v24.18.0/bin:$PATH
npm test -- tests/integration/personal.test.ts tests/integration/storage.test.ts
npm test -- tests/integration/personal.test.ts tests/unit/documents-ipc.test.ts tests/unit/preload.test.ts
npm test
npm run typecheck
export LD_LIBRARY_PATH=/tmp/type-nudge-linux-deps/extracted/usr/lib/x86_64-linux-gnu
npm run package
TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge" npm run test:desktop
git diff --check
```

GUI libraries are the temporary preparation recorded under TND-001. Packaging/graphical checks used execution-sandbox escalation after automatic approval, following the previously established Forge/network and WSLg requirements. Electron's Chromium sandbox remained enabled. Both the first and final packaged desktop runs passed; after adding editor-visible save errors and input validation, the package was rebuilt and the final suite rerun. No check failed in this story's run.

| Check | Observed result |
| --- | --- |
| Initial focused personal/storage checks | Passed: 36 tests before adding two further personal resource/deletion cases. |
| Final focused personal/IPC/preload command | Passed: 3 files, 30 tests (13 real SQLite, 16 document IPC and 1 existing expanded preload case). |
| Full `npm test` | Passed: 11 files, 196 tests, including all earlier storage/prediction/editor-boundary regressions. |
| `npm run typecheck` | Passed for application and all test harnesses. |
| `npm run package` | Passed: actual Linux x64 application directory under `out/TypeNudge-linux-x64`; native SQLite prepared. No installer produced. |
| Actual packaged executable command | Passed: 13/13 Electron tests in 21.1 seconds on the final build. |
| `git diff --check` | Passed. Generated packages, temporary DBs/user data, test results and screenshots remain ignored. |

### Behavior and proof boundaries

- Real SQLite tests save/reopen exact Unicode/CRLF/literal-markup text with consent off and no N-gram rows. Enabling consent alone leaves unlearned notes unchanged. Enabled saves replace N=1/2/3 counts; unchanged re-saves preserve frequencies, revisions and cache identity. A SQL trigger deliberately rejects an indexed token and proves text/hash/revision/count/cache rollback, including a failed new-document save.
- Tests exercise Imported Texts/My Writing/Combined, consent pause/resume, per-document activation preserved through saves, forgotten/deleted/reset contributions and warmed-cache invalidation. Off-state saving removes that note's previous contribution. Forget/reset preserve saved text; reset turns consent off and leaves imported data intact. Deletion cascades one personal document/count set without affecting another.
- Persistence tests reopen the real DB with consent/activation/text intact. A schema-1 fixture containing real imported rows/counts upgrades to schema 2 without changing them. Updated future-schema tests refuse version 3. Expected revision checks reject stale saves. Combined quotas cover 100 sources/documents and 32 MiB stored UTF-8 text; individual notes are bounded to 1 MiB. Indexing limits are enforced only for enabled learning, permitting unlearned long-token text to be saved.
- The eight document IPC methods enforce the trusted window/main-frame entry, exact argument counts/keys, UUIDs, revisions, bounded names/text and real booleans. Payloads cannot inject paths, SQL, source IDs or consent through Save. Lists contain only at most 100 summaries; Open returns one body. DB/internal path failures are sanitized while safe conflict/limit messages remain actionable.
- The real packaged UI creates `Personal first` / `Personal second`, saves `private alpha`, replaces it with `private beta`, verifies exact unigram frequencies and shows a personal `pri` → `vate` completion. Ordinary typing and enabling consent do not persist/index the draft. It toggles personal activation, removes learning, cancels/confirms New, reopens exact text with a fresh undo history, pauses consent and saves `private gamma` without counts.
- Further UI checks reset personal data with both saved notes and imported counts retained, restart with consent still off, reopen `resettable note`, delete one saved note, and attempt native window close with unsaved text. The real close guard fires; the test stubs only the message-box answer to Keep editing and verifies the window/text remain. Fixture cleanup explicitly discards remaining unsaved text.
- Controlled test-only Save/Open handlers delay responses to prove typing after Save remains dirty and a late Open cannot overwrite new edits. A failed Save preserves text and shows an error beside the editor. These handlers do not prove storage writes; real persistence/learning cases use production handlers and SQLite. Earlier prediction/keyboard/CSP/sandbox/clipboard/import/small-window checks remain passing.

Actual ignored screenshots include `personal-documents.png`; the saved-document/learning/reset UI was visually inspected. Only synthetic fixtures were used; no user text, runtime database, generated package or screenshot is committed. No automatic filesystem collection, per-keystroke storage, clipboard capture or global hotkey hook was introduced.

### Limits and Not run

Native Windows/macOS, Linux outside WSLg, other architectures, installers/signing/CI, physical IME input, assistive-technology hardware and native support-browser launching: **Not run**. IME coverage remains the earlier synthetic composition checks. Development-server mode was not repeated; runtime proof uses the actual packaged production app.

No new indexing/typing latency benchmark was run; the existing TND-003 measurements are historical core-only observations. Database/index work remains synchronous in main, with asynchronous renderer IPC and stale-result protection. Saved documents are local SQLite data under `userData`, not exported filesystem files. Unsaved drafts are in memory only; forced termination/OS failure recovery is not implemented. Save with learning enabled is atomic: an indexing limit/failure keeps the previous saved revision, and the writer can disable learning to save within text-storage limits.

## TND-006 — 2026-10-18

Implementation approved by the user's request to continue with TND-006. Starting point: clean `dev_r0.1` at TND-005 commit `6c8ad27`. Separate approval to commit TND-006 after review was received on 2026-10-18; the evidence below was recorded before that commit. Changes are limited to a small CI workflow, reproducible indexing measurements/result assertions and release documentation. No application, schema, dependency, prediction or UI behavior was changed.

### Environment and commands

Ubuntu 26.04 LTS x64 / WSL2 kernel `6.6.87.2-microsoft-standard-WSL2`, WSLg `:0` / `wayland-0`, AMD Ryzen 9 3900X 12-Core Processor, 24 logical CPUs and 31.3 GiB memory visible to WSL. Node 24.18.0 / npm 11.16.0; existing Electron 44.9.0, `better-sqlite3` 13.0.3 and SQLite 3.53.4. GUI libraries and execution-sandbox escalation follow the TND-001 preparation; Electron's own Chromium sandbox remained enabled.

```bash
export PATH=/home/zsolti-wsl/.nvm/versions/node/v24.18.0/bin:$PATH
npm test
npm run typecheck
npm run benchmark:prediction
export LD_LIBRARY_PATH=/tmp/type-nudge-linux-deps/extracted/usr/lib/x86_64-linux-gnu
npm run package
TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge" npm run test:desktop
# Targeted investigation after the initial typing anomaly:
TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge" npm run test:desktop -- --grep 'edits Unicode plain text'
# A fresh full packaged run followed that targeted pass.
# Development launch, with an isolated temporary profile:
dev_profile=$(mktemp -d /tmp/typenudge-dev-XXXXXX)
npm run dev -- -- "--user-data-dir=$dev_profile"
# Separate terminal while dev/Vite was running:
npm run test:desktop
git diff --check
```

The development run used an isolated temporary profile and Forge's `q` command to stop the app/server after checks. The leftover profile was explicitly removed afterwards; the final cleanup probe confirmed no profile process and a closed Vite port. Package verification ran before dev, with no Vite server needed. `out/` remains a separate production copy; dev rewrites the root `.vite/` build and must be stopped before rebuilding it for production.

| Check | Observed result |
| --- | --- |
| Full `npm test` | Passed: 11 files, 196 tests, covering all import/index, prediction/cache, source settings, personal documents/learning and IPC/security checks. |
| `npm run typecheck` | Passed, including the expanded TypeScript benchmark and desktop harness. |
| `npm run benchmark:prediction` | Passed: exact expected N/top-three outputs, unchanged prediction-source metadata, indexing hashes/token counts/revisions and fixture cleanup checked. Results below. |
| Fresh local CI-like installation | Passed: `npm ci --no-fund`, typecheck and 196 tests with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` in an isolated temporary copy. Install added 183 packages and audited 184 with 0 vulnerabilities reported at that time. |
| Workflow validation | YAML parsed/reviewed: push/PR/manual events, read-only permissions, commit pins and install/typecheck/test steps. Hosted GitHub Actions: Not run. |
| `npm run package` | Passed: unsigned Linux x64 application directory under `out/TypeNudge-linux-x64`; no installer created. |
| Actual packaged executable suite | Final full run passed: 13/13 in 20.8 seconds. The real Electron main process opens/updates its `typenudge.sqlite3` under isolated `userData` through production import/save/restart paths. |
| Development `npm run dev` + suite | App/Vite launched successfully; 13/13 desktop tests passed in 15.2 seconds. Stopped deliberately after verification. |
| Package contents/license audit | Passed: all 8 shipped SQLite prebuilds are physically unpacked, including `better-sqlite3/prebuilds/linux-x64.node`; resource `LICENSE` equals repository `LICENSE`; bundled CodeMirror/MIT notices are present (10,411 bytes). Other prebuild filenames are not other-platform runtime proof. |
| `git diff --check` | Passed; generated builds, DBs, dependencies, profiles and screenshots remain ignored. |

The fresh-install check archived the tracked baseline to an OS temporary directory, overlaid the changed benchmark source, then ran the CI commands with the existing lockfile and a temporary npm cache. The fixture and its installed dependencies were removed afterwards. npm 11.16.0 emitted a non-blocking `allow-scripts` warning for `better-sqlite3`'s fallback install script; no manual script approval was applied, and real SQLite tests passed using the shipped Linux prebuild. This local Ubuntu 26.04 result does not claim a successful Ubuntu 24.04 hosted job.

### Initial discrepancies and subsequent checks

The first packaged suite was 12/13: the keyboard fixture `A second line` unexpectedly became `A secon d lineggg ` before clipboard actions. No source/test change was made to hide it. The same test passed with fresh user data on an unchanged package, followed by full packaged 13/13 and development 13/13 passes. The input anomaly's cause was not determined; it is recorded as a transient observed discrepancy, not a diagnosed/fixed application defect.

An initial ad-hoc archive audit looked for the legacy filename `better_sqlite3.node` and failed that assumption. Inspecting the actual pinned dependency showed platform-named files under `prebuilds/`; the corrected audit verified their unpacked metadata and physical files. No package contents were changed to satisfy that audit.

### CI scope and pins

`.github/workflows/checks.yml` uses Ubuntu 24.04, Node 24.18.0, npm lockfile installation and a 15-minute timeout. It skips downloading the Electron executable; unit/SQLite tests need no graphical session. Checkout credentials are not persisted, repository permission is `contents: read`, npm caching is enabled and superseded checks are canceled. There is no GUI/packaging/publishing job and no separate lint configuration; TypeScript is the static check.

The official v7 tag targets were resolved read-only through GitHub's public API: [checkout `3d3c42e`](https://github.com/actions/checkout/commit/3d3c42e5aac5ba805825da76410c181273ba90b1) and [setup-node `949feb2`](https://github.com/actions/setup-node/commit/949feb2413d6458794dcd2491c4babbbce0c15c1). Full commit IDs are pinned in the workflow. No GitHub run was triggered or advertised as green.

### Indexing and prediction measurements

Run `npm run benchmark:prediction` on the environment above. Each of two sources contains synthetic `we write wordX.` sentences, newline separated, with `X = sentenceIndex % 500`. The small fixture has 100 sentences/source (600 tokens / 3,378 UTF-8 bytes total), the medium 5,000/source (30,000 tokens / 177,798 bytes total). Continuation vocabulary is at most 500; these are modest bounded fixtures, not worst-case corpora.

Five fresh temporary DBs per corpus measure initial indexing of both sources and then retained-copy reindexing of both. Timers include tokenization/hashing and SQLite writes/commits; DB open/schema creation, corpus construction, file selection/decoding and assertions are excluded. Indexing p95 with five samples is simply the maximum observed sample.

| Total tokens / bytes | Initial indexing median / p95 (ms) | Reindex median / p95 (ms) |
| --- | --- | --- |
| 600 / 3,378 | 3.8941 / 9.7280 | 4.7127 / 5.0777 |
| 30,000 / 177,798 | 56.3546 / 67.1981 | 55.4716 / 62.3048 |

Prediction uses 100 LRU-cleared and 1,000 warm samples/case. Timers surround the actual `engine.predict` call, including normalization, source/revision snapshots, cache lookup and SQLite queries on misses. They exclude bundling/setup/assertions, Electron IPC, rendering, debounce and user typing. SQLite/OS pages are not flushed; `lruCleared` replaces the older output label `cold` to avoid implying cold disk/startup.

| Total tokens | Case | LRU cleared median / p95 (ms) | Warm median / p95 (ms) |
| --- | --- | --- | --- |
| 600 | unigram | 0.1327 / 0.2076 | 0.0263 / 0.0550 |
| 600 | prefix | 0.1244 / 0.1833 | 0.0244 / 0.0306 |
| 600 | bigram | 0.1504 / 0.2226 | 0.0264 / 0.0417 |
| 600 | trigram | 0.1270 / 0.1920 | 0.0261 / 0.0357 |
| 600 | enabled-only backoff | 0.1332 / 0.1826 | 0.0257 / 0.0425 |
| 30,000 | unigram | 0.4905 / 0.6873 | 0.0256 / 0.0420 |
| 30,000 | prefix | 0.4796 / 0.5186 | 0.0254 / 0.0423 |
| 30,000 | bigram | 0.4762 / 0.5337 | 0.0251 / 0.0384 |
| 30,000 | trigram | 0.4748 / 0.5075 | 0.0256 / 0.0301 |
| 30,000 | enabled-only backoff | 0.4843 / 0.5142 | 0.0253 / 0.0331 |

Unigram uses empty prefix/context and returns `we`, `write`, `word0`. Other cases use prefix `wo`; bigram context is `['write']`, trigram `['we','write']`, and enabled-only backoff `['missing','write']` with N=1/3. Expected continuations are `word0`, `word1`, `word10`, with the expected enabled order asserted. Source snapshots remain unchanged by prediction; reindexing retains hashes/token counts while advancing source revisions once.

### Release boundary and Not run

All six stories' implementation/available-environment criteria now have evidence. This completes the MVP's local Linux x64/WSLg implementation/verification scope. It is not a published release or a universal support claim. Hosted GitHub Actions, native Windows/macOS, native Linux outside WSLg, other architectures, installers/signing, physical IME, assistive-technology hardware and actual support-browser launch remain **Not run**. No release tag or uploaded binary exists from this work.

These measurements are one local run with limited vocabulary and uncontrolled system load; they are not quality, worst-case, end-to-end typing or cross-platform performance guarantees. GUI tests use the existing controlled dialog/delayed-handler fixtures described in TND-004/005. No user corpus was used, and no runtime files/screenshots/builds are committed.

## TND-006 follow-up — Windows native packaging, 2026-10-18

The user reported Forge failing to rebuild `better-sqlite3` on native Windows after commit `a6d3f98`. This follow-up fixes that packaging path within TND-006. No application behavior, dependency versions or lockfile changed. Separate approval to commit this follow-up was received on 2026-10-18; the evidence below was recorded before that commit.

### Cause and targeted fix

The pinned `better-sqlite3` 13.0.3 ships Node-API 10 binaries, including `prebuilds/win32-x64.node`. A native Windows Node 24.18.0 probe opened an in-memory SQLite 3.53.4 database and round-tripped Hungarian/Japanese text through that binary. The installed Forge/rebuild code nevertheless detected `binding.gyp` and attempted a source rebuild instead of recognizing this prebuild layout. A fresh Windows `npm ci` also attempted an implicit `node-gyp rebuild`; its log showed that Python 3.13.14 was found but no usable Visual C++ installation was available.

`forge.config.mjs` now uses `rebuildConfig.ignoreModules: ['better-sqlite3']`. `package.json` explicitly denies only that dependency's install script with `allowScripts: { "better-sqlite3": false }`, supported by the tested npm 11.16.0. Native files remain packaged/unpacked normally; other modules retain their usual rebuild behavior. Both settings must be revisited if the SQLite version or target platform changes. See the upstream [Node-API release notes](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0), [Forge rebuild configuration](https://www.electronforge.io/config/configuration#electron-rebuild-config) and [npm install-script policy](https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts/).

The existing tests now use host-valid file URLs, Windows junctions for final/ancestor link rejection, and invalid filename input without creating an OS-invalid file. Linux still checks a final file symlink. The desktop harness removes inherited `ELECTRON_RUN_AS_NODE` entirely, filters undefined environment values, and uses the existing Windows `Ctrl+Y` redo binding. No runtime shortcut or security-policy change was made.

### Environment, commands and isolation

Native Windows x64, Windows_NT `10.0.26100`, Node 24.18.0 / npm 11.16.0 / Electron 44.9.0, SQLite 3.53.4. Commands ran using Windows `C:\Program Files\nodejs\node.exe` and its `npm-cli.js`, invoked through WSL interop; builds and GUI tests were native Windows processes. The check used an isolated `out/windows-check-*` archive of `a6d3f98`, overlaid with the changed config/package/tests, rather than replacing the user's current dependencies. Its own npm cache was used.

The actual native command sequence was `npm-cli.js ci --cache <fixture>/npm-cache --no-fund`, `npm-cli.js run typecheck`, `npm-cli.js test` and `npm-cli.js run package`. Windows Node then set `TYPENUDGE_EXECUTABLE` to the packaged `.exe` and invoked `node_modules/@playwright/test/cli.js test` with `spawnSync` and inherited stdio. Equivalent PowerShell project commands are:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run package
$env:TYPENUDGE_EXECUTABLE = "$PWD\out\TypeNudge-win32-x64\type-nudge.exe"
npm.cmd run test:desktop
Remove-Item Env:TYPENUDGE_EXECUTABLE
```

Linux regression used a separate `/tmp/typenudge-linux-followup-*` archive with the same changed config/package/tests and the earlier Ubuntu 26.04 x64 / WSLg environment:

```bash
export PATH=/home/zsolti-wsl/.nvm/versions/node/v24.18.0/bin:$PATH
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --offline --cache /tmp/type-nudge-npm-cache --no-fund
npm run typecheck
npm test
npm run package
export LD_LIBRARY_PATH=/tmp/type-nudge-linux-deps/extracted/usr/lib/x86_64-linux-gnu
TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge" npm run test:desktop
```

Both suites used their existing isolated temporary `userData`, synthetic text, controlled file-dialog results and external-browser stub. Chromium sandboxing stayed enabled. The user's personal app profile/documents were not opened or changed.

### Final results and initial failures

| Check | Result |
| --- | --- |
| Clean native Windows `npm ci` after targeted policy change | Passed: 183 packages added, 184 audited; 0 vulnerabilities reported at that time. |
| Windows typecheck and unit/SQLite tests | Passed: typecheck; 196/196 tests in 11 files. |
| Native Windows x64 `npm run package` | Passed; no Visual C++ installation or source rebuild was needed. |
| Actual Windows packaged executable suite | Passed: 13/13, final run 13.2 seconds; includes import/reindex/delete, personal save/learning, restart persistence, editing, shortcuts, ghost text, IPC/security and stale replies. |
| Windows package audit | Passed: `win32-x64.node` is marked unpacked in ASAR and physically present with identical bytes to the dependency prebuild; resource `LICENSE` matches; 10,411-byte bundled notices include CodeMirror/MIT. |
| Clean isolated Linux install/typecheck/unit tests | Passed: offline install; typecheck; 196/196 in 11 files. |
| Linux x64 package and actual packaged suite | Passed: package; 13/13, final run 12.4 seconds. |
| Final diff/asset review | `git diff --check` passed; application source, dependency versions, lockfile, branding, legal notices, README diagrams and support section are unchanged. |

Initial Windows unit results were 193/196: a POSIX-only file URL, unavailable file-symlink privileges, and attempting to create a newline-containing filename caused fixture failures. The portable fixtures above passed on both OSes without skipped tests. The first Windows GUI launch inherited the host's `ELECTRON_RUN_AS_NODE=1` despite the old empty-string override; removing the variable allowed launch. The next GUI run was 12/13 because its redo assertion sent Linux's `Ctrl+Shift+Z` instead of the existing Windows `Ctrl+Y` binding. Both harness defects were corrected and the full suite then passed, including a final run after typechecking the environment filter. An intermediate typecheck rejected unfiltered `string | undefined` environment values; the explicit type guard fixed it before final checks.

An initial Windows archive-audit probe used POSIX separators and failed to locate a file through the platform-specific ASAR API; using `path.join` corrected the probe, with no package alteration. A first Linux typecheck attempt against the existing checkout was blocked by its currently Windows-only TypeScript dependency installation. All reported Linux passes instead used the clean isolated Linux installation; the existing checkout's `node_modules` was left intact.

The tested Windows application directory was moved intact to ignored `out/TypeNudge-win32-x64/`; its `type-nudge.exe` can be launched directly, with the full directory retained. A fresh native Windows launch from this final location passed: editor visible, `listSources()` returned `{ ok: true, value: [] }`, and a real `typenudge.sqlite3` existed in its own temporary profile. The initial ad-hoc assertion expected an unwrapped array; correcting it to the actual IPC reply shape passed without changing the app. The probe closed the app and removed its profile. Executable SHA-256: `cea8ef80a311884c854d01470725f6c208b00180eea6c3f0e88fe699821afe83`.

Final screenshots are under ignored `test-results/windows-native-followup/` and `test-results/linux-native-followup/`. Temporary verification checkouts/caches were removed afterwards; the final config/package/test files were byte-compared against both fixtures before cleanup. No installer, signature or publication was created, and no push was performed. Hosted CI, Windows development-server mode, macOS, native Linux outside WSLg, other architectures, physical IME and actual support-browser dispatch remain **Not run** in this follow-up. No performance benchmark was repeated.

## TND-006 follow-up — Larger text imports, 2026-10-18

Starting point: clean `dev_r0.1` at `8b09b0a`. The user reported a roughly 500 KB file as too long and requested larger-file testing after discussion of raising the limits. The original file/exact error was not supplied; all measurements below use synthetic data and do not claim validation of that original file. No separate commit approval has been received for this follow-up.

### Reproduction and resulting bounds

An initial Windows probe using unchanged application code reproduced `A file can contain at most 50,000 words.` with a 512,000-byte file containing 102,400 repetitions of `word`. No source/count was written. An exploratory process-local override confirmed that the same bytes can be imported with larger bounds; the production source was changed only after larger varied/unique-word probes completed.

Current TXT/MD import bounds are **250,000 words and 5 MiB per file**, **10 MiB per selection**, with the existing 10-file, 100-source/document, 32 MiB total raw-text and 128-code-point individual-word limits retained. Personal saves have an explicit independent `personalBytes` limit of **1 MiB**, used by both validation and storage; their existing save-size behavior is preserved. The higher token allowance also applies to opt-in personal learning within that save-size bound. Error messages derive their MiB values from the shared limits. No schema/dependency/IPC expansion, truncation or background-worker architecture change was introduced.

### Commands and environments

Native Windows x64, Windows_NT `10.0.26100`, AMD Ryzen 9 3900X / 24 logical CPUs / 63.93 GiB physical memory visible to Windows, Node 24.18.0 / npm 11.16.0, Electron 44.9.0, existing `better-sqlite3` 13.0.3 / SQLite 3.53.4. Windows `node.exe` and `npm-cli.js` were invoked through WSL interop. The focused root check ran typecheck, the storage/personal/prediction integration suites (63 checks before the additional personal case), and the new benchmark. Final full checks used fresh isolated archives with all changed/new source, script and test files overlaid; no existing dependency installation or personal app profile was replaced.

Equivalent native PowerShell commands:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run benchmark:import
npm.cmd run package
$env:TYPENUDGE_EXECUTABLE = "$PWD\out\TypeNudge-win32-x64\type-nudge.exe"
npm.cmd run test:desktop
Remove-Item Env:TYPENUDGE_EXECUTABLE
```

Windows fresh installation used a fixture-local npm cache and `--no-fund`. Linux regression used the earlier Ubuntu 26.04 x64 / WSL2/WSLg environment, Node 24.18.0 / npm 11.16.0, `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --offline --cache /tmp/type-nudge-npm-cache --no-fund`, typecheck, full tests and package. Its actual packaged executable suite ran with `TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge"` and the earlier GUI-library `LD_LIBRARY_PATH`. GUI suites were run sequentially across OSes to avoid sharing the clipboard concurrently.

### Import/index measurements on native Windows

`npm run benchmark:import` bundles `scripts/import-benchmark.ts`, then starts a fresh Node process and temporary SQLite DB for each fixture. Each operation is timed once: real selected-file import, unchanged reimport, retained-copy reindex. Import includes file/parent checks, reading, UTF-8 decoding, tokenization, hashing and committed SQLite writes. Corpus generation, file creation, schema creation and assertions are outside the timers. Whole-process peak RSS includes setup, fixture/assertion allocations and all operations, and excludes Electron renderer/GPU processes.

| Fixture | UTF-8 bytes / words | Import (ms) | Unchanged reimport (ms) | Reindex (ms) | Peak RSS (MiB) | DB bytes after close |
| --- | --- | --- | --- | --- | --- | --- |
| Repeated short word, 500 KiB | 512,000 / 102,400 | 171.15 | 162.13 | 161.52 | 64.73 | 573,440 |
| Seeded varied Unicode words, 500 KiB | 512,000 / 66,705 | 1,607.89 | 194.83 | 1,894.23 | 233.61 | 22,614,016 |
| Unique-word stress, 125k | 1,499,979 / 125,000 | 2,855.54 | 415.00 | 3,971.43 | 465.96 | 66,322,432 |
| Unique-word stress, 250k | 2,999,979 / 250,000 | 6,073.25 | 848.24 | 8,495.86 | 552.95 | 132,521,984 |
| Exact 5 MiB byte bound, mostly spaces | 5,242,880 / 3 | 96.34 | 30.14 | 22.58 | 108.15 | 5,308,416 |

The varied fixture uses a fixed seed (42) and a 4,096-word synthetic Unicode vocabulary; it has 4,099 unigrams, 66,565 bigrams and 66,701 trigrams including a known three-word header. The unique 250k fixture has 749,994 N-gram rows. All cases assert full stored body/byte length/hash, exact total N frequencies, unchanged reimport metadata/counts, retained-copy reindex revision +1, unchanged input bytes and known trigram output. No corpus is loaded into the application renderer by the implementation.

Five LRU-cleared prediction probes per order are also recorded; SQLite/OS pages are not flushed. Median / maximum milliseconds:

| Fixture | N=1 | N=3 |
| --- | --- | --- |
| Repeated 500 KiB | 0.10 / 1.61 | 0.12 / 1.60 |
| Varied 500 KiB | 2.37 / 4.66 | 0.12 / 1.59 |
| Unique 125k | 80.53 / 101.80 | 0.15 / 1.91 |
| Unique 250k | 192.36 / 195.27 | 0.15 / 1.91 |
| 5 MiB byte bound | 0.10 / 1.57 | 0.16 / 1.61 |

These are single-operation observations/five prediction samples on one machine, not stable percentiles, quality estimates or worst-case guarantees. The 5 MiB fixture is a byte-boundary check, not representative prose. The earlier exploratory single-import 250k probe peaked near 391 MiB; the committed benchmark's 552.95 MiB peak covers reimport/reindex and assertions too. The 32 MiB budget caps raw source text rather than derived SQLite/index/WAL size; the unique 250k test produced a 126.38 MiB DB from roughly 3 MB of input.

### Final automated and packaged results

- Clean Windows and Linux installations: 183 packages added / 184 audited on each; 0 vulnerabilities reported at that time. Dependency versions and lockfile unchanged.
- Typecheck and full unit/SQLite suites: **200/200 in 11 files on each OS**. Exact 250,000-word, 5 MiB/file and 10 MiB/selection bounds are accepted; over-limit files/batches/words and oversized individual words are rejected without altering previous contributions. A 500 KiB opt-in personal save preserves exact frequencies across re-save within its unchanged 1 MiB save budget.
- Actual native Windows x64 package: **14/14 desktop checks, 31.9 seconds**. The new large-import test passed in 19.4 seconds.
- Actual Linux x64/WSLg package: **14/14 desktop checks, 25.1 seconds**. The new large-import test passed in 13.1 seconds.
- The new packaged test selects three real synthetic files together: 512,000 bytes / 102,400 words; 2,999,979 bytes / 250,000 unique words; 5,242,880 bytes / 3 words. It checks complete body/hash/byte/count persistence, unchanged reimport, reindex with stable frequencies, real ghost text and restart persistence with unchanged input files. Only the OS dialog return is controlled; real ingestion, SQL and prediction run in packaged Electron. Chromium sandboxing is enabled and all user data is isolated.
- Initial three-file import, measured from UI click to completion: Windows **6,344.04 ms**, renderer interval maximum gap **74.60 ms** / 126 ticks, main-process peak RSS at that point **348.03 MiB**; Linux **4,495.98 ms**, renderer gap **50.30 ms** / 89 ticks, main-process peak **404.13 MiB**. These do not measure physical keyboard dispatch, total app memory or later reindex peaks.
- Windows archive audit passed: SQLite `win32-x64.node` marked/physically unpacked and byte-identical, resource Apache license matches, and 10,411-byte bundled notices contain CodeMirror/MIT.

The first Windows desktop run was 13/14 because the new measurement callback accidentally referenced imported Node `performance` inside a serialized renderer function. It failed before import; qualifying `window.performance` and aliasing the Node timer fixed only the test harness. The final full suites above passed on unchanged packaged binaries after that correction. No application defect was hidden or assertion skipped.

### Delivered artifact and remaining limits

At that stage the tested Windows app directory was retained separately at ignored `out/TypeNudge-win32-x64-large-import/`, preserving the existing normal build and user session. This temporary delivery is superseded by the normal-package follow-up below. A fresh native launch from the final location successfully imported a 512,000-byte / 102,400-word file through the real preload/IPC/import path with its own temporary profile, then closed and removed that profile. App archive SHA-256: `af4a4a3ecb1907419fc84ebab9b07db8642d16feaeb9a048f6bac26b7e1e9680`.

Actual screenshots/metric attachments are under ignored `test-results/windows-large-import/` and `test-results/linux-large-import/`. Final source/config/test files were byte-compared against both verified fixtures. Temporary verification checkouts/caches and exploratory probe files were removed after checks; no real user corpus/profile was accessed. The diff/notice review keeps README diagrams/support, branding, legal notices and unrelated files intact. No commit, push, installer, signature or publication is part of this work.

Indexing/reindexing and prediction queries remain synchronous in main; diverse large imports can occupy it for seconds, and the broad unique-word unigram query took around 192 ms. Renderer interval evidence does not guarantee main-process/window-action or physical typing responsiveness. Background indexing/performance redesign is outside this change. Hosted CI, other OS/architectures, original-file validation, physical IME and actual external-browser launching remain **Not run**. The existing small-corpus prediction benchmark was not repeated because its algorithm is unchanged.


## TND-006 follow-up — Control characters and normal Windows package, 2026-10-18

The user identified FF (form feed, U+000C) in an imported text and requested that similar characters be ignored without a new build for every character. They also requested that larger imports be part of the normal build, with no separate `large-import` variant, and confirmed saving/closing the running old variant before artifact replacement.

### Import policy and checks

- The UTF-8 decoded import copy maps FF/VT/NEL and Unicode LINE/PARAGRAPH SEPARATOR to LF. All other Unicode `Cc` controls (the complete C0/C1 ranges including NUL/DEL), except ordinary TAB/CR/LF, become spaces. Using separators avoids joining unrelated words; page/line boundaries reset N-gram contexts.
- Unicode format marks, soft hyphens, zero-width/bidirectional marks, unusual spaces and symbols remain accepted. The existing word tokenizer excludes them from word tokens and treats them as separators; their stored text is preserved. No language-specific segmentation or blanket deletion of joiners was added.
- Only the retained import copy is cleaned. Original selected files remain unchanged; content hashes and reindexing use the cleaned local body. Reimport of an equivalent cleaned body is unchanged. File/selection limits still count original bytes, preventing a batch-budget bypass when cleanup shrinks UTF-8 text. Fatal UTF-8 decoding, extension/path checks and all other resource bounds remain enforced. No schema/dependency/IPC or personal-editor behavior change was introduced.
- Focused Windows typecheck passed. Storage checks passed **34/34**, including exhaustive C0/C1 handling, Unicode line/paragraph separators, ordinary whitespace preservation, 26 format/space/symbol examples, original-file immutability, stable reimport/reindex frequencies and raw batch limits. One interim assertion used in-memory N-gram field names instead of SQLite column names; correcting only that test expectation passed.
- The actual packaged large-import test now includes **100 FF characters in its 512,000-byte / 102,400-word source**, asserting the cleaned body/hash/counts and no page-crossing N-grams, unchanged reimport, original-file immutability and restart persistence. Its other real inputs remain 250,000 unique words and a 5 MiB byte-boundary fixture.

### Commands and environment

Same native Windows x64 / Windows_NT 10.0.26100, Node 24.18.0 / npm 11.16.0, Electron 44.9.0 and better-sqlite3 13.0.3 environment as the preceding follow-up. Linux checks use Ubuntu 26.04 x64 under WSL2/WSLg with the same pinned runtimes and the previously documented temporary GUI-library path. Both clean verification checkouts are generated from HEAD with all changed/new source, scripts and tests overlaid; each uses its own dependencies, synthetic files and temporary app profiles.

Commands: `npm ci --no-fund` (Windows fixture-local cache; Linux `ELECTRON_SKIP_BINARY_DOWNLOAD=1` with `--offline --cache /tmp/type-nudge-npm-cache`), `npm run typecheck`, `npm test`, `npm run package`, then `TYPENUDGE_EXECUTABLE` targeting that package and `npm run test:desktop`. Windows uses native `node.exe`/`npm-cli.js` through WSL interop; GUI suites run sequentially across OSes. Both clean installs added 183 packages / audited 184, reporting 0 vulnerabilities at that time. Both typechecks and complete unit/SQLite suites passed **206/206 in 11 files**.

### Packaged results and delivered artifact

| Check | Result |
| --- | --- |
| Actual Windows x64 package | Passed; final full suite **14/14 in 31.2 seconds**, large/control import case 18.4 seconds. |
| Actual Linux x64/WSLg package | Passed; final full suite **14/14 in 25.3 seconds**, large/control import case 13.3 seconds. |
| Windows three-file UI import | 6,132.58 ms; renderer interval maximum gap 63.70 ms / 122 ticks; main-process peak RSS at that point 350.64 MiB. |
| Linux three-file UI import | 4,514.56 ms; renderer interval maximum gap 50.70 ms / 90 ticks; main-process peak RSS at that point 405.61 MiB. |
| Windows native/license archive audit | SQLite Node-API binary is marked and physically unpacked, matching the installed prebuild; resource Apache license matches; bundled notices contain `@codemirror/` and MIT, 10,411 bytes. |
| Normal-path native Windows smoke | Passed: fresh launch from `out/TypeNudge-win32-x64/type-nudge.exe`, real bridge/IPC/SQLite import of 102,406 words with 100 FFs plus NUL/C1/Unicode line/paragraph controls, exact cleaned text/hash/bytes, unchanged selected file, temporary profile removed after closing. |

The initial full desktop runs on each OS were **8/14**. Linux unexpectedly copied `we write wox` instead of `we write wo`; Windows copied the whole page instead of the expected completed editor text, with unexpected `we write woke` in the page. These are observed input/focus discrepancies, with cause undetermined. After the first assertion failed, worker restarts created fresh profiles and five later editor checks lacked fixtures populated by earlier tests. The independent large/control import case passed in both initial runs. Failure traces are retained under ignored `test-results/linux-control-import-initial/` and `test-results/windows-control-import-initial/`. A fresh full run on each **unchanged package and unchanged test source** then passed 14/14; `--max-failures=1` was used only to stop further cascades if the anomaly repeated. No assertions were relaxed or skipped, and no application keyboard/focus change is claimed. An initial archive-audit probe searched for capitalized `CodeMirror`; the generated notices use `@codemirror/`, and correcting the probe passed without modifying the package.

The final Windows package replaces the previous normal directory at ignored **`out/TypeNudge-win32-x64/`** and contains both larger imports and control-character cleanup. The superseded generated `out/TypeNudge-win32-x64-large-import/` variant is removed after the user saved/closed it and a process check confirmed no Windows TypeNudge was running. Existing user documents/profiles and the existing root Linux artifact are preserved; only temporary verification builds/profiles and superseded generated Windows directories are cleaned up. The Windows app archive SHA-256 is `0707526e91752bfdde79d2ad26e69ac76e0d399e80d959c506a83328b53f58e5`.

Final screenshots are under ignored `test-results/windows-control-import/` and `test-results/linux-control-import/`. Changed/new runtime, script, configuration and test files were byte-compared against both verified checkouts before cleanup. Diff/notice checks preserve README Mermaid diagrams and its full license/support footer, branding, dependency versions and lockfile. No commit, push, installer, signature or publication was performed.

The import benchmark was not repeated; the earlier measurements above describe its earlier revision. New packaged import observations cover this cleanup change, but interval/main-RSS samples are not total app memory, physical typing or worst-case latency guarantees. Main-process indexing remains synchronous. Original user-file validation, hosted CI, macOS/other architectures, physical IME and actual external-browser launching remain **Not run** in this follow-up.


## TND-006 follow-up — Unavailable imported sources, 2026-10-18

The user requested a per-source cleanup action only when the original file is unavailable and a stored index exists. This follow-up retains the preceding uncommitted larger-import/control-character fixes. No new release/story, global clear, automatic deletion, directory scan or background watcher was added.

### Behavior and compatibility

- Schema **3** adds main-only `imported_files(source_id, original_path)` with a cascading foreign key. Successful explicit import remembers its canonical path in the same transaction as the text/counts; unchanged explicit reimport also backfills the location without changing content/index revisions or counts. Migration preserves prior imported/personal text, counts and settings. Previous schema-2 executables refuse an upgraded database; no downgrade is attempted.
- Old entries have unknown availability: only a path hash was retained previously, so their original paths cannot be reconstructed. Ordinary Delete remains available, and explicit reimport enables checks without guessing/scanning paths.
- Opening Sources / **Check files** invokes a no-argument, trusted-frame IPC request. Only those remembered paths are probed asynchronously using stat plus read-only open/stat/close, without reading bodies. Each check returns unknown after 1.5 seconds if the filesystem has not replied. Missing file/parent and denied access are distinguished from other errors/timeouts; unknown does not authorize conditional cleanup. Ordinary metadata/prediction reads remain free of filesystem probes. Paths are never returned to the renderer.
- A missing/unavailable source with actual N-gram rows shows **Clear index** in place of ordinary Delete. Empty/unindexed, available or unknown sources keep Delete. The UUID-only cleanup handler holds the existing mutation lock, rechecks availability/index existence, then transactionally deletes the source, stored body, all N=1/2/3 rows and location metadata, advancing index revision. Restored files refuse conditional cleanup and refresh the row. Other imports/personal documents remain intact; no original file/directory is deleted.
- The Sources dialog now displays import limits from shared constants; its former hardcoded 1 MiB / 4 MiB copy was stale after the preceding larger-import change. Rows/buttons wrap in the existing small-window layout.

### Verification

Environments, pinned runtimes and commands match the preceding Windows/Linux follow-up: native Windows x64 / Node 24.18.0 / npm 11.16.0 and Ubuntu 26.04 x64 under WSL2/WSLg. Each clean isolated checkout uses HEAD plus all changed/new runtime, configuration, scripts and tests; no existing dependency installation or personal profile is replaced. Commands: `npm ci --no-fund` (Windows fixture-local cache; Linux `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --offline --cache /tmp/type-nudge-npm-cache --no-fund`), `npm run typecheck`, `npm test`, `npm run package`, then `TYPENUDGE_EXECUTABLE` pointing to that actual package and `npm run test:desktop -- --max-failures=1`. GUI suites run sequentially; sandboxing remains on.

- Focused Windows checks: typecheck and **35/35** file-status, SQLite migration/cleanup, preload and source-IPC cases passed. Final read-only-open probing separately passed the 14 file-status/SQLite cases. An interim test typecheck assumed document summaries expose a source ID; the fixture now queries its real SQLite foreign key instead, without changing application behavior.
- Clean installs: 183 packages added / 184 audited, 0 vulnerabilities reported on each OS at that time. Dependency versions and lockfile are unchanged.
- Full typechecks and unit/real-SQLite suites: **225/225 in 13 files on each OS**. Coverage includes unknown/denied/timed-out checks, persistent canonical paths and path privacy, lossless schema-1/2 migration, unchanged-reimport backfill, restored-file refusal, empty-source refusal, directory replacement, scoped cascading cleanup, rollback and cached prediction invalidation while retaining other imported/personal counts.
- Actual Linux x64/WSLg package: **15/15 desktop checks in 27.4 seconds**. The new independent availability test passed in 1.6 seconds.
- Actual Windows x64 package: **15/15 desktop checks in 34.1 seconds**. The new independent availability test passed in 2.0 seconds. Both full suites passed on their first attempt in this follow-up; no assertions were skipped or relaxed.
- The new UI case imports two nonempty sources and one empty source, deletes only its temporary originals, verifies conditional/absent Clear index buttons, rejects cleanup after restoration, checks unchanged SQL counts on refusal, then clears only the missing indexed source. Source/text/N-gram/path rows are all absent afterwards; other source counts and files survive restart. The actual 520 × 480 dialog has no horizontal overflow and its screenshot visibly shows the missing source and Clear index action.
- Windows archive audit passed: unpacked native SQLite bytes match, Apache resource license matches, and 10,411-byte bundled notices retain `@codemirror/` / MIT. App archive SHA-256: `ed929fc896e50bf13ca2a48df0570782bc1054ecc280b717b559a89bf3ea8a4b`.

After the user confirmed saving/closing TypeNudge and a process check found no Windows TypeNudge process, the tested app directory replaced normal **`out/TypeNudge-win32-x64/`**. The same availability test passed again from that final executable location with an isolated temporary profile, including real DB creation, import, restored-file refusal, scoped cleanup and restart. No real user corpus/profile was opened, migrated or cleared during verification. The existing root Linux artifact is preserved.

Screenshots are retained under ignored `test-results/windows-source-availability/`, `test-results/linux-source-availability/` and `test-results/windows-source-availability-final/`. Runtime/configuration/HTML/CSS/test bytes were compared with both verified checkouts before cleanup. Temporary checkouts/caches/profiles and the superseded normal build backup were removed after final-location verification. README Mermaid/license/support footer, branding, legal notices and the dependency lockfile are preserved; final diff/notice checks passed. No commit, push, installer, signing or publication was performed.

No core prediction/import benchmark was repeated: their algorithms and numeric bounds are unchanged from the preceding follow-up, and the packaged large/control-import regression remains part of both 15-test suites. No new latency/memory guarantee is claimed. Hosted CI, other OS/architectures, physical IME, real-file permission ACL manipulation and actual external-browser dispatch remain **Not run**. Denied-read permission paths are tested deterministically at the filesystem boundary; the real packaged tests exercise actual deletion/restoration.


## TND-007 — Specification, 2026-10-18

Created [TND-007 — Prediction controls, N=1–7 and multi-word suggestions](stories/TND-007-prediction-controls-and-multiword-suggestions.md) at the user's request. Status is **Planned**. The existing TND-001–006 baseline and executable remain unchanged; no TND-007 implementation or commit is represented by this documentation.

Confirmed requirements include virtual runtime combination of selected per-source N-gram counts, cross-file aggregation before per-N top-X selection, merged raw-count scores, final top-X score-weighted sampling, mandatory lower N through a maximum of 7, multi-word virtual-context lookahead and one/several/all-word acceptance, hidden settings/keyboard help and 500,000-word indexing with unchanged byte limits. The user's example is retained exactly: `[a,b] -> C` with counts 7 and 4 contributes one combined entry of 11. Only selected/eligible files containing that context contribute; no physical merged source or full renderer index is created.

The story records proposed numeric defaults and shortcuts, migration/reindex compatibility, unchanged learning/privacy rules, bounded indexing/prediction work, and required SQLite/resource/packaged checks. Optional diagnostics/repetition reduction are suggestions rather than accepted extra implementation scope. README/release/roadmap/workflow links distinguish the implemented baseline from the planned follow-up; the former extended-N experiment is linked to TND-007.

Checks run: `git diff --check` passed; a local Python check resolved relative documentation links, verified README Mermaid blocks and its entire license/support footer against HEAD, confirmed all changed/new files are Markdown and that the Git index is empty. Application typecheck/unit/SQLite/UI tests, N=7/500k benchmarks, migration and packaging are **Not run** for TND-007 because this phase only creates the specification. Earlier TND-006 results remain historical evidence for the current build, not evidence for these planned features.


### TND-007 pool clarification, 2026-10-18

The user revised the planned selection policy: every usable N contributes its own top-X pool from the virtual combined source model; equal words then have their admitted per-N counts added, order labels are discarded, final top X is retained and sampling uses those final scores. This explicitly replaces the draft's first-successful-order/backoff stopping rule. Different per-N vocabularies are supported; only records admitted to a per-N top-X pool enter the merged score. Raw counts are used without an unrequested per-N normalization or multiplier. The existing application's N=1/2/3 backoff remains unchanged until implementation.

Added [the full pool guide](../../prediction-pool.md), linked from the story, README and current prediction documentation. It defines source eligibility, context suffixes, prefix matching, both top-X cutoffs, raw-score formula, weighted probability, deterministic ties, a worked X=2 example, empty/short-context cases, multi-word virtual rollout and snapshot/cache boundaries. It explicitly notes that raw summation lets higher-N evidence add score but cannot guarantee that every rare higher-N-only candidate survives the final cutoff. Story acceptance criteria and planning summaries were updated to match. This remains documentation only; application tests/benchmarks and packaging are Not run for the revised algorithm.

Documentation checks for this clarification passed: `git diff --check`; a local Python link/scope check over nine Markdown-only files (58 resolved relative links, README Mermaid/license/support sections preserved, Git index empty); and arithmetic checks for the guide's per-N pools, merged scores `alma:18, szilva:12, körte:10`, final top-two probabilities 60%/40%, and the rare-candidate cutoff counterexample. These are specification/example checks, not runtime prediction or benchmark results.
