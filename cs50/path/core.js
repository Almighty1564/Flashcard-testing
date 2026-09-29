/* Course navigation only. Reads existing evidence; never upgrades a declaration into a code pass. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.T08PathCore=api;})(globalThis,function(){
 'use strict';
 const VERSION='1.0.0', STAGES=['foundation','practice','apply','review'];
 const LABELS={foundation:'1 · Acquire',practice:'2 · Burn in & rotate',apply:'3 · Integrate & operate',review:'4 · Retain & prove'};
 const stamp=e=>e.at||e.client_at||'';
 const sorted=events=>[...events].sort((a,b)=>stamp(a).localeCompare(stamp(b))||String(a.id).localeCompare(String(b.id)));
 const newest=events=>sorted(events).at(-1);
 const page=(path,args)=>path+'#'+new URLSearchParams(args);
 const mapLink=(id,stage)=>page('path.html',{objective:id,...(stage?{stage}:{})});
 
 function readFoundation(storage,account,course){
  const keys=[`tomato08_cs50_safe_${account}`,`tomato08_cs50_v1_${account}`];
  try{
   const key=keys.find(k=>storage.getItem(k)!==null);
   if(!key)return {state:{events:[],seen:{}},available:true,key:null,warning:''};
   const raw=storage.getItem(key),s=JSON.parse(raw);
   const ids=new Set(course.units.map(u=>u.id)),tasks=new Set(course.units.flatMap(u=>u.tasks.map(t=>t.id)));
   if(s?.schema!==1||s.version!==course.version||!Array.isArray(s.events)||s.events.length>10000||!s.seen||typeof s.seen!=='object'||s.events.some(e=>!e||typeof e.id!=='string'||!Number.isFinite(Date.parse(e.at))||!ids.has(e.unit)||!['quiz','attempt'].includes(e.type)||typeof e.passed!=='boolean'||e.type==='attempt'&&!tasks.has(e.task)))throw new Error('incompatible');
   return {state:s,available:true,key,warning:''};
  }catch(_){return {state:{events:[],seen:{}},available:false,key:null,warning:'Foundation history is unreadable or a different version. Original bytes are untouched. Use Foundation recovery tools before continuing.'};}
 }
 function build(plan,course,packs,studio){
  if(plan.version!==VERSION||!Array.isArray(plan.objectives))throw new Error('Unsupported course map. Your saved work was not changed.');
  const units=new Map(course.units.map(u=>[u.id,u])),topics=new Map(packs.map(p=>[p.id,p])),releases=new Map(studio.releases.map(r=>[r.id,r]));
  const ids=new Set(),known=new Set(),nodes=[];
  const addItem=(key,title,href,rule,extra={})=>({key,title,href,rule,...extra});
  for(const row of plan.objectives){
   if(ids.has(row.id)||!/^[-a-z0-9]+$/.test(row.id)||!plan.phases.some(p=>p.id===row.phase))throw new Error('Invalid course objective.');ids.add(row.id);
   if(row.requires.some(id=>!known.has(id)))throw new Error('A course prerequisite is missing or appears after its objective: '+row.id);
   known.add(row.id);const node={...row,number:nodes.length+1,stages:STAGES.map(id=>({id,title:LABELS[id],items:[]}))};
   const stage=id=>node.stages.find(s=>s.id===id), foundation=stage('foundation'),practice=stage('practice'),apply=stage('apply'),review=stage('review');
   if(row.kind==='foundation'){
    const u=units.get(row.ref);if(!u)throw new Error('Missing Foundation section: '+row.ref);
    node.title=u.title;node.goal=row.goal;node.source=u;
    const link=(tab,task)=>page('index.html',{view:'course',unit:u.id,tab,...(task?{task}:{})});
    foundation.items.push(addItem('lesson','Review the lesson and matching lecture',link('theory'),{type:'seen',unit:u.id},{where:'Website + Harvard lecture'}));
    foundation.items.push(addItem('quiz','Check understanding: six concept questions',link('quiz'),{type:'foundation-quiz',unit:u.id},{where:'Website · graded quiz'}));
    for(const t of u.tasks){const dest=t.kind==='project'?apply:t.kind==='rebuild'?review:practice;
     dest.items.push(addItem(t.id,t.title,link(t.kind==='project'?'project':'practice',t.id),{type:'foundation-task',id:t.id},{where:t.tests?'Local code + imported checks':'Artifact + self-review',delayed:t.kind==='rebuild'}));
    }
   }else if(row.kind==='python'){
    const p=topics.get(row.ref);if(!p)throw new Error('Missing Python topic: '+row.ref);node.title=p.title.replace(': 15 distinct forms','').replace(': 15 distinct requirements','');node.goal=p.outcome||row.goal;node.source=p;
    for(let n=1;n<=5;n++)foundation.items.push(addItem('learn-'+n,p.steps[n-1].title||'Learning step '+n,page('practice.html',{view:'topic',topic:p.id,stage:'learn',step:n}),{type:'learn-step',topic:p.id,step:n},{where:'Website · learning step'}));
    for(const t of p.tasks){const dest=t.mode==='check'?apply:practice;
     dest.items.push(addItem(t.id,t.title,page('practice.html',{view:'topic',topic:p.id,stage:t.mode,task:t.id}),{type:'ledger-task',id:t.id,version:t.version},{where:'Local Python + imported checks',independent:t.mode==='check'}));}
    node.projectHandoff=p.project||row.project;
   }else if(row.kind==='project'){
    const r=releases.get(row.ref);if(!r)throw new Error('Missing project release: '+row.ref);node.source=r;node.title=studio.projects.find(p=>p.id===r.project).title+': '+r.title.replace(/^\d+\s*\/\s*/, '');node.goal=r.goal;
    const link=tab=>page('projects.html',{view:'projects',release:r.id,tab});
    foundation.items.push(addItem('brief','Read the requirements and supporting lessons',link('learn'),{type:'path-step',step:'brief'},{where:'Website · read then acknowledge',ack:true}));
    practice.items.push(addItem('prediction','Predict the result before building',link('learn'),{type:'project-quiz',id:r.id},{where:'Website · graded prediction'}));
    practice.items.push(addItem('plan','Plan your implementation and a boundary-case test',link('evidence'),{type:'path-step',step:'plan'},{where:'Your editor + self-reported plan',ack:true,notes:true}));
    apply.items.push(addItem('implementation','Build the release and submit its evidence',link('evidence'),{type:'ledger-task',id:r.id,version:r.version},{where:r.mode==='checked'?'Local project + imported checks':'Artifact + self-review'}));
   }else throw new Error('Unsupported objective kind');
   review.items.push(addItem('reflection','Review your evidence and record the takeaway',mapLink(row.id,'review'),{type:'reflection'},{where:'Website · reflection, not a code grade',notes:true}));
   nodes.push(node);
  }
  if(nodes.length!==course.units.length+packs.length+studio.releases.length)throw new Error('The map must include every existing section, topic, and project release.');
  for(const [kind,refs]of [['foundation',[...units.keys()]],['python',[...topics.keys()]],['project',[...releases.keys()]]]){
   const mapped=nodes.filter(n=>n.kind===kind).map(n=>n.ref);if(new Set(mapped).size!==refs.length||refs.some(ref=>!mapped.includes(ref)))throw new Error('Missing or duplicated content mapping.');
  }
  return {version:VERSION,phases:plan.phases,nodes};
 }
 function eventsFor(events,node,type,extra={}){return events.filter(e=>{const p=e.payload;return p&&p.type===type&&p.release_id==='path-'+node.id&&p.path_version===VERSION&&Object.entries(extra).every(([k,v])=>p[k]===v);});}
 function inspect(item,node,foundation,events){
  const r=item.rule;let matches=[],e=null,done=false,provenance='',unknown=false,independent=false;
  if(r.type.startsWith('foundation')||r.type==='seen'){
   if(!foundation.available)return {...item,done:false,status:'unavailable',evidence:[],provenance:'History unavailable'};
   if(r.type==='seen'){done=Boolean(foundation.state.seen?.[r.unit]);provenance='Reading acknowledged';}
   else matches=foundation.state.events.filter(e=>r.type==='foundation-quiz'?e.type==='quiz'&&e.unit===r.unit:e.type==='attempt'&&e.task===r.id);
  }else if(r.type==='learn-step'){done=events.some(e=>e.payload?.type==='trace'&&e.payload.kind==='learn-step'&&e.payload.release_id==='py-topic-'+r.topic&&e.payload.version==='1.0.0'&&e.payload.step===r.step);provenance='Learning step acknowledged';}
  else if(r.type==='ledger-task')matches=events.filter(e=>e.payload?.type==='attempt'&&e.payload.release_id===r.id&&e.payload.release_version===r.version);
  else if(r.type==='project-quiz')matches=events.filter(e=>e.payload?.type==='quiz'&&e.payload.release_id===r.id);
  else if(r.type==='path-step'){e=newest(eventsFor(events,node,'trace',{kind:'path-step',step:r.step}));done=Boolean(e);provenance='Self-reported preparation';}
  if(matches.length){e=newest(matches);const p=e.payload||e;done=p.passed===true;provenance=p.provenance==='local-unverified'?'Local checks · unverified':p.provenance==='self-review'?'Self-reviewed artifact':'Quiz result';independent=['none','docs'].includes(p.assistance)&&!p.hints;}
  const wasPassed=matches.some(e=>(e.payload||e).passed===true);
  return {...item,done,status:done?'done':e&&matches.length?'retry':'todo',evidence:e?[e.id]:[],provenance,independent,wasPassed,at:e?stamp(e):null};
 }
 function evaluate(map,foundation,events){
  const progress=new Map();
  for(const node of map.nodes){
   const stages=node.stages.map(s=>({...s,items:s.items.map(i=>inspect(i,node,foundation,events))}));
   const evidence=stages.flatMap(s=>s.items.filter(i=>i.rule.type!=='reflection').flatMap(i=>i.evidence)).sort();
   const prerequisiteItems=stages.flatMap(s=>s.items.filter(i=>i.rule.type!=='reflection'));
   const readyReview=prerequisiteItems.every(i=>i.done);
   const reflection=newest(eventsFor(events,node,'reflection',{kind:'objective-review'}));
   const validReview=reflection&&JSON.stringify(reflection.payload.evidence_ids)===JSON.stringify(evidence)&&typeof reflection.payload.text==='string'&&reflection.payload.text.trim().length>=40;
   const reviewItem=stages.at(-1).items.find(i=>i.rule.type==='reflection');
   Object.assign(reviewItem,{done:Boolean(readyReview&&validReview),status:readyReview&&validReview?'done':reflection?'stale':'todo',provenance:'Self-reported reflection',evidence:reflection?[reflection.id]:[]});
   for(const s of stages){s.done=s.items.every(i=>i.done);s.completed=s.items.filter(i=>i.done).length;s.needsWork=s.items.some(i=>i.status==='retry');}
   const complete=stages.every(s=>s.done),nextStage=stages.find(s=>!s.done)||stages.at(-1),nextItem=nextStage.items.find(i=>!i.done)||nextStage.items.at(-1);
   const missing=node.requires.filter(id=>!progress.get(id)?.complete);
   const doneCount=stages.reduce((sum,s)=>sum+s.completed,0),total=stages.reduce((sum,s)=>sum+s.items.length,0);
   progress.set(node.id,{node,stages,complete,nextStage,nextItem,missing,evidence,readyReview,reflection,doneCount,total,started:doneCount>0||evidence.length>0,needsWork:stages.some(s=>s.needsWork)});
  }
  return progress;
 }
 function next(map,progress){return map.nodes.find(n=>!progress.get(n.id).complete)||null;}
 function identify(map,pathname,hash){const p=new URLSearchParams(hash.replace(/^#/,''));if(/practice\.html$/.test(pathname)){const id=p.get('topic');return map.nodes.find(n=>n.kind==='python'&&n.ref===id)||null;}if(/projects\.html$/.test(pathname)){return map.nodes.find(n=>n.kind==='project'&&n.ref===p.get('release'))||null;}if(/\/cs50\/(index\.html)?$/.test(pathname)){return map.nodes.find(n=>n.kind==='foundation'&&n.ref===(p.get('unit')||'scratch'))||null;}return null;}
 function activeStage(node,hash){const p=new URLSearchParams(hash.replace(/^#/,''));if(node.kind==='python')return {learn:'foundation',practice:'practice',check:'apply',apply:'review'}[p.get('stage')]||'foundation';if(node.kind==='project')return p.get('tab')==='evidence'?'apply':p.get('tab')==='learn'?'foundation':'foundation';const task=node.source.tasks.find(t=>t.id===p.get('task'));return task?(task.kind==='project'?'apply':task.kind==='rebuild'?'review':'practice'):p.get('tab')==='project'?'apply':p.get('tab')==='practice'?'practice':'foundation';}
 
 function connections(map,id){
  const node=map.nodes.find(n=>n.id===id);if(!node)throw new Error('Unknown objective');
  return {node,before:node.requires.map(x=>map.nodes.find(n=>n.id===x)),after:map.nodes.filter(n=>n.requires.includes(id))};
 }
 function graphLayout(map,id,whole=false){
  const conn=connections(map,id),width=280,height=136,gap=60,positions=new Map();
  if(!whole){
   const cols=[conn.before,[conn.node],conn.after],max=Math.max(1,...cols.map(c=>c.length));
   cols.forEach((col,c)=>col.forEach((n,i)=>positions.set(n.id,{x:25+c*(width+gap),y:55+(max-col.length)*(height+26)/2+i*(height+26),width,height})));
   return {positions,width:3*width+2*gap+50,height:Math.max(290,90+max*(height+26)),direction:'horizontal',nodes:[...conn.before,conn.node,...conn.after]};
  }
  const ranks=new Map(),rows=[];
  for(const n of map.nodes){const r=n.requires.length?1+Math.max(...n.requires.map(p=>ranks.get(p))):0;ranks.set(n.id,r);(rows[r]||= []).push(n);}
  const max=Math.max(...rows.map(r=>r.length)),w=max*(width+40)+20;
  rows.forEach((row,r)=>row.forEach((n,i)=>positions.set(n.id,{x:30+(max-row.length)*(width+40)/2+i*(width+40),y:35+r*(height+64),width,height})));
  return {positions,width:w,height:60+rows.length*(height+64),direction:'vertical',nodes:map.nodes};
 }
 return {VERSION,STAGES,LABELS,mapLink,readFoundation,build,evaluate,next,identify,activeStage,connections,graphLayout};
});
