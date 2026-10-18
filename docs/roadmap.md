# Development roadmap

## Release 0.1 — Offline Predictive Writing MVP (Implemented; locally verified)

| Story | Short name | Dependency |
| --- | --- | --- |
| [TND-001](releases/release-0.1-mvp/stories/TND-001-electron-foundation-and-editor.md) | Electron foundation and editor | None |
| [TND-002](releases/release-0.1-mvp/stories/TND-002-sqlite-index-and-text-import.md) | SQLite index and text import | TND-001 |
| [TND-003](releases/release-0.1-mvp/stories/TND-003-ngram-prediction-engine.md) | N-gram prediction engine | TND-002 |
| [TND-004](releases/release-0.1-mvp/stories/TND-004-inline-suggestions-and-settings.md) | Inline suggestions and settings | TND-003 |
| [TND-005](releases/release-0.1-mvp/stories/TND-005-personal-writing-and-learning.md) | Personal writing and learning | TND-002, TND-004 |
| [TND-006](releases/release-0.1-mvp/stories/TND-006-testing-packaging-and-documentation.md) | Testing, packaging and release verification | TND-001–005 |
| [TND-007](releases/release-0.1-mvp/stories/TND-007-prediction-controls-and-multiword-suggestions.md) | Prediction controls and multi-word suggestions | TND-001–006 |

See [Release overview](releases/release-0.1-mvp/README.md) and [verification](releases/release-0.1-mvp/verification.md). All seven stories are implemented, with local Linux x64/WSL2 (WSLg/Xvfb) package/development checks, native Windows x64 package checks and measured indexing/prediction evidence. CI is configured; hosted execution, other native OS targets and installers/signing/publication remain unverified or unprovided.

## Prediction controls

[TND-007 — Prediction controls, N=1–7 and multi-word suggestions](releases/release-0.1-mvp/stories/TND-007-prediction-controls-and-multiword-suggestions.md) is **Implemented**, dependent on TND-001–006. It provides a hidden settings panel and keyboard Help, mandatory lower N orders, per-N top-X pools from selected sources as a virtual combined model, followed by merged-score final top-X sampling, multi-word lookahead/partial acceptance and a 500,000-word limit with unchanged byte bounds. Local Windows x64 and Linux x64/WSL2 (WSLg/Xvfb) package checks and measured 500,000-word corpus costs are recorded in verification.

## Later possibilities

Beyond the implemented TND-007 above, only [future ideas](future.md) are recorded; no Release 0.2 or further stories are assigned. Do not implement those ideas without a new request.
