# TND-003: N-gram prediction engine

## Status

Implemented — 2026-10-18. Main-process unit/real SQLite checks, regression tests, typecheck and reproducible benchmark passed on Linux x64/WSL2 with Node 24.18.0. Editor/IPC integration is TND-004 work; desktop/packaging and other OS targets were not rerun for this story. See [verification](../verification.md#tnd-003--2026-10-18).

## User story

As a writer, I want helpful next-word and partial-word suggestions so that I can type faster without an online model.

## Goal

Implement a deterministic, source-filtered word-frequency/prefix/N-gram prediction module with configurable N=1,2,3.

## Dependencies

TND-002 implemented and verified.

## Acceptance criteria

- [x] Expose a narrow testable prediction interface for current word prefix, preceding completed-word context, active source IDs and enabled N sizes. No global text/keyboard capture.
- [x] Implement Unicode-aware token normalization, deterministic unigram/bigram/trigram counts and word-prefix matching; avoid joining N-grams across sentences/documents.
- [x] Query only explicitly enabled orders, preferring the longest usable context and backing off to shorter **enabled** orders when necessary. Reject an empty selection of enabled N sizes.
- [x] Rank based on observed active-source frequencies with stable tie-breaks; return a maximum of three unique words and no suggestion on empty matches.
- [x] Use indexed, bounded SQLite queries plus a small LRU cache; key/invalidate cache by context/prefix, source selection, enabled N and index revisions. Do not load the full DB into renderer memory.
- [x] Add deterministic unit/SQLite integration tests for N selection, prefix, multilingual text, disabled sources, ordering, repeated import/cache invalidation, and record a reproducible small benchmark with real timing and environment.

## Out of scope

No neural LLM, sentence-level generation, stemming/morphological engine, Trie/TST, fourth-order N, or unverified latency guarantee.
