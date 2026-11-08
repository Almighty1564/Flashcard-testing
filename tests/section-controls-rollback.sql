-- Run after section-controls.sql on an isolated schema with synthetic auth helpers.
-- All fixture rows and JWT settings are rolled back.
begin;

insert into public.profiles(id, role) values
  ('00000000-0000-4000-8000-000000000001', 'developer'),
  ('00000000-0000-4000-8000-000000000002', 'tester'),
  ('00000000-0000-4000-8000-000000000003', 'developer');
insert into public.modules(id, slug, name, is_published) values
  ('00000000-0000-4000-8000-000000000011', 'section-fixture-a', 'Fixture A', true),
  ('00000000-0000-4000-8000-000000000012', 'section-fixture-b', 'Fixture B', true);
insert into public.question_groups(id, module_id, name) values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000011', 'Fixture section'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000012', 'Other fixture section');
insert into public.questions(id, module_id, group_id, question_type, question_text, is_active) values
  ('section-fixture-active','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021','flashcard','Active',true),
  ('section-fixture-held','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021','flashcard','Held',false),
  ('section-fixture-ungrouped','00000000-0000-4000-8000-000000000011',null,'flashcard','Ungrouped',true);
insert into public.card_progress(user_id, question_id, last_result)
values ('00000000-0000-4000-8000-000000000002','section-fixture-active','correct');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);

do $$
declare
  m constant uuid := '00000000-0000-4000-8000-000000000011';
  g constant uuid := '00000000-0000-4000-8000-000000000021';
  other_group constant uuid := '00000000-0000-4000-8000-000000000022';
  actual record;
begin
  select * into strict actual from public.memorized_rank('section-fixture-a');
  if actual.bank_size <> 2 or actual.my_learned <> 1 then
    raise exception 'baseline rank incorrect';
  end if;
  begin
    perform public.set_question_group_enabled(m,g,false,1);
    raise exception 'learner could toggle';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
  begin
    perform public.set_question_group_enabled(m,g,false,1);
    raise exception 'unapproved developer could toggle';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  begin
    perform public.set_question_group_enabled(m,other_group,false,1);
    raise exception 'expected cross-module rejection';
  exception when raise_exception then
    if sqlerrm <> 'section not found in module' then raise; end if;
  end;
  if public.set_question_group_enabled(m,g,false,1) <> 2
     or public.set_question_group_enabled(m,g,false,2) <> 2 then
    raise exception 'disable or idempotent retry returned wrong revision';
  end if;
  begin
    perform public.set_question_group_enabled(m,g,true,1);
    raise exception 'expected stale revision rejection';
  exception when raise_exception then
    if sqlerrm not like 'stale_module_revision:%' then raise; end if;
  end;
  if not exists (select from public.question_groups where id=g and not is_enabled)
     or (select count(*) from public.questions where module_id=m) <> 3 then
    raise exception 'developer cannot author all items';
  end if;

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
  if exists (select from public.question_groups where id=g)
     or exists (select from public.questions where group_id=g)
     or not exists (select from public.questions where id='section-fixture-ungrouped') then
    raise exception 'disabled section visibility mismatch';
  end if;
  select * into strict actual from public.memorized_rank('section-fixture-a');
  if actual.bank_size <> 1 or actual.my_learned <> 0 then
    raise exception 'disabled questions counted in rank';
  end if;

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  if public.sync_module_snapshot(m,2,'Fixture A',true,
    jsonb_build_array(jsonb_build_object('id',g,'name','Renamed fixture','sort_order',0,'is_enabled',true)),
    (select jsonb_agg(to_jsonb(q) || '{"is_active":true}'::jsonb) from public.questions q where module_id=m)
  ) <> 3 then raise exception 'snapshot revision wrong'; end if;
  if not exists (select from public.question_groups where id=g and not is_enabled and name='Renamed fixture')
     or not exists (select from public.questions where id='section-fixture-held' and not is_active) then
    raise exception 'snapshot overwrote eligibility flags';
  end if;
  if public.set_question_group_enabled(m,g,true,3) <> 4 then
    raise exception 'reenable revision wrong';
  end if;

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
  if not exists (select from public.questions where id='section-fixture-active')
     or exists (select from public.questions where id='section-fixture-held') then
    raise exception 'reenabled section question visibility mismatch';
  end if;
  select * into strict actual from public.memorized_rank('section-fixture-a');
  if actual.bank_size <> 2 or actual.my_learned <> 1 then
    raise exception 'original progress did not return in rank';
  end if;
end;
$$;

rollback;
