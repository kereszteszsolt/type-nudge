# Statistical text prediction — planned implementation

TypeNudge uses **word-based** N-grams, not a large language model. It predicts at most one **word completion or next word** at a time, with up to three ranked alternatives. It is intended for general plain text, not solely source code.

## N-gram definitions

| Order | Context | Prediction role |
| --- | --- | --- |
| N=1 (unigram) | No preceding word | Frequent words and prefix candidates |
| N=2 (bigram) | Last 1 completed word | Next-word prediction |
| N=3 (trigram) | Last 2 completed words | Next-word prediction |

For a **partially typed word**, filter the candidate token by its prefix (e.g. `prog` → `programozás`). For a **word boundary**, suggest a next token using previously completed words. Handle whitespace and punctuation deterministically; do not append multiple unintended spaces or duplicate the already typed prefix.

## Configuration and backoff

- Enable any **nonempty subset** of N=1,2,3. Default all three enabled.
- Query the **highest enabled, contextually valid order** first; if no candidate matches context/prefix, back off to the next **enabled** smaller order. Never use a disabled N as a hidden fallback.
- Aggregate counts **only across enabled sources**. Support all imported sources, personal writing, or Combined with per-imported-file toggles; personal learning consent remains independent.
- Rank deterministically by observed frequency and stable tie-breaking. Return maximum **three** alternatives, with no duplicate candidates.
- If no meaningful candidate exists, show no ghost text. Never fabricate an LLM-like sentence completion.

## Unicode and language handling

Accept Unicode text and preserve accents for display. Normalize comparison/token keys consistently (e.g. Unicode normalization plus case handling), with tests for Hungarian, Romanian and English. The MVP does not perform morphological analysis, spell-checking, stemming, grammar correction or automatic language detection.

## Runtime and cache

Queries run asynchronously from the editor's perspective. Return a request identifier/revision with results so stale completions can be ignored. Use SQLite indexes plus a **bounded in-memory LRU cache**; invalidate entries when active sources, N settings or indexed revisions change. Measure latency on fixed fixtures rather than claiming constant response times.

## Minimum tests

- Empty corpus, one word, incomplete word, punctuation and multiple spaces.
- N=1-only, N=2-only, N=3-only, mixed orders and fallback when an N is disabled.
- Partially typed prefix, Unicode accents and deterministic tie resolution.
- Source enable/disable, repeated import, updated personal note, deletion and invalidated cache.
- At most three suggestions, no repeated user prefix, no stale ghost text after the user types further.
