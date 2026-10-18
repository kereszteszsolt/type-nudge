# Prediction pool: the complete TND-007 mechanism

**Status: Planned specification, not current application behavior.** This document defines the user's revised [TND-007](releases/release-0.1-mvp/stories/TND-007-prediction-controls-and-multiword-suggestions.md) design. The current executable still uses the [single-order N=1/2/3 predictor](prediction-engine.md). TND-007 implementation and benchmarks are Not run.

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
merge equal words and sum their admitted counts across N
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

The same X limits **each per-N pool and the final pool**. All configured, usable N orders contribute; finding a match at a larger N does not stop smaller orders from contributing.

## 1. Choose the sources and the context

- Source mode determines Imported Texts, My Writing or Combined. Apply the persisted enabled flags and personal-learning consent before counting anything.
- Only selected, eligible indexed sources contribute. A file without the queried context/candidate contributes zero. A missing original can still contribute its retained local index until the writer disables or removes that source.
- Retain per-source counts in SQLite. The virtual model is a query-time combination, not a copied/concatenated text file, permanently merged source, new learned document or second full index in renderer memory.
- The maximum-N slider selects M in 1–7 and enables exactly N=1 through N=M.
- For N=1 use empty context. For N=2 use the last completed word; for N=3 use the last two; continue through N=7 with the last six completed words. Skip an N when too few completed words exist. Real sentence/line/document boundaries reset context.
- For the first incomplete word, apply the typed prefix to every per-N query. A candidate must extend that prefix; an exact match must not produce an empty completion. Subsequent proposed words use an empty prefix.

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
P_N = TopX_by_frequency(F_N)
```

Do the cross-file SUM **before** applying this per-N LIMIT. A word can be absent from every individual file's top X and still qualify after counts are combined. Never take per-file top-X lists first or choose a file before choosing a word.

Different orders can produce different words. Empty per-N pools contribute nothing; keep querying the other usable orders. A successful N=7 pool does not suppress N=1–6. This is a mixture of per-order evidence, replacing the previous longest-context-first stopping rule for TND-007.

## 4. Merge per-N pools and add the scores

Build the union of words in P_1 through P_M. For each word, add its counts from the **per-N pools that admitted it**:

```text
score(w) = sum over usable N of:
             F_N(w), if w belongs to P_N
             0,      otherwise
```

An existing count below an N's top-X cutoff does not contribute to this sum. Do not perform an extra lookup of every union word's omitted counts after truncation; the merge operates on the per-N top-X records specified above.

The final merged candidate is identified only by its word and display spelling, with one summed score. It does not retain an order label or separate entry per N. Temporary per-N data is used to calculate that score; it is not a request to select an N first during sampling.

Use the **raw summed counts**, as requested. No per-order normalization, averaging, automatic higher-N multiplier or repetition penalty is applied silently. The score combines related N-gram observations; it is not a count of independent observations or a calibrated linguistic probability.

## 5. Apply top X again to the merged scores

Sort the merged candidates by score descending and the same BINARY word tie-break, then keep at most X:

```text
finalPool = TopX_by_score(union(P_1, ..., P_M))
```

With M<=7, the intermediate union has at most M*X unique words (at most 700 under the proposed X<=100 bound). The final pool has at most X. Unselected/disabled sources and words outside this final pool cannot be sampled.

## 6. Sample using the final scores

For every word in finalPool:

```text
P(select w) = score(w) / sum(score(v) for v in finalPool)
```

Draw once from this distribution. Do not select an N, a file or an intermediate-pool entry first. A singleton final pool is deterministic. With X=1 the final choice is deterministic, although several orders may have contributed to its score. If all per-N pools are empty, return no next word and stop the preview.

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

The independent top-two pools are:

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

Rebuild every per-N pool, merge scores, truncate to final top X and sample again for the next word. Do not keep sampling successive words from the first word's unchanged pool. Keep only the bounded context suffix needed for M; repeat until the preview count is reached or no word is available.

For a typed prefix `al`, completing it to alma adds the full alma token once to virtual history, while the displayed first suffix is only the untyped portion. Pending words are not inserted, saved or learned merely because the predictor used them as virtual context.

Tab accepts one pending word; separate commands accept K leading words or the complete preview. Retain a valid remaining preview after partial acceptance. Regenerate on a real input/settings/source change or explicit next-suggestion action, rather than randomly changing the preview while the writer pauses.

## 8. Snapshot, cache and implementation boundaries

Use one consistent source/index snapshot throughout a generated sequence. Include eligible source fingerprints, global index revision, maximum N, X, normalized prefix and relevant context in deterministic pool cache keys. Cancel obsolete display/acceptance after edits, source/consent/index changes, selection/composition or settings updates. Cache pools, not a permanently frozen random sentence.

SQLite should aggregate per-source rows before each per-N limit; main combines the bounded pools. Main validates settings/context and supplies eligible sources. Renderer receives only bounded prediction information, never arbitrary SQL/filesystem access or the full corpus index. The bounds on returned candidates do not guarantee bounded SQLite scan time; indexing and multi-step query costs still require the measurements in TND-007.

## What this does and does not guarantee

Every usable order has an opportunity to nominate words and add score. A rare higher-order match can help a word reach the final pool, as in the worked example. **Raw summation does not guarantee that a higher-order-only word survives the final top-X cutoff.** For example, an admitted unigram candidate scored 1000 can still beat a higher-order-only candidate scored 2.

This implements the requested two-stage top-X/raw-score mechanism. Stronger higher-N influence would need a separately chosen weighting/normalization policy; that is not silently included in this design. The optional repetition-reduction idea in the story likewise requires its own approval.
