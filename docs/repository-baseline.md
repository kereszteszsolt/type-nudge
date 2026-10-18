# Repository baseline and implementation status

**Original baseline:** documentation only, with all six stories Planned. **Current state:** TND-001–003 add the editor, local SQLite/import/source index, and a deterministic main-process prediction module with bounded LRU. TND-004–006 remain Planned. [Verification](releases/release-0.1-mvp/verification.md) records actual commands and environment limits.

## Included

- README with user experience, two Mermaid diagrams, technical architecture, license and Ways to Support.
- Brand metadata under `brand/`, including optional empty icon and poster slots.
- `AGENTS.md`, one optional Codex worker, two technology-focused skills and minimal Codex configuration.
- Release 0.1 overview, six stories with acceptance criteria, and honest `Not run` verification.
- Architecture, storage, prediction, editor, privacy, testing and GitHub metadata guides.
- TND-001 application source, exact dependency manifest/lockfile, Forge/Vite configs, unit tests and a real Electron smoke harness.
- TND-002 schema/store, explicit file ingestion, transactional indexing, Sources dialog and real temporary-database integration tests.
- TND-003 prefix/backoff/ranking module, shared normalization, snapshot-aware SQLite queries, bounded cache, deterministic tests and a reproducible prediction benchmark.

## Still absent

- Prediction IPC/editor integration and ghost-text extension.
- Saved editor documents, personalized learning, source activation/settings UI and CI workflow.
- Release installers, signing, published binaries and end-to-end prediction/typing performance evidence.

TND-001 implementation was approved on 2026-10-18. The editor currently holds session-only text. Release completion still requires the later stories and platform delivery evidence. Never imply that Markdown descriptions mean software features already work.
