# Repository baseline and implementation status

**Original baseline:** documentation only, with all six stories Planned. **Current state:** TND-001 adds the desktop/editor foundation; TND-002 adds local SQLite, bounded TXT/MD import, per-source N=1/2/3 indexing and source management. TND-003–006 remain Planned. [Verification](releases/release-0.1-mvp/verification.md) records actual commands and environment limits.

## Included

- README with user experience, two Mermaid diagrams, technical architecture, license and Ways to Support.
- Brand metadata under `brand/`, including optional empty icon and poster slots.
- `AGENTS.md`, one optional Codex worker, two technology-focused skills and minimal Codex configuration.
- Release 0.1 overview, six stories with acceptance criteria, and honest `Not run` verification.
- Architecture, storage, prediction, editor, privacy, testing and GitHub metadata guides.
- TND-001 application source, exact dependency manifest/lockfile, Forge/Vite configs, unit tests and a real Electron smoke harness.
- TND-002 schema/store, explicit file ingestion, transactional indexing, Sources dialog and real temporary-database integration tests.

## Still absent

- Prediction/ranking engine and ghost-text extension.
- Saved editor documents, personalized learning, source activation/settings UI and CI workflow.
- Release installers, signing, published binaries and real prediction performance data.

TND-001 implementation was approved on 2026-10-18. The editor currently holds session-only text. Release completion still requires the later stories and platform delivery evidence. Never imply that Markdown descriptions mean software features already work.
