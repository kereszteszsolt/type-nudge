# Testing and evidence plan

All items below are **planned tests**, not completed verification. The only authoritative runtime evidence is in [Release 0.1 verification](releases/release-0.1-mvp/verification.md).

| Scope | Planned approach | Story |
| --- | --- | --- |
| Electron main/preload boundary | Mocked IPC input validation, no Node/SQLite access in renderer, deny unexpected filesystem requests | TND-001 |
| Text ingestion/SQLite | Temp DBs, Unicode TXT/MD, safe limits, repeat import, per-source enable/delete/reindex | TND-002 |
| N-gram calculations | Deterministic fixtures for N=1/2/3, prefix, backoff, source filters, top 3 | TND-003 |
| Inline editor UX | CodeMirror tests/smoke for Tab, Alt+Down, Esc, stale requests, IME and normal shortcuts | TND-004 |
| Personal learning | Opt-in default off; save, resave without double count, disable learning and reset | TND-005 |
| Desktop delivery | Vitest, Electron smoke, packaged app launch and native `better-sqlite3` DB open on each verified OS, CI | TND-006 |

## Performance checks

Use reproducible small and medium corpora with documented word counts, number of sources, input prefix length, hardware and runtime. Capture warm/cold prediction latency and indexing time. Set sensible targets only after measuring a real application; **do not claim a benchmark or fast response from planned documentation**.

## Recording rules

Record actual OS, commands, result summaries and failures for the current story. If a target platform, packaging action or test was not run, write `Not run`. No paid services or secrets are needed; network access is not a feature requirement. Capture failures and limitations plainly.
