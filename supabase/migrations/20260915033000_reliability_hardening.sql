-- Reliability hardening for Tomato08. Safe to apply to the existing project.

alter table public.modules
  add column if not exists revision integer not null default 1;

alter table public.test_sessions
  add column if not exists client_event_id text;

create unique index if not exists test_sessions_user_event_uidx
  on public.test_sessions(user_id, client_event_id);

create or replace function public.save_card_progress_safe(
  p_question_id text,
  p_last_result text,
  p_due_at timestamptz,
  p_interval_days numeric,
  p_ease numeric,
  p_reps integer,
  p_lapses integer,
  p_total_reviews integer,
  p_last_reviewed_at timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  applied boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.card_progress as cp (
    user_id, question_id, last_result, due_at, interval_days, ease,
    reps, lapses, total_reviews, last_reviewed_at, updated_at
  ) values (
    auth.uid(), p_question_id, p_last_result, p_due_at,
    coalesce(p_interval_days, 0), coalesce(p_ease, 2.5),
    coalesce(p_reps, 0), coalesce(p_lapses, 0), coalesce(p_total_reviews, 0),
    coalesce(p_last_reviewed_at, now()), now()
  )
  on conflict (user_id, question_id) do update set
    last_result = excluded.last_result,
    due_at = excluded.due_at,
    interval_days = excluded.interval_days,
    ease = excluded.ease,
    reps = excluded.reps,
    lapses = excluded.lapses,
    total_reviews = excluded.total_reviews,
    last_reviewed_at = excluded.last_reviewed_at,
    updated_at = now()
  where excluded.last_reviewed_at >= coalesce(cp.last_reviewed_at, '-infinity'::timestamptz)
  returning true into applied;

  return coalesce(applied, false);
end;
$$;

revoke all on function public.save_card_progress_safe(text,text,timestamptz,numeric,numeric,integer,integer,integer,timestamptz) from public, anon;
grant execute on function public.save_card_progress_safe(text,text,timestamptz,numeric,numeric,integer,integer,integer,timestamptz) to authenticated;

create or replace function public.save_test_session_safe(
  p_event_id text,
  p_module_id uuid,
  p_mode text,
  p_selected_group_ids jsonb,
  p_result_counts jsonb,
  p_total_questions integer,
  p_started_at timestamptz,
  p_completed_at timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if coalesce(btrim(p_event_id), '') = '' then
    raise exception 'event id required';
  end if;

  insert into public.test_sessions (
    user_id, module_id, mode, selected_group_ids, result_counts,
    total_questions, started_at, completed_at, client_event_id
  ) values (
    auth.uid(), p_module_id, coalesce(p_mode, 'unknown'),
    coalesce(p_selected_group_ids, '[]'::jsonb), coalesce(p_result_counts, '{}'::jsonb),
    coalesce(p_total_questions, 0), p_started_at, coalesce(p_completed_at, now()), p_event_id
  )
  on conflict (user_id, client_event_id) do nothing
  returning true into inserted;

  return coalesce(inserted, false);
end;
$$;

revoke all on function public.save_test_session_safe(text,uuid,text,jsonb,jsonb,integer,timestamptz,timestamptz) from public, anon;
grant execute on function public.save_test_session_safe(text,uuid,text,jsonb,jsonb,integer,timestamptz,timestamptz) to authenticated;

create or replace function public.sync_module_snapshot(
  p_module_id uuid,
  p_expected_revision integer,
  p_module_name text,
  p_is_published boolean,
  p_groups jsonb,
  p_questions jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_revision integer;
  next_revision integer;
begin
  if not public.is_developer() then
    raise exception 'developer role required';
  end if;

  select revision into current_revision
  from public.modules
  where id = p_module_id
  for update;

  if current_revision is null then
    raise exception 'module not found';
  end if;
  if current_revision <> p_expected_revision then
    raise exception 'stale_module_revision: expected %, current %', p_expected_revision, current_revision;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_groups, '[]'::jsonb)) as x(id uuid, name text, sort_order integer)
    join public.question_groups g on g.id = x.id
    where g.module_id <> p_module_id
  ) then
    raise exception 'group id belongs to another module';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_questions, '[]'::jsonb)) as x(id text)
    join public.questions q on q.id = x.id
    where q.module_id <> p_module_id
  ) then
    raise exception 'question id belongs to another module';
  end if;

  insert into public.question_groups as g (id, module_id, name, sort_order)
  select x.id, p_module_id, coalesce(nullif(btrim(x.name), ''), 'Untitled group'), x.sort_order
  from jsonb_to_recordset(coalesce(p_groups, '[]'::jsonb)) as x(id uuid, module_id uuid, name text, sort_order integer)
  on conflict (id) do update set
    name = excluded.name,
    sort_order = excluded.sort_order
  where g.name is distinct from excluded.name
     or g.sort_order is distinct from excluded.sort_order;

  insert into public.questions as q (
    id, module_id, group_id, question_type, question_text,
    question_image_path, answer_data, sort_order, is_active, updated_at
  )
  select x.id, p_module_id, x.group_id, x.question_type, coalesce(x.question_text, ''),
         x.question_image_path, coalesce(x.answer_data, '{}'::jsonb), x.sort_order,
         coalesce(x.is_active, true), now()
  from jsonb_to_recordset(coalesce(p_questions, '[]'::jsonb)) as x(
    id text, module_id uuid, group_id uuid, question_type text, question_text text,
    question_image_path text, answer_data jsonb, sort_order integer, is_active boolean
  )
  on conflict (id) do update set
    group_id = excluded.group_id,
    question_type = excluded.question_type,
    question_text = excluded.question_text,
    question_image_path = excluded.question_image_path,
    answer_data = excluded.answer_data,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now()
  where q.group_id is distinct from excluded.group_id
     or q.question_type is distinct from excluded.question_type
     or q.question_text is distinct from excluded.question_text
     or q.question_image_path is distinct from excluded.question_image_path
     or q.answer_data is distinct from excluded.answer_data
     or q.sort_order is distinct from excluded.sort_order
     or q.is_active is distinct from excluded.is_active;

  delete from public.questions q
  where q.module_id = p_module_id
    and not exists (
      select 1 from jsonb_to_recordset(coalesce(p_questions, '[]'::jsonb)) as x(id text)
      where x.id = q.id
    );

  delete from public.question_groups g
  where g.module_id = p_module_id
    and not exists (
      select 1 from jsonb_to_recordset(coalesce(p_groups, '[]'::jsonb)) as x(id uuid)
      where x.id = g.id
    );

  next_revision := current_revision + 1;
  update public.modules
     set name = coalesce(nullif(btrim(p_module_name), ''), name),
         is_published = coalesce(p_is_published, false),
         revision = next_revision,
         updated_at = now()
   where id = p_module_id;

  return next_revision;
