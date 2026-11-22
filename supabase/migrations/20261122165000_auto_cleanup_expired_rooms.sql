-- Automatically expire stale KEY BULLET multiplayer rooms.
create extension if not exists pg_cron;

create or replace function private.cleanup_expired_game_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.game_rooms
   where
     (status = 'waiting' and created_at < now() - interval '30 minutes')
     or (status = 'playing' and created_at < now() - interval '2 hours')
     or (status = 'finished' and coalesce(finished_at, created_at) < now() - interval '10 minutes');

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.cleanup_expired_game_rooms() from public, anon, authenticated;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'key-bullet-room-cleanup';

select cron.schedule(
  'key-bullet-room-cleanup',
  '*/5 * * * *',
  $job$select private.cleanup_expired_game_rooms();$job$
);
