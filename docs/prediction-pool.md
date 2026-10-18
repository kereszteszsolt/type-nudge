# Prediction pool: the complete TND-007 mechanism

**TND-007 pool mechanism.** This document defines the implemented algorithm for [TND-007](releases/release-0.1-mvp/stories/TND-007-prediction-controls-and-multiword-suggestions.md). See [verification](releases/release-0.1-mvp/verification.md) for actual test/build results and [the engine interface](prediction-engine.md) for its API. The earlier executable used single-order N=1/2/3 backoff.

## The complete pipeline

For **each** word to predict:

```text
selected, enabled indexed sources
             |
             v
virtual combined counts, separately for each usable N
             |
             v
top X matching words for N=1, top X for N=2, ... top X for N=M
             |
             v
multiply admitted counts by their N setting (default 1×)
             |
             v
merge equal words and sum their scaled contributions across N
             |
             v
keep the top X words by final score
             |
             v
sample one word, weighted by final score
             |
             v
append the proposed word to virtual context and repeat if more words are requested
```

The same X limits **each per-N pool and the final pool**. All configured, usable N orders with a nonzero multiplier contribute; finding a match at a larger N does not stop smaller orders from contributing.

## 1. Choose the sources and the context

- Source mode determines Imported Texts, My Writing or Combined. Apply the persisted enabled flags and personal-learning consent before counting anything.
- Only selected, eligible indexed sources contribute. A file without the queried context/candidate contributes zero. A missing original can still contribute its retained local index until the writer disables or removes that source.
- Retain per-source counts in SQLite. The virtual model is a query-time combination, not a copied/concatenated text file, permanently merged source, new learned document or second full index in renderer memory.
- The maximum-N slider selects M in 1–7 and enables exactly N=1 through N=M.
- For N=1 use empty context. For N=2 use the last completed word; for N=3 use the last two; continue through N=7 with the last six completed words. Skip an N when too few completed words exist. Real sentence/line/document boundaries reset context.
- For the first incomplete word, apply the typed prefix to every per-N query. A candidate must extend that prefix; an exact match must not produce an empty completion. Subsequent proposed words use an empty prefix.

### Word order is part of the context key

N-grams are ordered, contiguous word sequences. The bigrams `alma körte` and `körte alma` are different entries. Likewise `[alma, körte] → szilva` and `[körte, alma] → szilva` are different trigrams; the predictor does not sort or permute their words. Cross-file aggregation adds counts only for the same N, ordered context and next-word key. Unigrams have no preceding-word context and count individual word frequency.

## 2. Virtually combine files, separately at each N

For a given N, its context suffix cN and candidate word w, sum counts from all eligible sources S:

```text
F_N(w) = sum over s in S of count_s(N, cN, w)
```

The user's example is:

```text
file A:  [a, b] -> C : 7
file B:  [a, b] -> C : 4
virtual: [a, b] -> C : 11
```

This is one candidate C with count 11 at N=3. A third selected file without that trigram adds zero. If B is disabled, the virtual count becomes 7. Changing the selected sources changes the virtual result without rewriting A's stored counts.

Group by normalized word keys using the existing Unicode NFC/case/apostrophe rules. Keep one deterministic display spelling. Equal-looking variants that normalize to one key must not receive duplicate entries or extra sampling tickets.

## 3. Take top X separately for every usable N

For every N independently, rank matching words by F_N descending, with ascending SQLite BINARY normalized-word order for equal counts, and keep at most X:

```text
P_N = TopX_by_frequency(F_N), if scale_N > 0
P_N = empty,                if scale_N = 0
```

Do the cross-file SUM **before** applying this per-N LIMIT. A word can be absent from every individual file's top X and still qualify after counts are combined. Never take per-file top-X lists first or choose a file before choosing a word.

Different orders can produce different words. Empty per-N pools contribute nothing; keep querying the other usable orders. A successful N=7 pool does not suppress N=1–6. This is a mixture of per-order evidence, replacing the previous longest-context-first stopping rule for TND-007.

## 4. Merge per-N pools and add the scores

Build the union of words in P_1 through P_M. For each word, add its scaled counts from the **per-N pools that admitted it**:

```text
score(w) = sum over usable N of:
             scale_N * F_N(w), if w belongs to P_N
             0,                otherwise
```

