# Statistical text prediction

TypeNudge uses local **word N-grams N=1–7**. It generates a preview of 1–10 words using the [complete pool mechanism](prediction-pool.md): source aggregation, top X per usable N, per-N scaling and admitted-score summation, final top X, weighted sampling and virtual-context rollout. It is a statistical word predictor, without a language-model service or grammar correction.

## Engine interface

```typescript
const engine = new PredictionEngine(store.predictionRepository());
const result = engine.predict({
  prefix: 'wo', context: ['we', 'write'], sourceIds: selectedSourceIds,
  maxN: 7, poolSize: 10, previewWords: 3, ngramScales: [1, 1, 1, 1, 1, 1, 1],
});
// { candidates: firstFinalPool, words: sampledSequence, indexRevision }
```

`prefix` is empty at a word boundary or a partial word; `context` has at most six completed words from one sentence/line/document, oldest first. Raw punctuation/whitespace inside tokens is rejected. UUID source IDs are deduplicated/canonicalized and bounded to 100. Maximum N is an integer 1–7, X 1–100 and preview count 1–10; all lower N orders are mandatory. `ngramScales` is an exact seven-element array of integers 0–250 in N=1..7 order, defaulting to seven 1× values in persisted settings. Zero-weight orders are omitted from prediction queries and final candidates; if all usable orders have zero weight, return an empty result without sampling or hidden fallback. Unknown fields, malformed Unicode, invalid bounds/IDs and overlong tokens fail before storage access. Optional `avoidWord` is a bounded complete token for an explicit next-suggestion request.

A candidate contains `word` (normalized comparison key), `display` (deterministic original NFC spelling) and `frequency` (final virtually scaled cross-order score). It has no N identity. `candidates` is the first final pool; `words` is the sampled continuation. These arrays/rows are frozen; `indexRevision` identifies their snapshot. No match gives an empty sequence. Exact normalized-word matches are excluded from prefix completion, preventing empty suffixes.

## Ranking and sampling

Every usable order has its own N-1-word suffix, up to six words. SQLite sums matching counts across the selected enabled sources **before** its parameterized `LIMIT X`. The worker merges the resulting at most 7X rows by normalized word, multiplies each admitted count by that N’s setting, sums equal words, sorts by score descending / UTF-8 BINARY word order ascending, and takes final top X. Disabled/unselected sources and nonconsenting personal sources never contribute. See the pool guide for formulas, the 18/12 example, omitted-count behavior and scaling limitations.

A weighted draw samples one final candidate; later words repeat the pipeline after appending earlier pending full words to virtual context. Prefix filtering applies only at the first position. Sampling uses half-open cumulative intervals with an injected RNG for exact tests. Production uses `Math.random`; cached pools are deterministic, while explicit requests can resample. Next suggestion excludes the previous first word only when the final pool has alternatives.

## Unicode and source rules

Shared `src/shared/words.ts` normalization applies NFC, locale-independent lowercase, curly-to-straight apostrophes, then NFC. Accents are retained; expanding lowercase mappings and supplementary-plane letters are tested. This is not full linguistic case folding, morphological analysis or automatic language detection. Binary prefix bounds advance a Unicode scalar. Stored counts retain first-observed spelling per source; queries choose the BINARY-smallest admitted display variant.

Source mode Imported Texts / My Writing / Combined and per-source flags determine eligibility. Personal sources also require current learning consent; ordinary typing and proposed words are never learned. Explicit saves replace personal contributions transactionally. Retained imported indexes still contribute when the original file is missing until disabled/deleted.

## Runtime, snapshots and cache

Main validates named IPC and delegates local storage operations to one **worker thread**. That thread owns the only SQLite connection, performs indexing/prediction and serializes operations. The renderer sends only bounded `{prefix, context, avoidWord?}`; source sets, numeric limits and multipliers come from persisted preferences. Renderer security/CSP and ordinary editing remain intact.

The repository reads global revision, at most 100 source records and all per-position candidate queries in **one read transaction**, so a sequence never combines different committed index states. Source/context/candidate equality plus prefix ranges use the N-gram primary key; the real SQLite query-plan test checks this search. SQLite may scan many matching rows even though returned rows are bounded; no fixed latency is guaranteed.

The single LRU holds **128 deterministic per-N or merged pools in total** (constructor bound 1–256). Keys include the pool kind/order, relevant normalized prefix/context suffix, sorted source IDs, maximum N, X, index revision and source ID/revision/hash/enabled fingerprint. Merged keys additionally include all seven multipliers; raw per-N keys omit scaling to reuse unmodified SQL results. A scale-only setting write preserves stored counts and index revisions, while renderer generations invalidate the old preview. Every sequence reads fresh source metadata, including on cache hits. Revision changes clear the cache; fingerprint changes isolate activation changes even without a revision increment. Unchanged current-format imports/saves preserve revisions. Empty pools are cached, failed queries are not; `clearCache()` supports measured probes. Cache entries never freeze a random sentence indefinitely.

The renderer uses a 60 ms trailing debounce and a generation gate. Edits, caret/selection/focus/composition changes and source/settings operations invalidate pending results. Main bounds its worker queue to 32 waiting operations and coalesces obsolete queued predictions. Worker failure rejects waiters safely; restarting the application reopens SQLite. See [editor behavior](editor-interactions.md), [storage](indexing-and-storage.md) and [verification](releases/release-0.1-mvp/verification.md).
