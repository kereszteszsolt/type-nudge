---
name: ngram-prediction
description: Statistical word-based autocomplete in TypeNudge: Unicode tokenization, SQLite unigram/bigram/trigram counts by source, prefix search, backoff, cache invalidation and deterministic tests.
---

# N-gram prediction engineering

## Use when

An approved story touches tokenization, text import/indexing, N-gram storage, prediction/ranking, user-selected active sources or N values, cache consistency, performance tests, or per-document replacement on save. Not a generic writing-prompt skill.

## Technical practices

1. Document Unicode case normalization and token boundaries; **do not** bridge N-grams across sentences or document boundaries. Support accented words in tests. Preserve original spellings for display where sensible while indexing normalized tokens.
2. Maintain **per-source** unigram, bigram and trigram counts; use SQLite indexes for `(source, order, context, candidate)` and prefix search. Prefer bounded indexed queries and a small LRU over loading all N-grams into memory.
3. For a partial word, use prefix matching; for a completed word boundary, predict the next word. Rank consistently with count and deterministic ties. Make at most 3 suggestions.
4. Back off from **highest enabled N** to lower **enabled N** only when the current context yields no usable candidates; disabling N=2 means the algorithm must never silently query it.
5. Use explicit source filters and source revisions. Reindexing/resaving is a **transactional replacement** of previous per-source counts, not additive on every save. Delete/disable one source without changing others.
6. Cache keys include prior word context, prefix, active source fingerprint, selected N values and index revision; invalidate when any of these semantics change. Bound memory and avoid stale asynchronous completions.
7. Keep algorithms deterministic and separable from UI and SQLite adapters. Test multilingual Unicode, punctuation, empty/small corpora, duplicate reimports, source toggles and cache invalidation. Benchmark on documented fixtures/hardware before claiming latency targets.

## Verification

Use focused Vitest unit tests plus real SQLite integration tests with temporary databases. Run representative import/prediction benchmarks; record inputs, timings and environment in verification. Avoid performance promises unsupported by measurements.
