# Future ideas — not committed work

The following are **ideas only**: no release, story, implementation approval or acceptance criteria has been assigned.

- **Character N-grams:** optionally compare character-level and word-level completion.
- **Language profiles:** easier separation of Hungarian, English and other imported corpora without automatic remote detection.
- **Trie benchmark:** compare SQLite prefix queries with a memory-limited in-process Trie on the same fixtures; add it only if measurements justify the cost.
- **Extended N:** experiment with N=4 on larger corpora once current backoff is reliable.
- **Import previews and corpus statistics:** inspect word counts before/after local indexing.
- **Desktop packaging:** consider macOS packaging after support and tests are available.

Do not add Ollama, OpenRouter, cloud AI, rich-text authoring or system-wide keystroke capture merely to make the project look larger. The MVP remains useful without the ideas above.
