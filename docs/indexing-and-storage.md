# Storage and indexing — proposed design

**One local SQLite database** under Electron's `userData` stores source identities, user-created documents, source content required for intentional reindexing, unigram/bigram/trigram counts, active source flags and UI settings. No remote DB or service is planned.

## Conceptual tables

| Table | Representative fields | Purpose |
| --- | --- | --- |
| `sources` | `id`, `kind` (`imported`/`personal`), `display_name`, `enabled`, `revision`, `content_hash`, timestamps | Independently managed corpus membership |
| `documents` | `id`, `source_id`, `body_text`, timestamps | Local editable/imported UTF-8 text, enabling reindex of each source |
| `ngrams` | `source_id`, `n`, `context_key`, `next_token`, `frequency` | Counts by source and N=1/2/3 |
| `settings` | source mode, enabled N, personal-learning consent, editor preferences | Preferences across restarts |

These are **conceptual schemas**, not generated SQL migrations. Keep tables and indexes minimal in actual implementation. Store *normalized* search tokens and retain the original text/casing for readable completion rendering where necessary.

## Import lifecycle

1. User selects a `.txt` or `.md` file using an OS file dialog. Only UTF-8 text is accepted; reject unsupported encoding/over-limit files with a clear error. Bound cumulative import size and file count.
2. Assign a stable source identity, store its text locally and tokenize into sentences and word sequences. Build **N=1,2,3** counts without crossing sentence/document boundaries.
3. Write the new source text, revision and counts **in one transaction**; the previous revision is replaced rather than double-counted. A repeat import of unchanged content is a no-op or idempotent replacement.
4. The user can enable, disable, delete or reindex that source independently. Disabled/deleted source counts must not affect predictions; no full-corpus rebuild is required.

## Personal writing

New saved notes belong to their own personal source/document identity. The **Learn from my writing** preference is **off by default**. Save always persists the user's note (when explicitly requested); index only if consent is on. Updating a saved note replaces its index contribution atomically; disabling learning stops future collection and excludes personal corpus from predictions according to user preference. Provide a way to remove/reset personal learned data.

## SQLite queries and indexing

A composite index should support fast lookups by active `source_id`, `n`, context and candidate. Prefix lookup must use a normalized token prefix and a SQLite-index-friendly query where possible; test accented Unicode and case folding explicitly. Keep a small bounded LRU for repeated lookups, keyed by source selection, enabled N, text prefix/context and current source revisions.

**Never preload the entire database into renderer memory.** Indexing or expensive scanning runs off the renderer event loop; the UI stays responsive.

## Privacy and deletion

Imported and personal text remain **on the current machine** in the application's data directory. Deleting a source removes its stored text and index contribution. Uninstalling an application does not always remove OS user data automatically: document where that folder is and include a reset command/UI action in the finished release.
