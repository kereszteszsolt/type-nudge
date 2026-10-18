# Release 0.1 — Verification evidence

## State

**Release in progress.** TND-001 has implementation and real verification evidence below. TND-002–006 remain Planned and Not run; this is not a completed MVP release.

| Story | Status | Source / unit checks | Desktop / packaging checks | Notes |
| --- | --- | --- | --- | --- |
| TND-001 | Implemented | 32 Vitest tests passed; typecheck passed | 5/5 desktop tests in each mode: development, production build, Linux x64 packaged executable (WSLg) | Session-only text; no SQLite, imports, predictions or save; Windows/macOS Not run |
| TND-002 | Planned | Not run | Not run | No SQLite schema or indexer yet |
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
- No prediction benchmark, SQLite/native-module test, import, save or learning check applies to TND-001. Those features are unimplemented.
