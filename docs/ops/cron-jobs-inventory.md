# Hồ sơ `cron.job` — kiểm kê thực tế

> Nguồn sự thật: `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname` chạy trực tiếp trên DB production. File này được xây từ snapshot, không từ file cũ. Cập nhật khi thêm/xoá/huỷ cron.
>
> Snapshot: **2026-07-13** (68 job active).

## Quy ước

- **Vĩnh viễn** — chạy đều đặn, không tự huỷ.
- **One-shot** — chạy đúng 1 lần rồi tự `cron.unschedule()` trong body.
- Slot ban đêm (02:00 – 05:00 UTC) là khe housekeeping tập trung — thêm job mới nên chọn slot trống 15' để giảm chồng tải.

## Job mới trong đợt này (BTC P0 + Registry validate)

| Jobname | Schedule (UTC) | Loại | Ghi chú |
|---|---|---|---|
| `btc-raw-sat-guard-daily` | `45 4 * * *` | Vĩnh viễn | Gọi `public.btc_raw_sat_guard_scan()` trực tiếp trong DB. Chỉ INSERT `notifications` type `btc_guard_drift` cho admin khi NOT (threshold_1000.ok AND cross_table_ratio_1e8.ok). Actor = FUN.RICH (`a97cbb6c-...`). Không qua edge, không dùng service_role key. |
| `registry-validate-log-cleanup-30d` | `0 3 * * *` | Vĩnh viễn | Xoá `registry_validate_log` cũ hơn 30 ngày. |
| `registry-validate-report-24h` | `20 7 14 7 *` | **One-shot** | Chạy 2026-07-14 07:20 UTC, body tự `cron.unschedule('registry-validate-report-24h')`. Còn `active=true` vì chưa tới ngày. |
| `registry-validate-report-48h` | `20 7 15 7 *` | **One-shot** | Chạy 2026-07-15 07:20 UTC, self-unschedule. Còn `active=true` vì chưa tới ngày. |

Sau 15/07/2026, cần verify lại 2 dòng one-shot đã tự biến mất khỏi `cron.job`. Nếu còn → self-unschedule fail, mở điều tra.

## Kiểm kê đầy đủ (snapshot 2026-07-13, 68 job)

### Live / Agora (16)
`agora-webcam-recording-processor-every-1min`, `agora-webcam-replay-reconciler-every-5min`, `agora-webcam-stuck-promoter-every-1min`, `agora-webcam-temp-cleanup-every-15min`, `agora-webcam-zombie-cleanup-every-1min`, `concat-replay-webm-a`, `concat-replay-webm-b`, `live-duration-watchdog-every-1min`, `live-recording-orphan-recover-every-10min`, `live-replay-archive-every-1min`, `live-replay-cleanup-webm-backfill-every-2min`, `live-replay-mp4-poll-every-1min`, `live-replay-poll-status`, `live-replay-readiness-check-a`, `live-replay-readiness-check-b`, `live-replay-rtmp-pending-rescue-hourly`, `live-replay-stream-ingest-every-5min`, `live-rtmp-cleanup-stuck-every-30min`, `live-rtmp-grace-watchdog-every-1min`, `auto-finalize-recordings-every-5min`.

### BTC / wallet (5)
`btc-ownership-reverify-auto-resume` (`*/5 * * * *`), `btc-raw-sat-guard-daily` (`45 4 * * *`), `scan-btc-transactions-every-5min`, `auto-scan-donations-every-5min`, `auto-backfill-donations-every-5min`, `backfill-donations-to-transactions-5min`, `fast-scan-donations-every-minute`.

### PPLP / mint (14)
`pplp-auto-submit-batch` (`*/15`), `pplp-burst-detector-daily` (`45 2`), `pplp-epoch-snapshot-monthly` (`5 0 1 * *`), `pplp-mark-suspected-farming-daily` (`0 6`), `pplp-micro-preview-daily` (`15 2`), `pplp-mint-stale-recovery-2h` (`0 */2`), `pplp-recovery-tick-30m` (`*/30`), `pplp-split-stuck-throttled-daily` (`0 5`), `pplp-v2-auto-attest-internal-10min` (`*/10`), `pplp-v25-aggregate-daily` (`0 4`), `pplp-v25-impact-12h` (`0 */12`), `pplp-v25-intent-6h` (`0 */6`), `pplp-v25-stability-calculator-daily` (`15 3`), `pplp-v25-tier-daily` (`0 5`), `pplp-validation-window-daily` (`30 2`), `pplp-vesting-release-daily` (`0 2`), `auto-flip-recoverable-mint-hourly` (`50 * * * *`), `light-actions-auto-flip-daily` (`0 23`).

### Identity / trust (3)
`identity-did-auto-promote-daily` (`0 4`), `identity-epoch-snapshot-daily` (`30 3`), `identity-trust-engine-hourly` (`0 * * * *`).

### Ecosystem / pet / mystery-box / quest (10)
`connector-growth-daily` (`30 4`), `connector-window-expire-hourly` (`0 * * * *`), `mystery-box-daily-login` (`5 0`), `mystery-box-expire-daily` (`0 3`), `mystery-box-stats-recompute-daily` (`30 4`), `pet-battle-expire-hourly` (`5 * * * *`), `pet-risk-cron-daily` (`30 4`), `pet-tick-30min` (`*/30`), `quest-evaluate-batch-4h` (`7 */4`), `quest-streak-cron-daily` (`55 23`).

### Registry / housekeeping / stats (6)
`app-stats-refresh-5min`, `cascade-consistency-daily` (`0 4`), `cleanup-old-system-data-daily` (`30 3`), `daily-fraud-scan` (`0 7`), `fun-profile-outbox-publisher-1min`, `inflation-health-job-daily` (`0 3`), `registry-validate-log-cleanup-30d` (`0 3`).

### One-shot còn chờ (2)
`registry-validate-report-24h` (`20 7 14 7 *`), `registry-validate-report-48h` (`20 7 15 7 *`).

## Nợ kiểm kê

- **Đối chiếu định kỳ:** nên chạy `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname` mỗi lần thêm/xoá job và cập nhật file này. Không dựa vào memory/PR log.
- **Slot 04:30 UTC hiện có 3 job** (`connector-growth-daily`, `mystery-box-stats-recompute-daily`, `pet-risk-cron-daily`). Không thêm job thứ 4 vào slot này nếu tránh được — dời sang khe trống 15' (04:45 đã dùng, 04:15 và 04:50 trống).
