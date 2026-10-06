-- Companions now write their liveness at most once a minute (and poll every 1-2 minutes when there is no work),
-- so a helper counts as offline only after 3 minutes of silence instead of 45 seconds.
create or replace function public.reap_jobs_and_workers()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- cloud jobs run inside a single serverless invocation: if its lease ran out, it died; fail it (retryable from the UI)
  update public.jobs set status = 'failed', error_code = 'CLOUD_TIMEOUT',
     error_message = 'Cloud transcription took too long. Try again, or use your computer for long videos.',
     lease_expires_at = null, finished_at = now(), updated_at = now()
   where status = 'processing' and engine = 'cloud' and lease_expires_at < now();
  update public.jobs set
     status = case when attempts >= max_attempts then 'failed'::public.job_status else 'queued'::public.job_status end,
     error_code = 'LEASE_EXPIRED',
     error_message = case when attempts >= max_attempts then 'Your computer stopped responding while working on this job.' else error_message end,
     worker_id = null, lease_expires_at = null,
     run_after = now() + (least(attempts, 5) * interval '20 seconds'),
     finished_at = case when attempts >= max_attempts then now() else finished_at end,
     updated_at = now()
   where status = 'processing' and engine = 'local' and lease_expires_at < now();
  update public.jobs set status = 'cancelled', finished_at = now(), updated_at = now()
   where status = 'queued' and cancel_requested;
  update public.workers set status = 'offline', current_job_id = null
   where status = 'online' and last_seen_at < now() - interval '3 minutes';
  update public.exports set status_v2 = 'expired'
   where status_v2 = 'ready' and expires_at is not null and expires_at < now();
  delete from public.device_codes where expires_at < now() - interval '1 day';
end $function$;
