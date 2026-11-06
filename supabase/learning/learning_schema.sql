-- STAGED, NOT APPLIED. Promote using `supabase migration new source_backed_learning`.
-- Additive only. Requires existing public.modules/questions and approved-account gate.
begin;
do $$ begin
  if to_regprocedure('security_private.is_allowed()') is null then
    raise exception 'Existing approved-account gate is required';
  end if;
end $$;

create table public.learning_sources (
  id uuid primary key, module_id uuid not null references public.modules(id),
  created_by uuid not null references auth.users(id), filename text not null,
  mime_type text not null check (mime_type in ('text/plain','image/png','image/jpeg','application/pdf')),
  object_path text not null unique, content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  byte_size integer not null check(byte_size between 1 and 2097152),
  created_at timestamptz not null default now()
);
create table public.learning_mappings (
  id uuid primary key default gen_random_uuid(), module_id uuid not null references public.modules(id),
  question_id text not null references public.questions(id), objective_id text not null,
  objective_title text not null, source_ids jsonb not null check(jsonb_typeof(source_ids)='array'),
  reviewed_by uuid not null references auth.users(id), reviewed_at timestamptz not null default now(),
  unique(module_id,question_id,objective_id)
);
create table public.learning_rules (
  id uuid primary key default gen_random_uuid(), module_id uuid not null references public.modules(id),
  custom_instructions text not null check(length(custom_instructions) between 0 and 8000),
  reviewed_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.learning_attempts (
  user_id uuid not null references auth.users(id), event_id text not null check(length(event_id) between 1 and 200),
  module_id uuid not null references public.modules(id), question_id text not null references public.questions(id),
  payload jsonb not null check(jsonb_typeof(payload)='object'), recorded_at timestamptz not null default now(),
  primary key(user_id,event_id)
);
create index learning_attempt_session on public.learning_attempts(user_id,module_id,(payload->>'session_id'));
create table public.learning_plans (
  id uuid primary key, user_id uuid not null references auth.users(id), module_id uuid not null references public.modules(id),
  request_id uuid not null, mode text not null check(mode in ('hasty','deliberate')),
  status text not null default 'queued' check(status in ('queued','working','published','failed')),
  input_snapshot jsonb not null, rules_snapshot jsonb not null,
  created_at timestamptz not null default now(), unique(user_id,request_id)
);
create table public.learning_jobs (
  id uuid primary key default gen_random_uuid(), plan_id uuid not null unique references public.learning_plans(id),
  stage text not null default 'organize' check(stage in ('organize','author','source_review','rules_review','presentation_review','publish')),
  status text not null default 'queued' check(status in ('queued','running','complete','failed')),
  attempts integer not null default 0 check(attempts between 0 and 3),
  available_at timestamptz not null default now(), lease_id uuid, lease_until timestamptz,
  payload jsonb not null default '{}'::jsonb, error_code text, history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.learning_worker_state (
  id boolean primary key default true check(id=true), last_seen timestamptz not null,
  worker_version text not null
);
create index learning_jobs_ready on public.learning_jobs(status,available_at);
create table public.learning_artifacts (
  id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.learning_plans(id),
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'), canonical_content text not null,
  content jsonb not null, status text not null default 'draft' check(status in ('draft','published')),
  created_at timestamptz not null default now(), published_at timestamptz,
  unique(plan_id,content_hash), check(content=canonical_content::jsonb)
);
create table public.learning_reviews (
  id uuid primary key default gen_random_uuid(), artifact_id uuid not null references public.learning_artifacts(id),
  content_hash text not null, role text not null check(role in ('source_review','rules_review','presentation_review')),
  verdict text not null check(verdict in ('PASS','REVISE')), model text not null,
  findings jsonb not null, created_at timestamptz not null default now(), unique(artifact_id,role,content_hash)
);
create table public.learning_acknowledgments (
  plan_id uuid not null references public.learning_plans(id), user_id uuid not null references auth.users(id),
  lesson_id text not null, content_hash text not null, acknowledged_at timestamptz not null default now(),
  primary key(plan_id,user_id,lesson_id)
);
create table public.learning_retest_results (
  plan_id uuid primary key references public.learning_plans(id), user_id uuid not null references auth.users(id),
  content_hash text not null, results jsonb not null, submitted_at timestamptz not null default now()
);

-- Versioned evidence is immutable even through application service-role writes.
-- Administrative retention/removal requires a separately reviewed operation.
create function public.learning_immutable_evidence() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='DELETE' then raise exception 'Versioned learning evidence cannot be deleted by the application'; end if;
  if TG_TABLE_NAME='learning_artifacts' then
    if (to_jsonb(NEW)-'status'-'published_at') is distinct from (to_jsonb(OLD)-'status'-'published_at')
      or (OLD.status='published' and NEW.status<>'published') then
      raise exception 'Artifact content is immutable; create a new version';
    end if;
  elsif TG_TABLE_NAME='learning_plans' then
    if (to_jsonb(NEW)-'status') is distinct from (to_jsonb(OLD)-'status') then
      raise exception 'Plan evidence snapshot is immutable';
    end if;
  else
    raise exception 'Learning evidence is append-only';
  end if;
  return NEW;
end $$;
do $$ declare t text; begin
  foreach t in array array['learning_sources','learning_rules','learning_attempts','learning_plans','learning_artifacts','learning_reviews','learning_acknowledgments','learning_retest_results'] loop
    execute format('create trigger learning_immutable before update or delete on public.%I for each row execute function public.learning_immutable_evidence()',t);
  end loop;
end $$;
revoke all on function public.learning_immutable_evidence() from public,anon,authenticated;

do $$ declare t text; begin
  foreach t in array array['learning_sources','learning_mappings','learning_rules','learning_attempts','learning_plans','learning_jobs','learning_worker_state','learning_artifacts','learning_reviews','learning_acknowledgments','learning_retest_results'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
-- No client SELECT on artifact answer keys, reviews, source internals or job payloads.
grant select on public.learning_plans,public.learning_attempts,public.learning_acknowledgments,public.learning_retest_results to authenticated;
create policy learning_attempt_own on public.learning_attempts for select to authenticated
  using(user_id=(select auth.uid()) and (select security_private.is_allowed()));
create policy learning_plan_own on public.learning_plans for select to authenticated
  using(user_id=(select auth.uid()) and (select security_private.is_allowed()));
create policy learning_ack_own on public.learning_acknowledgments for select to authenticated
  using(user_id=(select auth.uid()) and (select security_private.is_allowed()));
create policy learning_result_own on public.learning_retest_results for select to authenticated
  using(user_id=(select auth.uid()) and (select security_private.is_allowed()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('learning-sources','learning-sources',false,2097152,array['text/plain','image/png','image/jpeg','application/pdf']);
-- Only the authenticated API issues bounded upload and read operations. No public object policy.

create function public.learning_enqueue(p_plan jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
  -- Serialize per-account quota checks, including concurrent duplicate requests.
  perform pg_advisory_xact_lock(hashtextextended(p_plan->>'user_id',0));
  select id into result from public.learning_plans where user_id=(p_plan->>'user_id')::uuid and request_id=(p_plan->>'request_id')::uuid;
  if result is not null then return result; end if;
  if (select count(*) from public.learning_plans where user_id=(p_plan->>'user_id')::uuid and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=10 then
    raise exception 'Daily plan limit reached';
  end if;
  if (select count(*) from public.learning_plans where user_id=(p_plan->>'user_id')::uuid and status in ('queued','working'))>=3 then
    raise exception 'Complete pending plans before requesting more';
  end if;
  insert into public.learning_plans(id,user_id,module_id,request_id,mode,input_snapshot,rules_snapshot)
  values((p_plan->>'id')::uuid,(p_plan->>'user_id')::uuid,(p_plan->>'module_id')::uuid,
    (p_plan->>'request_id')::uuid,p_plan->>'mode',p_plan->'input_snapshot',p_plan->'rules_snapshot')
  on conflict(user_id,request_id) do nothing returning id into result;
  if result is null then
    select id into result from public.learning_plans where user_id=(p_plan->>'user_id')::uuid and request_id=(p_plan->>'request_id')::uuid;
  end if;
  insert into public.learning_jobs(plan_id) values(result) on conflict(plan_id) do nothing;
  return result;
end $$;

create function public.learning_claim_job(p_plan_id uuid default null) returns setof public.learning_jobs
language plpgsql security invoker set search_path='' as $$
declare chosen uuid;
begin
  update public.learning_jobs set status='failed',error_code='lease_exhausted',updated_at=now()
    where status='running' and lease_until<now() and attempts>=3;
  update public.learning_plans p set status='failed' from public.learning_jobs j where j.plan_id=p.id and j.status='failed';
  select id into chosen from public.learning_jobs where
    (p_plan_id is null or plan_id=p_plan_id) and attempts<3 and
    ((status='queued' and available_at<=now()) or (status='running' and lease_until<now()))
    order by available_at for update skip locked limit 1;
  if chosen is null then return; end if;
  update public.learning_jobs set status='running',attempts=attempts+1,lease_id=gen_random_uuid(),
    lease_until=now()+interval '120 seconds',updated_at=now() where id=chosen;
  update public.learning_plans p set status='working' from public.learning_jobs j where j.id=chosen and p.id=j.plan_id;
  return query select * from public.learning_jobs where id=chosen;
end $$;

create function public.learning_finish_job(p_job_id uuid,p_lease_id uuid,p_next_stage text,p_payload jsonb,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.learning_jobs;
begin
  select * into job from public.learning_jobs where id=p_job_id and lease_id=p_lease_id and status='running' and lease_until>now() for update;
  if job.id is null then return false; end if;
  update public.learning_jobs set
    status=case when p_error is not null then case when attempts>=3 or p_error='review_revision_limit' then 'failed' else 'queued' end
      when p_next_stage is null then 'complete' else 'queued' end,
    stage=coalesce(p_next_stage,stage), attempts=case when p_error is null then 0 else attempts end,
    payload=case when p_error is null then p_payload else payload end,
    error_code=p_error, available_at=now()+case when p_error is null then interval '0 seconds' else interval '15 seconds' * attempts end,
    history=history||jsonb_build_array(jsonb_build_object('stage',stage,'attempt',attempts,'at',now(),'error',p_error)),
    lease_id=null,lease_until=null,updated_at=now() where id=job.id;
  if p_error is not null and (job.attempts>=3 or p_error='review_revision_limit') then update public.learning_plans set status='failed' where id=job.plan_id; end if;
  return true;
end $$;

create function public.learning_publish(p_artifact_id uuid,p_job_id uuid,p_lease_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare a public.learning_artifacts; j public.learning_jobs; n integer;
begin
  select * into j from public.learning_jobs where id=p_job_id and lease_id=p_lease_id and status='running' and stage='publish' and lease_until>now() for update;
  select * into a from public.learning_artifacts where id=p_artifact_id and plan_id=j.plan_id for update;
  if j.id is null or a.id is null then raise exception 'Valid publication lease required'; end if;
  if encode(extensions.digest(convert_to(a.canonical_content,'UTF8'),'sha256'),'hex')<>a.content_hash then raise exception 'Artifact hash mismatch'; end if;
  select count(distinct role) into n from public.learning_reviews where artifact_id=a.id and content_hash=a.content_hash and verdict='PASS';
  if n<>3 then raise exception 'Independent reviews required'; end if;
  update public.learning_artifacts set status='published',published_at=now() where id=a.id;
  update public.learning_plans set status='published' where id=a.plan_id;
  return true;
end $$;
revoke all on function public.learning_enqueue(jsonb),public.learning_claim_job(uuid),public.learning_finish_job(uuid,uuid,text,jsonb,text),public.learning_publish(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.learning_enqueue(jsonb),public.learning_claim_job(uuid),public.learning_finish_job(uuid,uuid,text,jsonb,text),public.learning_publish(uuid,uuid,uuid) to service_role;
commit;
