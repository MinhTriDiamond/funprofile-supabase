# Thực thi chính sách nguồn 24 giờ

1. Ghi mailbox/nhánh riêng sau xác nhận Telegram — đã thực hiện.
2. Thêm migration service-only: cờ mặc địnhOFF, source lease/audit, đủ24h/complete/outputverified, truy vấn ref và tombstone/guard chống race — kiểm SQL local/ACL/2connection.
3. Thêm backend cleanup step vào tickcron hiện có: verifyoutput/source, arm/fence, delete đúngsourcekey, HEAD404/recovery; cậpnhật audit originalRetained. Không đổi playback/output.
4. Unit/R2mock/offline/tsgo/Deno/SQL/build; self-review tập trung noearlydelete, sourceownership, ref race, retry404, flagOFF, khôngxóa output.
5. PR + CloudflarePreview đúnghead render; merge/xóa nhánh. Snapshot source/configvàmetadata canary; migration trước processfunction và webhooksharedbundle.
6. Source-dry-run canary: dueAt=published+24h, chưađủh thì khôngxóa. Probe nguồn HEAD, outputHEAD/Range; xácminh guard/ACL và cron tíchhợp. Bật cờ24h sau gates, không sửaclock đểxóa canary sớm.
7. Hồsơ/receipt/mailboxkếtquả + Telegramcopy; nếu chưatới hạn chỉ báođãlậplịch, không báođãxóa original. Rollbacktắtcờ vàgiữtombstone/output.
