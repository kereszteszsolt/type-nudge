# Codex configuration

The main Codex session handles ordinary work. The optional `implementation_worker` agent in `agents/` may be delegated **one already-approved story** as the **only code writer**. `config.toml` limits concurrency to one thread: extra parallel implementers and automatic architect/reviewer cycles are intentionally not used.

## Skills

- [`electron-desktop`](../.agents/skills/electron-desktop/SKILL.md): Electron application structure, secure IPC, editor integration, SQLite native packaging and desktop tests.
- [`ngram-prediction`](../.agents/skills/ngram-prediction/SKILL.md): tokenization, SQLite indexes, per-source counts, backoff, prefix completion and performance.

Skills are **technology-focused reference material**, loaded only when relevant. Business behavior, story acceptance criteria and release priorities belong in [`docs/releases/`](../docs/releases/) and [`docs/story-workflow.md`](../docs/story-workflow.md), not repeated here.

Before implementation or any commit, request explicit approval. Verify results and record genuine evidence in [`verification.md`](../docs/releases/release-0.1-mvp/verification.md).
