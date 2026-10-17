# TND-003: N-gram prediction engine

## Status

Planned

## User story

As a writer, I want helpful next-word and partial-word suggestions so that I can type faster without an online model.

## Goal

Implement a deterministic, source-filtered word-frequency/prefix/N-gram prediction module with configurable N=1,2,3.

## Dependencies

TND-002 implemented and verified.

## Acceptance criteria

- [ ] Expose a narrow testable prediction interface for current word prefix, preceding completed-word context, active source IDs and enabled N sizes. No global text/keyboard capture.
- [ ] Implement Unicode-aware token normalization, deterministic unigram/bigram/trigram counts and word-prefix matching; avoid joining N-grams across sentences/documents.
- [ ] Query only explicitly enabled orders, preferring the longest usable context and backing off to shorter **enabled** orders when necessary. Reject an empty selection of enabled N sizes.
- [ ] Rank based on observed active-source frequencies with stable tie-breaks; return a maximum of three unique words and no suggestion on empty matches.
- [ ] Use indexed, bounded SQLite queries plus a small LRU cache; key/invalidate cache by context/prefix, source selection, enabled N and index revisions. Do not load the full DB into renderer memory.
- [ ] Add deterministic unit/SQLite integration tests for N selection, prefix, multilingual text, disabled sources, ordering, repeated import/cache invalidation, and record a reproducible small benchmark with real timing and environment.

## Out of scope

No neural LLM, sentence-level generation, stemming/morphological engine, Trie/TST, fourth-order N, or unverified latency guarantee.
