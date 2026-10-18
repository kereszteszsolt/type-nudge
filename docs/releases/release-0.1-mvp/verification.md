# Release 0.1 — Verification evidence

## State

**Release in progress.** TND-001–002 have implementation and real verification evidence below. TND-003–006 remain Planned and Not run; this is not a completed MVP release. Each section records the state when that story was verified.

| Story | Status | Source / unit checks | Desktop / packaging checks | Notes |
| --- | --- | --- | --- | --- |
| TND-001 | Implemented | 32 Vitest tests passed; typecheck passed | 5/5 desktop tests in each mode: development, production build, Linux x64 packaged executable (WSLg) | Foundation scope; see TND-002 for SQLite/import evidence; Windows/macOS Not run |
| TND-002 | Implemented | 67 tests passed, including 22 real SQLite integration tests and 13 source IPC tests; typecheck passed | 6/6 desktop tests passed in development and on the actual Linux x64 packaged executable (WSLg) | SQLite 3.53.4 through better-sqlite3 13.0.3; native files unpacked; Windows/macOS Not run |
| TND-003 | Planned | Not run | Not run | No prediction code or benchmarks yet |
| TND-004 | Planned | Not run | Not run | No CodeMirror ghost extension yet |
| TND-005 | Planned | Not run | Not run | No document save or personal learner yet |
| TND-006 | Planned | Not run | Not run | No CI, release installers or delivery verification yet |

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
