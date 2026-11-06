/* Source-backed lessons in a separate dialog. Never writes legacy mastery or SRS. */
(function(root){
  'use strict';
  let host,content,status,context=null,current=null,owner=null,pollTimer=null,version=0,polls=0,lastFocus=null;
  const cache=new Map();
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const service=()=>root.T08Learning;
  function safeUrl(value){
    try{const url=new URL(value,root.location.href),origin=new URL(root.FC?.config?.url||root.location.origin).origin;
      return (url.origin===origin || (url.origin===root.location.origin&&['localhost','127.0.0.1'].includes(url.hostname)))&&['https:','http:'].includes(url.protocol)?url.href:null;
    }catch{return null;}
  }
  function ensure(){
    if(host)return;host=document.createElement('dialog');host.className='t08-learning';host.setAttribute('aria-label','Source-based learning workspace');
    host.innerHTML='<header class="lw-head"><div><span class="lw-kicker">Tomato08 / Learning workspace</span><h2>Study what I missed</h2></div><button type="button" data-close>Return to results ×</button></header><div class="lw-status" role="status" aria-live="polite"></div><div data-learning-content></div><footer class="lw-footer">Learning evidence stays separate from your existing mastery scores and due reviews. Reading acknowledges a lesson; it does not establish mastery.</footer>';
    document.body.appendChild(host);content=host.querySelector('[data-learning-content]');status=host.querySelector('.lw-status');host.querySelector('[data-close]').onclick=close;
    host.addEventListener('close',stop);host.addEventListener('cancel',()=>stop());
    service().subscribe?.(state=>{if(host.open&&owner!==state.userId){close();content.replaceChildren();context=null;current=null;}});
  }
  function stop(){clearTimeout(pollTimer);pollTimer=null;version++;}
  function close(){stop();host?.close();lastFocus?.focus?.();}
  function message(text){status.textContent=text;}
  function error(err,retry){
    message('The learning request could not finish. Your regular study progress is unaffected.');
    const box=document.createElement('div');box.className='lw-error';box.setAttribute('role','alert');box.textContent=err?.message||'Please try again.';
    content.replaceChildren(box);if(retry){const button=document.createElement('button');button.textContent='Try again';button.onclick=retry;content.append(button);}
  }
  function sourceNames(ids){return (ids||[]).map(id=>{const source=current?.sources?.find(s=>s.id===id);return esc(source?.filename||id);}).join(' · ');}
  function pending(summary){return (summary.cardIds||[]).map(id=>({question_id:String(id),outcome:summary.results?.[id]||'unanswered',confidence:service().normalizeConfidence(summary.results?.[id]==='confident'?'confident':summary.results?.[id]==='guessed'?'guessed':'unknown')}));}
  function requestKey(){return `${owner}:${context.moduleId}:${context.summary.id}`;}
  function readPlan(){try{return JSON.parse(root.sessionStorage.getItem('t08.learning.plan.'+requestKey())||'null');}catch{return null;}}
  function savePlan(value){try{root.sessionStorage.setItem('t08.learning.plan.'+requestKey(),JSON.stringify(value));}catch{}}
  function overview(){
    const attempts=pending(context.summary),incorrect=attempts.filter(a=>a.outcome==='wrong').length,uncertain=attempts.filter(a=>a.outcome==='guessed'||(a.outcome==='correct'&&a.confidence==='Unknown')).length,unanswered=attempts.filter(a=>a.outcome==='unanswered').length;
    message('Your completed test is the baseline for this plan.');
    content.innerHTML=`<p>Use the original course sources to study the ideas behind your answers, then take a fresh retest after the assigned lessons.</p><div class="lw-card"><div class="lw-inline"><span class="lw-chip">${incorrect} wrong</span><span class="lw-chip">${uncertain} uncertain</span><span class="lw-chip">${unanswered} unanswered / unassessed</span></div><p class="lw-muted">These categories determine study priorities; they are not a diagnosis of every topic in the course. Original-question coverage and generated retests remain separate.</p><label for="lw-depth">Lesson depth</label><select id="lw-depth"><option value="deliberate">Deliberate · course facts, explanations, examples</option><option value="hasty">Hasty · essential course facts and screenshots</option></select><div class="lw-actions"><button type="button" class="lw-primary" id="lw-create">Build my study plan</button><button type="button" id="lw-resume" ${readPlan()?.plan_id?'':'hidden'}>Resume this test’s plan</button></div></div><details><summary>Inspect the complete question list</summary><div class="lw-review-list">${attempts.map(a=>{const card=context.bank?.cards?.find(c=>String(c.id)===a.question_id);return `<div class="lw-card"><span class="lw-chip">${esc(a.outcome)} · ${esc(a.confidence)}</span><p>${esc(card?.question?.text||'[Image question]')}</p><span class="lw-cite">Original question ID: ${esc(a.question_id)}</span></div>`;}).join('')}</div></details>`;
    content.querySelector('#lw-create').onclick=create;content.querySelector('#lw-resume').onclick=()=>load(readPlan().plan_id);
  }
  async function create(){
    const selection=content.querySelector('#lw-depth')?.value||'deliberate',token=++version;
    const previous=readPlan();const requestId=previous?.request_id||root.crypto.randomUUID();savePlan({...previous,request_id:requestId});
    message('Queueing a source-checked lesson plan…');content.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{await root.T08LearningCapture?.flush?.();const result=await service().request('create_plan',{module_id:context.moduleId,request_id:requestId,attempt_ids:context.summary.learningAttemptIds||[],session_id:context.summary.learningSessionId||null,attempts:pending(context.summary).filter(a=>['wrong','guessed','unanswered'].includes(a.outcome)||(a.outcome==='correct'&&a.confidence==='Unknown')),mode:selection});
      if(token!==version||!host.open)return;if(!result.plan_id)throw new Error('The plan was not confirmed created.');savePlan({request_id:requestId,plan_id:result.plan_id});polls=0;await load(result.plan_id);
    }catch(err){if(token===version)error(err,overview);}
  }
  async function load(planId){
    clearTimeout(pollTimer);const token=++version;
    try{const data=await service().request('get_plan',{plan_id:planId});if(token!==version||!host.open)return;
      if(!data.plan?.id)throw new Error('No accessible study plan was returned.');current=data;
      if(data.results){results();return;}
      if(['ready','published','completed'].includes(data.plan.status)){plan();return;}
      if(['failed','blocked','needs_review'].includes(data.plan.status)||['failed','blocked'].includes(data.job?.status)){
        message('This lesson plan was not released.');content.innerHTML='<div class="lw-card"><h3>Course material needs review.</h3><p>The plan did not pass all required source and instruction checks. Existing quizzes and reviews remain available.</p><p class="lw-muted">A course author can inspect the job and repair the material. Unreviewed lessons are kept unpublished.</p><button type="button" id="lw-check">Check status</button></div>';content.querySelector('#lw-check').onclick=()=>load(planId);return;
      }
      message('Preparing lessons and verifying the sources and study rules…');content.innerHTML=`<section class="lw-card"><h3>Your plan is being prepared.</h3><p>Each lesson must pass the required reviews before it appears here. You can close this view and resume later.</p><span class="lw-chip">${esc(data.job?.stage||data.plan.status||'queued')}</span><button type="button" id="lw-check">Check now</button></section>`;content.querySelector('#lw-check').onclick=()=>{polls=0;load(planId);};
      if(++polls<45&&!document.hidden)pollTimer=setTimeout(()=>load(planId),Math.max(1000,Number(service().config.pollIntervalMs)||4000));
    }catch(err){if(token===version)error(err,()=>load(planId));}
  }
  function plan(){
    message('Required reviews passed for this published lesson version.');
    const lessons=current.lessons||[],acks=new Set(current.acknowledged||[]);
    content.innerHTML=`<h3>Your lesson path</h3><p class="lw-muted">Complete the assigned lessons before the fresh retest. Supported practice during a lesson does not count as independent recall.</p><div class="lw-card">${lessons.map((l,i)=>`<div class="lw-row"><div><span class="lw-chip">${i+1} / ${lessons.length} ${acks.has(l.id)?'· reading acknowledged':''}</span><h3>${esc(l.title)}</h3><p>${esc(l.summary||'')}</p><span class="lw-cite">${sourceNames(l.source_ids)}</span></div><button type="button" data-lesson="${i}">${acks.has(l.id)?'Revisit lesson':'Open lesson'} →</button></div>`).join('')}</div><div class="lw-actions"><button type="button" class="lw-primary" id="lw-retest" ${!current.results&&lessons.length&&acks.size>=lessons.length&&current.questions?.length?'':'disabled'}>${current.results?"Retest completed":"Start fresh retest"}</button><button type="button" id="lw-update">Refresh plan</button><span class="lw-muted">${acks.size}/${lessons.length} lessons read</span></div>`;
    content.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>lesson(Number(b.dataset.lesson)));content.querySelector('#lw-retest').onclick=assessment;content.querySelector('#lw-update').onclick=()=>load(current.plan.id);
  }
  function sourceView(source){
    if(!source)return '<p class="lw-muted">No source file is available.</p>';
    const url=safeUrl(source.url);let media='';
    if(url&&['image/png','image/jpeg','image/webp'].includes(source.mime_type))media=`<img src="${esc(url)}" alt="Original source: ${esc(source.filename)}" referrerpolicy="no-referrer">`;
    else if(url&&source.mime_type==='application/pdf')media=`<iframe src="${esc(url)}" title="Original source PDF: ${esc(source.filename)}" sandbox="" referrerpolicy="no-referrer"></iframe>`;
    else if(source.text)media=`<pre>${esc(source.text)}</pre>`;
    else if(url&&source.mime_type==='text/plain')media='<pre data-original-text>Loading the original text…</pre>';
    return `<p class="lw-cite">${esc(source.filename)} · ${esc(source.content_hash||'')}</p>${media}${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open original source ↗</a>`:'<p class="lw-muted">The source link has expired or is unavailable. Refresh the plan to obtain a new link.</p>'}`;
  }
  async function originalText(source,target){
    if(source?.mime_type!=='text/plain'||!target?.querySelector('[data-original-text]'))return;
    const url=safeUrl(source.url),stamp=version,account=owner;if(!url)return;
    const output=target.querySelector('[data-original-text]');
    try{const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Source link expired');
      const reader=response.body.getReader(),parts=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();throw new Error('Source too large');}parts.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
      if(stamp===version&&account===owner&&output.isConnected)output.textContent=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    }catch(_){if(stamp===version&&account===owner&&output.isConnected)output.textContent='Original text could not load. Refresh the plan or open the original source link.';}
  }
  function lesson(index){
    const l=current.lessons?.[index];if(!l)return;const sources=(l.source_ids||[]).map(id=>current.sources?.find(s=>s.id===id)).filter(Boolean),acked=(current.acknowledged||[]).includes(l.id);
    message(`Lesson ${index+1} of ${current.lessons.length}`);
    content.innerHTML=`<h2>${esc(l.title)}</h2><div class="lw-grid"><section class="lw-card"><h4>Course facts</h4><ul class="lw-facts">${(l.facts||[]).map(f=>`<li>${esc(f.text)}<span class="lw-cite">${sourceNames(f.source_ids)}${f.locator?' · '+esc(f.locator):''}</span></li>`).join('')}</ul><h4>Plain explanation</h4><p>${esc(l.summary||'')}</p>${current.plan.mode==='deliberate'&&l.example?`<h4>Illustrative example</h4><p>${esc(l.example)}</p>`:''}${current.plan.mode==='deliberate'&&l.recall_prompt?`<details><summary>Practice recall · ungraded</summary><p>${esc(l.recall_prompt)}</p><details><summary>Reveal after trying</summary><p>${esc(l.recall_answer)}</p></details></details>`:''}</section><section class="lw-card lw-source"><span class="lw-kicker">Original source material</span>${sources.length>1?`<label for="lw-source-select">Source file</label><select id="lw-source-select">${sources.map((s,i)=>`<option value="${i}">${esc(s.filename)}</option>`).join('')}</select>`:''}<div id="lw-source-view">${sourceView(sources[0])}</div></section></div><div class="lw-actions"><button type="button" class="lw-primary" id="lw-ack" ${acked?'disabled':''}>${acked?'Reading acknowledged':'I have read this lesson'}</button><button type="button" id="lw-next">${index+1<current.lessons.length?'Next lesson →':'Back to my plan'}</button><button type="button" id="lw-plan">View lesson path</button></div>`;
    originalText(sources[0],content.querySelector('#lw-source-view'));
    content.querySelector('#lw-source-select')?.addEventListener('change',e=>{const source=sources[Number(e.target.value)],target=content.querySelector('#lw-source-view');target.innerHTML=sourceView(source);originalText(source,target);});
    content.querySelector('#lw-plan').onclick=plan;content.querySelector('#lw-next').onclick=()=>index+1<current.lessons.length?lesson(index+1):load(current.plan.id);
    content.querySelector('#lw-ack').onclick=async e=>{e.target.disabled=true;const token=version;try{await service().request('acknowledge',{plan_id:current.plan.id,lesson_id:l.id});if(token!==version||!host.open)return;current.acknowledged=[...new Set([...(current.acknowledged||[]),l.id])];lesson(index);}catch(err){if(token===version){message(err.message);e.target.disabled=false;}}};
  }
  function assessment(){
    if(current.results){results();return;}if(!current.questions?.length)return;message('Complete the whole retest before feedback.');
    content.innerHTML=`<h3>Apply the same ideas to new questions.</h3><p class="lw-muted">This retest uses generated questions tied to the same objectives. It does not add to original-question coverage. Confidence may remain Unknown.</p><form id="lw-test">${current.questions.map((q,i)=>`<section class="lw-card"><span class="lw-kicker">Question ${i+1} / ${current.questions.length} · ${esc(q.type||'Application of source material')}</span><span class="lw-cite">Source identifiers: ${sourceNames(q.source_ids)}</span><fieldset><legend>${esc(q.prompt)}</legend>${[...(q.choices||[]),{id:'no_idea',text:'No idea'}].map(c=>`<label class="lw-choice"><input required type="radio" name="lw-answer-${i}" value="${esc(c.id)}"><span>${esc(c.text)}</span></label>`).join('')}</fieldset><label class="lw-inline">Confidence<select name="lw-confidence-${i}"><option>Unknown</option><option>Confident</option><option>Guessed</option><option>No idea</option></select></label></section>`).join('')}<div class="lw-actions"><button type="submit" class="lw-primary">Submit complete retest</button><button type="button" id="lw-test-back">Return to lessons</button></div></form>`;
    content.querySelector('#lw-test-back').onclick=plan;
    content.querySelector('#lw-test').onsubmit=async e=>{e.preventDefault();const form=new FormData(e.target),button=e.submitter,token=version;button.disabled=true;
      try{await service().request('submit_retest',{plan_id:current.plan.id,answers:current.questions.map((q,i)=>({question_id:q.id,choice_id:form.get('lw-answer-'+i),confidence:form.get('lw-confidence-'+i)}))});if(token===version&&host.open)await load(current.plan.id);}catch(err){if(token===version){message(err.message);button.disabled=false;}}
    };
  }
  function results(){const r=current.results;message('Fresh retest recorded separately from your existing progress.');
    content.innerHTML=`<h2>${Number(r.correct)||0} / ${Number(r.total)||0} correct</h2><p>${esc(r.mastery||'Multiple-choice performance is current assessment evidence. Retention and practical performance remain unverified.')}</p>${(r.items||[]).map(item=>`<section class="lw-card"><span class="lw-chip">${item.correct?'Correct':'Needs study'} · ${esc(item.confidence||'Unknown')}</span><p>${esc(current.questions?.find(q=>q.id===item.question_id)?.prompt||item.question_id)}</p><p>${esc(item.rationale)}</p><span class="lw-cite">${sourceNames(item.source_ids)}</span></section>`).join('')}<div class="lw-actions"><button type="button" id="lw-revisit">Revisit the lessons</button><button type="button" id="lw-export">Export learning evidence</button></div><p class="lw-muted">This completed question set is practice when revisited. A later retention check requires a fresh assessment. Existing due reviews have not been changed.</p>`;
    content.querySelector('#lw-revisit').onclick=plan;content.querySelector('#lw-export').onclick=()=>{const body={format:'tomato08-learning-evidence-v1',plan:current.plan,results:r,original_question_coverage:false};const url=URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='learning-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  }
  async function open(value){
    if(!service()?.isAvailable())throw new Error('The learning extension is unavailable.');if(!value?.moduleId||!value.summary?.id)throw new Error('Complete a test before opening a study plan.');
    ensure();stop();context=value;owner=service().getUserId();current=null;lastFocus=document.activeElement;if(!host.open)host.showModal();overview();
  }
  root.T08LearningWorkspace={open,close,safeUrl};
})(typeof window!=='undefined'?window:globalThis);
