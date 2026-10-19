# TypeNudge

> **Write naturally. Get subtle, offline predictions as you type.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-D22128?style=flat-square)](LICENSE)
![Status: In development](https://img.shields.io/badge/status-in%20development-64748b?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-44.9.0-47848F?style=flat-square)
![Offline](https://img.shields.io/badge/offline-by%20design-244936?style=flat-square)

**TypeNudge** is an **offline desktop writing app in development** for ordinary text: notes, articles, messages and technical writing. Its plain-text CodeMirror editor suggests word completions and likely next words as subtle **ghost text**. Suggestions come from a lightweight, local **unigram/bigram/trigram** model indexed from imported text files and, with explicit consent, saved personal documents. No LLM or cloud API is used.

> **Repository status: TND-001–007 implemented; Release 0.1 verified locally on Linux x64/WSL2 (WSLg/Xvfb) and Windows x64.** Available: the desktop editor, local text-source management, inline N=1–7 multi-word suggestions, persisted preferences and personal documents with opt-in save-time learning. **Use Save (Ctrl/Cmd+S) to persist text locally; unsaved changes stay in memory and have a discard guard.** CI checks are configured; hosted execution and other-platform delivery remain unverified. See [verification](docs/releases/release-0.1-mvp/verification.md) for actual checks and platform limits.

[TND-007](docs/releases/release-0.1-mvp/stories/TND-007-prediction-controls-and-multiword-suggestions.md) adds keyboard Help, hidden prediction settings, contiguous N=1–7, two-stage top-X score mixing, multi-word previews and 500,000-word indexing within the existing byte limits. The [complete pool mechanism](docs/prediction-pool.md) explains exactly how selected files and N orders are combined and sampled.

Open **Sources → Import TXT / MD** to select UTF-8 files. The source list shows word counts and revisions; **Use** enables a source for predictions, **Reindex** uses the stored copy and **Delete** removes that source's local text and counts. Reimporting the same selected file replaces changed content and leaves identical content unchanged. Limits: 10 files, 5 MiB per file, 10 MiB per selection, 500,000 words per file, 128 characters per word, 100 stored sources and 32 MiB of stored text. File size and word count are independent: a 500 KiB file can contain more than the former 50,000-word allowance.

**Sources → Check files** refreshes the availability of original imports; opening Sources also checks them. If an original is missing/unreadable and its stored index exists, **Clear index** removes that source, retained text and all N=1–7 counts from the database. It rechecks availability before clearing, and leaves other imports/personal notes intact. Readable files and imports without counts keep the normal **Delete** action. Old imports show unknown availability until explicitly reimported once: earlier databases retained only a path hash. No background folder scan or automatic deletion runs.

Imported text tolerates control characters: form feed (FF), vertical tab, NEL and Unicode line/paragraph separators become line breaks; other C0/C1 controls (including NUL and DEL) become spaces. Normal tabs/CR/LF stay intact. Unicode format marks, unusual spaces and symbols do not block indexing and are not indexed as words. The selected file is never rewritten; hashes/reindexing use the cleaned local copy.

Open **Settings** to choose **Imported Texts**, **My Writing** or **Combined**, maximum N (1–7), candidate pool X (1–100), preview length (1–10), partial-acceptance count and an individual **0–250× multiplier per N** (slider or manual number, default 1×). Settings also shows **database + WAL + SHM storage size**, with a refresh button. Every lower N is mandatory. Selected files form a virtual combined model: sum source counts before each per-N top-X cutoff, multiply admitted counts by their N setting and add equal-word scores, keep final top X and sample by score. Each later preview word uses the previous proposed words as virtual context. Multipliers affect this virtual pool only; stored frequencies stay unchanged and no reindex is needed. A 0× multiplier removes that N’s contribution; all usable weights at zero means no suggestion.

**Tab** accepts one pending word, **Alt+Right** the configured number, **Alt+Enter** the whole preview, **Alt+Down** requests another continuation and **Esc** dismisses. Each acceptance is one undo step; a valid remaining preview stays visible. **?** explains commands and settings. Settings uses two columns on wide windows and stacks on narrow ones; **About → Ways to support** contains the maintainer support link. Without a suggestion, normal keyboard behavior remains available. Settings and source activation persist across restarts. My Writing contributes only while learning is on.

Older indexes are preserved during schema-4 migration and show **N=4–7 pending**. Use **Sources → Reindex** to rebuild their retained local copies; the original file is not required. Already learned personal notes upgrade on an explicit Save with learning on. Unlearned notes are never bulk-indexed. New indexing always builds all seven orders independently of the slider.

Use **New**, give the document a name, then **Save**. **Documents** reopens/deletes saved notes and provides **Learn from my writing**, off by default. Enabling learning affects future explicit saves; it never indexes existing notes automatically. Saving while on replaces that note's counts, while saving with learning off removes its previous learned contribution. Turning learning off pauses personal predictions while retaining other learned counts. **Use**, **Remove learning** and **Reset personal learned data** control personal contributions independently; reset also turns learning off and keeps saved documents and imports. Storage is limited to 1 MiB per text, 100 combined sources/documents and 32 MiB total UTF-8 text.

## Release 0.1 — Offline Predictive Writing MVP

- **Plain-text writing:** write in a CodeMirror 6 editor with unobtrusive inline (ghost-text) suggestions.
- **Keyboard controls:** accept one/several/all pending words, request an alternative or dismiss; a small **?** Help button lists the actual shortcuts.
- **Three prediction sources:** **Imported Texts**, **My Writing**, or **Combined**; enable/disable individual imported files. Save-time learning from personal writing is **opt-in and off by default**.
- **Configurable N-grams:** a maximum-N slider enables **N=1 through N=7** contiguously. All usable orders contribute to the mixed pool.
- **Word completion and multi-word preview:** contextual top-X sampling and virtual lookahead for up to **ten** words. Pending suggestions are never saved or learned; the persistent index updates only on import/reindex or an authorized save.
- **Local index:** per-source N-gram counts in a single SQLite file and a small in-memory LRU cache. Disabling a source never requires reindexing every other source.
- **Privacy:** no accounts, global keystroke capture, telemetry, network-based prediction, Ollama, OpenRouter or model downloads.

### Writing with TypeNudge

1. Import one or more UTF-8 `.txt` or `.md` files (or start typing without imports).
2. Choose active source files, enable or disable learning from saved writing, and choose the maximum N, pool size and preview count in Settings.
3. Write normally. Read a dim suggested completion at the caret and accept it with **Tab**, skip to another with **Alt + Down**, accept several with **Alt+Right** or all with **Alt+Enter**, or dismiss with **Esc**.
4. Save a document locally; if personal learning is enabled, that document's previous index contribution is **replaced**, not counted twice. Revisit or disable sources whenever needed.

There is no system-wide autocomplete. Prediction operates **only within TypeNudge's own editor**.

## Architecture

The diagram shows the original TND-001–006 flow. TND-007 moves the N-gram services into one local worker thread and uses the [two-stage pool](docs/prediction-pool.md) in place of backoff/top-three selection; the IPC/privacy boundary is retained.

```mermaid
flowchart TB
    User[User typing or importing text] --> Editor[Electron renderer / CodeMirror 6]
    Editor -->|Validated, narrow IPC via preload| Main[Electron main process]
    Main --> Engine[Prediction engine: prefix + N-gram backoff]
    Engine --> Cache[Small in-memory LRU cache]
    Engine --> Store[(SQLite: documents, sources, N-gram counts, settings)]
    Main --> Import[Local UTF-8 TXT / Markdown ingestion]
    Import --> Store
    Engine -->|Top 3 candidates| Main
    Main -->|IPC response| Editor
    Editor --> Ghost[Inline ghost text + keyboard actions]
```

The Electron renderer has **no Node.js or arbitrary filesystem access**. The main process coordinates a single local worker that owns SQLite and user-approved file operations. Local app and prediction data are stored under Electron's OS-specific `userData` directory, not in the repository.

[Architecture](docs/architecture.md) · [Security and privacy](docs/security-and-privacy.md) · [App configuration](docs/app-configuration.md).

## Prediction and learning flow

```mermaid
sequenceDiagram
    actor Writer
    participant UI as CodeMirror editor
    participant Core as Prediction engine
    participant DB as SQLite per-source counts
    Writer->>UI: Type a word fragment / next-word context
    UI->>Core: Request top suggestions with enabled N and sources
    Core->>DB: Query highest enabled matching context / prefix
    DB-->>Core: Frequency-ranked candidates
    opt No usable higher-order candidates
        Core->>DB: Back off to shorter enabled N (if any)
    end
    Core-->>UI: Up to 3 completions
    UI-->>Writer: Show faint inline suggestion
    Writer->>UI: Tab, Alt+Down or Esc
    opt Save document and personal learning is enabled
        UI->>Core: Save new revision
        Core->>DB: Replace old per-document contribution atomically
    end
```

A **prefix match** completes a partially typed word; a **word N-gram** predicts a next word given up to two preceding words. This is a statistical model: suggestions depend on the chosen text corpus and may be limited in quality for small inputs or highly inflected languages.

[Storage and indexing](docs/indexing-and-storage.md) · [Prediction rules](docs/prediction-engine.md) · [Editor interactions](docs/editor-interactions.md).

## Technology stack

| Area | Technology |
| --- | --- |
| Desktop application | Electron |
| Language | TypeScript |
| Editor | CodeMirror 6, a small custom inline completion extension |
| Algorithms | Word-frequency, bigram, trigram, prefix matching, backoff |
| Persistence | SQLite through `better-sqlite3` in the main process |
| Optimization | SQLite B-tree indexes, bounded TypeScript LRU cache |
| Frontend build | Vite |
| Packaging | Electron Forge (platform-specific builds) |
| Unit / integration tests | Vitest |
| Desktop smoke checks | Playwright Electron support or an equivalent reproducible Electron harness |
| Delivery checks | GitHub Actions for typecheck and unit/SQLite tests; local desktop packaging checks |

The foundation pins Electron **44.9.0**, TypeScript **7.0.2**, Vite **8.3.4**, Forge **8.0.1**, CodeMirror 6 packages, Vitest **5.0.5**, Playwright **1.64.1**, and `better-sqlite3` **13.0.3** in `package.json` and `package-lock.json`. SQLite stays external to the main JS bundle; Forge retains the native dependency and unpacks its native files from ASAR. [Forge's Vite integration](https://www.electronforge.io/config/plugins/vite) remains experimental upstream, so upgrades require desktop checks. No backend server, Docker, React or LLM integration is planned.

## Local run

Use **Node.js 24.x (24.18.0 or newer)** and npm in a desktop session. Install Linux GUI dependencies if your distribution lacks them (`libnss3`, `libnspr4`, `libasound2t64` on Ubuntu 26.04, plus GTK/GBM and their dependencies). An initial dependency/Electron download needs internet access; editor functionality does not.

```bash
npm ci
npm run dev
```

`npm start` is an alias for `npm run dev`. Vite serves only on `127.0.0.1:5173` during development; that port must be free. Keep the Chromium sandbox enabled. The built app loads local files and does not need Vite or a server.

On Windows-mounted WSL checkouts, file notifications may miss edits. Restart `npm run dev` if the window keeps serving an older module; use a fresh `package` build for verification.

For native Windows, use Windows Node.js 24.x (24.18.0 or newer) and npm 11.16.0 or newer in PowerShell:

```powershell
cd C:\P\ghpub\www-temp\type-nudge # adjust to your checkout
npm.cmd ci
npm.cmd run dev
```

Stop development before packaging with `npm.cmd run package`. On Windows x64, the expected executable is `out\TypeNudge-win32-x64\type-nudge.exe`; keep its complete application directory together. `npm.cmd ci` replaces the installed dependencies for the current OS: do not share an active `node_modules` installation between WSL and Windows, and reinstall when switching.

The pinned `better-sqlite3` 13 uses shipped Node-API binaries. `package.json` denies its unnecessary install-time build through npm's `allowScripts` policy, and Forge skips rebuilding only that module through `rebuildConfig.ignoreModules`. Its prebuilds still need to be unpacked from ASAR and checked in the real packaged app. This avoids an unnecessary Windows `node-gyp`/Visual C++ build; other native modules retain Forge's normal rebuild behavior. Revisit both settings when changing the SQLite dependency or targeting a platform without a shipped compatible prebuild.

```bash
npm test              # IPC/security and real SQLite integration tests
npm run typecheck
npm run benchmark:prediction # reproducible synthetic SQLite prediction benchmark
npm run benchmark:import # larger import/reimport/reindex timings, memory and prediction probes
npm run package       # builds the current platform's app directory under out/
npm run test:desktop  # tests the built main/preload/renderer; run package first
```

Desktop tests require a working graphical session and use temporary user data. Verified packaged targets are **Linux x64 under WSLg / Ubuntu 26.04** and **native Windows x64 (build 26100)**. After `npm run package`, launch its application directory or run the same tests against its actual executable:

```bash
./out/TypeNudge-linux-x64/type-nudge
TYPENUDGE_EXECUTABLE="$PWD/out/TypeNudge-linux-x64/type-nudge" npm run test:desktop
```

For Windows PowerShell:

```powershell
npm.cmd run package
$env:TYPENUDGE_EXECUTABLE = "$PWD\out\TypeNudge-win32-x64\type-nudge.exe"
npm.cmd run test:desktop
Remove-Item Env:TYPENUDGE_EXECUTABLE
```

`package` creates an **unsigned application directory**, with native SQLite unpacked from ASAR and Apache/bundled dependency notices included. No installer, signing or publication is configured. macOS, native Linux desktops outside WSL2 and other architectures remain **Not run**. See [verification](docs/releases/release-0.1-mvp/verification.md) for commands, GUI-library preparation and the platform evidence. Do not package concurrently with `dev`, which rewrites the same `.vite/` build directory.

The [Checks workflow](.github/workflows/checks.yml) uses Node 24.18.0 on Ubuntu 24.04 to install the lockfile, typecheck and run unit/real SQLite tests. It skips the Electron binary download and does not run GUI, package or publish jobs. Actions are pinned to upstream commit IDs with read-only repository permissions. Its commands passed locally in a fresh temporary installation; **hosted GitHub Actions execution is Not run**. No separate lint configuration is present.

`npm run benchmark:prediction` reports first indexing, retained-copy reindexing and LRU-cleared/warm prediction timings for two synthetic sources at 600 and 30,000 total tokens. Measurements include corpus sizes, CPU/runtime/SQLite versions and deterministic result checks. They exclude Electron IPC, rendering, file-picker/decoding and database-open time; they are local observations with a bounded vocabulary, not worst-case or end-to-end typing guarantees. Results are recorded in [verification](docs/releases/release-0.1-mvp/verification.md#tnd-006--2026-10-18).

`npm run benchmark:import` uses a fresh process/database for each 500,000-word repeated, varied and unique-word corpus, plus an exact 5 MiB boundary fixture. It checks stored bytes/hashes/all seven N counts, unchanged reimports and retained-copy reindexing, and reports peak process RSS, SQLite/WAL bytes and five LRU-cleared N=1–7 probes for preview lengths 1/3/10. Worker indexing keeps main/editor handling available; source mutations remain serialized. Vocabulary diversity changes storage/query cost substantially: the byte-padding fixture is not a vocabulary stress case. Personal saved texts retain their separate 1 MiB limit. See [verification](docs/releases/release-0.1-mvp/verification.md) for actual measurements and limitations.

## Development roadmap

| Item | Status | Description |
| --- | --- | --- |
| [Release 0.1 — MVP](docs/releases/release-0.1-mvp/README.md) | Implemented; locally verified | All seven stories; Linux x64/WSL2 (WSLg/Xvfb) and Windows x64 package checks, Linux development checks, CI configuration and measured performance |
| [Release 0.1 verification](docs/releases/release-0.1-mvp/verification.md) | TND-001–007 evidence | Real commands, hardware, timings and platform/CI limits |
| [TND-007](docs/releases/release-0.1-mvp/stories/TND-007-prediction-controls-and-multiword-suggestions.md) | Implemented | Help, hidden settings, N=1–7, per-N/final top-X score mixing, multi-word preview and 500k words |
| [Future ideas](docs/future.md) | Ideas only | Optional later experiments; no committed release or acceptance criteria |

See [Roadmap](docs/roadmap.md), [Testing](docs/testing.md) and [Repository baseline](docs/repository-baseline.md). For suggested GitHub metadata, see [About & Topics](docs/github-metadata.md).

Development follows [AGENTS.md](AGENTS.md) and the [story workflow](docs/story-workflow.md): one approved story at a time, relevant technology skills only, actual test evidence, and **separate approvals before implementation and git commit**. The optional worker agent is not an automatic parallel team.

## License

Apache-2.0. Copyright © 2026 **Keresztes Zsolt** — [kereszteszsolt.hu](https://kereszteszsolt.hu).

The short, two-line SPDX notice applies to **new hand-written application source**, as described in [AGENTS.md](AGENTS.md). General/generated configuration, JSON, TOML, Markdown and lockfiles **do not receive source headers**. The full legal text is in [LICENSE](LICENSE). The display-only [`brand/branding.json`](brand/branding.json) does not change legal authorship or license notices.

## Contact

**Project maintainer: Keresztes Zsolt**

| Platform | Link |
| --- | --- |
| Website | [kereszteszsolt.hu](https://kereszteszsolt.hu/) |
| GitHub | [@kereszteszsolt](https://github.com/kereszteszsolt) |

> The maintainer's website is available in Hungarian (HU), English (EN), Romanian (RO) and German (DE).

## ☕ Ways to support

**Explore ways to support the maintainer and their projects.**

[https://kereszteszsolt.hu/ways-to-support](https://kereszteszsolt.hu/ways-to-support)

<p align="center">
  <a href="https://buymeacoffee.com/kereszteszsolt"><img src="docs/assets/buy-me-a-coffee-orange.png" alt="Buy Me a Coffee" width="360"></a><br>
  <strong>Every coffee counts! ☕❤️</strong>
</p>

---

<p align="center">
  <strong>Made with ❤️ by <a href="https://kereszteszsolt.hu/">Keresztes Zsolt</a></strong><br>
  ⭐ Star this repository if you find it useful!
</p>
