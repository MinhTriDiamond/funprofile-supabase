UPDATE live_replays SET archive_attempts = 7, archive_next_retry_at = now()
WHERE id IN ('66b28bb2-775a-493f-8b7b-6eec7634bce2','766d0144-ed47-4b3a-ab5c-aceac6da2d9e');