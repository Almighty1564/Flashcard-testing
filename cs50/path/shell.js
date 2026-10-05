/* Shared orientation and notebook, layered over existing course engines. */
(async function(){
 'use strict';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const header=document.querySelector('body>header');if(!header)return;
 document.body.classList.add('t08-guided');header.classList.add('path-work-header');
 // Preserve the existing account control, which owns each engine's backup actions.
 const account=header.querySelector('#accountButton,#account'),brand=header.querySelector('.brand');
 [...header.children].forEach(el=>{if(el!==account&&el!==brand)el.remove();});
 if(brand){brand.setAttribute('href','path.html');const text=brand.querySelector('span');if(text)text.innerHTML='TOMATO08<small>PROGRAMMING / NETWORK AUTOMATION</small>';}
 const nav=document.createElement('nav');nav.className='path-work-nav';nav.setAttribute('aria-label','Course navigation');nav.innerHTML='<a href="../dev.html">DEV</a><a href="path.html">Course map</a><a href="path.html#view=progress">Progress</a><a href="path.html#view=tools">Tools</a>';header.insertBefore(nav,account);
 const notes=document.createElement('button');notes.type='button';notes.id='courseNotesButton';notes.textContent='Notes';header.insertBefore(notes,account);
 const bar=document.createElement('section');bar.className='path-orientation';bar.hidden=true;bar.setAttribute('aria-label','Current course objective');header.after(bar);
 const footer=document.createElement('div');footer.className='path-next-bar';footer.hidden=true;const host=document.getElementById('main');(document.getElementById('workspace')||document.querySelector('.layout')||host)?.after(footer);
 let data,node=null,lastHash='',frame=0;
 async function render(){
  if(!data)return;node=T08PathCore.identify(data.map,location.pathname,location.hash);T08Notebook.setContext(node);
  const p=new URLSearchParams(location.hash.slice(1)),isTool=['setup','evidence','history','mixed','skills'].includes(p.get('view'));
  const gate=document.getElementById('gate'),workspace=document.getElementById('workspace');if(workspace?.hidden){bar.hidden=true;footer.hidden=true;return;}
  bar.hidden=false;const stage=node?T08PathCore.activeStage(node,location.hash):null;
  const state=window.CS50Lab?.state;
  const stageLink=s=>T08PathCore.mapLink(node.id,s);
  bar.innerHTML=`<div class="path-orientation-title"><div><a href="${node?T08PathCore.mapLink(node.id):'path.html'}">← Back to course map</a><strong>${node&&!isTool?'Objective '+String(node.number).padStart(2,'0')+' / '+esc(node.title):'Course tools and supporting records'}</strong></div><button id="browseCourseTools" aria-expanded="${document.body.classList.contains('path-browse')}">${document.body.classList.contains('path-browse')?'Hide':'Show'} topic browser</button></div>${node&&!isTool?`<ol class="path-work-stages">${T08PathCore.STAGES.map((s,i)=>`<li><a href="${stageLink(s)}" ${s===stage?'aria-current="step"':''}>${i+1}. ${esc(T08PathCore.LABELS[s])}</a></li>`).join('')}</ol><div class="path-work-foot"><span>${esc(node.goal)}</span><a href="${stageLink(stage)}">Review this stage’s checklist →</a></div>`:'<p class="path-small">These pages support your work. Continue the guided sequence from Course map.</p>'}`;
  bar.querySelector('#browseCourseTools').onclick=()=>{document.body.classList.toggle('path-browse');render();};
  footer.hidden=!node||isTool;footer.innerHTML=node?`<span>Finished this activity? The map reads its recorded result and shows what comes next.</span><a href="${T08PathCore.mapLink(node.id,stage)}">Return to this objective →</a>`:'';
  // Avoid duplicate high-level stage systems. Preserve these controls for users who explicitly browse.
  document.querySelectorAll('#content>.steps,#content .steps,#app>.tabs').forEach(el=>el.classList.add('path-legacy-stages'));
 }
 notes.onclick=()=>T08Notebook.open(node);
 window.addEventListener('hashchange',()=>{lastHash=location.hash;requestAnimationFrame(render);});
 document.addEventListener('t08-evidence-updated',render);
 try{data=await T08PathData.load();render();const target=document.getElementById('workspace')||document.getElementById('app');if(target){new MutationObserver(()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;render();});}).observe(target,{childList:true,subtree:true,attributes:target.id==='workspace',attributeFilter:['hidden']});}}
 catch(error){bar.hidden=false;bar.textContent='Course map is temporarily unavailable. Your existing assignment still works.';}
})();
