create table if not exists public.ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (now() at time zone 'utc')::date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);
alter table public.ai_usage_daily enable row level security;
revoke all on public.ai_usage_daily from anon, authenticated;

create policy ai_usage_no_direct_read on public.ai_usage_daily
for select to authenticated using (false);

create or replace function public.consume_ai_quota(p_daily_limit integer default 100)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
  current_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.is_developer() then raise exception 'developer role required'; end if;
  if p_daily_limit < 1 or p_daily_limit > 1000 then raise exception 'invalid quota'; end if;

  insert into public.ai_usage_daily(user_id,usage_date,request_count,updated_at)
  values(auth.uid(),today,1,now())
  on conflict (user_id,usage_date) do update set
    request_count=public.ai_usage_daily.request_count+1,
    updated_at=now()
  returning request_count into current_count;

  if current_count > p_daily_limit then
    update public.ai_usage_daily set request_count=p_daily_limit
    where user_id=auth.uid() and usage_date=today;
    return false;
  end if;
  return true;
end;
$$;
revoke all on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;
