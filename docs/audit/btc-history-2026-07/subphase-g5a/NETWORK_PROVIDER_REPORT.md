# G5A.1 · Network Provider Report (Template)

**Run ID:** `<fill-in>`
**Started:** `<UTC>`
**Finished:** `<UTC>`
**Mode:** `dry_run`
**Providers enabled:** `mempool.space → blockstream.info` (reserved slot ready)

---

## 1. High-level

| Metric | Value |
|---|---|
| Total requests | |
| Cache hits | |
| Provider switches | |
| Failures (all providers exhausted) | |
| Total fetch time (ms) | |
| Average latency / req (ms) | |

**PASS threshold:** `failures_final / total_requests < 1%`.

## 2. Per-provider breakdown

| Provider | Attempts | Success | Retry | Timeout | HTTP 429 | Other error | Total ms | Avg ms/attempt |
|---|---|---|---|---|---|---|---|---|
| mempool | | | | | | | | |
| blockstream | | | | | | | | |
| reserved | 0 | 0 | 0 | 0 | 0 | 0 | 0 | n/a |

## 3. Failure taxonomy

| Bucket | Count | % of attempts |
|---|---|---|
| timeout | | |
| http_429 | | |
| other_error | | |
| final failures (chain exhausted) | | |

## 4. Retry policy in effect

- Retries per provider: **3**
- Backoff schedule: **500ms → 1500ms → 3000ms**
- Timeout per request: **5000ms**
- Cache TTL (address stats, in-memory per run): **5 min**
- Concurrency: **3**, inter-batch delay: **400ms**

## 5. Cache effectiveness

| Metric | Value |
|---|---|
| Cache-first hits | |
| Cache hit rate | `cache_hit / total_requests` |

## 6. Verdict

- [ ] `failures_final < 1%` → PASS
- [ ] Any provider with >30% timeout rate → investigate

---

*Metrics source: `system_config.value.network` under key `g5a_dryrun_run:<run_id>` (populated by `BtcProviderManager.snapshot()`).*
