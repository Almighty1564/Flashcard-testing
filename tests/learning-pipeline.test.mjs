import test from 'node:test';
import assert from 'node:assert/strict';
import {processJob,Backend} from '../supabase/functions/learning-api/backend.mjs';
import {RULES} from '../supabase/functions/learning-api/domain.mjs';

class MemoryPipeline {
  constructor({rejectSource=false}={}){
    this.rejectSource=rejectSource;this.calls=[];this.published=false;this.reviews=[];this.artifacts=[];
    this.job={id:'job',plan_id:'plan',stage:'organize',status:'queued',attempts:0,payload:{},lease_id:'lease'};
    this.plan={id:'plan',mode:'deliberate',rules_snapshot:RULES,input_snapshot:{sources:[{id:'s1',content_hash:'original-bytes-hash'}],objectives:[{id:'o1',title:'One objective'}],questions:[{id:'original',question_text:'Original wording?'}]}};
  }
  async rpc(name,args){
    if(name==='learning_claim_job'){if(this.job.status!=='queued')return [];this.job.status='running';this.job.attempts++;return [structuredClone(this.job)];}
    if(name==='learning_finish_job'){
      if(args.p_error){this.job.status=args.p_error==='review_revision_limit'||this.job.attempts>=3?'failed':'queued';}
      else {this.job.payload=args.p_payload;this.job.stage=args.p_next_stage??this.job.stage;this.job.status=args.p_next_stage?'queued':'complete';this.job.attempts=0;}
      return true;
    }
    if(name==='learning_publish'){this.published=true;return true;}
    throw new Error(name);
  }
  async table(name,query){
    if(name==='learning_plans')return [this.plan];
    if(name==='learning_artifacts'){
      const p=new URLSearchParams(query.slice(1));return this.artifacts.filter(a=>(!p.has('id')||a.id===p.get('id').slice(3))&&(!p.has('content_hash')||a.content_hash===p.get('content_hash').slice(3)));
    }
    if(name==='learning_reviews'){
      const p=new URLSearchParams(query.slice(1));return this.reviews.filter(r=>r.artifact_id===p.get('artifact_id').slice(3)&&r.role===p.get('role').slice(3)&&r.content_hash===p.get('content_hash').slice(3));
    }
    throw new Error(name);
  }
  async insert(name,value){const row={id:crypto.randomUUID(),...value};(name==='learning_artifacts'?this.artifacts:this.reviews).push(row);return [row];}
  async sourceBytes(s){assert.equal(s.id,'s1');return new Uint8Array([1]);}
  async model(role,payload,sources=[]){
    this.calls.push({role,payload,sources});
    if(role==='organize')return {model:'offline-extractor',value:{sources:[{source_id:'s1',readable:true,page_count:1,summary:'A source.',excerpts:[{text:'A supported fact.',locator:'page 1'}]}]}};
    if(role==='author')return {model:'offline-author',value:{lessons:[{id:'l1',objective_id:'o1',title:'A lesson',summary:'A supported fact.',facts:[{text:'A supported fact.',source_ids:['s1'],locator:'page 1'}],example:'Illustrative example.',recall_prompt:'Recall?',recall_answer:'A supported fact.',source_ids:['s1']}],questions:[{id:'r1',objective_id:'o1',prompt:'A fresh scenario?',choices:[{id:'a',text:'A supported fact.'},{id:'b',text:'An alternative.'}],answer_id:'a',rationale:'The source says so.',source_ids:['s1']}]}};
    return {model:'offline-'+role,value:{content_hash:payload.content_hash,verdict:this.rejectSource&&role==='source_review'?'REVISE':'PASS',findings:this.rejectSource&&role==='source_review'?['Unsupported fact.']:[]}};
  }
}

test('queued pipeline makes separate evidence and reviewer calls before exact-hash publication',async()=>{
  const db=new MemoryPipeline();
  for(let i=0;i<6;i++){const result=await processJob(db);assert.equal(result.error,undefined);if(i<5)assert.equal(db.published,false);}
  assert.equal(db.published,true);assert.equal(db.job.status,'complete');
  assert.deepEqual(db.calls.map(c=>c.role),['organize','author','source_review','rules_review','presentation_review']);
  assert.equal(db.calls.find(c=>c.role==='source_review').sources[0].id,'s1');
  assert.equal(new Set(db.reviews.map(r=>r.content_hash)).size,1);
  assert.equal(db.reviews[0].content_hash,db.artifacts[0].content_hash);
  assert.equal(db.calls.find(c=>c.role==='rules_review').payload.artifact.pipeline_version,'learning-v1');
});
test('unresolved source rejection stops after bounded author revisions and never publishes',async()=>{
  const db=new MemoryPipeline({rejectSource:true});
  for(let i=0;i<15&&db.job.status!=='failed';i++)await processJob(db);
  assert.equal(db.published,false);assert.equal(db.job.status,'failed');
  assert.equal(db.calls.filter(c=>c.role==='author').length,3);
  assert.equal(db.calls.some(c=>c.role==='rules_review'),false);
});
test('unreadable source never advances to authoring',async()=>{
  const db=new MemoryPipeline();db.model=async()=>({model:'offline',value:{sources:[{source_id:'s1',readable:false,page_count:1,summary:'Unreadable',excerpts:[]}]}});
  for(let i=0;i<3;i++)await processJob(db);
  assert.equal(db.job.status,'failed');assert.equal(db.artifacts.length,0);assert.equal(db.published,false);
});
test('PostgREST minimal successful inserts return safely without JSON body',async()=>{
  const db=new Backend({SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'offline-placeholder'},async()=>new Response(null,{status:201}));
  assert.equal(await db.table('learning_attempts','',{method:'POST',body:{}}),null);
});
