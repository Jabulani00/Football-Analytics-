begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Replace jobs by stable name so reapplying the migration cannot duplicate work.
select cron.unschedule(jobid)
from cron.job
where jobname in ('betway-hunt-every-five-minutes', 'betway-verify-every-fifteen-minutes');

select cron.schedule(
  'betway-hunt-every-five-minutes',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://zymspnykcnqczqdnernb.supabase.co/functions/v1/betway-hunt',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce((
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'betway_cron_secret'
          limit 1
        ), '')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 140000
    );
  $job$
);

select cron.schedule(
  'betway-verify-every-fifteen-minutes',
  '2,17,32,47 * * * *',
  $job$
    select net.http_post(
      url := 'https://zymspnykcnqczqdnernb.supabase.co/functions/v1/betway-verify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce((
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'betway_cron_secret'
          limit 1
        ), '')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 140000
    );
  $job$
);

commit;
