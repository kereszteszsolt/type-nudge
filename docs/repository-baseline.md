# Repository baseline and implementation status

**Original baseline:** documentation only, with all six stories Planned. **Current state:** TND-001 adds the Electron/TypeScript/Vite/Forge foundation, plain-text CodeMirror editor, display branding, narrow preload bridge and focused tests. TND-002–006 remain Planned. [Verification](releases/release-0.1-mvp/verification.md) records actual commands and environment limits.

## Included

- README with user experience, two Mermaid diagrams, technical architecture, license and Ways to Support.
- Brand metadata under `brand/`, including optional empty icon and poster slots.
- `AGENTS.md`, one optional Codex worker, two technology-focused skills and minimal Codex configuration.
- Release 0.1 overview, six stories with acceptance criteria, and honest `Not run` verification.
- Architecture, storage, prediction, editor, privacy, testing and GitHub metadata guides.
- TND-001 application source, exact dependency manifest/lockfile, Forge/Vite configs, unit tests and a real Electron smoke harness.

## Still absent

- SQLite schema/migrations, text imports, prediction engine and ghost-text extension.
- Persistent documents, personalized learning, settings and CI workflow.
- Release installers, signing, published binaries and real prediction performance data.

TND-001 implementation was approved on 2026-10-18. The editor currently holds session-only text. Release completion still requires the later stories and platform delivery evidence. Never imply that Markdown descriptions mean software features already work.
