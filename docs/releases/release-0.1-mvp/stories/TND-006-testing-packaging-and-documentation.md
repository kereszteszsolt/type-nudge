# TND-006: Testing, packaging and documentation

## Status

Implemented — locally verified on Linux x64/WSLg; see [verification](../verification.md#tnd-006--2026-10-18). Hosted CI, other native OS targets, installers/signing and publication remain outside the verified scope.

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

## Out of scope

No new prediction algorithms or unrelated UI redesign; no network-based AI, cloud sync, login system or additional preplanned releases.