end;
$$;

revoke all on function public.sync_module_snapshot(uuid,integer,text,boolean,jsonb,jsonb) from public, anon;
grant execute on function public.sync_module_snapshot(uuid,integer,text,boolean,jsonb,jsonb) to authenticated;

-- Ranking now represents latest strong recall, not mere exposure/repetition.
create or replace function public.memorized_rank(p_module_slug text)
returns table(my_rank integer, total_users integer, my_learned integer, top_learned integer, bank_size integer)
language sql
security definer
set search_path = public
as $$
  with mq as (
    select q.id
    from public.questions q
    join public.modules m on m.id = q.module_id
    where m.slug = p_module_slug and q.is_active
  ),
  base as (
    select pr.id as uid,
           (select count(*)
              from public.card_progress cp
             where cp.user_id = pr.id
               and cp.last_result in ('correct','confident')
               and cp.question_id in (select id from mq))::int as learned
    from public.profiles pr
    where pr.role = 'tester'
  ),
  ranked as (
    select b.uid, b.learned,
           rank() over (order by b.learned desc)::int as rnk,
           count(*) over ()::int as total,
           max(b.learned) over ()::int as top
    from base b
  )
  select r.rnk, r.total, r.learned, r.top, (select count(*)::int from mq)
  from ranked r
  where r.uid = auth.uid();
$$;

-- Remove legacy overlapping permissive policies after retaining their newer, scoped equivalents.
drop policy if exists progress_own on public.card_progress;
drop policy if exists modules_read on public.modules;
drop policy if exists modules_write on public.modules;
drop policy if exists groups_read on public.question_groups;
drop policy if exists groups_write on public.question_groups;
drop policy if exists questions_read on public.questions;
drop policy if exists questions_write on public.questions;
drop policy if exists presence_own on public.presence;
drop policy if exists reports_insert on public.question_reports;
drop policy if exists reports_read_own on public.question_reports;
drop policy if exists sessions_own on public.test_sessions;
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_self_update on public.profiles;

-- Developer-read policies should apply only to signed-in callers.
drop policy if exists card_progress_dev_select on public.card_progress;
create policy card_progress_dev_select on public.card_progress for select to authenticated using ((select public.is_developer()));
drop policy if exists presence_dev_select on public.presence;
create policy presence_dev_select on public.presence for select to authenticated using ((select public.is_developer()));
drop policy if exists profiles_dev_select on public.profiles;
create policy profiles_dev_select on public.profiles for select to authenticated using ((select public.is_developer()));

-- Rebuild presence owner policies with authenticated role and init-plan-safe auth calls.
drop policy if exists presence_own_insert on public.presence;
drop policy if exists presence_own_select on public.presence;
drop policy if exists presence_own_update on public.presence;
create policy presence_own_insert on public.presence for insert to authenticated with check (user_id = (select auth.uid()));
create policy presence_own_select on public.presence for select to authenticated using (user_id = (select auth.uid()));
create policy presence_own_update on public.presence for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Harden helper-function execution grants. Trigger functions do not need client EXECUTE.
alter function public.touch_updated_at() set search_path = public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_developer() from public, anon;
grant execute on function public.is_developer() to authenticated;
revoke execute on function public.list_question_reports(text) from public, anon;
grant execute on function public.list_question_reports(text) to authenticated;
revoke execute on function public.memorized_rank(text) from public, anon;
grant execute on function public.memorized_rank(text) to authenticated;
revoke execute on function public.set_report_status(uuid,text) from public, anon;
grant execute on function public.set_report_status(uuid,text) to authenticated;
