-- Manual deployment. Apply as one transaction before releasing the frontend.
begin;
set local lock_timeout = '5s';

alter table public.question_groups add column is_enabled boolean not null default true;

-- Existing role, publication and membership policies remain in force.
create policy study_enabled_groups on public.question_groups
as restrictive for select to authenticated
using (is_enabled or (select public.is_developer()));

create policy study_enabled_group_questions on public.questions
as restrictive for select to authenticated
using (
  (select public.is_developer())
  or group_id is null
  or exists (
    select 1 from public.question_groups g
    where g.id = questions.group_id and g.module_id = questions.module_id and g.is_enabled
  )
);

create function public.set_question_group_enabled(
  p_module_id uuid,
  p_group_id uuid,
  p_enabled boolean,
  p_expected_revision integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_revision integer;
  current_enabled boolean;
begin
  if auth.uid() is null or public.is_developer() is not true
     or security_private.is_allowed() is not true then
    raise exception 'developer role required' using errcode = '42501';
  end if;
  if p_module_id is null or p_group_id is null or p_enabled is null or p_expected_revision is null then
    raise exception 'module, section, enabled state, and revision are required' using errcode = '22004';
  end if;

  select revision into current_revision
  from public.modules where id = p_module_id for update;
  if not found then
    raise exception 'module not found';
  end if;
  if current_revision is distinct from p_expected_revision then
    raise exception 'stale_module_revision: expected %, current %', p_expected_revision, current_revision;
  end if;

  select is_enabled into current_enabled
  from public.question_groups where id = p_group_id and module_id = p_module_id for update;
  if not found then
    raise exception 'section not found in module';
  end if;
  if current_enabled = p_enabled then
    return current_revision;
  end if;

  update public.question_groups set is_enabled = p_enabled
  where id = p_group_id and module_id = p_module_id;
  if not found then
    raise exception 'section update was not applied';
  end if;
  update public.modules set revision = current_revision + 1, updated_at = now()
  where id = p_module_id returning revision into current_revision;
  if not found then
    raise exception 'module revision update was not applied';
  end if;
  return current_revision;
end;
$$;

revoke execute on function public.set_question_group_enabled(uuid, uuid, boolean, integer) from public, anon;
grant execute on function public.set_question_group_enabled(uuid, uuid, boolean, integer) to authenticated;

-- Legacy clients include is_active in every snapshot. Use it for new rows only.
-- Section availability has its own RPC and remains independent of snapshot saves.
CREATE OR REPLACE FUNCTION public.sync_module_snapshot(p_module_id uuid, p_expected_revision integer, p_module_name text, p_is_published boolean, p_groups jsonb, p_questions jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare current_revision integer; next_revision integer;
begin
  if public.is_developer() is not true then raise exception 'developer role required'; end if;
  select revision into current_revision from public.modules where id=p_module_id for update;
  if current_revision is null then raise exception 'module not found'; end if;
  if current_revision is distinct from p_expected_revision then
    raise exception 'stale_module_revision: expected %, current %',p_expected_revision,current_revision;
  end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_groups,'[]'::jsonb)) as x(id uuid,name text,sort_order integer)
    join public.question_groups g on g.id=x.id where g.module_id<>p_module_id
  ) then raise exception 'group id belongs to another module'; end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_questions,'[]'::jsonb)) as x(id text)
    join public.questions q on q.id=x.id where q.module_id<>p_module_id
  ) then raise exception 'question id belongs to another module'; end if;
  insert into public.question_groups as g (id,module_id,name,sort_order)
  select x.id,p_module_id,coalesce(nullif(btrim(x.name),''),'Untitled group'),x.sort_order
  from jsonb_to_recordset(coalesce(p_groups,'[]'::jsonb)) as x(id uuid,module_id uuid,name text,sort_order integer)
  on conflict (id) do update set name=excluded.name,sort_order=excluded.sort_order
  where g.name is distinct from excluded.name or g.sort_order is distinct from excluded.sort_order;
  insert into public.questions as q (
    id,module_id,group_id,question_type,question_text,question_image_path,
    answer_data,sort_order,is_active,updated_at
  )
  select x.id,p_module_id,x.group_id,x.question_type,coalesce(x.question_text,''),
         x.question_image_path,coalesce(x.answer_data,'{}'::jsonb),x.sort_order,
         coalesce(x.is_active,true),now()
  from jsonb_to_recordset(coalesce(p_questions,'[]'::jsonb)) as x(
    id text,module_id uuid,group_id uuid,question_type text,question_text text,
    question_image_path text,answer_data jsonb,sort_order integer,is_active boolean
  )
  on conflict (id) do update set
    group_id=excluded.group_id,question_type=excluded.question_type,
    question_text=excluded.question_text,question_image_path=excluded.question_image_path,
    answer_data=excluded.answer_data,sort_order=excluded.sort_order,
    updated_at=now()
  where q.group_id is distinct from excluded.group_id
     or q.question_type is distinct from excluded.question_type
     or q.question_text is distinct from excluded.question_text
     or q.question_image_path is distinct from excluded.question_image_path
     or q.answer_data is distinct from excluded.answer_data
     or q.sort_order is distinct from excluded.sort_order;
  delete from public.questions q where q.module_id=p_module_id and not exists (
    select 1 from jsonb_to_recordset(coalesce(p_questions,'[]'::jsonb)) as x(id text) where x.id=q.id
  );
  delete from public.question_groups g where g.module_id=p_module_id and not exists (
    select 1 from jsonb_to_recordset(coalesce(p_groups,'[]'::jsonb)) as x(id uuid) where x.id=g.id
  );
  next_revision:=current_revision+1;
  update public.modules set
    name=coalesce(nullif(btrim(p_module_name),''),name),
    is_published=coalesce(p_is_published,false),revision=next_revision,updated_at=now()
  where id=p_module_id;
  return next_revision;
end;$function$;

-- This existing definer bypasses RLS and needs the same study eligibility check.
CREATE OR REPLACE FUNCTION public.memorized_rank(p_module_slug text)
 RETURNS TABLE(my_rank integer, total_users integer, my_learned integer, top_learned integer, bank_size integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with mq as(select q.id from public.questions q join public.modules m on m.id=q.module_id where m.slug=p_module_slug and m.is_published and q.is_active
   and (q.group_id is null or exists (
     select 1 from public.question_groups g
     where g.id = q.group_id and g.module_id = q.module_id and g.is_enabled
   ))),
 base as(select pr.id as uid,(select count(*) from public.card_progress cp where cp.user_id=pr.id and cp.last_result in ('correct','confident') and cp.question_id in(select id from mq))::int as learned from public.profiles pr where pr.role='tester'),
 ranked as(select b.uid,b.learned,rank() over(order by b.learned desc)::int as rnk,count(*) over()::int as total,max(b.learned) over()::int as top from base b)
 select r.rnk,r.total,r.learned,r.top,(select count(*)::int from mq) from ranked r where r.uid=auth.uid() and security_private.is_allowed();
$function$;

commit;
