# TND-006: Testing, packaging and documentation

## Status

Planned

## User story

As a user, I want a trustworthy offline desktop build with documented settings and predictable suggestions so that I can install and try TypeNudge.

## Goal

Verify the existing MVP end-to-end, package the supported desktop target(s), and close the release documentation honestly.

## Dependencies

TND-001 through TND-005 implemented and verified.

## Acceptance criteria

- [ ] Run full focused Vitest and real SQLite integration tests for import/index, N-gram outputs, source toggles, personal save learning and Electron IPC/security; fix defects in scope.
- [ ] Run reproducible Electron UI smoke scenarios covering ghost text, Tab/Alt+Down/Esc, source settings, empty states, save/reopen, Unicode and stale asynchronous suggestions.
- [ ] Package and **launch** the application on the actually available supported OS target(s); explicitly test `better-sqlite3` opening its userData DB in a packaged Electron build. Mark any untested Windows/Linux target `Not run` rather than claiming universal support.
- [ ] Add a small GitHub Actions workflow for feasible lint/typecheck/unit checks, without inventing unsupported cross-platform native packaging success. Keep generated installers and local DB files out of git.
- [ ] Measure/report representative corpus sizes, indexing time and prediction latency on documented hardware; state limitations instead of unproven performance claims.
- [ ] Update README with **verified** launch, build and packaging commands; preserve Mermaid diagrams, Apache-2.0/license headers, brand metadata and Ways to Support links. Record actual commands, outcomes and blockers in release verification before changing release status.

## Out of scope

No new prediction algorithms or unrelated UI redesign; no network-based AI, cloud sync, login system or additional preplanned releases.
