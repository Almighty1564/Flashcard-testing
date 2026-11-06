// Real isolated PostgreSQL via PGlite. Auth/Storage schemas are explicit local stubs;
// this does not exercise hosted Supabase services or production data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let PGlite,unavailable='Install pinned @electric-sql/pglite or set PGLITE_PATH to its dist/index.js.';
try{({PGlite}=await import(process.env.PGLITE_PATH?pathToFileURL(path.resolve(process.env.PGLITE_PATH)).href:'@electric-sql/pglite'));}catch(error){if(process.env.PGLITE_PATH)throw error;unavailable+=' '+error.code;}
const ids={alice:'10000000-0000-4000-8000-000000000001',bob:'10000000-0000-4000-8000-000000000002',module:'20000000-0000-4000-8000-000000000001',plan:'30000000-0000-4000-8000-000000000001',request:'40000000-0000-4000-8000-000000000001',source:'50000000-0000-4000-8000-000000000001',artifact:'60000000-0000-4000-8000-000000000001'};
test('actual staged learning SQL: isolated PostgreSQL syntax, permissions, RLS and publication gates',{skip:!PGlite&&unavailable},async t=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage; create schema security_private; create schema extensions;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function security_private.is_allowed() returns boolean language sql stable as $$select coalesce(current_setting('test.account_approved',true),'true')='true'$$;
      -- Compatibility shim: actual Postgres SHA256, not a fake hash or worker verdict.
      create function extensions.digest(data bytea,algorithm text) returns bytea language sql immutable as $$select case when algorithm='sha256' then pg_catalog.sha256(data) else null end$$;
      create table public.modules(id uuid primary key);
      create table public.questions(id text primary key,module_id uuid references public.modules(id));
      create table public.profiles(id uuid primary key,role text);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
      alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
      grant usage on schema public,auth,storage,security_private,extensions to anon,authenticated,service_role;
      grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
      insert into auth.users values('${ids.alice}'),('${ids.bob}');
      insert into public.modules values('${ids.module}');
      insert into public.questions values('fixture-question','${ids.module}');`);
    await db.exec(fs.readFileSync(path.join(root,'supabase/learning/learning_schema.sql'),'utf8'));
    const role=async(name,user=ids.alice,approved=true)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('test.account_approved',$2,false)",[user,String(approved)]);await db.exec('set role '+name);};
    const query=(sql,args=[])=>db.query(sql,args);
    const scalar=async(sql,args=[])=>Object.values((await query(sql,args)).rows[0])[0];
    const reject=async(sql,args=[])=>assert.rejects(query(sql,args));
    const plan={id:ids.plan,user_id:ids.alice,module_id:ids.module,request_id:ids.request,mode:'deliberate',input_snapshot:{attempts:[]},rules_snapshot:{version:1}};
    await role('service_role');
    await query("insert into public.learning_attempts(user_id,event_id,module_id,question_id,payload) values($1,'fixture-event',$2,'fixture-question',$3)",[ids.alice,ids.module,{response:'private raw answer'}]);
    await query("insert into public.learning_sources(id,module_id,created_by,filename,mime_type,object_path,content_hash,byte_size) values($1,$2,$3,'source.txt','text/plain','alice/source.txt',$4,12)",[ids.source,ids.module,ids.alice,'a'.repeat(64)]);
    await query("insert into storage.objects(bucket_id,name,owner) values('learning-sources','alice/source.txt',$1)",[ids.alice]);
    await t.test('actual migration runs; service-only enqueue is idempotent and creates one job',async()=>{
      assert.equal(await scalar('select public.learning_enqueue($1)',[plan]),ids.plan);
      assert.equal(await scalar('select public.learning_enqueue($1)',[{...plan,id:'30000000-0000-4000-8000-000000000099'}]),ids.plan);
      assert.equal(await scalar('select count(*)::int from public.learning_plans'),1);
      assert.equal(await scalar('select count(*)::int from public.learning_jobs'),1);
    });
    await t.test('anonymous cannot read personal tables, unpublished answer keys or invoke worker RPCs',async()=>{
      await role('anon');for(const table of ['learning_attempts','learning_plans','learning_sources','learning_artifacts','learning_reviews'])await reject('select * from public.'+table);
      await reject('select public.learning_enqueue($1)',[plan]);await reject('select * from public.learning_claim_job(null)');
      assert.equal(await scalar('select count(*)::int from storage.objects'),0);
    });
    await t.test('authenticated owner can read own evidence; other users and unapproved users cannot',async()=>{
      await role('authenticated',ids.alice);assert.equal(await scalar('select count(*)::int from public.learning_attempts'),1);assert.equal(await scalar('select count(*)::int from public.learning_plans'),1);
      await role('authenticated',ids.bob);assert.equal(await scalar('select count(*)::int from public.learning_attempts'),0);assert.equal(await scalar('select count(*)::int from public.learning_plans'),0);
      await role('authenticated',ids.alice,false);assert.equal(await scalar('select count(*)::int from public.learning_attempts'),0);assert.equal(await scalar('select count(*)::int from public.learning_plans'),0);
    });
    await t.test('even the owner cannot directly modify attempts/plans, read source internals or author reviews',async()=>{
      await role('authenticated',ids.alice);
      await reject("insert into public.learning_attempts(user_id,event_id,module_id,question_id,payload) values($1,'forged',$2,'fixture-question','{}')",[ids.alice,ids.module]);
      await reject("update public.learning_plans set status='published'");
      await reject('select * from public.learning_sources');await reject('select * from public.learning_artifacts');await reject('select * from public.learning_reviews');
      await reject("insert into public.learning_reviews(artifact_id,content_hash,role,verdict,model,findings) values($1,$2,'source_review','PASS','forged','{}')",[ids.artifact,'a'.repeat(64)]);
      await reject('select public.learning_publish($1,$2,$3)',[ids.artifact,ids.plan,ids.request]);
      assert.equal(await scalar('select count(*)::int from storage.objects'),0);
      const result=await query("insert into storage.objects(bucket_id,name,owner) values('learning-sources','alice/forged.txt',$1)",[ids.alice]).then(()=>true,()=>false);assert.equal(result,false);
    });
    let job;
    await t.test('job lease excludes a concurrent claim and rejects wrong or expired completion',async()=>{
      await role('service_role');job=(await query('select * from public.learning_claim_job($1)',[ids.plan])).rows[0];assert.ok(job.lease_id);assert.equal(job.attempts,1);
      assert.equal((await query('select * from public.learning_claim_job($1)',[ids.plan])).rows.length,0);
      assert.equal(await scalar('select public.learning_finish_job($1,$2,$3,$4)',[job.id,ids.request,'author',{}]),false);
      await query("update public.learning_jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);
      assert.equal(await scalar('select public.learning_finish_job($1,$2,$3,$4)',[job.id,job.lease_id,'author',{}]),false);
      job=(await query('select * from public.learning_claim_job($1)',[ids.plan])).rows[0];assert.equal(job.attempts,2);
      assert.equal(await scalar('select public.learning_finish_job($1,$2,$3,$4)',[job.id,job.lease_id,'publish',{artifact_id:ids.artifact}]),true);
      job=(await query('select * from public.learning_claim_job($1)',[ids.plan])).rows[0];assert.equal(job.stage,'publish');
    });
    const canonical=JSON.stringify({lessons:[{id:'lesson',facts:['fixture']}],retest:[{answer:'private answer'}]}),hash=createHash('sha256').update(canonical).digest('hex');
    await t.test('publication requires a valid lease, real content hash and all three role approvals for that hash',async()=>{
      const malformed=crypto.randomUUID();await query("insert into public.learning_artifacts(id,plan_id,content_hash,canonical_content,content) values($1,$2,$3,$4,$5)",[malformed,ids.plan,'a'.repeat(64),canonical,JSON.parse(canonical)]);
      await reject('select public.learning_publish($1,$2,$3)',[ids.artifact,job.id,ids.request]);
      await reject('select public.learning_publish($1,$2,$3)',[malformed,job.id,job.lease_id]);
      await query("insert into public.learning_artifacts(id,plan_id,content_hash,canonical_content,content) values($1,$2,$3,$4,$5)",[ids.artifact,ids.plan,hash,canonical,JSON.parse(canonical)]);
      for(const roleName of ['source_review','rules_review'])await query("insert into public.learning_reviews(artifact_id,content_hash,role,verdict,model,findings) values($1,$2,$3,'PASS','fixture-reviewer','{}')",[ids.artifact,hash,roleName]);
      await reject('select public.learning_publish($1,$2,$3)',[ids.artifact,job.id,job.lease_id]);
      await query("insert into public.learning_reviews(artifact_id,content_hash,role,verdict,model,findings) values($1,$2,'presentation_review','PASS','fixture-reviewer','{}')",[ids.artifact,hash]);
      assert.equal(await scalar('select public.learning_publish($1,$2,$3)',[ids.artifact,job.id,job.lease_id]),true);
      assert.equal(await scalar('select status from public.learning_plans where id=$1',[ids.plan]),'published');
      const changed=JSON.stringify({lessons:[],retest:[]}),changedHash=createHash('sha256').update(changed).digest('hex');
      await reject('update public.learning_artifacts set canonical_content=$1,content=$2,content_hash=$3 where id=$4',[changed,JSON.parse(changed),changedHash,ids.artifact]);
      assert.equal(await scalar('select content_hash from public.learning_artifacts where id=$1',[ids.artifact]),hash);
      const replacement=crypto.randomUUID();await query('insert into public.learning_artifacts(id,plan_id,content_hash,canonical_content,content) values($1,$2,$3,$4,$5)',[replacement,ids.plan,changedHash,changed,JSON.parse(changed)]);
      await reject('select public.learning_publish($1,$2,$3)',[replacement,job.id,job.lease_id]);
    });
    await t.test('publication does not expose answer keys via direct learner SELECT',async()=>{await role('authenticated');await reject('select content from public.learning_artifacts');await reject('select * from public.learning_jobs');});
    await t.test('lesson acknowledgments and retest results remain private to the approved owner',async()=>{
      await role('service_role');await query('insert into public.learning_acknowledgments(plan_id,user_id,lesson_id,content_hash) values($1,$2,$3,$4)',[ids.plan,ids.alice,'fixture-lesson',hash]);
      await query('insert into public.learning_retest_results(plan_id,user_id,content_hash,results) values($1,$2,$3,$4)',[ids.plan,ids.alice,hash,{correct:1}]);
      for(const table of ['learning_acknowledgments','learning_retest_results']){
        await role('authenticated',ids.alice);assert.equal(await scalar('select count(*)::int from public.'+table),1);
        await role('authenticated',ids.bob);assert.equal(await scalar('select count(*)::int from public.'+table),0);
        await role('authenticated',ids.alice,false);assert.equal(await scalar('select count(*)::int from public.'+table),0);
      }
    });
    await t.test('pending-plan and daily quotas are enforced in real SQL',async()=>{
      await role('service_role');
      for(let i=0;i<3;i++)await query('select public.learning_enqueue($1)',[{...plan,id:crypto.randomUUID(),request_id:crypto.randomUUID(),user_id:ids.bob}]);
      await reject('select public.learning_enqueue($1)',[{...plan,id:crypto.randomUUID(),request_id:crypto.randomUUID(),user_id:ids.bob}]);
      await query("update public.learning_plans set status='failed' where user_id=$1",[ids.bob]);
      for(let i=3;i<10;i++){const next={...plan,id:crypto.randomUUID(),request_id:crypto.randomUUID(),user_id:ids.bob};await query('select public.learning_enqueue($1)',[next]);await query("update public.learning_plans set status='failed' where id=$1",[next.id]);}
      await reject('select public.learning_enqueue($1)',[{...plan,id:crypto.randomUUID(),request_id:crypto.randomUUID(),user_id:ids.bob}]);
      assert.equal(await scalar('select count(*)::int from public.learning_plans where user_id=$1',[ids.bob]),10);
    });
    await t.test('three worker errors exhaust retries and fail the plan without publishing',async()=>{
      await role('service_role');const next={...plan,id:crypto.randomUUID(),request_id:crypto.randomUUID()};await query('select public.learning_enqueue($1)',[next]);
      for(let attempt=1;attempt<=3;attempt++){
        const claimed=(await query('select * from public.learning_claim_job($1)',[next.id])).rows[0];assert.equal(claimed.attempts,attempt);
        assert.equal(await scalar('select public.learning_finish_job($1,$2,$3,$4,$5)',[claimed.id,claimed.lease_id,'author',{},'fixture_provider_failure']),true);
        await query("update public.learning_jobs set available_at=now()-interval '1 second' where id=$1",[claimed.id]);
      }
      assert.equal(await scalar('select status from public.learning_plans where id=$1',[next.id]),'failed');
      assert.equal((await query('select * from public.learning_claim_job($1)',[next.id])).rows.length,0);
    });
    await t.test('service writes cannot rewrite or delete append-only evidence and source records',async()=>{
      await role('service_role');for(const table of ['learning_sources','learning_attempts','learning_reviews','learning_acknowledgments','learning_retest_results'])await reject('delete from public.'+table);
      await reject("update public.learning_attempts set payload='{}'");
      await reject("update public.learning_plans set input_snapshot='{}' where id=$1",[ids.plan]);
      await role('authenticated');await reject('select * from public.learning_worker_state');
    });
  }finally{await db.close();}
});
