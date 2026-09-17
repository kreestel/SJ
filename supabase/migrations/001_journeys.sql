-- Prototype document storage with optimistic concurrency, scoped server access,
-- and a database-owned deadline evaluator independent of connected browsers.
create table if not exists public.journey_documents (
  id uuid primary key,
  version bigint not null default 0,
  data jsonb not null
);
create unique index if not exists journey_share_hash on public.journey_documents ((data->>'shareHash'));
create unique index if not exists journey_ack_hash on public.journey_documents ((data->>'ackHash'));
create index if not exists journey_expiry on public.journey_documents ((data->>'expiresAt'));
alter table public.journey_documents enable row level security;
revoke all on public.journey_documents from anon, authenticated;
grant all on public.journey_documents to service_role;

create or replace function public.evaluate_journey_deadlines() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row_record record; j jsonb; state text; eta timestamptz;
  grace_seconds int; response_seconds int; now_at timestamptz := clock_timestamp();
  event_type text; events jsonb; changed boolean;
begin
  delete from public.journey_documents where (data->>'expiresAt')::timestamptz <= now_at;
  for row_record in select * from public.journey_documents
    where data->>'status' in ('ACTIVE','ARRIVAL_DETECTED','GRACE_PERIOD','CHECK_IN_DUE')
    for update skip locked
  loop
    j := row_record.data; state := j->>'status'; eta := (j->>'expectedAt')::timestamptz;
    grace_seconds := (j->>'graceSeconds')::int; response_seconds := (j->>'responseSeconds')::int;
    events := j->'events'; changed := false;
    for stage in 1..3 loop
      event_type := null;
      if state in ('ACTIVE','ARRIVAL_DETECTED') and now_at >= eta then
        state := 'GRACE_PERIOD'; event_type := 'ETA_MISSED';
      elsif state = 'GRACE_PERIOD' and now_at >= eta + make_interval(secs => grace_seconds) then
        state := 'CHECK_IN_DUE'; event_type := 'CHECK_IN_REQUESTED';
      elsif state = 'CHECK_IN_DUE' and now_at >= eta + make_interval(secs => grace_seconds + response_seconds) then
        state := 'ESCALATED'; event_type := 'ESCALATION_SENT';
        j := jsonb_set(j, '{escalatedAt}', to_jsonb(now_at));
      end if;
      if event_type is not null then
        changed := true;
        events := events || jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'type',event_type,'occurredAt',now_at,'receivedAt',now_at,'sequence',0));
      end if;
    end loop;
    if changed then
      j := jsonb_set(jsonb_set(j,'{status}',to_jsonb(state)),'{events}',events);
      update public.journey_documents set data=j, version=version+1 where id=row_record.id;
    end if;
  end loop;
end;
$$;
revoke all on function public.evaluate_journey_deadlines() from public, anon, authenticated;
grant execute on function public.evaluate_journey_deadlines() to service_role;

-- Enable pg_cron in Supabase Dashboard > Integrations > Cron first.
-- Then run the following ONCE in the SQL editor:
-- select cron.schedule('safejourney-deadlines', '* * * * *', 'select public.evaluate_journey_deadlines()');
-- Demo timers may escalate up to one minute after their deadline on hosted cron.
