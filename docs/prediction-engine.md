# Statistical text prediction

TypeNudge uses **word-based** N-grams, not a large language model. It predicts at most one **word completion or next word** at a time, with up to three ranked alternatives. It is intended for general plain text, not solely source code.

**TND-003 implements the main-process module.** `PredictionEngine` and its SQLite repository are tested independently of Electron UI. They are not yet connected to typing, IPC, ghost text or source/settings controls; that integration belongs to TND-004.

## Core interface

```typescript
const engine = new PredictionEngine(store.predictionRepository());
const result = engine.predict({
  prefix: 'wo',
  context: ['we', 'write'],
  sourceIds: selectedSourceIds,
  enabledN: [1, 2, 3],
});
// { candidates: [{ word, display, frequency }, ...], order: 3, indexRevision }
```

`prefix` is empty at a word boundary or contains the current partial word. `context` contains 0–2 **completed words from the current sentence/document**, oldest first. The caller must clear that context at sentence/line/document boundaries; raw punctuation or whitespace inside a context token is rejected. Source IDs are explicit UUIDs, with at most 100 entries, canonicalized and deduplicated. N sizes must be a nonempty selection of 1/2/3 (at most three input entries). Unknown fields, missing values, unsupported orders, invalid words/IDs and oversized requests fail before database access.

Each raw word/prefix is bounded to 256 UTF-16 code units and 128 NFC Unicode code points. Empty prefixes and trailing apostrophes in a partial word are allowed; completed context words cannot end in an apostrophe. The output's `word` is the normalized comparison key, `display` is an original NFC spelling found in the active corpus, and `frequency` is the total count at the matched order/context. `order` is `null` with no matches. `indexRevision` identifies the read snapshot's corpus revision. Results and their candidate objects are frozen so caller changes cannot corrupt the cache.

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

In the implemented core, no matches means an empty candidate array. A first successful higher-order query ends backoff even if it returns only one candidate; lower orders do not fill remaining slots. A prefix must extend the typed word: an exact normalized-word match is excluded, avoiding an empty completion. A query with no enabled/known selected sources or insufficient context for all selected N sizes returns no candidates.

Ranking sums frequency **across all requested, persisted-enabled sources before taking the top three**. Ties use ascending SQLite BINARY normalized-word order, independent of request ordering and system locale. Each word appears once; its display form is the BINARY-smallest first-observed spelling among the matching source rows. Disabled and unselected sources contribute neither counts nor display spelling. Source mode and personal-learning consent will be applied by the later caller/settings layer when constructing source IDs; no personal learner or settings control is added here.

## Unicode and language handling

Accept Unicode text and preserve accents for display. Normalize comparison/token keys consistently (e.g. Unicode normalization plus case handling), with tests for Hungarian, Romanian and English. The MVP does not perform morphological analysis, spell-checking, stemming, grammar correction or automatic language detection.

The importer and predictor now share `src/main/text/words.ts`: NFC, locale-independent lowercase, curly-to-straight apostrophes, then NFC again. This retains accents and also handles lowercase mappings that expand (for example `İ`), without claiming full linguistic case folding. Prefix bounds advance a Unicode scalar rather than a UTF-16 code unit, so supplementary-plane letters work with the indexed binary range. Word/sentence tokenization remains the TND-002 rule; no stored counts change format.

## Runtime and cache

The current module is synchronous and main-process-only. The TND-004 preload/IPC/editor integration must make requests asynchronously and check request IDs/text/settings revisions before showing a result. The core already returns its index revision but does not monitor any keyboard or editor.

The repository reads the global index revision, at most 100 selected source records (ID/revision/hash/enabled), and any candidate rows in **one read transaction**. This prevents a mixed result if a separate connection updates source activation while a request is running. Candidate queries use equality on source, N and context plus a normalized prefix range. `CROSS JOIN` keeps selected sources outside the indexed N-gram lookup; the real SQLite query-plan test checks the primary-key range search. [SQLite documents this join-order control](https://www.sqlite.org/optoverview.html#manual_control_of_query_plans_using_cross_join).

SQLite aggregates all matching rows and returns `LIMIT 3`; no full index enters JavaScript or the renderer. Requests have at most three candidate lookups. The existing import/corpus caps bound stored inputs, but an unprefixed unigram query can still aggregate many rows inside SQLite. No fixed latency is guaranteed.

The LRU holds **128 requests by default**, with an internal constructor limit of 1–256 for focused tests. Keys include normalized prefix/context, sorted source IDs, sorted enabled N sizes, global index revision and a fingerprint of selected source IDs/revisions/hashes/enabled flags. Every request reads a fresh source snapshot, including on cache hits. A changed global revision clears old entries; activation/source-state changes select a different cache key even if no index revision was incremented. Identical reimports keep the revision and can reuse the cached result. Empty matches are cached, failed queries are not. `clearCache()` supports explicit invalidation and reproducible measurements.

Run `npm run benchmark:prediction` for synthetic on-disk SQLite measurements with cache cleared versus warm-cache queries. Build/index preparation and UI/IPC/rendering are outside the measured time; exact fixtures, medians/p95 and environment are in [verification](releases/release-0.1-mvp/verification.md#tnd-003--2026-10-18).

## Release-wide checks (including later stories)

- Empty corpus, one word, incomplete word, punctuation and multiple spaces.
- N=1-only, N=2-only, N=3-only, mixed orders and fallback when an N is disabled.
- Partially typed prefix, Unicode accents and deterministic tie resolution.
- Source enable/disable, repeated import, updated personal note, deletion and invalidated cache.
- At most three suggestions, no repeated user prefix, no stale ghost text after the user types further.
