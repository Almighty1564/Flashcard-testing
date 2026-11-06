/* OFFLINE TEST FIXTURE ONLY. This file is never loaded by the production website. */
(function(root){
  'use strict';
  const moduleId='10000000-0000-4000-8000-000000000001',userId='20000000-0000-4000-8000-000000000001',planId='30000000-0000-4000-8000-000000000001';
  const source={id:'source-test',filename:'learning-source.txt',mime_type:'text/plain',url:location.origin+'/tests/fixtures/learning-source.txt',content_hash:'fixture-source-identity'};
  const topics=[['maintenance','Maintenance log','The maintenance log records completed equipment checks and the date of each check.','Which record confirms a completed equipment check?','Maintenance log','Equipment register'],['register','Equipment register','The equipment register records equipment identifiers, including serial numbers.','Which record lists equipment serial numbers?','Equipment register','Maintenance log']];
  const bank={module:{id:moduleId,slug:'learning-fixture',name:'Operations practice · isolated test data'},revision:1,groups:[{id:'g1',name:'Records'}],cards:topics.map(([id,title,fact,prompt,good,bad])=>({id,groupId:'g1',type:'multiple-choice',status:'complete',question:{text:prompt,image:null},choices:[{id:'a',text:good,correct:true},{id:'b',text:bad,correct:false}],shuffleChoices:false}))};
  const lessons=topics.map(([id,title,fact])=>({id:'lesson-'+id,objective_id:id,title,summary:fact,facts:[{text:fact,source_ids:[source.id],locator:'Handbook paragraph '+(id==='maintenance'?1:2)}],source_ids:[source.id],example:id==='maintenance'?'Illustrative example: a technician checks the log to confirm yesterday’s equipment check.':'Illustrative example: an inventory clerk checks the register for an equipment serial number.',recall_prompt:'What information belongs in the '+title.toLowerCase()+'?',recall_answer:fact}));
  const questions=[{id:'fresh-maintenance',objective_id:'maintenance',type:'Application of source material',prompt:'A supervisor needs evidence that a scheduled equipment check happened yesterday. Which record should they inspect?',choices:[{id:'a',text:'Maintenance log'},{id:'b',text:'Equipment register'}],source_ids:[source.id]},{id:'fresh-register',objective_id:'register',type:'Application of source material',prompt:'A replacement part must be matched to a specific equipment serial number. Which record provides the identifier?',choices:[{id:'a',text:'Equipment register'},{id:'b',text:'Maintenance log'}],source_ids:[source.id]}];
  let created=false,checks=0,acks=[],results=null,legacySaves=0;const attempts=[];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const answer=async body=>{
    switch(body.action){
      case 'status':return {enabled:true,configured:true,worker_configured:true,worker_ready:true,developer:true};
      case 'save_attempts':attempts.push(...clone(body.attempts));return {ok:true,saved:body.attempts.length};
      case 'create_plan':created=true;return {plan_id:planId,status:'queued'};
      case 'get_plan':if(!created)throw Error('No test plan');checks++;return {plan:{id:planId,module_id:moduleId,status:checks<2?'working':'published',mode:'deliberate',content_hash:'fixture-review-only'},job:{stage:'source_review',status:'queued'},lessons:checks<2?[]:clone(lessons),questions:acks.length===lessons.length?clone(questions):[],sources:[clone(source)],acknowledged:[...acks],results:clone(results)};
      case 'acknowledge':acks=[...new Set([...acks,body.lesson_id])];return {ok:true};
      case 'submit_retest':if(acks.length!==lessons.length)throw Error('Read every assigned lesson');if(!results){if(body.answers.length!==questions.length)throw Error('Complete retest required');const items=body.answers.map(a=>({question_id:a.question_id,objective_id:questions.find(q=>q.id===a.question_id).objective_id,choice_id:a.choice_id,answer_id:'a',correct:a.choice_id==='a',confidence:a.confidence||'Unknown',rationale:'The original handbook assigns this information to the selected record.',source_ids:[source.id]}));results={correct:items.filter(a=>a.correct).length,total:items.length,items,mastery:'Multiple-choice evidence only. Retention, independent recall and practical performance remain unverified.'};}return {results:clone(results)};
      case 'list_sources':return {sources:[clone(source)],mappings:topics.map(([id,title])=>({question_id:id,objective_id:id,objective_title:title,source_ids:[source.id]}))};
      case 'get_rules':return {rules:{text:'Preserve the handbook vocabulary.'}};
      case 'save_rules':return {ok:true};
      case 'save_mappings':return {ok:true};
      case 'save_sources':return {sources:[clone(source)]};
      default:throw Error('Unsupported offline fixture action');
    }
  };
  const session={user:{id:userId}},profile={id:userId,role:'developer',username:'Isolated test learner'};
  const save=async()=>{legacySaves++;const el=document.querySelector('#fixture-saves');if(el)el.textContent=String(legacySaves);};
  root.FC={
    config:{url:location.origin},getSession:async()=>clone(session),getProfile:async()=>clone(profile),requireUser:async()=>clone(profile),studLabel:()=>'',loadBank:async()=>clone(bank),loadProgress:async()=>({progress:{},mastery:{},totalReviews:0,sessions:[]}),saveCardProgress:save,saveSession:save,memorizedRank:async()=>null,reportQuestion:async()=>{},
    client:{
      rpc:async()=>{await save();return {data:true,error:null};},
      auth:{onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};},getUser:async()=>({data:{user:{id:userId}}})},
      from(){return {upsert:async()=>({data:null,error:null})};},
      functions:{invoke:async(_name,{body})=>{try{return {data:await answer(body),error:null};}catch(error){return {data:null,error};}}}
    }
  };
  const banner=document.createElement('div');banner.id='learning-fixture-banner';banner.textContent='ISOLATED TEST · Prepared fixtures and simulated server reviews · No live accounts, model calls, or production data';document.body.prepend(banner);
  const style=document.createElement('style');style.textContent='#learning-fixture-banner{background:#614f16;color:#fff4cc;padding:9px 16px;font:12px/1.5 system-ui;position:relative;z-index:100}.t08-learning::before{content:"ISOLATED TEST DATA · SIMULATED SERVER REVIEWS";display:block;background:#614f16;color:#fff4cc;padding:8px 12px;margin-bottom:18px;font:10px/1.5 system-ui;letter-spacing:.1em}';document.head.append(style);
  root.addEventListener('t08-learning-ready',()=>{const el=document.querySelector('#learning-fixture-banner');if(el&&!document.querySelector('#fixture-saves')){const count=document.createElement('span');count.innerHTML=' · Legacy save calls: <b id="fixture-saves">0</b>';el.append(count);}});
})(window);
