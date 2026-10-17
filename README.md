# TypeNudge

> **Write naturally. Get subtle, offline predictions as you type.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-D22128?style=flat-square)](LICENSE)
![Status: Planned](https://img.shields.io/badge/status-planned-64748b?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-planned-47848F?style=flat-square)
![Offline](https://img.shields.io/badge/offline-by%20design-244936?style=flat-square)

**TypeNudge** is a planned, **fully offline predictive writing assistant** for ordinary text: notes, articles, messages and technical writing. It will suggest word completions and likely next words as subtle **ghost text** inside its own editor. Suggestions will come from a lightweight, local **unigram/bigram/trigram** model learned from text files and optionally from saved writing — **not** from an LLM or cloud API.

> **Repository status: documentation-only baseline.** Release 0.1 (`TND-001`–`TND-006`) is **Planned**. No Electron application, package manifest, SQLite schema, executable build, tests or distributable binary exists in this ZIP. Everything below describes the intended MVP, not tested features.

## Planned Release 0.1 — Offline Predictive Writing MVP

- **Plain-text writing:** write in a CodeMirror 6 editor with unobtrusive inline (ghost-text) suggestions.
- **Keyboard controls:** **Tab** accepts; **Alt + Down** cycles suggested continuations; **Esc** dismisses. Normal editor shortcuts must keep working when no suggestion exists.
- **Three prediction sources:** **Imported Texts**, **My Writing**, or **Combined**; enable/disable individual imported files. Save-time learning from personal writing is **opt-in and off by default**.
- **Configurable N-grams:** enable any nonempty selection of **N=1, N=2 and N=3**. Prefer the longest available enabled context, then back off to shorter *enabled* contexts.
- **Word completion and next-word prediction:** prefix matching plus up to **three** ranked suggestions. Predictions update while typing; the persistent index updates only on import/reimport or an authorized save.
- **Local index:** per-source N-gram counts in a single SQLite file and a small in-memory LRU cache. Disabling a source never requires reindexing every other source.
- **Privacy:** no accounts, global keystroke capture, telemetry, network-based prediction, Ollama, OpenRouter or model downloads.

### What a user will do

1. Import one or more UTF-8 `.txt` or `.md` files (or start typing without imports).
2. Choose active source files, enable or disable learning from saved writing, and select N=1/2/3 predictors.
3. Write normally. Read a dim suggested completion at the caret and accept it with **Tab**, skip to another with **Alt + Down**, or dismiss with **Esc**.
4. Save a document locally; if personal learning is enabled, that document's previous index contribution is **replaced**, not counted twice. Revisit or disable sources whenever needed.

There is no system-wide autocomplete. Prediction operates **only within TypeNudge's own editor**.

## Architecture (planned)

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

The Electron renderer has **no Node.js or arbitrary filesystem access**. Only the main process owns SQLite and user-approved file operations. Local app and prediction data are stored under Electron's OS-specific `userData` directory, not in the repository.

[Architecture](docs/architecture.md) · [Security and privacy](docs/security-and-privacy.md) · [Branding](docs/branding.md).

## Prediction and learning flow (planned)

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

## Planned technology stack

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
| Delivery | GitHub Actions for focused checks; packaging on supported OS runners |

Dependencies and versions will be pinned and checked for Electron/native module compatibility by **TND-001**. Electron Forge, SQLite and the CodeMirror integration **are not installed yet** in this documentation baseline. No backend server, Docker, React or LLM integration is planned.

## Local run (after implementation)

During `TND-001` and `TND-006`, Codex will document **verified** commands, expected to resemble:

```bash
npm ci
npm run dev
npm run package
```

**Do not run these in this baseline**: it intentionally contains no `package.json` or application source. Final commands, platform prerequisites, and native `better-sqlite3` packaging requirements must be confirmed by the implementing stories. Target platforms are **Windows and Linux** for the first verified release; macOS can be evaluated later.

## Development roadmap

| Item | Status | Description |
| --- | --- | --- |
| [Release 0.1 — MVP](docs/releases/release-0.1-mvp/README.md) | Planned | Six scoped stories for the desktop application, indexing, predictions, learning, tests and packaging |
| [Release 0.1 verification](docs/releases/release-0.1-mvp/verification.md) | Not run | Real commands and observations will be recorded during implementation |
| [Future ideas](docs/future.md) | Ideas only | Optional later experiments; no committed release or acceptance criteria |

See [Roadmap](docs/roadmap.md), [Testing](docs/testing.md) and [Repository baseline](docs/repository-baseline.md). For GitHub metadata to apply **when the MVP is implemented**, see [About & Topics](docs/github-metadata.md).

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
