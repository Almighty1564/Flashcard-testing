/* Tomato08 CS50 Applied. Original curriculum; browser-local evidence, never a proctored score. */
(() => {
  'use strict';
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clone = x => JSON.parse(JSON.stringify(x));
  const stamp = () => new Date().toISOString();
  const date = x => new Date(x).toLocaleString([], {dateStyle:'medium',timeStyle:'short'});
  const label = {build:'Build', debug:'Repair', modify:'Adapt', rebuild:'Rebuild', project:'Project'};
  const runnerLabel = {c:'C · local',python:'Python · local',sql:'SQLite · local',javascript:'JavaScript · local',flask:'Flask · local',html:'HTML · preview',manual:'Artifact · self-review'};
  const helpLabel = {none:'No tailored help',docs:'Documentation only',hint:'Hints used',ai:'AI / tailored help',solution:'Solution consulted'};
  let C, tasks, state, key, account = 'guest', client, authUser = null, storageFailed = false;
  let currentView = 'course', activeUnit, activeTab = 'theory', activeTask = null, checkerText, reportTarget;
  const emptyState = () => ({schema:1,version:'1.0.0',events:[],drafts:{},quizzes:{},seen:{}});
  const isIndependent = e => ['none','docs'].includes(e.assistance) && !e.hints;
  const passed = t => state.events.some(e => e.task === t.id && e.passed === true);
  const quizPassed = u => state.events.some(e => e.type === 'quiz' && e.unit === u.id && e.passed === true);
  const quizEvent = u => [...state.events].reverse().find(e => e.type === 'quiz' && e.unit === u.id);
  function toast(message) { const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,4200); }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(state)); storageFailed=false; }
    catch (_) { storageFailed=true; }
    $('#saveStatus').textContent=storageFailed ? 'Not saved: browser storage is unavailable or full. Export a backup now.' : `Saved in this browser · ${authUser ? 'Account workspace' : 'Guest workspace'} · No cloud sync`;
    $('#saveStatus').classList.toggle('error',storageFailed);
  }
  function loadAccount(next, user=null) {
    account=next;authUser=user;key=`tomato08_cs50_v1_${account}`;
    try { const raw=JSON.parse(localStorage.getItem(key)||'null');state=validBackup(raw) ? raw : emptyState(); }
    catch (_) {state=emptyState();}
    save(); accountUI(); render();
  }
  function validBackup(x) {
    return x && x.schema===1 && x.version===C.version && Array.isArray(x.events) && x.events.length<=10000 &&
      x.drafts && typeof x.drafts==='object' && !Array.isArray(x.drafts) && x.quizzes && typeof x.quizzes==='object' && x.seen && typeof x.seen==='object' &&
      x.events.every(e=>e && typeof e.id==='string' && e.id.length<100 && typeof e.at==='string' && Number.isFinite(Date.parse(e.at)) && C.units.some(u=>u.id===e.unit) && ['quiz','attempt'].includes(e.type) && typeof e.passed==='boolean' && (e.type==='quiz'||tasks.some(t=>t.id===e.task))) &&
      Object.keys(x.drafts).every(id=>tasks.some(t=>t.id===id) && typeof x.drafts[id].code==='string' && x.drafts[id].code.length<=100000);
  }
  function draft(t) {
    if (!state.drafts[t.id]) state.drafts[t.id]={code:t.starter||'',notes:'',artifact:'',assistance:'none',hints:0,rubric:[],started:stamp(),updated:stamp()};
    return state.drafts[t.id];
  }
  function record(e) {
    state.events.push({id:uid(),at:stamp(),...e});save();renderNav();
  }
  function attempts(u) {return state.events.filter(e=>e.type==='attempt'&&e.unit===u.id);}
  function level(u) {
    const a=attempts(u).filter(e=>e.passed), indep=a.filter(isIndependent);
    let n=state.seen[u.id]||quizPassed(u)?1:0;
    if (a.length) n=2;
    const builds=indep.filter(e=>tasks.find(t=>t.id===e.task)?.kind==='build');
    if(indep.length)n=3;
    if(builds.length && indep.some(e=>tasks.find(t=>t.id===e.task)?.kind==='modify'&&builds.some(b=>Date.parse(e.at)>=Date.parse(b.at))))n=4;
    if(builds.length && indep.some(e=>tasks.find(t=>t.id===e.task)?.kind==='rebuild'&&builds.some(b=>Date.parse(e.at)-Date.parse(b.at)>=48*3600000)))n=5;
    return {n,text:['Not started','Familiar','Assisted','Applied','Adapted','Rebuilt later'][n]};
  }
  function dueUnits() {
    return C.units.filter(u=>{
      const a=attempts(u).filter(e=>e.passed&&isIndependent(e));
      const builds=a.filter(e=>tasks.find(t=>t.id===e.task)?.kind==='build'&&Date.now()-Date.parse(e.at)>=48*3600000);
      return builds.length && !a.some(e=>tasks.find(t=>t.id===e.task)?.kind==='rebuild'&&builds.some(b=>Date.parse(e.at)-Date.parse(b.at)>=48*3600000));
    });
  }
  function renderNav() {
    $('#unitNav').innerHTML=C.units.map((u,i)=>`<button class="unit-link ${u.id===activeUnit?.id?'active':''}" data-unit="${u.id}" ${u.id===activeUnit?.id?'aria-current="step"':''}><span class="num">${String(i).padStart(2,'0')}</span><span class="unitname">${esc(u.title)}</span>${u.tasks.every(passed)&&quizPassed(u)?'<span class="unitdone" aria-label="Completed">✓</span>':''}</button>`).join('');
    $$('.topbar nav button').forEach(b=>{b.classList.toggle('active',b.dataset.view===currentView);b.setAttribute('aria-current',b.dataset.view===currentView?'page':'false');});
  }
  function navigate({unit=activeUnit?.id||C.units[0].id,tab='theory',task=null,view='course'}={}) {
    const p=new URLSearchParams({view,unit,tab});if(task)p.set('task',task);
    const hash='#'+p.toString();if(location.hash===hash) route();else location.hash=hash;
  }
  function route() {
    const p=new URLSearchParams(location.hash.slice(1));
    currentView=['course','evidence','setup'].includes(p.get('view'))?p.get('view'):'course';
    activeUnit=C.units.find(u=>u.id===p.get('unit'))||C.units[0];
    activeTab=['theory','quiz','practice','project'].includes(p.get('tab'))?p.get('tab'):'theory';
    activeTask=activeUnit.tasks.find(t=>t.id===p.get('task'))||null;
    render();
  }
  function statsHTML() {
    const done=tasks.filter(passed).length+C.units.filter(quizPassed).length,total=tasks.length+C.units.length;
    const a=state.events.filter(e=>e.type==='attempt'&&e.passed);
    return `<div class="stats"><div class="stat"><strong>${done}<span> / ${total}</span></strong><span>Activities completed</span></div><div class="stat"><strong>${new Set(a.filter(isIndependent).map(e=>e.task)).size}</strong><span>Independently reported</span></div><div class="stat"><strong>${new Set(a.filter(e=>!isIndependent(e)).map(e=>e.task)).size}</strong><span>Assisted completions</span></div><div class="stat"><strong>${dueUnits().length}</strong><span>Delayed reviews due</span></div></div><div class="progress-track" role="progressbar" aria-label="Course activities completed" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${done/total*100}%"></i></div>`;
  }
  function render() {
    if(!C||!state)return;
    renderNav();
    if(currentView==='setup')return renderSetup();
    if(currentView==='evidence')return renderEvidence();
    if(activeTask)return renderTask(activeTask);
    const u=activeUnit, n=C.units.indexOf(u);
    $('#app').innerHTML=`<section class="hero"><div><span class="eyebrow">CS50 APPLIED / THEORY INTO PRACTICE</span><h1>Learn it.<br>Make it work.</h1><p>A programming course companion built around things you can actually make, repair, and explain.</p></div><div class="edition">12<small>SECTIONS</small></div></section>${statsHTML()}<div class="actions"><button class="primary" data-action="continue">Continue your path ↗</button><button data-action="review" ${dueUnits().length?'':'disabled'}>Open a due rebuild</button><a class="button quiet" href="${C.video}" target="_blank" rel="noopener noreferrer">Your lecture video ↗</a></div><div class="section-head"><div><span class="eyebrow">SECTION ${String(n).padStart(2,'0')}</span><h2>${esc(u.title)}</h2><p>${u.skills.map(esc).join(' · ')}</p></div><span class="tag">${level(u).text}</span></div><div class="tabs" aria-label="Lesson stages">${[['theory','01 Theory'],['quiz','02 Quiz'],['practice','03 Practice'],['project','04 Project']].map(([id,name])=>`<button data-tab="${id}" class="${activeTab===id?'active':''}" aria-pressed="${activeTab===id}">${name}</button>`).join('')}</div><div id="lesson"></div>`;
    if(activeTab==='theory')renderTheory();else if(activeTab==='quiz')renderQuiz();else renderTaskList(activeTab==='project');
  }
  function renderTheory() {
    const u=activeUnit;
    $('#lesson').innerHTML=`<div class="theory-grid">${u.theory.map(([title,text])=>`<article class="card"><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`).join('')}</div><div class="card"><div class="section-head" style="margin-top:0"><div><h3>Use the lecture. Then use the skill.</h3><p>Read the objectives, watch the matching Harvard section, and move into practice. Watching does not count as a coding pass.</p></div></div><div class="actions"><a class="button" href="${u.source}" target="_blank" rel="noopener noreferrer">Official lesson ↗</a>${u.id==='scratch'?'<a class="button" href="https://scratch.mit.edu/projects/editor/" target="_blank" rel="noopener noreferrer">Open Scratch ↗</a>':''}<button class="primary" data-action="seen">${state.seen[u.id]?'Continue to quiz':'Mark reviewed & start quiz'}</button><button data-action="print">Print lesson</button></div></div><p class="small">Original explanations and exercises. Official lecture material remains on Harvard’s website.</p>`;
  }
  function shuffle(a) {const x=[...a];for(let i=x.length-1;i>0;i--){const v=new Uint32Array(1);crypto.getRandomValues(v);const j=v[0]%(i+1);[x[i],x[j]]=[x[j],x[i]];}return x;}
  function quizState(u) {
    let q=state.quizzes[u.id];
    const valid=q && Array.isArray(q.order) && q.order.length===u.quiz.length && new Set(q.order).size===u.quiz.length && q.order.every(id=>u.quiz.some(item=>item.id===id)) && q.options && q.answers;
    if(!valid){q={order:shuffle(u.quiz.map(q=>q.id)),options:{},answers:{},submitted:false};u.quiz.forEach(item=>q.options[item.id]=shuffle(item.options.map((_,i)=>i)));state.quizzes[u.id]=q;save();}
    return q;
  }
  function renderQuiz() {
    const u=activeUnit,q=quizState(u);
    $('#lesson').innerHTML=`<div class="notice">Six concept and prediction questions. An 80% score completes this quiz, not the coding skill. Question and answer order shuffle on a new attempt.</div><form id="quizForm">${q.order.map((id,i)=>{
      const item=u.quiz.find(x=>x.id===id);let order=q.options[id];if(!Array.isArray(order)||order.length!==item.options.length||new Set(order).size!==item.options.length||order.some(v=>!Number.isInteger(v)||v<0||v>=item.options.length))order=item.options.map((_,i)=>i);
      return `<fieldset class="card"><legend>${i+1}. ${esc(item.prompt)}</legend>${order.map(index=>`<label class="option ${Number(q.answers[id])===index&&q.answers[id]!==undefined?'selected':''}"><input type="radio" name="${id}" value="${index}" ${Number(q.answers[id])===index&&q.answers[id]!==undefined?'checked':''} ${q.submitted?'disabled':''} required><span>${esc(item.options[index])}</span></label>`).join('')}${q.submitted?`<div class="quiz-feedback"><b class="${Number(q.answers[id])===item.answer?'good':'error'}">${Number(q.answers[id])===item.answer?'Correct':'Review this'}</b><p>${esc(item.explanation)}</p><span>Correct answer: ${esc(item.options[item.answer])}</span></div>`:''}</fieldset>`;
    }).join('')}<div class="actions">${q.submitted?`<button type="button" data-action="newQuiz">Start another attempt</button><button type="button" class="primary" data-tab="practice">Go to practice →</button>`:'<button type="submit" class="primary">Grade this attempt</button>'}</div></form>${q.submitted?`<p class="notice">Latest score: ${u.quiz.filter(item=>Number(q.answers[item.id])===item.answer).length}/${u.quiz.length}. Quiz answers and grading are visible in this client-side practice tool.</p>`:''}`;
  }
  function renderTaskList(projectOnly) {
    const list=activeUnit.tasks.filter(t=>projectOnly?t.kind==='project':t.kind!=='project');
    $('#lesson').innerHTML=`<p class="muted">${projectOnly?'Combine the section’s skills in a deliverable. Record the artifact, tests, and design decisions.':'Work through build → repair → adapt → rebuild. A delayed rebuild earns retained evidence only after 48 hours and an independently reported earlier build.'}</p><div class="task-list">${list.map(t=>`<article class="card task-card"><div class="taskmeta"><span class="tag">${label[t.kind]}</span><span class="tag ${passed(t)?'ok':''}">${passed(t)?'Completed':t.tests?'Behavior checks':'Self-review'}</span></div><h3>${esc(t.title)}</h3><p>${esc(t.brief)}</p><span class="small">${runnerLabel[t.runner]}${t.tests?` · ${t.tests.length} test cases`:''}</span><button data-task="${t.id}" class="${passed(t)?'':'primary'}">${passed(t)?'Review or retry':'Open assignment'} ↗</button></article>`).join('')}</div>`;
  }
  function assistanceSelect(d) {return `<label for="assistance">Assistance for this attempt</label><select id="assistance">${Object.entries(helpLabel).map(([id,text])=>`<option value="${id}" ${d.assistance===id?'selected':''}>${text}</option>`).join('')}</select><p class="small">Documentation is allowed for independent practice. Hints, AI-written code, or solutions make this attempt assisted. Outside help is self-reported.</p>`;}
  function renderTask(t) {
    const u=activeUnit,d=draft(t),auto=!!t.tests, last=[...state.events].reverse().find(e=>e.task===t.id);
    $('#app').innerHTML=`<div class="section-head"><div><button class="linkbtn" data-tab="${t.kind==='project'?'project':'practice'}">← ${esc(u.title)}</button><h1 style="font-size:30px;letter-spacing:-1px;margin:10px 0">${esc(t.title)}</h1><div class="actions"><span class="tag">${label[t.kind]}</span><span class="tag">${runnerLabel[t.runner]}</span><span class="tag ${passed(t)?'ok':''}">${passed(t)?'Evidence recorded':'In progress'}</span></div></div></div><div class="workspace"><div><section class="card"><h2>The assignment</h2><p>${esc(t.brief)}</p><ol class="requirements">${t.requirements.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>${t.kind==='rebuild'?'<div class="notice">Start from your own blank implementation. Passing early counts as practice; retained evidence requires a 48-hour gap after an independent build.</div>':''}</section>${auto?`<section class="card"><h3>Example contract</h3><label>${t.runner==='sql'?'Database setup':t.runner==='javascript'?'Function argument':'Input / request'}</label><pre>${esc(typeof t.tests[0].input==='string'?t.tests[0].input:JSON.stringify(t.tests[0].input,null,2))}</pre><label>Expected result</label><pre>${esc(typeof t.tests[0].expected==='string'?t.tests[0].expected:JSON.stringify(t.tests[0].expected,null,2))}</pre><details><summary>View all ${t.tests.length} practice test cases</summary>${t.tests.map(c=>`<h4>${esc(c.label)}</h4><pre>${esc(JSON.stringify({input:c.input,expected:c.expected},null,2))}</pre>`).join('')}</details><p class="small">These checks are public and editable. Passing them is behavioral evidence for these cases, not a secure exam or proof of the required technique.</p></section>`:''}<section class="card"><h3>Hints, not a replacement solution</h3><div id="hints">${t.hints.slice(0,d.hints).map((h,i)=>`<p><b>${i+1}.</b> ${esc(h)}</p>`).join('')}</div><button data-action="hint" ${d.hints>=t.hints.length?'disabled':''}>Reveal next hint</button><p class="small">Opening a hint is recorded for this attempt.</p></section><section class="card"><h3>Acceptance review</h3>${t.rubric.map((r,i)=>`<label class="checkline"><input type="checkbox" data-rubric="${i}" ${d.rubric?.includes(i)?'checked':''}><span>${esc(r)}</span></label>`).join('')}<p class="small">Technique, clarity, accessibility, and design claims remain self-reviewed. Automated output checks do not prove them.</p></section></div><div><section class="card"><div class="editor-top"><b>${esc(t.file)}</b><span id="draftStatus">Draft saved locally</span></div><label for="code" class="sr-only">Your source code or project notebook</label><textarea id="code" class="code" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off">${esc(d.code)}</textarea><div class="actions" style="margin-top:12px"><button class="primary" data-action="downloadLab">Download lab ZIP</button><button data-action="exportSource">Export source</button>${t.runner==='html'?'<button data-action="preview">Preview HTML</button>':''}<button data-action="newAttempt">New attempt</button></div><p class="small">${auto?'Write here or in your editor. Download the ZIP, extract it, and run the included checker on a computer. The website does not execute C, Python, SQL, or Flask.':t.runner==='html'?'Preview this single file in an isolated frame. External assets and network requests are blocked. Review its behavior using the rubric.':'Build the actual artifact in Scratch or your development environment. Use this notebook to record its location and reproducible evidence.'}</p><div id="previewHost"></div></section><section class="card"><h3>Record the attempt</h3>${assistanceSelect(d)}<label for="notes">What did you build, repair, or learn?</label><textarea id="notes" class="notes" placeholder="Record the cause of a defect, a test result, or a design decision.">${esc(d.notes||'')}</textarea><label for="artifact">Artifact or repository location ${auto?'(optional)':'(required)'}</label><input id="artifact" placeholder="Repository URL, Scratch link, or local file path" value="${esc(d.artifact||'')}">${auto?`<div class="notice"><b>Run locally</b><pre>python check.py</pre>Then import <code>result.json</code> here. On Windows, <code>py check.py</code> may be the installed launcher.</div><div class="actions"><button class="primary" data-action="importReport">Import checker result</button><button data-view="setup">Setup help</button></div>`:`<div class="notice">This assignment is not automatically graded. Check each review criterion, record an artifact location, and write at least 40 characters of evidence.</div><button class="primary" data-action="manualPass">Record completed self-review</button>`}<p class="small">Only synthetic/non-sensitive code and notes. Evidence is stored in this browser, not uploaded to the website.</p></section><div id="lastResult">${last?resultHTML(last):''}</div></div></div>`;
  }
  function resultHTML(e) {
    const t=tasks.find(t=>t.id===e.task);const changed=t&&draft(t).code!==e.code;
    return `<section class="card"><h3>${e.passed?'Evidence recorded':'Attempt needs work'}</h3><p><span class="tag ${e.passed?'ok':'fail'}">${e.passed?'Passed':'Not passed'}</span> <span class="tag">${e.provenance==='self-review'?'Self-reviewed':'Imported local result'}</span></p><p class="small">${date(e.at)} · ${esc(helpLabel[e.assistance]||'Assistance unknown')}${e.hints?` · ${e.hints} hints`:''}</p>${changed?'<div class="notice">Your current draft differs from this saved attempt. Run and import fresh checks for the changed code.</div>':''}${e.error?`<pre class="error">${esc(e.error)}</pre>`:''}${(e.results||[]).map(r=>`<div class="result-row"><strong class="${r.passed?'good':'error'}">${r.passed?'PASS':'FAIL'} · ${esc(r.label)}</strong>${!r.passed?`<label>Expected</label><pre>${esc(typeof r.expected==='string'?r.expected:JSON.stringify(r.expected))}</pre><label>Actual</label><pre>${esc(typeof r.actual==='string'?r.actual:JSON.stringify(r.actual))}</pre>${r.error?`<pre>${esc(r.error)}</pre>`:''}`:''}</div>`).join('')}${e.compile_output?`<details><summary>Compiler output</summary><pre>${esc(e.compile_output)}</pre></details>`:''}<p class="small">${e.provenance==='self-review'?'Your review is a declared completion, not an independently graded result.':'Local reports are unsigned, inspectable practice evidence. Independence, algorithm choice, and exhaustive correctness are not verified.'}</p></section>`;
  }
  function renderEvidence() {
    const due=dueUnits(), events=[...state.events].reverse();
    $('#app').innerHTML=`<section class="hero"><div><span class="eyebrow">YOUR TRAINING RECORD</span><h1>Progress with evidence.</h1><p>Inspect the work behind the result. Assisted practice, local checks, and self-reviews remain distinguishable.</p></div></section>${statsHTML()}<div class="actions"><button data-action="backup">Export all evidence</button><button data-action="importBackup">Import backup</button><button data-action="print">Print record</button></div><div class="notice">Levels show the highest recorded evidence, not a calibrated skill percentage or proctored result. Documentation-only work can be independently reported. Local reports and backups can be edited outside this app.</div><details><summary>How progression is calculated</summary><p>Familiar: lesson reviewed or quiz passed. Assisted: completed work with hints, AI, or solutions. Applied: at least one independently reported task pass. Adapted: an independently reported change request after an independent build. Rebuilt later: an independent rebuild at least 48 hours after an independent build. Manual self-reviews can contribute but remain labeled. Earlier successes are retained even after a later failed attempt; inspect the timeline for current weaknesses.</p></details>${due.length?`<section class="card"><h3>Ready to revisit</h3><p>These sections have an earlier independent build and are due for a changed problem.</p><div class="actions">${due.map(u=>`<button data-task="${u.tasks.find(t=>t.kind==='rebuild').id}">${esc(u.title)} →</button>`).join('')}</div></section>`:''}<div class="section-head"><h2>Evidence by section</h2><span class="small">Click to inspect assignments</span></div><div class="skill-grid">${C.units.map(u=>{const l=level(u);return `<section class="card"><h3>${esc(u.title)}</h3><p class="small">${u.skills.map(esc).join(' · ')}</p><div class="skill-row"><span>${l.text}</span><span class="skill-dots" aria-label="Evidence level ${l.n} of 5">${'●'.repeat(l.n)}${'○'.repeat(5-l.n)}</span></div><div class="skill-row"><span>Assignments completed</span><span>${u.tasks.filter(passed).length}/${u.tasks.length}</span></div><div class="skill-row"><span>Theory quiz</span><span>${quizPassed(u)?'Passed':quizEvent(u)?'Needs review':'Not attempted'}</span></div><button class="linkbtn" data-unit="${u.id}">Inspect section →</button></section>`;}).join('')}</div><div class="section-head"><h2>Attempt history</h2><span class="small">${events.length} recorded attempts</span></div>${events.length?`<div class="timeline">${events.map(e=>{const t=tasks.find(t=>t.id===e.task),u=C.units.find(u=>u.id===e.unit);return `<article class="event"><h3>${esc(t?.title||u?.title+' quiz')} <span class="tag ${e.passed?'ok':'fail'}">${e.passed?'Passed':'Needs work'}</span></h3><p>${date(e.at)} · ${e.type==='quiz'?`${e.correct}/${e.total} · Browser quiz`:esc(e.provenance==='self-review'?'Self-review':'Imported local checks')+' · '+esc(helpLabel[e.assistance]||'Unknown assistance')}</p>${e.notes?`<p>${esc(e.notes)}</p>`:''}<details><summary>Inspect saved evidence</summary>${e.artifact?`<p>Artifact: ${esc(e.artifact)}</p>`:''}${e.code?`<pre>${esc(e.code)}</pre>`:''}${e.results?`<pre>${esc(JSON.stringify(e.results,null,2))}</pre>`:''}${e.quizAnswers?`<pre>${esc(JSON.stringify(e.quizAnswers,null,2))}</pre>`:''}<p class="small">Attempt ID: ${esc(e.id)}</p></details></article>`;}).join('')}</div>`:'<div class="card empty">No recorded attempts yet. Begin a quiz or complete a lab to create your first evidence.</div>'}`;
  }
  function renderSetup() {
    $('#app').innerHTML=`<section class="hero"><div><span class="eyebrow">START HERE</span><h1>Your site is the course.<br>Your computer is the lab.</h1><p>Use the website for lessons, quizzes, writing, and evidence. Run real programs in a development environment.</p></div></section><section class="card setup-step"><span class="stepnum">01</span><div><h3>Choose your development environment</h3><p>For the C portion, Harvard’s browser-based environment is a practical route on Windows or an iPad with a keyboard. Alternatively, use a local editor, Python 3.10+, and GCC or Clang.</p><div class="actions"><a class="button primary" href="https://cs50.dev/" target="_blank" rel="noopener noreferrer">Open cs50.dev ↗</a><a class="button" href="https://code.visualstudio.com/docs/setup/setup-overview" target="_blank" rel="noopener noreferrer">Local VS Code setup ↗</a><a class="button" href="https://www.python.org/downloads/" target="_blank" rel="noopener noreferrer">Python ↗</a></div><p class="small">The website itself does not compile C or execute Python. Scratch projects use Scratch; HTML assignments have an isolated preview here.</p></div></section><section class="card setup-step"><span class="stepnum">02</span><div><h3>Download a lab, then extract it</h3><p>Each lab includes the requirements, your saved source draft, sample test cases, and the local checker. Automatic labs have <code>lab.json</code>, <code>check.py</code>, and a solution file. Projects include an evidence rubric instead.</p><pre>my-lab/\n  README.md\n  lab.json\n  check.py\n  solution.c   # or .py, .sql, .js, .html, .md</pre><p>Open the extracted folder in your editor. Do not run directly inside the ZIP preview.</p></div></section><section class="card setup-step"><span class="stepnum">03</span><div><h3>Implement, check, and investigate</h3><pre>python check.py</pre><p>Windows may use <code>py check.py</code>; some systems use <code>python3 check.py</code>. C additionally needs GCC/Clang. JavaScript function labs need Node.js. SQLite checking uses Python’s standard library.</p><p>For Flask labs, create a virtual environment, activate it, and install the included requirements:</p><pre>python -m venv .venv\n# Windows: .venv\\Scripts\\activate\n# macOS/Linux: source .venv/bin/activate\npython -m pip install -r requirements.txt\npython check.py</pre><p>For memory labs, a supported compiler can add sanitizer checks:</p><pre>python check.py --sanitize</pre><div class="notice">The checker runs your program on your computer. It has time and output limits, but it is not a security sandbox. Run only your own or trusted code, using fictional data. Never run it as administrator.</div></div></section><section class="card setup-step"><span class="stepnum">04</span><div><h3>Import the evidence</h3><p>Return to the same assignment and import <code>result.json</code>. Declare any assistance and add a note. Failed attempts are useful evidence too. Code snapshots, case results, notes, and timestamps stay attached to the attempt.</p><p>For Scratch, HTML behavior, and larger projects, review every criterion and record the artifact location. These are labeled self-reviews, not automatic passes.</p></div></section><section class="card setup-step"><span class="stepnum">05</span><div><h3>Protect your progress</h3><p>Progress is saved only in this browser, partitioned by your Tomato08 account or guest workspace. No course database changes were made. Another browser or device will not automatically have this progress.</p><p>Export a backup regularly, especially before clearing browser data. Backups contain your source code and notes. Import only your own trusted backup. Quiz state and source drafts are included.</p><div class="actions"><button class="primary" data-action="backup">Export backup</button><button data-action="importBackup">Import backup</button><button data-action="downloadCourse">Download all 60 assignments</button></div></div></section><section class="card"><h3>Scope and grading</h3><p>12 sections, 72 original quiz questions, 60 original assignments. Thirty coding labs provide 112 executable behavior checks; other assignments use self-review rubrics. This is not an official Harvard course, secure examination system, or automatic verifier of independent work.</p><p><a href="${C.honesty}" target="_blank" rel="noopener noreferrer">Harvard academic-honesty policy ↗</a> · <a href="${C.source}" target="_blank" rel="noopener noreferrer">Official syllabus and lessons ↗</a></p></section>`;
  }
  function accountUI() {
    if(!C)return;
    $('#accountButton').textContent=authUser?'Account':'Guest / sign in';
    $('#accountInfo').innerHTML=`<p>${authUser?'Signed in with your existing Tomato08 account.':'Using a guest workspace in this browser.'}</p><p class="small">Signing in switches workspaces. Guest work is not silently mixed into an account; export and import it explicitly to transfer it.</p>`;
    $('#loginForm').hidden=!!authUser;$('#signoutButton').hidden=!authUser;
  }
  function download(name,text,type='application/octet-stream') {
    const blob=text instanceof Blob?text:new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  const enc = new TextEncoder();
  const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function zip(files) {
    const parts=[],central=[];let offset=0;
    const put=(view,at,value,wide=false)=>wide?view.setUint32(at,value,true):view.setUint16(at,value,true);
    for(const [name,text] of Object.entries(files)){
      const n=enc.encode(name),data=enc.encode(text),crc=crc32(data),h=new Uint8Array(30+n.length),v=new DataView(h.buffer);
      put(v,0,0x04034b50,true);put(v,4,20);put(v,6,0x800);put(v,14,crc,true);put(v,18,data.length,true);put(v,22,data.length,true);put(v,26,n.length);h.set(n,30);parts.push(h,data);
      const c=new Uint8Array(46+n.length),w=new DataView(c.buffer);put(w,0,0x02014b50,true);put(w,4,20);put(w,6,20);put(w,8,0x800);put(w,16,crc,true);put(w,20,data.length,true);put(w,24,data.length,true);put(w,28,n.length);put(w,42,offset,true);c.set(n,46);central.push(c);offset+=h.length+data.length;
    }
    const size=central.reduce((n,c)=>n+c.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);put(v,0,0x06054b50,true);put(v,8,central.length);put(v,10,central.length);put(v,12,size,true);put(v,16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});
  }
  async function getChecker(){if(window.CS50_BUNDLE?.checker)return window.CS50_BUNDLE.checker;if(!checkerText){const r=await fetch('check.py');if(!r.ok)throw new Error('Could not download the checker. Reload and try again.');checkerText=await r.text();}return checkerText;}
  async function labFiles(t,all=false){
    const d=draft(t),files={};
    const command=all?'python ../../check.py':'python check.py';
    files['README.md']=`# ${t.title}\n\nTomato08 CS50 Applied ${C.version}. Original companion exercise, not a Harvard submission.\n\n${t.brief}\n\n## Requirements\n${t.requirements.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\n## Work\nEdit ${t.file}. ${t.tests?`Run: ${command}\nUpload result.json to this assignment on the website. C requires GCC/Clang; Python/SQL need Python 3.10+; JavaScript needs Node.js; Flask needs the included dependency.`:'Build the artifact and record evidence on the website. This assignment uses a self-review rubric, not an automatic grader.'}\n\n## Acceptance review\n${t.rubric.map(x=>'- '+x).join('\n')}\n\n## Safety and interpretation\nRun only your own or trusted code. The local checker is not a security sandbox. It runs programs on your computer with a time/output limit. Use synthetic data, not credentials or operational records. Reports are unsigned, inspectable practice evidence. Passing cases does not establish independence or prove all design requirements.\n\n## Your notes\n${d.notes||''}\nArtifact: ${d.artifact||''}\n`;
    files[t.file]=d.code;
    if(t.tests){files['lab.json']=JSON.stringify({course_id:C.id,version:C.version,task:t},null,2);if(!all)files['check.py']=await getChecker();}
    if(t.runner==='flask')files['requirements.txt']='Flask==3.1.2\n';
    return files;
  }
  async function downloadLab(t){download(`CS50-${t.id}.zip`,zip(await labFiles(t)));toast('Lab ZIP created with your current draft.');}
  async function downloadCourse(){
    const files={'check.py':await getChecker(),'START_HERE.txt':'Tomato08 CS50 Applied\nOpen a lab folder inside labs. Edit its source. For automatic labs, run python ../../check.py from that lab folder. Import its result.json on the website. Manual projects use rubrics. See each README.md.\n'};
    for(const t of tasks){const pack=await labFiles(t,true);for(const [name,text] of Object.entries(pack))files[`labs/${t.id}/${name}`]=text;}
    download('Tomato08-CS50-All-Labs.zip',zip(files));toast('All 60 assignments packaged.');
  }
  function exportBackup(){download(`CS50-progress-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({course_id:C.id,version:C.version,exported:stamp(),workspace:account,state},null,2),'application/json');toast('Backup includes your code, notes, quizzes, and attempt history.');}
  const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((o,k)=>(o[k]=v[k],o),{}):v);
  async function importReport(file){
    if(!file)return;const t=tasks.find(x=>x.id===reportTarget);if(!t?.tests)throw new Error('Open an automatically checked assignment first.');
    if(file.size>1500000)throw new Error('Result file is too large. Limit: 1.5 MB.');
    const r=JSON.parse(await file.text());
    if(r.schema!==1||r.course_id!==C.id||r.version!==C.version||r.task_id!==t.id||r.runner!==t.runner||typeof r.source!=='string'||r.source.length>100000||!Array.isArray(r.results))throw new Error('Report does not match this assignment and checker version.');
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(r.source)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(digest!==r.source_sha256)throw new Error('The source hash in this report does not match its source. Run the checker again.');
    const compileFailure=typeof r.error==='string' && r.results.length===0;
    if(!compileFailure&&(r.results.length!==t.tests.length||new Set(r.results.map(x=>x.id)).size!==t.tests.length))throw new Error('Report is missing expected cases. Run the supplied checker.');
    const results=r.results.map(item=>{const c=t.tests.find(x=>x.id===item.id);if(!c)throw new Error('Report contains an unknown test case.');if(canonical(item.expected)!==canonical(c.expected))throw new Error('Report test expectations differ from this curriculum version.');return {...item,label:c.label,passed:item.passed===true&&canonical(item.actual)===canonical(c.expected),error:String(item.error||'').slice(0,8000)};});
    const d=draft(t),help=d.hints&&['none','docs'].includes(d.assistance)?'hint':d.assistance;
    record({type:'attempt',unit:t.unit,task:t.id,passed:!compileFailure&&results.length===t.tests.length&&results.every(r=>r.passed),provenance:'local-unverified',assistance:help,hints:d.hints,code:r.source,source_sha256:digest,notes:d.notes,artifact:d.artifact,results,error:r.error?String(r.error).slice(0,16000):'',compile_output:String(r.compile_output||'').slice(0,16000),sanitizer:String(r.sanitizer||'not-run')});
    if(d.code!==r.source && (d.code===t.starter||!d.code.trim())){d.code=r.source;d.updated=stamp();save();}
    if(currentView==='course'&&activeTask?.id===t.id)renderTask(t);else render();toast('Local result recorded. Assistance remains self-reported.');
  }
  async function importBackup(file){
    if(!file)return;if(file.size>15000000)throw new Error('Backup exceeds the 15 MB import limit.');
    const data=JSON.parse(await file.text());if(data.course_id!==C.id||data.version!==C.version||!validBackup(data.state))throw new Error('This is not a valid backup for the current curriculum.');
    if(!confirm('Merge this backup into the current browser workspace? Attempt IDs are deduplicated. Imported drafts and quiz state will replace matching local drafts and quiz attempts. Only import your own backup.'))return;
    const byId=new Map(state.events.map(e=>[e.id,e]));data.state.events.forEach(e=>{if(!byId.has(e.id))byId.set(e.id,e);});
    state.events=[...byId.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    for(const t of tasks)if(Object.hasOwn(data.state.drafts,t.id))state.drafts[t.id]=clone(data.state.drafts[t.id]);
    for(const u of C.units){if(Object.hasOwn(data.state.quizzes,u.id))state.quizzes[u.id]=clone(data.state.quizzes[u.id]);if(data.state.seen[u.id])state.seen[u.id]=data.state.seen[u.id];}
    save();render();toast('Backup merged into this browser workspace. Imported claims are not reverified.');
  }
  function updateDraft(el){
    if(!activeTask)return;const d=draft(activeTask);
    if(['code','notes','artifact','assistance'].includes(el.id)){d[el.id==='code'?'code':el.id]=el.value;d.updated=stamp();save();if($('#draftStatus'))$('#draftStatus').textContent=storageFailed?'Not saved':'Draft saved locally';}
    if(el.dataset.rubric!==undefined){d.rubric=(d.rubric||[]).filter(i=>i!==Number(el.dataset.rubric));if(el.checked)d.rubric.push(Number(el.dataset.rubric));save();}
  }
  document.addEventListener('input',e=>updateDraft(e.target));
  document.addEventListener('change',e=>{
    updateDraft(e.target);
    if(e.target.closest('#quizForm')&&e.target.type==='radio'){const q=quizState(activeUnit);q.answers[e.target.name]=Number(e.target.value);save();const fs=e.target.closest('fieldset');$$('.option',fs).forEach(l=>l.classList.toggle('selected',$('input',l).checked));}
  });
  document.addEventListener('keydown',e=>{if(e.target.id==='code'&&e.key==='Tab'){e.preventDefault();const el=e.target,s=el.selectionStart;el.setRangeText('    ',s,el.selectionEnd,'end');updateDraft(el);}});
  document.addEventListener('submit',async e=>{
    if(e.target.id==='quizForm'){
      e.preventDefault();const q=quizState(activeUnit);if(q.submitted)return;
      if(activeUnit.quiz.some(item=>q.answers[item.id]===undefined)){toast('Answer every question before grading.');return;}
      const correct=activeUnit.quiz.filter(item=>Number(q.answers[item.id])===item.answer).length;q.submitted=true;
      record({type:'quiz',unit:activeUnit.id,passed:correct/activeUnit.quiz.length>=.8,correct,total:activeUnit.quiz.length,quizAnswers:clone(q.answers)});render();toast(`Quiz recorded: ${correct}/${activeUnit.quiz.length}.`);
    }
    if(e.target.id==='loginForm'){
      e.preventDefault();const btn=$('button[type="submit"]',e.target);btn.disabled=true;$('#loginError').textContent='';
      try{if(!client)throw new Error('Account service did not load. Reload with a connection or continue in the guest workspace.');const username=$('#username').value.trim().toLowerCase();const email=username.includes('@')?username:`${username}@${window.FC_CONFIG.emailDomain||'flashcard.invalid'}`;const res=await client.auth.signInWithPassword({email,password:$('#password').value});if(res.error)throw new Error('Sign-in failed. Check your username and password.');$('#password').value='';loadAccount(res.data.user.id,res.data.user);toast('Account workspace opened. Course progress is still browser-local.');}
      catch(error){$('#loginError').textContent=error.message;}finally{btn.disabled=false;}
    }
  });
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    try{
      if(b.dataset.unit)return navigate({unit:b.dataset.unit});
      if(b.dataset.view)return navigate({view:b.dataset.view,unit:activeUnit.id});
      if(b.dataset.tab)return navigate({unit:activeUnit.id,tab:b.dataset.tab});
      if(b.dataset.task){const t=tasks.find(t=>t.id===b.dataset.task);return navigate({unit:t.unit,tab:t.kind==='project'?'project':'practice',task:t.id});}
      const a=b.dataset.action,t=activeTask,d=t&&draft(t);
      if(a==='continue'){let u=C.units.find(u=>!quizPassed(u)||u.tasks.some(t=>!passed(t)))||activeUnit;if(!state.seen[u.id])navigate({unit:u.id});else if(!quizPassed(u))navigate({unit:u.id,tab:'quiz'});else{const next=u.tasks.find(t=>!passed(t));navigate({unit:u.id,tab:next?.kind==='project'?'project':'practice',task:next?.id});}}
      if(a==='review'){const u=dueUnits()[0];if(u)navigate({unit:u.id,tab:'practice',task:u.tasks.find(t=>t.kind==='rebuild').id});}
      if(a==='seen'){state.seen[activeUnit.id]=stamp();save();navigate({unit:activeUnit.id,tab:'quiz'});}
      if(a==='newQuiz'){delete state.quizzes[activeUnit.id];save();render();}
      if(a==='hint'&&d){d.hints=Math.min(t.hints.length,(d.hints||0)+1);if(['none','docs'].includes(d.assistance))d.assistance='hint';save();renderTask(t);}
      if(a==='newAttempt'&&d&&confirm('Start a new attempt from the starter? This replaces this assignment’s current draft and clears its hints, notes, and review selections. Saved attempt history is kept.')){delete state.drafts[t.id];draft(t);save();renderTask(t);}
      if(a==='exportSource'&&d)download(t.file,d.code,'text/plain');
      if(a==='downloadLab'&&t){b.disabled=true;await downloadLab(t);b.disabled=false;}
      if(a==='downloadCourse'){b.disabled=true;await downloadCourse();b.disabled=false;}
      if(a==='importReport'&&t){reportTarget=t.id;$('#reportInput').value='';$('#reportInput').click();}
      if(a==='preview'&&d){const host=$('#previewHost');host.replaceChildren();const frame=document.createElement('iframe');frame.className='preview';frame.title='Isolated preview of your HTML';frame.sandbox='allow-scripts';frame.referrerPolicy='no-referrer';frame.srcdoc='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">'+d.code;host.append(frame);}
      if(a==='manualPass'&&d){if((d.rubric||[]).length!==t.rubric.length||d.notes.trim().length<40||d.artifact.trim().length<3){toast('Complete every review criterion, add an artifact location, and write at least 40 characters of evidence.');return;}record({type:'attempt',unit:activeUnit.id,task:t.id,passed:true,provenance:'self-review',assistance:d.hints&&['none','docs'].includes(d.assistance)?'hint':d.assistance,hints:d.hints,code:d.code,notes:d.notes,artifact:d.artifact,rubric:clone(d.rubric)});renderTask(t);toast('Self-review recorded. It is not an automatically graded pass.');}
      if(a==='backup'||b.id==='backupButton')exportBackup();
      if(a==='importBackup'||b.id==='importBackupButton'){$('#backupInput').value='';$('#backupInput').click();}
      if(a==='print')window.print();
      if(b.id==='accountButton'){accountUI();$('#accountDialog').showModal();}
      if(b.id==='signoutButton'&&client){const res=await client.auth.signOut();if(res.error)throw res.error;loadAccount('guest');toast('Signed out. Account progress stays separated in this browser.');}
    }catch(error){toast(error.message||'The action could not be completed.');b.disabled=false;}
  });
  $('#reportInput').addEventListener('change',e=>importReport(e.target.files[0]).catch(error=>toast(error.message)));
  $('#backupInput').addEventListener('change',e=>importBackup(e.target.files[0]).catch(error=>toast(error.message)));
  window.addEventListener('hashchange',()=>{if(C&&state)route();});
  window.addEventListener('storage',e=>{if(e.key===key&&e.newValue)toast('This workspace changed in another tab. Export before continuing here to avoid overwriting newer work.');});
  async function boot(){
    try{
      if(window.CS50_BUNDLE?.course)C=clone(window.CS50_BUNDLE.course);else{const res=await fetch('manifest.json');if(!res.ok)throw new Error('Curriculum could not be loaded. Reload with a connection.');C=await res.json();if(Array.isArray(C.unitFiles)){C.units=await Promise.all(C.unitFiles.map(async path=>{const r=await fetch(path);if(!r.ok)throw new Error('A course section could not load. Reload with a connection.');return r.json();}));}}
      tasks=C.units.flatMap(u=>u.tasks.map(t=>({...t,unit:u.id})));C.units.forEach(u=>u.tasks=u.tasks.map(t=>tasks.find(x=>x.id===t.id)));
      activeUnit=C.units[0];loadAccount('guest');route();
      if(window.supabase?.createClient&&window.FC_CONFIG?.url){
        client=window.supabase.createClient(window.FC_CONFIG.url,window.FC_CONFIG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'flashcard_portal_session'}});
        client.auth.onAuthStateChange((_event,session)=>{const next=session?.user?.id||'guest';if(next!==account)setTimeout(()=>loadAccount(next,session?.user||null),0);});
        const result=await Promise.race([client.auth.getSession(),new Promise(resolve=>setTimeout(()=>resolve(null),5000))]);
        if(result?.data?.session){const user=result.data.session.user;if(account!==user.id)loadAccount(user.id,user);}
      }
    }catch(error){$('#app').innerHTML=`<section class="card"><h1>Course could not load</h1><p>${esc(error.message)}</p><p>Open this course from your website, or serve its folder using a local HTTP server. Opening index.html directly as a file does not support curriculum loading.</p><a class="button" href="../index.html">Back to Tomato08</a></section>`;}
  }
  // Small diagnostics surface for automated UI tests; it does not expose credentials.
  window.CS50Lab={get state(){return state;},get curriculum(){return C;},zip,level,validBackup};
  boot();
})();
