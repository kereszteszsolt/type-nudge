# Codex engineering guide — TypeNudge

## Status and approved boundaries

The original documentation-only baseline now includes **TND-001–006**. Release 0.1 is **implemented and locally verified on Linux x64/WSLg**: editor, SQLite/import, inline predictions/settings, personal documents/learning, CI configuration and reproducible performance evidence. Hosted CI, other native OS targets and release installers/signing/publication remain unverified or unprovided. Consult the active story and verification before presenting any behavior as implemented or verified.

The agreed MVP is a **single Electron/TypeScript desktop app** with CodeMirror 6, local SQLite indexing, N=1/2/3 word predictions, prefix completion, inline ghost text, selectable text sources, save-time opt-in learning, and Electron Forge packaging. No external API, server backend, cloud model, account, global keyboard monitoring or shared writing history.

## Minimize context and work duplication

1. Read this file, the **one approved active `TND-*` story** and its release README. Inspect only the affected files, tests and matching focused documentation.
2. Load `.agents/skills/electron-desktop/SKILL.md` for Electron security/IPC, CodeMirror, SQLite native packaging and desktop tests; `.agents/skills/ngram-prediction/SKILL.md` for tokenization, indexing, backoff, source filtering, caches or benchmarks. Load both only for a genuine cross-cutting change.
3. Skills explain **technology-specific implementation practice**, not product features, user stories, prompt policy or acceptance criteria. Those belong in release stories and domain docs.
4. The **main Codex session** is the default writer. `.codex/agents/implementation-worker.toml` is an optional **sole-writer delegate**, not an automatic second implementer; no unnecessary parallel analysis/review or competing changes.

## Engineering constraints

- **Electron:** `contextIsolation: true`, `nodeIntegration: false`, renderer sandbox enabled, restrictive Content Security Policy. Expose only validated, necessary IPC calls via a preload bridge. Database/file access belongs to the main process; never expose unrestricted SQL or filesystem access to UI code.
- **No spying/network:** only process explicit in-app document operations and user-selected TXT/MD imports. No OS-wide keystroke capture, telemetry, auto-update or internet-based suggestion service. User-initiated external website/support links may open in the system browser.
- **Local storage:** persist SQLite in Electron `userData`, never in repository assets. Bound import size/count; handle invalid encodings and inaccessible files. Treat imported text as untrusted content, not code or HTML to execute.
- **Prediction:** word unigrams/bigrams/trigrams with optional enabled sizes; deterministic longest-context backoff respecting disabled N; prefix matching for partial words; max 3 candidates. Source activation applies to all queries. Avoid loading the full index into renderer memory.
- **Learning:** import/reimport and explicitly saved personal documents update contributions transactionally. Personal learning defaults off; edits and re-saves must replace previous counts rather than inflate them. Explicitly delete/reindex sources without affecting other sources.
- **Responsiveness:** asynchronous renderer requests; prevent stale results after new typing or changed settings. Keep bounded LRU cache invalidated by affected revision/source/settings changes. Protect regular text editing and keyboard shortcuts.
- **Packaging:** verify platform-specific Electron/`better-sqlite3` native module compatibility; no unverified Windows/Linux/macOS claims. Keep generated files and user data out of version control.

## Story execution and approvals

1. Announce active story, scope, affected files, risks and focused tests; **ask for implementation approval** before changing application code.
2. Implement only the agreed story. Do not generate an entire app, alter architecture broadly, add new releases or create extra agents without approval.
3. Run focused tests first. Document real commands, results and environment (or `Not run`) in the active [verification](docs/releases/release-0.1-mvp/verification.md). Do not invent latency, build success, packaging or screenshots.
4. Review the diff, propose a commit message and request **separate commit approval**. No automatic commits, pushes or starting the next story.

## Short Apache-2.0 source notices

New **hand-written application source files** use only this **two-line SPDX notice**, with the language's normal comment syntax:

```text
SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
SPDX-License-Identifier: Apache-2.0
```

For TypeScript/JavaScript use `//`; for handwritten CSS use `/* ... */`; for handwritten HTML use `<!-- ... -->`. Do **not** paste the full license into source files. It is in `LICENSE`.

**Do not add headers** to Markdown, TOML, JSON (`brand/branding.json`, `package.json`, config), YAML, lockfiles, `.env*`, `.gitignore`, `.editorconfig`, generated Electron/Vite/Forge files, installer metadata, generated migrations, build artifacts or binary assets. Preserve third-party notices. The branding metadata controls **display-only** identity and support links; it never overwrites `LICENSE` or legal SPDX notices.

## Scope control

`docs/future.md` is an uncommitted idea list. Do not implement optional N-gram sizes beyond N=3, Trie/TST, cloud suggestions, rich document editing or global autocomplete unless separately approved. Application code must remain within the approved active story.
