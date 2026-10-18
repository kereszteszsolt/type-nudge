# Repository baseline and implementation status

**Original baseline:** documentation only, with all six stories Planned. **Current state:** TND-001–006 implement the MVP, including local documents/learning, inline predictions, CI configuration and measured performance. Local Linux x64/WSLg packaging/development is verified; this is not a published cross-platform release. [Verification](releases/release-0.1-mvp/verification.md) records actual commands and environment limits.

## Included

- README with user experience, two Mermaid diagrams, technical architecture, license and Ways to Support.
- Brand metadata under `brand/`, including optional empty icon and poster slots.
- `AGENTS.md`, one optional Codex worker, two technology-focused skills and minimal Codex configuration.
- Release 0.1 overview, six stories with acceptance criteria, and honest `Not run` verification.
- Architecture, storage, prediction, editor, privacy, testing and GitHub metadata guides.
- TND-001 application source, exact dependency manifest/lockfile, Forge/Vite configs, unit tests and a real Electron smoke harness.
- TND-002 schema/store, explicit file ingestion, transactional indexing, Sources dialog and real temporary-database integration tests.
- TND-003 prefix/backoff/ranking module, shared normalization, snapshot-aware SQLite queries, bounded cache, deterministic tests and a reproducible prediction benchmark.
- TND-004 validated prediction/settings IPC, CodeMirror ghost widget and conditional commands, request cancellation, per-source activation, persisted preferences, focused tests and actual packaged Electron checks.
- TND-005 schema-2 personal documents, bounded save/open IPC, optimistic revisions, unsaved-change guards, transactional opt-in learning and independent forget/reset/delete controls with real SQLite/Electron evidence.
- TND-006 minimal commit-pinned CI configuration, fresh-install command verification, measured initial/reindex/prediction performance, full packaged/development checks and license/native-module audit.

## Still absent

- Hosted CI run evidence and verified native Windows/macOS builds.
- Release installers, signing, published binaries and end-to-end prediction/typing performance evidence.

TND-001 implementation was approved on 2026-10-18. Documents persist only on an explicit Save; unsaved changes remain in memory with a discard guard. All six stories are implemented within the documented available-environment scope. Hosted CI, installers and other native platforms require their own evidence. Never imply that Markdown descriptions mean software features already work.
