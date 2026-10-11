/* Inline Communicator workspace. Existing mod1.html owns cards, grading and persistence. */
(function () {
  'use strict';
  if (document.body.dataset.page !== 'modules' || !document.getElementById('testerApp')) return;
  const $ = id => document.getElementById(id);
  const nav = $('workspaceNav'), app = $('testerApp');
  const menu = document.createElement('details');
  menu.id = 'cwWorkspaceMenu'; menu.className = 'cw-workspace-menu'; menu.open = true;
  menu.innerHTML = '<summary>☰ <span>Workspace menu</span><span class="cw-chevron" aria-hidden="true">▾</span></summary><div class="cw-menu-body"></div>';
  const menuBody = menu.lastElementChild;
  const communicator = nav.querySelector('[data-nav="modules"]');
  const moduleGroup = communicator.closest('.w-nav-group');
  const otherGroups = [...moduleGroup.parentElement.children].filter(el => el.classList.contains('w-nav-group') && el !== moduleGroup);
  moduleGroup.after(menu); otherGroups.forEach(el => menuBody.append(el));
  const account = nav.querySelector('.w-account'); if (account) menuBody.append(account);
  function moveAppearance() { const el = nav.querySelector(':scope > .lg-controls'); if (el) menuBody.append(el); }
  moveAppearance(); new MutationObserver(moveAppearance).observe(nav, {childList: true});

  const tools = document.createElement('section');
  tools.id = 'cwStudyTools'; tools.className = 'cw-study-tools'; tools.hidden = true;
  tools.setAttribute('aria-label', 'Study tools');
  tools.innerHTML = `<div class="cw-tools-heading"><span>STUDY TOOLS</span><strong id="cwToolModule"></strong></div>
    <div class="cw-ring-card"><button type="button" id="cwRing" data-study-action="ringBtn" aria-label="Open module progress breakdown" disabled>
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="cw-ring-track" cx="60" cy="60" r="50"/><g id="cwRingSegments" transform="rotate(-90 60 60)"></g></svg>
    <span class="cw-ring-center"><strong id="cwPercent">0%</strong><small>memorized</small></span></button>
    <div class="cw-legend">${['Confident','Correct','Guessed','Wrong','Skipped'].map((name,i)=>`<div><i class="cw-color-${i}"></i><span>${name}</span><strong id="cwCount${i}">0</strong></div>`).join('')}</div>
    <p id="cwSeen">Loading progress…</p><small>Click ring for breakdown</small></div>
    <button class="cw-control cw-refresh" type="button" data-study-action="unlockBtn" disabled>↻ <span>Refresh from Cloud</span></button>
    <details class="cw-disclosure" id="cwCustom"><summary>Build Custom Test <span aria-hidden="true">›</span></summary><div>
    <button type="button" data-study-action="customPickBtn" disabled>Choose groups…</button>
    <button type="button" data-study-action="customWeakBtn" disabled>Wrong &amp; guessed only</button>
    <button type="button" data-study-action="customUntestedBtn" disabled>Never seen only</button>
    <button type="button" data-study-action="customAllCardsBtn" disabled>Every question</button></div></details>
    <button type="button" class="cw-control" id="cwCalculation" data-study-action="calcBtn" hidden></button>
    <details class="cw-disclosure" id="cwGroups"><summary>Groups <small id="cwGroupCount"></small><span aria-hidden="true">▾</span></summary><div>
    <label class="w-sr-only" for="cwGroupSearch">Find a group</label><input id="cwGroupSearch" type="search" placeholder="Find a group…"><div id="cwGroupList"></div>
    <p class="cw-small">For multiple groups, use Build Custom Test.</p></div></details>
    <details class="cw-disclosure" id="cwSettings"><summary>Settings <span aria-hidden="true">▾</span></summary><div>
    <button type="button" data-study-action="exportBtn" disabled>Export progress</button>
    <button type="button" data-study-action="importBtn" disabled>Import progress</button>
    <p class="cw-small">Uses your existing module progress and backup format.</p></div></details>`;
  menu.after(tools);
  const study = document.createElement('section');
  study.id = 'cwStudy'; study.hidden = true; study.setAttribute('aria-labelledby','cwTitle');
  study.innerHTML = `<div class="cw-breadcrumb"><a href="./tester.html">Communicator</a><span aria-hidden="true">/</span><span id="cwCrumb"></span></div>
    <header class="w-heading cw-heading"><div><h1 id="cwTitle" tabindex="-1">Study</h1><p id="cwSubtitle"></p><p id="cwSaveStatus" role="status" aria-live="polite"></p></div></header>
    <div id="cwLoading" class="p-empty" role="status">Loading your module…</div><div id="cwError" class="p-empty" role="alert" hidden><h2>Module could not be opened</h2><p id="cwErrorText"></p><button id="cwRetry" type="button" class="p-button">Try again</button> <a class="p-button" id="cwStandalone" href="./mod1.html">Open standalone study page</a></div>
    <div id="cwFrameHost"></div><a class="cw-back" href="./tester.html">← Communicator / all modules</a>`;
  app.after(study);
  let published = [], accountId = null, selected = null, mounted = null, bridge = null;
  let frame = null, generation = 0, lastSnapshot = null, lastGroups = '', readyTimer = null;
  const scriptURL = new URL('./communicator-study-embed.js?v=20261011-1', location.href).href;
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const resolve = slug => published.find(m => m.slug === slug || normalize(m.name) === normalize(slug));
  const actionIds = new Set(['ringBtn','unlockBtn','customPickBtn','customWeakBtn','customUntestedBtn','customAllCardsBtn','calcBtn','exportBtn','importBtn']);
  function closePopovers() { menu.open = !selected; tools.querySelectorAll('details').forEach(d => { d.open = false; }); }
  function syncTheme() {
    if (!frame?.contentDocument?.body) return;
    const source = getComputedStyle(document.documentElement), body = frame.contentDocument.body;
    for (const [to, from] of Object.entries({bg:'--w-bg',panel:'--w-surface',panel2:'--w-side',line:'--w-line',text:'--w-text',muted:'--w-muted'})) body.style.setProperty('--'+to,source.getPropertyValue(from));
    frame.contentDocument.documentElement.style.colorScheme = document.documentElement.dataset.lgPalette === 'dawn' ? 'light' : 'dark';
  }
  new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-lg-palette','data-lg-material','data-lg-opaque']});
  function renderGroups(groups) {
    const sig=JSON.stringify(groups); if (sig===lastGroups) return; lastGroups=sig;
    $('cwGroupCount').textContent = '('+groups.length+')'; const list=$('cwGroupList');list.replaceChildren();
    for (const group of groups) {
      const button=document.createElement('button');button.type='button';button.dataset.studyGroup=group.id;
      const name=document.createElement('strong'), meta=document.createElement('small');name.textContent=group.name;meta.textContent=group.meta;
      button.append(name,meta);button.classList.toggle('is-active',group.active);list.append(button);
    }
    filterGroups();
  }
  function filterGroups() {
    const q=$('cwGroupSearch').value.toLowerCase();
    $('cwGroupList').querySelectorAll('button').forEach(b => { b.hidden=!b.textContent.toLowerCase().includes(q); });
  }
  function receive(data) {
    if (!data || !selected || selected.slug!==mounted || !accountId) return;
    lastSnapshot=data;
    $('cwTitle').textContent=data.title || selected.name;
    $('cwSubtitle').textContent=data.subtitle;
    $('cwSaveStatus').textContent=data.saveStatus;
    $('cwSaveStatus').classList.toggle('cw-pending',data.pending);
    $('cwPercent').textContent=data.percent+'%'; $('cwSeen').textContent=data.seen;
    data.counts.forEach((n,i)=>{$('cwCount'+i).textContent=String(n);});
    const signature=JSON.stringify([data.counts,data.total]);
    if ($('cwRingSegments').dataset.signature!==signature) {
      const container=$('cwRingSegments');container.replaceChildren();container.dataset.signature=signature;let offset=0;const circumference=2*Math.PI*50;
      data.counts.forEach((n,i)=>{const length=data.total ? n/data.total*circumference:0;const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
        for(const [a,v] of Object.entries({cx:60,cy:60,r:50,'stroke-dasharray':`${length} ${circumference-length}`,'stroke-dashoffset':-offset,'class':'cw-segment cw-color-'+i}))circle.setAttribute(a,String(v));
        offset+=length;container.append(circle);});
    }
    tools.querySelectorAll('[data-study-action]').forEach(b=>{b.disabled=(b.dataset.studyAction!=='unlockBtn' && !data.ready) || data.disabled.includes(b.dataset.studyAction);});
    $('cwCalculation').hidden=!data.calculator; $('cwCalculation').textContent=data.calculator||'';
    renderGroups(data.groups);
    if (frame) frame.style.height=Math.max(300,Math.min(24000,data.height))+'px';
  }
  function destroyFrame() {
    generation++;clearTimeout(readyTimer);
    try{bridge?.disconnect();}catch(_){}bridge=null;frame?.remove();frame=null;mounted=null;lastSnapshot=null;lastGroups='';
    $('cwFrameHost').replaceChildren();
  }
  function fail(message) {
    clearTimeout(readyTimer);$('cwLoading').hidden=true;$('cwError').hidden=false;$('cwErrorText').textContent=message;
    if(frame)frame.hidden=true;
  }
  function mount(module) {
    if (mounted===module.slug && frame) { frame.hidden=false;bridge?.refresh();syncTheme();return; }
    destroyFrame();mounted=module.slug;const token=generation;
    $('cwLoading').hidden=false;$('cwError').hidden=true;$('cwSubtitle').textContent='Loading questions and progress…';$('cwSaveStatus').textContent='';
    $('cwStandalone').href='./mod1.html?module='+encodeURIComponent(module.slug);
    tools.querySelectorAll('[data-study-action]').forEach(b=>{b.disabled=true;});$('cwGroupList').replaceChildren();$('cwGroupCount').textContent='';$('cwPercent').textContent='0%';$('cwSeen').textContent='Loading progress…';$('cwRingSegments').replaceChildren();delete $('cwRingSegments').dataset.signature;for(let i=0;i<5;i++)$('cwCount'+i).textContent='0';
    frame=document.createElement('iframe');frame.id='cwStudyFrame';frame.title=module.name+' testing workspace';frame.hidden=true;frame.referrerPolicy='same-origin';
    frame.addEventListener('load',()=>{
      if(token!==generation)return;
      try {
        const doc=frame.contentDocument;
        if(frame.contentWindow.location.href==='about:blank')return;
        const url=new URL(frame.contentWindow.location.href);
        if(url.origin!==location.origin || url.pathname!==new URL('./mod1.html',location.href).pathname) { fail('Your study session is unavailable. Return to Communicator or sign in again.');return; }
        const script=doc.createElement('script');script.src=scriptURL;
        script.onerror=()=>fail('Study controls could not load. Retry without clearing your browser data.');
        script.onload=async()=>{
          try {
            const api=frame.contentWindow.T08StudyEmbed;
            if(!api)throw Error('The study adapter did not start.');
            await api.ready;
            if(token!==generation || !accountId)return;
            bridge=api;bridge.connect(receive);syncTheme();$('cwLoading').hidden=true;$('cwError').hidden=true;frame.hidden=!selected;clearTimeout(readyTimer);
          }catch(e){if(token===generation)fail(e.message||'The study workspace could not start.');}
        };
        doc.head.append(script);
      }catch(_){fail('The study frame could not be accessed securely. Use the standalone study link.');}
    });
    $('cwFrameHost').append(frame);
    frame.contentWindow.location.replace(new URL('./mod1.html?module='+encodeURIComponent(module.slug),location.href).href);
    readyTimer=setTimeout(()=>{if(token===generation&&!bridge)fail('Loading is taking longer than expected. Retry when your connection is available.');},25000);
  }
  function show(module, focus=false) {
    selected=module||null;document.body.classList.toggle('cw-studying',Boolean(selected));
    app.hidden=Boolean(selected);study.hidden=!selected;tools.hidden=!selected;menu.open=!selected;
    communicator.toggleAttribute('aria-current',!selected);if(!selected)communicator.setAttribute('aria-current','page');
    moduleGroup.querySelectorAll('a.w-child').forEach(a=>{
      const m=resolve(new URL(a.href).searchParams.get('module'));a.removeAttribute('aria-current');
      if(selected && m?.slug===selected.slug)a.setAttribute('aria-current','page');
    });
    closePopovers();
    if(selected){$('cwTitle').textContent=selected.name;$('cwCrumb').textContent=selected.name;$('cwToolModule').textContent=selected.name;mount(selected);}
    else if(frame)frame.hidden=true;
    document.title=selected?selected.name+' / Communicator / Tomato08':'Communicator / Tomato08 Atelier';
    if(focus){(selected?$('cwTitle'):$('pageTitle')).setAttribute('tabindex','-1');(selected?$('cwTitle'):$('pageTitle')).focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  }
  function route(focus=false) {
    if(!accountId)return;
    const requested=new URLSearchParams(location.search).get('module');const match=requested?resolve(requested):null;
    const status=$('requestedModuleStatus');status.hidden=!requested||Boolean(match);
    if(requested&&!match)status.textContent='That module is not currently published. Choose an available module below.';
    show(match,focus);
  }
  function navigate(module) {
    if(module && mounted && module.slug!==mounted && lastSnapshot?.pending){alert('Progress is still pending cloud sync. Keep this module open and use Refresh from Cloud after reconnecting.');return;}
    if(module && mounted && module.slug!==mounted && lastSnapshot?.activeSession && !confirm('Switch modules and leave the current test? Recorded answers are retained. Unanswered questions will not be submitted.'))return;
    const url=new URL(location.href);if(module)url.searchParams.set('module',module.slug);else url.searchParams.delete('module');url.hash='';
    if(url.href!==location.href)history.pushState({communicator:true},'',url.pathname+url.search);
    show(module,true);
  }
  document.addEventListener('click',event=>{
    const a=event.target.closest('a[href]');if(!a||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!accountId)return;
    const url=new URL(a.href,location.href);if(url.origin!==location.origin||url.pathname!==new URL('./tester.html',location.href).pathname)return;
    const requested=url.searchParams.get('module');const module=requested?resolve(requested):null;if(requested&&!module)return;
    event.preventDefault();navigate(module);
  });
  tools.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled||!bridge)return;
    if(actionIds.has(button.dataset.studyAction)){bridge.run(button.dataset.studyAction);if(button.dataset.studyAction!=='importBtn')closePopovers();}
    else if(button.dataset.studyGroup){bridge.group(button.dataset.studyGroup);closePopovers();}
    if(button.dataset.studyAction!=='importBtn')nav.querySelector('.w-nav-close')?.click();
  });
  $('cwGroupSearch').addEventListener('input',filterGroups);
  $('cwRetry').addEventListener('click',()=>{const m=selected;destroyFrame();if(m)mount(m);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&selected&&menu.open){menu.open=false;menu.querySelector('summary').focus();}});
  document.addEventListener('pointerdown',e=>{if(selected&&menu.open&&!menu.contains(e.target))menu.open=false;});
  document.addEventListener('workspace:account',event=>{
    const next=event.detail?.userId||null;
    if(!event.detail?.signedIn || (accountId && next && next!==accountId)){destroyFrame();published=[];show(null);app.hidden=true;}
    accountId=event.detail?.signedIn?(next||'approved'):null;
  });
  $('signOutBtn').addEventListener('click',()=>{destroyFrame();published=[];selected=null;study.hidden=true;tools.hidden=true;},true);
  const auth=window.FC?.client?.auth;
  if(auth?.onAuthStateChange)auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT' || (accountId && accountId!=='approved' && session?.user?.id && session.user.id!==accountId)){
      destroyFrame();study.hidden=true;tools.hidden=true;published=[];accountId=null;app.hidden=true;
      location.replace('./index.html?return='+encodeURIComponent(location.pathname+location.search));
    }
  });
  window.addEventListener('popstate',()=>route(true));
  window.T08Communicator=Object.freeze({setModules(items){published=items.filter(m=>m.is_published&&typeof m.slug==='string');route();}});
})();
