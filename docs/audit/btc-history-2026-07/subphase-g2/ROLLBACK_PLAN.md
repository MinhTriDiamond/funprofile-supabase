# G2 · ROLLBACK_PLAN — rollback tức thì mọi bước

**Nguyên tắc:** mọi bước G3–G7 đều phải reversible. Không hard-delete, không destructive migration.

## 1. Cơ chế rollback theo giai đoạn

### G3 (schema mới)
- Bảng mới (`btc_tx_semantic`, `btc_review_queue`, `btc_ownership_snapshot`, `btc_raw_tx_cache`): nullable, không FK cứng vào bảng cũ.
- Cột thêm (`vout_index`, `classifier_version`, `tags`, `superseded_by`, `integrity_status`): tất cả NULLABLE / DEFAULT.
- **Rollback:** không cần drop; để bảng/cột trống, feature flag OFF là không ai đọc.

### G4 (parser v2 dark launch)
- `system_config.scan_btc_v2_enabled=false` → parser v2 không chạy.
- V1 vẫn chạy bình thường (chưa disable).
- **Rollback:** set flag false, restart edge function.

### G5 (historical shadow classify)
- Chỉ ghi vào `btc_tx_semantic` shadow.
- Không đụng `donations`/`wallet_transfers`/view.
- **Rollback:** TRUNCATE `btc_tx_semantic` (an toàn vì shadow), hoặc bỏ qua.

### G6 (view cutover) — RỦI RO CAO NHẤT
- Migration cutover:
  ```sql
  CREATE OR REPLACE VIEW v_btc_history AS <new SSOT query>;
  ```
- Migration rollback (prepare sẵn trong cùng PR):
  ```sql
  CREATE OR REPLACE VIEW v_btc_history AS <old query reading donations>;
  ```
- Consumer đã migrate sang view → revert view = revert toàn bộ đọc.
- **Rollback:** apply migration đảo chiều trong 1 lệnh. Data không mất.

### G7 (leaderboard rebuild)
- Job rebuild leaderboard ghi vào bảng riêng `benefactors_v2`.
- UI switch qua `benefactors_v2` bằng feature flag `benefactors_v2_enabled`.
- **Rollback:** flag OFF → UI đọc leaderboard cũ.

## 2. Kill-switch tức thì
| Component | Kill-switch | Effect |
|---|---|---|
| Parser v2 | `system_config.scan_btc_v2_enabled=false` | v1 chạy 100% |
| Discovery v2 | `system_config.btc_discovery_v2_enabled=false` | không học aux mới |
| View cutover | Revert migration `v_btc_history` | UI đọc data cũ |
| Leaderboard v2 | `system_config.benefactors_v2_enabled=false` | UI đọc board cũ |

## 3. Điều kiện KHÔNG được rollback
Sau khi Cha duyệt supersede row cụ thể trong `btc_review_queue`, nếu đã áp dụng `superseded_by`:
- Rollback = clear `superseded_by` + `integrity_status='ok'` trên row đó.
- Data không mất, chỉ khôi phục hiển thị.

## 4. Không được làm
- ❌ Migration destructive (DROP TABLE, DROP COLUMN NOT NULL, TRUNCATE `donations`).
- ❌ Xoá `profile_btc_aux_addresses`.
- ❌ Xoá cache raw tx (giữ để re-classify khi parser fix bug).
- ❌ Hard-delete row `donations`/`wallet_transfers` cũ.

## 5. Rollback drill (trong QA)
- Trước khi cutover G6: chạy full drill trên staging.
- Đo thời gian: revert view + reload consumer < 60s.
- Verify wallet UI quay về data v1 chính xác 100%.

## 6. Escalation
Nếu rollback không cứu được:
1. Kill toàn bộ 4 flag ở §2.
2. Snapshot DB trước cutover (Cloud → Advanced settings → Export data).
3. Alert Cha + admin team.
4. Freeze scanner (`scan_btc_enabled=false`) cho tới khi có root-cause.
