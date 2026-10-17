# Story-driven Codex workflow

## Story format

Six stories live in [Release 0.1](releases/release-0.1-mvp/README.md) and each has `Status`, `User story`, `Goal`, `Dependencies`, `Acceptance criteria` and `Out of scope`. Status transitions: **Planned → In progress → Implemented** only when evidence justifies them.

## Minimal approval and verification loop

1. Select **one** story in dependency order. Read `AGENTS.md`, the active release README and only its story; open the relevant specialist documentation/skill as needed.
2. Explain touched areas, constraints and focused test commands; **ask for explicit implementation approval** before code changes.
3. Main session implements or delegates to the **sole-writer optional agent**. No duplicate writers, unnecessary reviewers or parallel subagent chains.
4. Run the narrowest relevant checks. Log the actual commands, results, OS, limitations, or `Not run` in [verification](releases/release-0.1-mvp/verification.md).
5. Review diff and propose a commit message. Request **separate commit approval**; no automatic commits/pushes and no next story until approved.

The skills define technology practice; story requirements do not get copied to skills. Docs in `future.md` are not approved stories. Source SPDX conventions are defined once in `AGENTS.md`; no headings or code headers are needed in generic JSON/TOML/Markdown configs.
