# Future ideas — not committed work

The following are **ideas only**: no release, story, implementation approval or acceptance criteria has been assigned.

Word N=4–7 has moved into the user-requested [TND-007](releases/release-0.1-mvp/stories/TND-007-prediction-controls-and-multiword-suggestions.md) implementation. That story is **Implemented**; extended N is part of the current executable rather than an unassigned experiment below.

- **Character N-grams:** optionally compare character-level and word-level completion.
- **Language profiles:** easier separation of Hungarian, English and other imported corpora without automatic remote detection.
- **Trie benchmark:** compare SQLite prefix queries with a memory-limited in-process Trie on the same fixtures; add it only if measurements justify the cost.
- **Import previews and corpus statistics:** inspect word counts before/after local indexing.
- **Desktop packaging:** consider macOS packaging after support and tests are available.

Do not add Ollama, OpenRouter, cloud AI, rich-text authoring or system-wide keystroke capture merely to make the project look larger. The MVP remains useful without the ideas above.