An existing count below an N's top-X cutoff does not contribute to this sum. Do not perform an extra lookup of every union word's omitted counts after truncation; the merge operates on the per-N top-X records specified above.

The final merged candidate is identified only by its word and display spelling, with one summed score. It does not retain an order label or separate entry per N. Temporary per-N data is used to calculate that score; it is not a request to select an N first during sampling.

Each N=1–7 has its own persisted integer multiplier `scale_N` from **0 to 250**, initially **1×**, controlled by a slider and an editable number in Settings. Multiply after each per-N top-X cutoff and before merging/final top X. At **0×**, an order contributes no candidates or scores: its effective pool is empty and its SQL lookup can be skipped. Positive multipliers remain the same for every candidate within that N, so they do not change the raw-frequency per-N ordering or admit omitted counts. Orders above the selected maximum, or without enough context, still contribute nothing. At all-default 1×, this is exactly the original raw-count sum. No per-order normalization, averaging, automatic higher-N boost or repetition penalty is applied silently. The score combines related N-gram observations; it is not a count of independent observations or a calibrated linguistic probability.

## 5. Apply top X again to the merged scores

Sort the merged candidates by score descending and the same BINARY word tie-break, then keep at most X:

```text
finalPool = TopX_by_score(union(P_1, ..., P_M))
```

With M<=7, the intermediate union has at most M*X unique words (at most 700 under the X<=100 bound). The final pool has at most X. Unselected/disabled sources and words outside this final pool cannot be sampled.

## 6. Sample using the final scores

For every word in finalPool:

```text
P(select w) = score(w) / sum(score(v) for v in finalPool)
```

Draw once from this distribution. Do not select an N, a file or an intermediate-pool entry first. A singleton final pool is deterministic. With X=1 the final choice is deterministic, although several orders may have contributed to its score. If all per-N pools are empty, including when every usable order has weight 0×, return no next word and stop the preview without drawing a random number. Do not silently restore 1× weights or fall back to a zero-weight order. A positive high-N weight cannot contribute when there is too little context for that N.

For an exact weighted draw, let T be the sum of final scores, draw a uniform r in `[0,1)`, and set u=r*T. Walk the final pool's stable order, accumulating scores; select the first word whose cumulative score is greater than u. Half-open intervals avoid assigning a boundary value to two words. In the example below, alma occupies `[0,18)` and szilva `[18,30)`; r=0.6 gives u=18 and therefore selects szilva.

Production sampling is random; tests supply controlled random values/seed to verify exact cumulative intervals, tie ordering and membership. No random choice may select outside finalPool.

## Worked example: X=2, maximum N=3

Suppose the completed context is `[a, b]`. After summing the eligible files, the matching counts are:

| Word | N=1, context `[]` | N=2, context `[b]` | N=3, context `[a,b]` |
| --- | ---: | ---: | ---: |
| alma | 11 | 6 | 1 |
| körte | 10 | 1 | 0 |
| szilva | 8 | 7 | 5 |
| barack | 3 | 1 | 1 |

With all multipliers at their default **1×**, the independent top-two pools are:

- N=1: `alma:11`, `körte:10`.
- N=2: `szilva:7`, `alma:6`.
- N=3: `szilva:5`, `alma:1`. The count-1 tie with barack is settled by the stable word ordering.

Merge their admitted entries:

| Word | From P_1 | From P_2 | From P_3 | Final score |
| --- | ---: | ---: | ---: | ---: |
| alma | 11 | 6 | 1 | 18 |
| szilva | 0 | 7 | 5 | 12 |
| körte | 10 | 0 | 0 | 10 |

The final top-two pool is **alma:18, szilva:12**. Their sampling probabilities are **60% and 40%**. Körte drops out. Szilva's unigram count of 8 and körte's bigram count of 1 were below their respective per-N cutoffs and are not added back later.

Here the longer-context evidence helps szilva overtake a more frequent unigram. Neither the highest-order pool alone nor the unigram pool alone determines the result.

### The same example with a manual multiplier

