# Storage and indexing

The release design uses **one local SQLite database** under Electron's `userData` for source identities, documents, source content required for intentional reindexing, unigram/bigram/trigram counts, active source flags and settings. No remote DB or service is planned.

TND-002 implements the imported-source portion in `typenudge.sqlite3`, created lazily when Sources is first used. WAL sidecars belong to the same logical database. Main-process code owns the only runtime DB connection, closes it on quit, enables foreign keys, and initializes schema version 1 transactionally. A newer schema version is refused rather than downgraded. TND-003 adds a read-only prediction repository on that same connection; it does not change the schema or require reindexing. Personal documents, source activation controls and settings UI remain later work.

## Storage model

| Table | Representative fields | Purpose |
| --- | --- | --- |
| `sources` | `id`, `kind` (`imported`/`personal`), `display_name`, `enabled`, `revision`, `content_hash`, timestamps | Independently managed corpus membership |
| `documents` | `id`, `source_id`, `body_text`, `byte_length` | Retained UTF-8 text, enabling reindex of each source; editor saving remains planned |
| `ngrams` | `source_id`, `n`, `context_key`, `next_token`, `frequency` | Counts by source and N=1/2/3 |
| `settings` | `key`, JSON `value` | Initial source mode, enabled N, personal-learning consent and index revision |

The schema is defined in `src/main/storage/store.ts`. Documents have an ID, unique source reference with cascading deletion, body text and UTF-8 byte length. Sources include a hashed canonical-path identity, display name, enabled flag, revision, SHA-256 content hash, token count and timestamps. N-grams additionally keep the first observed display spelling. Settings initially store `personalLearning=false`, `sourceMode="imported"`, `enabledN=[1,2,3]`, and an integer `indexRevision`; there is no personal-learning implementation or preference editor yet.

The N-gram primary key `(source_id, n, context_key, next_token)` supports per-source context/prefix ranges. An additional `(n, next_token COLLATE BINARY, source_id)` index supports prefix-first lookups. All text values use bound SQL parameters. List responses contain at most 100 summaries, never stored bodies or the full index.

## Import lifecycle

1. User selects a `.txt` or `.md` file using an OS file dialog. Only UTF-8 text is accepted; reject unsupported encoding/over-limit files with a clear error. Bound cumulative import size and file count.
2. Assign a stable source identity, store its text locally and tokenize into sentences and word sequences. Build **N=1,2,3** counts without crossing sentence/document boundaries.
3. Write the new source text, revision and counts **in one transaction**; the previous revision is replaced rather than double-counted. A repeat import of unchanged content is a no-op or idempotent replacement.
4. The user can enable, disable, delete or reindex that source independently. Disabled/deleted source counts must not affect predictions; no full-corpus rebuild is required.

TND-002 exposes import, list, reindex and delete in **Sources**. Enable/disable controls remain TND-004 work; replacement preserves the stored enabled flag. Each selected canonical path gets a stable UUID (Windows path identity is case-folded); renaming/moving a file creates another identity. Identical contents at different selected paths remain independent. A UTF-8 BOM is removed during decoding, while stored text otherwise retains original spelling, whitespace and line endings. The content hash is over that decoded UTF-8 text. Reimport of the same content is a no-op; replacement and explicit reindex increment revisions. Every successful mutation also advances `indexRevision` for later cache invalidation.

Reindex reads the stored body and needs no access to the original file. Deleting a source cascades to its body and counts, leaving other sources intact. A mixed selection reports per-file failures and keeps valid imports; a selection exceeding batch count/byte limits is rejected before any contribution is written. No external path is accepted from the renderer. Permission, missing-file, encoding, size and DB errors are recoverable and do not expose internal paths in UI errors.

## Import bounds and token rules

- Only explicitly selected regular `.txt` / `.md` files, with case-insensitive extensions and fatal UTF-8 decoding. Reject control characters in names and binary/control characters in bodies (tabs, CR and LF are allowed). Reject symbolic links, linked parent folders, directories and traversal-style paths; never scan a directory.
- At most **10 files**, **1 MiB per file**, **4 MiB per selection**, **100 stored sources**, **32 MiB total stored UTF-8 text**, **50,000 tokens per file**, and **128 Unicode code points per word**. Bounded reads also detect overgrowth/changed metadata during import. Counts are computed in main-process memory per bounded source, never in the renderer.
- Token keys use Unicode NFC and locale-independent lowercase. Letters/numbers with combining marks form words; internal straight/curly apostrophes belong to a word and normalize to a straight apostrophe in the key. Accents are preserved, with the first original NFC spelling retained for display.
- `. ! ? 。 ！ ？ ; :`, CR and LF end a context. Other punctuation (including commas/hyphens) separates words. Contexts are reset at every sentence/line/document boundary. This conservative rule intentionally does not infer abbreviations or perform language-specific segmentation. CJK runs are kept as written, without morphological tokenization.
- N=1 uses the empty context string. N=2/3 use JSON arrays of the previous one/two normalized tokens, avoiding ambiguous word separators. All three orders are indexed; TND-003 queries only the explicitly enabled orders with longest-context backoff.

## Personal writing

New saved notes belong to their own personal source/document identity. The **Learn from my writing** preference is **off by default**. Save always persists the user's note (when explicitly requested); index only if consent is on. Updating a saved note replaces its index contribution atomically; disabling learning stops future collection and excludes personal corpus from predictions according to user preference. Provide a way to remove/reset personal learned data.

## SQLite queries and indexing

A composite index should support fast lookups by active `source_id`, `n`, context and candidate. Prefix lookup must use a normalized token prefix and a SQLite-index-friendly query where possible; test accented Unicode and case folding explicitly. Keep a small bounded LRU for repeated lookups, keyed by source selection, enabled N, text prefix/context and current source revisions.

The TND-003 repository enforces requested IDs plus `enabled=1` at every order. It uses the existing primary key for source/N/context equality and binary candidate-prefix ranges, performs frequency aggregation inside SQLite, and returns `LIMIT 3`. Metadata is capped at 100 rows and each request makes at most three candidate queries. Frequencies are summed before limiting, so a word shared across sources can win even when it is outside each individual source's top three. Exact aggregation can still examine all matching indexed rows; the result limit is not a fixed query-work budget or latency guarantee. The existing source/text/token bounds cap corpus growth. See [prediction rules](prediction-engine.md) for tie-breaking, cache/snapshot semantics and measured limits.

**Never preload the entire database into renderer memory.** Indexing or expensive scanning runs off the renderer event loop; the UI stays responsive.

## Privacy and deletion

Imported and personal text remain **on the current machine** in the application's data directory. Deleting a source removes its stored text and index contribution. Uninstalling an application does not always remove OS user data automatically: document where that folder is and include a reset command/UI action in the finished release.
