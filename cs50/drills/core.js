/* Pure drill contracts and progress. Reports are unsigned local practice evidence. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.T08DrillCore=api;})(globalThis,function(){
 'use strict';
 const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
 // Preserve attempt/import order across cloud uploads. Receipt time is not attempt time.
 const stamp=e=>e.client_at;
 const taskID=id=>typeof id==='string'&&/^py-[a-z]+-\d{2}$/.test(id);
 const help=['none','docs','hint','ai','solution'];
 function attempts(events,task){return events.filter(e=>e.payload.type==='attempt'&&e.payload.release_id===task.id&&e.payload.release_version===task.version).sort((a,b)=>Date.parse(stamp(a))-Date.parse(stamp(b))||a.id.localeCompare(b.id));}
 function facts(events,task){const all=attempts(events,task),passed=all.filter(e=>e.payload.passed),independent=passed.filter(e=>['none','docs'].includes(e.payload.assistance)&&!e.payload.hints);return {all,passed:passed.length>0,independent:independent.length>0,latest:all.at(-1),lastPass:passed.at(-1)};}
 function learned(events,topic){return new Set(events.filter(e=>e.payload.type==='trace'&&e.payload.kind==='learn-step'&&e.payload.release_id==='py-topic-'+topic.id&&e.payload.version==='1.0.0').map(e=>e.payload.step).filter(n=>Number.isInteger(n)&&n>=1&&n<=5));}
 function summary(events,topic){const rows=topic.tasks.map(t=>({t,...facts(events,t)}));return {learned:learned(events,topic).size,practice:rows.filter(x=>x.t.mode==='practice'&&x.passed).length,checks:rows.filter(x=>x.t.mode==='check'&&x.passed).length,independentChecks:rows.filter(x=>x.t.mode==='check'&&x.independent).length,needsWork:rows.filter(x=>x.latest&&!x.latest.payload.passed).length};}
 function shuffled(values,random=Math.random){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
 function queue(tasks,events,mode='mixed',limit=10,random=Math.random,now=Date.now()){
  let pool=tasks.filter(t=>t.mode==='practice');
  if(mode==='failed')pool=pool.filter(t=>{const f=facts(events,t);return f.latest&&!f.latest.payload.passed;});
  if(mode==='untried')pool=pool.filter(t=>!facts(events,t).all.length);
  if(mode==='review')pool=pool.filter(t=>{const f=facts(events,t);return f.lastPass&&now-Date.parse(stamp(f.lastPass))>=48*3600000;});
  return shuffled(pool,random).slice(0,Math.max(1,Math.min(50,limit))).map(t=>t.id);
 }
 function validateCatalog(index,packs){
  if(index.schema!==1||index.version!=='1.0.0'||packs.length!==12)throw new Error('Unsupported curriculum. Existing evidence was not changed.');
  const ids=new Set();
  for(const p of packs){if(p.tasks.length!==18||p.steps.length!==5||p.tasks.filter(t=>t.mode==='practice').length!==15||p.tasks.filter(t=>t.mode==='check').length!==3)throw new Error('Incomplete practice pack.');
   for(const t of p.tasks){if(!taskID(t.id)||ids.has(t.id)||t.topic!==p.id||!Array.isArray(t.cases)||!t.cases.length||new Set(t.cases.map(c=>c.id)).size!==t.cases.length)throw new Error('Invalid task contract.');ids.add(t.id);}}
  return true;
 }
 async function validateReport(r,t){
  if(!r||r.schema!==1||r.kind!=='tomato08-python-drill-report'||r.task_id!==t.id||r.task_version!==t.version||r.runner_version!=='1.0.0'||r.topic!==t.topic||r.mode!==t.mode||r.trust!=='local-unverified')throw new Error('Report does not match this exact exercise/version.');
  if(typeof r.id!=='string'||!/^[-0-9a-f]{36}$/i.test(r.id)||typeof r.created_at!=='string'||!Number.isFinite(Date.parse(r.created_at))||!r.source_files||Object.keys(r.source_files).length!==1||typeof r.source_files['src/solution.py']!=='string'||r.source_files['src/solution.py'].length>50000||new TextEncoder().encode(JSON.stringify(r)).length>500000)throw new Error('Malformed or oversized source report.');
  const code=r.source_files['src/solution.py'],sourceHash=await hash(JSON.stringify([['src/solution.py',await hash(code)]]));
  if(r.source_sha256!==sourceHash||r.tests_sha256!==t.tests_sha256)throw new Error('Source or test fingerprint mismatch. Rerun the original checker.');
  if(!Array.isArray(r.results)||r.results.length!==t.cases.length||new Set(r.results.map(c=>c.id)).size!==t.cases.length||r.results.some(c=>!t.cases.some(tc=>tc.id===c.id)||typeof c.passed!=='boolean'||c.skipped!==false||typeof c.detail!=='string'||c.detail.length>12000))throw new Error('Missing, duplicate or invalid behavior cases.');
  const passed=r.results.every(c=>c.passed);
  if(r.passed!==passed)throw new Error('Report summary disagrees with its cases.');
  return {passed,code,report:r};
 }
 return {canonical,hash,taskID,help,attempts,facts,learned,summary,shuffled,queue,validateCatalog,validateReport};
});
