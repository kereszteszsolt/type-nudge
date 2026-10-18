# TND-007: Prediction controls, N=1–7 and multi-word suggestions

## Status

**Planned — specification only.** Requested on 2026-10-18 after TND-001–006 and their import/source-management follow-ups. Application implementation, migration, performance measurements and packaging for TND-007 are **Not run**. The current executable still has N=1/2/3, a 250,000-word limit and single-word suggestions.

The user confirmed that selected indexed files form a **virtual combined model**: equal N/context/next-word entries contribute summed counts at prediction time. The revised design takes a separate top-X pool for every usable N from that combined model, merges equal words by summing their admitted counts, retains the final top X and samples **weighted by final score**. This replaces the earlier proposed first-successful-order backoff; all usable orders contribute. Numeric defaults and extra shortcuts below are proposals for implementation approval, not existing behavior.

Planning checks are recorded in [verification](../verification.md#tnd-007--specification-2026-10-18).

## User story

As a writer, I want unobtrusive prediction settings, discoverable keyboard help and adjustable multi-word suggestions from my selected text sources, so that I can control contextual accuracy, variety and how much suggested text I accept.

## Goal

Extend the local word model to N=1–7 with mandatory lower orders, per-N top-X pools mixed into a final top-X candidate pool, and sequential lookahead. Keep ordinary writing in focus, let the writer accept one/several/all proposed words, and support up to 500,000 indexed words per text without increasing the existing byte limits.

## Dependencies

TND-001–006 and commit `02b4637` (larger imports, control-character handling and unavailable-source cleanup). Existing local-only storage, source activation, opt-in learning, conditional Clear index, Unicode/prefix handling and desktop security remain required.

## Confirmed product requirements

### Virtual combined model and two-stage top-X pool

For each prediction step, resolve the currently selected and enabled imported/personal sources using the existing source mode and learning-consent rules. Treat these sources as **one virtual model** for the query, retaining independent per-source storage. The complete algorithm, formulas, worked example, edge cases and multi-word flow are specified in [the prediction-pool guide](../../../prediction-pool.md).

For the same order N, completed context and normalized next-word key:

```text
file 1: [a, b] -> C : 7
file 2: [a, b] -> C : 4
virtual model while typing: [a, b] -> C : 11
```

`C` appears once with total frequency 11. A selected file without that context/candidate contributes zero. Disabled, unselected, deleted and nonconsenting personal sources contribute nothing. The virtual result changes with source selection, activation, content/index revisions and learning consent; it is not a permanently merged source or an additional learned document.

At every generated position:

1. Use the last at most six completed words of the current real + virtual context. All orders 1 through the configured maximum are enabled; use every order for which enough context exists.
2. Independently for **each** usable N, take its own N-1-word context suffix (empty for N=1), apply typed-prefix matching, **sum frequencies across all eligible sources**, deduplicate by normalized word, rank by summed count descending and stable BINARY word order for ties, then retain at most X words. Empty orders contribute nothing; a match at a larger N never suppresses smaller orders.
3. Merge these per-N top-X pools by word. A word's **final score is the sum of its admitted per-N counts**. Counts below an N's own top-X cutoff contribute zero; do not rescore omitted rows after taking the union. Different orders can nominate different words.
4. Remove order identity from the merged candidate entries: one word, one summed score, with a deterministic display spelling. Rank by final score and the same stable word tie-break, then keep the **final top X**.
5. Sample one word from that final pool, weighted by its final score. No per-order normalization, higher-N multiplier or file-average weighting is implied.
6. Append the chosen full word to the virtual context and repeat the entire per-N/merge/final-top-X process with an empty prefix for the next position. No words are sampled from a stale first-position pool.

The pool is contextual, rather than a single global list of the most common words. The same X caps each per-N pool and the final pool. At most M*X words enter the intermediate union before deduplication (up to 700 with M=7/X=100); at most X remain after the final cutoff. Pools can remain in main: SQLite aggregates files and limits per-N results, and main merges the bounded records without loading entire source indexes into renderer memory.

Regression example for summation **before** LIMIT: with X=2, file A has `alpha:8, bravo:7, shared:6`, and file B has `delta:8, echo:7, shared:6` for the same context. The combined pool starts `shared:12, alpha:8`; `shared` must not disappear because it is third in both individual files.

### Multi-word preview and acceptance

- A preview contains up to the configured number of words. A completion of the currently typed partial word counts as its first word.
- Every later word is predicted as if all preceding proposed words had already been accepted. For example, after real context `[a, b]`, a proposed `C` makes the next context `[a, b, C]` (trimmed to the configured context length). After a proposed `D`, use the corresponding extended suffix for the next step. Pending words affect lookahead, but are not written into the real document or learned index.
- Stop at the configured word count or when no valid next candidate exists. Real sentence/line/document boundaries continue to reset context; this feature predicts word sequences and does not invent punctuation or insert line breaks.
- Default acceptance inserts **only the first pending word**, or only its missing suffix for a partially typed word. Separate commands accept a configured number of leading pending words or the whole displayed preview.
- Preserve the remaining preview after partial acceptance when text/settings/sources still match, so pressing accept again consumes the next displayed word. A new edit, caret/selection change, source/settings revision or composition invalidates obsolete previews.
- Preview text stays stable while the writer pauses. Repainting, reading a cached pool or moving focus back from an unrelated render must not continuously resample it. Explicit next-suggestion requests regenerate a continuation from the current real context; prefer a different first word when that pool has alternatives. Singleton/no-alternative cases finish without an endless retry loop.
- Prefix spelling, accents and whitespace remain correct: do not repeat the typed prefix, join words together, append duplicate spaces or insert a newline when accepting a complete preview. Each acceptance is one undo operation; ghost text stays outside saved text and clipboard content until accepted.

### Settings and help

- A compact **Settings** button opens a dismissible right-side prediction panel. It is closed by default so settings do not remain above the editor. On narrow windows use a usable drawer/dialog layout with scrolling, visible labels and keyboard focus management.
- Move existing source-mode selection and N controls into that panel. Replace independent N checkboxes with a maximum-N slider: selecting M enables exactly `1..M`; the current value and effective orders are visible.
- Add controls for pool size X, preview word count and the number of words accepted by the partial-accept command. Persist these settings locally; shrinking the preview limit clamps the partial-accept count to a valid value.
- Keep a small **Help / ?** button discoverable. Help explains accepting one/several/all words, next suggestion, dismissal, source selection, maximum N and both pool cutoffs. Larger N uses more preceding words and adds evidence alongside lower orders rather than guaranteeing grammatical output or exclusive priority.
- Help and Settings support keyboard opening/closing, Escape and focus restoration. Commands operate only in the focused editor when a valid preview exists; normal editing, focus traversal, save, undo/redo and IME remain intact otherwise.

### Import/index bounds

- Raise the token limit to **500,000 words per indexed text**. Keep **5 MiB per imported file**, **10 MiB per import selection**, **10 files per selection**, **1 MiB per personal saved text**, **100 combined sources/documents**, **32 MiB retained UTF-8 text** and **128 code points per word**.
- Word count and bytes are independent limits: 500,000 long words need not fit in 5 MiB. Exceeding either limit produces a clear error without truncation or loss of the previous contribution.
- Continue ignoring/normalizing supported import controls, honoring UTF-8/path checks and leaving selected original files unchanged.
- Index N=1–7 for newly indexed contributions independently of the current slider value, so lowering/raising maximum N does not itself require rebuilding sources.

## Proposed settings and commands

The numeric defaults/bounds and new shortcuts are proposed for approval; weighted sampling from the final cross-order pool is confirmed. None of this is implemented yet.

| Setting | Proposed range | Proposed initial value |
| --- | --- | --- |
| Maximum N | 1–7; enables every lower order | 3 for a new profile; migrate an old selection to its highest selected N |
| Candidate pool X | 1–100; applied per N and again after merging | 10 |
| Preview words | 1–10 | 3 |
| Words per partial-accept command | 1 through preview limit | 2, clamped to preview limit |
| Sampling | Final-score-weighted within the merged final top-X pool | Confirmed by the user |

A final pool entry with score 11 has sampling weight 11; a word's probability is its final score divided by the sum of the final pool's scores. With X=1, the final choice is deterministic. Raw-count addition gives higher-order matches an opportunity to add evidence, but does not guarantee that a rare higher-order-only word survives the final cutoff; see the guide's limitations.

| Action | Proposed shortcut | Behavior |
| --- | --- | --- |
| Accept next pending word | `Tab` | One word / missing suffix |
| Next suggestion | `Alt + Down` | Generate another eligible continuation without changing the document |
| Accept configured leading words | `Alt + Right` | At most K remaining words |
| Accept whole preview | `Alt + Enter` | All currently displayed pending words; no inserted newline |
| Dismiss preview | `Esc` | No document modification |

Verify these bindings on actual supported desktop targets and display the actual binding in Help. Do not override normal Tab/Alt/Enter behavior when no valid preview exists.

## Acceptance criteria

- [ ] Settings and Help are accessible, dismissible, correctly focused and usable in a 520 × 480 window; main editing controls stay available with the panel closed.
- [ ] Maximum N is validated as an integer 1–7; N=1 through that maximum are always enabled. Invalid/fractional/out-of-range settings are rejected at the main-process boundary.
- [ ] Real SQLite fixtures demonstrate counts for every N through 7, six-word context suffixes, sentence/document boundaries, Unicode/prefix completion and contributions from all usable orders. An available high-N pool must not suppress lower-N pools; insufficient/empty orders are skipped.
- [ ] Per-source counts remain independent, while prediction pools use the virtual combined model: `[a,b] -> C: 7+4=11`, absent contexts contribute zero, duplicates combine, and aggregate-before-LIMIT retains candidates outside each file's individual top X.
- [ ] X is validated and applied twice at every position: to each per-N pool after cross-file aggregation and to the merged-score pool. Tests cover different per-N words, duplicate-word score sums, omitted counts contributing zero, stable ties and the final cutoff. Final entries have one word/score and no N identity; source activation/mode/consent applies at every stage, with cache/preview invalidation on source/revision changes.
- [ ] Sampling has a documented approved distribution; tests inject controlled random values/seed and verify exact selection boundaries, top-X membership and singleton behavior without statistical/flaky assertions. Cache deterministic pools rather than freezing random output indefinitely.
- [ ] Multi-word fixtures prove that pending words influence every subsequent per-N pool and final mixture, prefix matching applies only to the first incomplete word, short contexts skip unusable N, and an empty union stops the sequence.
- [ ] One-word, K-word and whole-preview acceptance preserve the remaining sequence, spelling, spaces, selection and isolated undo. Next/dismiss do not modify the document; unaccepted text is neither saved, copied nor learned.
- [ ] Delayed replies, rapid typing, settings/source changes, selection, blur and synthetic composition cannot display or insert obsolete sequences. The editor remains usable while indexing/prediction work is pending.
- [ ] Persisted settings migrate from schema-3 independent N selections without deleting sources, saved notes, imported-file metadata or learned contributions; sparse selections become contiguous through their previous maximum.
- [ ] The N<=3 schema constraint and index format are upgraded safely. Preserve existing N=1–3 data and expose which retained contributions need rebuilding for N=4–7. Provide an explicit retained-copy rebuild path, with progress, before claiming all older sources are N=7-ready; never bulk-learn previously unlearned personal notes. Re-saving an already learned unchanged document can upgrade an obsolete contribution when consent is on.
- [ ] Exact 500,000-word and byte boundaries pass real SQLite checks; 500,001 words and over-limit bytes fail without partial updates. Reimport/reindex/re-save remain transactional replacements, and deleting one source removes its N=1–7 counts without affecting others.
- [ ] Large-source indexing uses bounded batches/background work outside the renderer and keeps editor/main request handling usable; failure/cancellation cannot publish half-built counts. Document the chosen main/worker coordination instead of merely raising constants around an unbounded all-N Map.
- [ ] Measure representative repeated, varied and unique-word corpora up to 500,000 words and actual byte limits, with peak memory, index/WAL size, indexing time and broad-prefix/long-context multi-step prediction costs. No latency/memory claim is made before these checks.
- [ ] Run focused unit/real SQLite tests first, full regressions, and actual packaged Windows x64 / Linux x64/WSLg UI/native-module checks where available. Record commands/results/environment, migrations, screenshots and all Not run cases in verification; deliver the normal Windows app directory without a second variant.
- [ ] Update current prediction/storage/editor/security documentation and README after implementation, preserving branding, SPDX notices, Mermaid blocks and support/license sections. Request separate commit approval.

## Implementation outline and risks

Once implementation is approved, this story replaces the earlier independent-N subset, first-successful-order backoff, top-three and single-word limits with the specified contiguous N=1–7, bounded top-X pool and multi-word preview behavior. Those old rules still describe the current executable until TND-007 is implemented and verified; other security/privacy/storage requirements stay in force.

1. Extend shared settings/types/request validation and define the bounded multi-word result/acceptance contract. Main resolves source IDs, pool bounds and persisted settings; renderer cannot inject SQL, arbitrary paths, unbounded context or unauthorized source sets.
2. Migrate SQLite constraints/settings and track index-format coverage. Keep per-source contributions and the old committed index available until a replacement is complete. Preserve imported paths and personal-learning semantics from schema 3.
3. Extend tokenization/indexing and retained-copy rebuild orchestration. Keep pending work bounded and writes serialized; any worker is a local main-coordinated implementation detail, not a service or backend.
4. Aggregate/rank top-X pools in SQLite separately for every usable N, merge word scores in main and take final top X. Add bounded virtual-context rollout and final-score-weighted randomness above the deterministic query/cache layer. Keep a single consistent source/index snapshot for a generated sequence and revalidate its revision before display/acceptance.
5. Update the CodeMirror ghost state and conditional commands, then the hidden Settings panel/Help. Preserve pending word boundaries for partial acceptance and invalidate stale generations.
6. Verify migration, correctness, resource costs and actual packaged behavior before changing story status or delivering a replacement build.

Affected areas include `src/shared/{prediction,sources}.ts`, main prediction/IPC/storage modules, preload, renderer prediction-context/suggestions/controls, `index.html`, styles, benchmarks, focused tests and matching domain documentation. Dependency upgrades, unrelated UI changes and a new release are not required.

The size risk is material: one 500,000-word sentence can contribute up to **3,499,979 N-gram occurrences** across N=1–7 (`7T - 21`); a unique-word fixture can approach that many distinct rows. The 32 MiB text budget does not cap derived SQLite/index/WAL size. Bound memory and measure real storage/latency rather than inferring safety from the 5 MiB input cap. Every preview step queries all usable orders, including potentially expensive low-order vocabulary aggregations. Measure that full workload rather than the cost of an early-exit backoff query.

## Additional suggestions — optional, not acceptance criteria

- A compact explanation of final pool size/scores can help writers understand the mixture without attributing its final words to one N. Stronger higher-N weighting would be a separate policy choice; the present design uses raw-count sums.
- Consider an optional repetition penalty if measurements show repeated-word loops. Keep natural repeated words possible; do not introduce a hard hidden word ban or alter frequency counts.

## Out of scope

No cloud/LLM service, network prediction, character N-grams, grammar correction, sentence/punctuation generation, Trie/TST rewrite, rich-text editing, global keyboard capture, shared writing history, new installer/release or silent personal learning. User-requested N=4–7 is scoped to TND-007 and does not authorize unrelated future ideas.
