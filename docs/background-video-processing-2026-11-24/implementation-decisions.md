# Quyết định triển khai và phần hoãn

Các quyết định dưới đây được trích nguyên văn từ nhật ký thực thi theo đúng thứ tự. Đây là các đánh đổi kỹ thuật, không phải bằng chứng canary đã hoàn tất.

1. Ruling: Work in existing authorized feature branch/current checkout, clean before implementation, rather than creating another worktree — user approved this branch and IDE workspace; no unrelated changes present.

2. Task 2: Ruling: Local PostgreSQL fixture mocks auth.uid only inside disposable loopback test databases — production auth schema remains untouched — if the fixture differs from hosted permissions, staging must catch it.

3. Task 2: Ruling: Expanded task to owner-scoped new post upload keys and multipart authorization — client-editable upload sessions alone cannot attest source ownership; explicit live custom paths stay unchanged — legacy sources need an explicit canary instead of automatic optimization.

4. Task 3: Ruling: Use TUS direct_user=true with maxDurationSeconds=14400 on creation, not copy — copy API does not document an input duration cap; official direct-creator docs do — costs one bounded backend transfer of the original, with a canary required before enablement.

5. Task 3: Ruling: Added optional bucket selection to existing multipart signing helpers; legacy calls keep identical defaults, private calls use manual redirects and timeouts — avoids duplicating SigV4 — a helper regression could affect RTMP, so regression tests remain required.

6. Task 4: Ruling: Corrected fixture and migration to the real posts.visibility column and added deleted_at checks — isolated fixture had incorrectly named the column privacy; reproduced failure before correction — hosted migration still requires staging validation against existing triggers.

7. Task 4: Ruling: Enforce the same owner namespace on get-upload-url as multipart-upload — otherwise single PUT could overwrite a protected source despite the multipart guard — extends deployment scope by one existing function, with legacy keys unaffected.

8. Task 4: Ruling: An explicit retry only wakes eligible jobs; needs_review requires manual reconciliation rather than clearing an ambiguous import — prevents duplicate billable VODs — operator intervention is needed after a lost CREATE response.

9. Task 5: Ruling: Exchange the five-minute signed permit in a POST body for a path-scoped HttpOnly/Secure cookie, rather than a query token — preserves stable URLs and keeps tokens out of URL logs/metadata — cross-site Preview playback depends on the browser allowing the SameSite=None cookie; failure stays private.

10. Task 6: Ruling: Owner retry uses a narrowly scoped authenticated RPC and resumes only a recorded safe phase; it never retries importing/ambiguous creation — UI owner-only controls are not authorization — an unrecoverable encoding error still needs operator intervention.

11. Task 6: Ruling: Reuse the existing feed posts realtime channel and invalidate only updates carrying processing metadata; mount the permission reader only for optimized videos — no image-only polling or added media queries — processing freshness depends on existing realtime delivery.

12. Task 7: Ruling: Cancelled jobs have a separate service-only fenced cleanup RPC; no cleanup transition can publish or resurrect a post — normal advance deliberately refuses cancelled jobs — adds two RPCs and a cancellation trigger migration.

13. Task 7: Ruling: Protect every job source/output key indefinitely, including cancelled and completed records; delete-from-r2 refuses protected keys — original retention and durable outputs have no approved TTL — reclaiming those bytes needs a future explicit purge policy.

14. Task 7: Ruling: Source replacement and soft deletion also cancel jobs, not only hard DELETE — real posts use deleted_at — incomplete multipart/owned VOD can be cleared after the lease expires, while originals and completed R2 output remain retained.

15. Final: Ruling: Hosted schema/deployment order cannot be certified by the local fixture — read actual production columns/triggers, snapshot deployed functions and keep flags off until scoped migration/probe/canary — a missed hosted interaction blocks rollout rather than being treated as passed.

16. Final: Ruling: Legacy MOV canary requires service-only exact key/owner attestation, never general legacy enqueue — completed source and selected post/session must match the reviewed manifest — incorrect operator attestation could import the wrong owned source.

17. Final: Ruling: Keep quota reservations conservative even when provider usage may already include them — preserves RTMP reserve under usage lag — admission throughput can be lower than theoretical capacity.

18. Final: Ruling: Browser coverage remains explicit: workerd and Chrome local are proved; Safari/cross-site Preview, actual source quality and production quota require canary evidence — private failures do not fall back public — rollout remains off if a required runtime gate fails.

19. Final: Ruling: Adaptive bitrate, historical batch processing and original deletion remain outside V1 — approved durable R2 design is one MP4 plus retained original — total R2 includes both original and optimized output.

20. Task 8: Ruling: Use a scheduled Worker with the existing approved dedicated cron-secret interface, instead of storing a cron secret in SQL/Vault — avoids touching forbidden vault schema and keeps processing independent of tabs — scheduled event delivery and handler versions need production verification.

21. Task 8: Ruling: New reader/frontend and flag-off backend must be deployed before the canary publishes a private locator — old frontend cannot authorize that locator — code may be on main while the feature is intentionally off until canary passes; do not call that complete.

22. Task 8: Ruling: The integration route is already authorized by the Coordinator workflow and approved plan — create PR/Preview and merge only after its gate, instead of asking the finishing-skill options menu again — canonical branch/base remains feat/quangvu-background-video-processing → main.

23. Task 8: Ruling: Cloudflare did not create a check for feat/*, so a temporary fix/quangvu-background-video-preview alias points to the exact same PR commit to trigger a Preview — no divergent implementation — remove the alias after integration.

## Phần nhỏ hoãn lại

- Final: minor (deferred): gallery download failure still lacks toast feedback.
- Final: minor (deferred): pure policy and processor retain duplicated decisions; processor safety tests cover actual paths without a refactor in this pass.
