# TND-006: Testing, packaging and documentation

## Status

Implemented — locally verified on Linux x64/WSLg and Windows x64; see [verification](../verification.md#tnd-006--2026-10-18) and the [Windows packaging follow-up](../verification.md#tnd-006-follow-up--windows-native-packaging-2026-10-18). Hosted CI, other native OS targets, installers/signing and publication remain outside the verified scope.

## User story

As a user, I want a trustworthy offline desktop build with documented settings and predictable suggestions so that I can install and try TypeNudge.

## Goal

Verify the existing MVP end-to-end, package the supported desktop target(s), and close the release documentation honestly.

## Dependencies

TND-001 through TND-005 implemented and verified.

## Acceptance criteria

- [x] Run full focused Vitest and real SQLite integration tests for import/index, N-gram outputs, source toggles, personal save learning and Electron IPC/security; fix defects in scope.
- [x] Run reproducible Electron UI smoke scenarios covering ghost text, Tab/Alt+Down/Esc, source settings, empty states, save/reopen, Unicode and stale asynchronous suggestions.
- [x] Package and **launch** the application on the actually available supported OS target(s); explicitly test `better-sqlite3` opening its userData DB in a packaged Electron build. Mark any untested Windows/Linux target `Not run` rather than claiming universal support.
- [x] Add a small GitHub Actions workflow for feasible lint/typecheck/unit checks, without inventing unsupported cross-platform native packaging success. Keep generated installers and local DB files out of git.
- [x] Measure/report representative corpus sizes, indexing time and prediction latency on documented hardware; state limitations instead of unproven performance claims.
- [x] Update README with **verified** launch, build and packaging commands; preserve Mermaid diagrams, Apache-2.0/license headers, brand metadata and Ways to Support links. Record actual commands, outcomes and blockers in release verification before changing release status.

196 unit/integration checks, typecheck and CI-like fresh installation passed. Final full packaged and development runs each passed 13/13; the initial transient typing discrepancy and archive-audit filename assumption are recorded in verification. CI YAML/pins were reviewed and its commands passed locally, but no hosted workflow run is claimed. Benchmarks cover bounded 600/30,000-token corpora, exclude IPC/rendering and provide no worst-case/cross-platform latency guarantee. No application code or dependency change was needed.

The Windows follow-up skips only the pinned Node-API SQLite module's unnecessary npm/Forge rebuild, makes existing test fixtures portable, and verifies real native Windows x64 packaging/SQLite/UI behavior. Dependency versions and application behavior are unchanged; platform results and initial test-harness failures are recorded separately in verification.

The [larger-import follow-up](../verification.md#tnd-006-follow-up--larger-text-imports-2026-10-18) raises TXT/MD import limits to 250,000 words / 5 MiB per file and 10 MiB per selection, with independent 1 MiB personal saves, reproducible import/RSS measurements and packaged large-corpus checks. Import/index work remains synchronous in main; measurements state vocabulary-dependent costs and do not imply a worst-case typing or memory guarantee.

The control-character follow-up accepts body controls during TXT/MD import: page/line controls and Unicode line/paragraph separators become LF; other C0/C1 controls except TAB/CR/LF become spaces. Unicode format marks/spaces/symbols remain accepted and excluded from word tokens. Original files stay unchanged; hashes/reindex use the cleaned local copy and byte limits still apply to the original selection. The normal Windows package includes this and the larger-import support.

The unavailable-source follow-up adds main-only schema-3 original-path metadata, explicit file checks in Sources and conditional **Clear index** for unavailable originals with stored counts. Cleanup rechecks under the mutation lock; unknown legacy locations require explicit reimport for checks and retain ordinary Delete. Tests cover migration, privacy, restored-file refusal, scoped deletion/cache invalidation and the packaged UI.

## Out of scope

No new prediction algorithms or unrelated UI redesign; no network-based AI, cloud sync, login system or additional preplanned releases.