Set only N=3 to **100×**. The same raw per-N pools are admitted, but alma scores `11 + 6 + 100*1 = 117`, szilva scores `7 + 100*5 = 507`, and körte scores `10`. Final top two becomes **szilva:507, alma:117**, sampled with weights 507/624 and 117/624. The omitted unigram count of 8 for szilva still contributes zero. Setting N=3 back to 1× restores the original 18/12 pool without reindexing.

For a rare N=7 match, suppose N=1 nominates alma:20 and N=7 nominates körte:2 at X=1, with other orders empty. At 1× the final word is alma:20; with N=7 at 100× it is körte:200. If the N=7 count came from two files with count 1 each, aggregate them first, then multiply `(1+1)*100`. This does not duplicate files or weight one file independently.

Scaling is **virtual only**. SQLite `ngrams.frequency`, source hashes/revisions, learned text and global index revision remain unchanged. Only the seven small preference values are persisted. Existing per-N SQL pools can be reused; the merged pool is recalculated with the new multipliers and any pending editor preview is invalidated. A settings write can change SQLite/WAL file lengths by normal persistence overhead, but never scales or rebuilds stored N-gram rows.

Setting N=3 to **0×** in the original example instead removes its entries: alma scores 17, körte 10 and szilva 7, so the final X=2 pool becomes alma:17, körte:10. Setting every usable weight to zero gives an empty preview. Stored counts and existing saved multiplier choices remain intact; a new profile still defaults to 1× for every order.

## 7. Repeat for a multi-word preview

If the sampled next word is alma, append its **full normalized word** to virtual history, as if accepted, without editing the real document:

```text
real completed history: [a, b]
first proposed word:    alma
virtual history:       [a, b, alma]

next word's contexts:
N=1: []
N=2: [alma]
N=3: [b, alma]
N=4: [a, b, alma]  (only if the chosen maximum permits N=4)
```

For every later position use the same configured per-N multipliers. Rebuild every per-N pool, merge scaled scores, truncate to final top X and sample again for the next word. Do not keep sampling successive words from the first word's unchanged pool. Keep only the bounded context suffix needed for M; repeat until the preview count is reached or no word is available.

For a typed prefix `al`, completing it to alma adds the full alma token once to virtual history, while the displayed first suffix is only the untyped portion. Pending words are not inserted, saved or learned merely because the predictor used them as virtual context.

Tab accepts one pending word; Alt+Right accepts K leading words and Alt+Enter the complete preview. Alt+Down requests another continuation, excluding the previous first word when alternatives exist; singleton pools finish without retrying. Retain a valid remaining preview after partial acceptance. Regenerate on a real input/settings/source change or explicit next-suggestion action, rather than randomly changing the preview while the writer pauses.

## 8. Snapshot, cache and implementation boundaries

Use one consistent source/index snapshot throughout a generated sequence in the SQLite-owning local worker thread. Include eligible source fingerprints, global index revision, maximum N, X, normalized prefix and relevant context in deterministic pool cache keys. Merged-pool keys also include all seven multipliers; raw per-N SQL pools omit them so a scale-only change can reuse their unmodified counts. Cancel obsolete display/acceptance after edits, source/consent/index changes, selection/composition or settings updates. Cache pools, not a permanently frozen random sentence. Per-N and merged pools share one 128-entry LRU, so an unchanged unigram/shorter suffix can be reused across lookahead positions without scanning its vocabulary again.

SQLite aggregates per-source rows before each per-N limit; the local worker combines the bounded pools. Main validates settings/context; the worker resolves eligible sources from persisted settings/consent. Renderer receives only bounded prediction information, never arbitrary SQL/filesystem access or the full corpus index. The bounds on returned candidates do not guarantee bounded SQLite scan time; indexing and multi-step query costs still require the measurements in TND-007.

## What this does and does not guarantee

Every usable order has an opportunity to nominate words and add score. A rare higher-order match can help a word reach the final pool, as in the worked example. **Raw summation does not guarantee that a higher-order-only word survives the final top-X cutoff.** For example, an admitted unigram candidate scored 1000 can still beat a higher-order-only candidate scored 2.

This implements the requested two-stage top-X mechanism with explicit per-N multipliers. The default 1× remains raw summation; raising a higher-N multiplier increases its contribution but does not guarantee survival against every possible competing score. No automatic normalization is included. The optional repetition-reduction idea in the story likewise requires its own approval.
