/* Version 4 lesson tools. Presentation only: the existing course and notebook
   engines continue to own authentication, grading, drafts, evidence and sync. */
(function () {
  'use strict';
  const app = document.getElementById('app'), main = document.getElementById('main');
  const media = window.T08LessonMedia;
  if (!app || !main || !media || document.getElementById('lessonWorkbench')) return;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const root = document.createElement('section');
  root.id = 'lessonWorkbench'; root.className = 'lw-workbench'; root.hidden = true;
  root.setAttribute('aria-label', 'Lesson workspace');
  root.innerHTML = `
    <aside class="lw-sidebar" aria-label="Workspace navigation">
      <a class="lw-brand" href="../index.html"><b>t08</b><span>TOMATO08<small>DEVELOPMENT</small></span></a>
      <button class="lw-menu" id="lwMenu" type="button" aria-expanded="false" aria-controls="lwNavigation">Navigation <span aria-hidden="true">☰</span></button>
      <nav id="lwNavigation">
        <a href="../index.html">Overview</a>
        <div class="lw-nav-group"><a href="../tester.html">Communicator</a><a class="lw-child" href="../tester.html?module=mod1">MOD 1</a><a class="lw-child" href="../tester.html?module=mod2">MOD 2</a><a class="lw-child" href="../tester.html?module=mod3">MOD 3</a></div>
        <div class="lw-nav-group"><a href="../dev.html">DEV (Coding)</a><a class="lw-child" href="path.html" aria-current="page">CS50 Applied</a><a class="lw-child" href="practice.html">Practice</a><a class="lw-child" href="projects.html">Projects</a></div>
        <div class="lw-nav-group"><span class="lw-eyebrow">UTILITIES</span><a href="../weather.html">Weather</a><a href="path.html#view=progress">Course progress</a><a href="path.html#view=tools">Course tools</a></div>
        <div class="lw-nav-group lw-account-slot" id="lwAccountSlot"></div>
      </nav>
    </aside>
    <div class="lw-main">
      <header class="lw-heading"><div><a class="lw-eyebrow" href="../dev.html">DEV / CS50 APPLIED</a><h1 id="lwTitle"></h1><p id="lwSection"></p></div><div class="lw-course-controls"><span id="lwProgress"></span><div><button type="button" id="lwPrevious" aria-label="Previous lesson">←</button><button type="button" id="lwNext" aria-label="Next lesson">→</button></div></div></header>
      <div class="lw-tablist" role="tablist" aria-label="Lesson tools">
        <button id="lwTab-lecture" type="button" role="tab" data-lw-tab="lecture" aria-controls="lwPanel-lecture" aria-selected="true">▷ <span>Lecture</span></button>
        <button id="lwTab-scratch" type="button" role="tab" data-lw-tab="scratch" aria-controls="lwPanel-scratch" aria-selected="false" tabindex="-1">▧ <span>Scratch</span></button>
        <button id="lwTab-notes" type="button" role="tab" data-lw-tab="notes" aria-controls="lwPanel-notes" aria-selected="false" tabindex="-1">▤ <span>Notes</span></button>
        <button id="lwTab-files" type="button" role="tab" data-lw-tab="files" aria-controls="lwPanel-files" aria-selected="false" tabindex="-1">▱ <span>Files</span></button>
      </div>
      <div class="lw-grid"><div class="lw-tool" id="lwTool">
        <div class="lw-toolbar"><h2 id="lwToolTitle">Lecture video</h2><span id="lwToolLabel" class="lw-small">Official CS50 lecture</span><div class="lw-window-controls"><button id="lwMinimize" type="button" aria-label="Minimize current tool" aria-expanded="true">−</button><button id="lwMaximize" type="button" aria-label="Maximize current tool" aria-pressed="false">⛶</button></div></div>
        <div id="lwToolBody">
          <section id="lwPanel-lecture" role="tabpanel" aria-labelledby="lwTab-lecture" tabindex="0">
            <div class="lw-video" id="lwVideoMount"><div class="lw-load-screen" id="lwVideoStart"><span class="lw-video-mark">CS50</span><h3 id="lwVideoTitle"></h3><button type="button" class="lw-primary" id="lwLoadVideo">Load lecture</button><p>Loads YouTube's embedded player here. Playback is not a course completion.</p></div></div>
            <div class="lw-resource-foot"><span>Harvard CS50 · English</span><a id="lwVideoFallback" target="_blank" rel="noopener noreferrer">Open official player ↗</a></div>
          </section>
          <section id="lwPanel-scratch" role="tabpanel" aria-labelledby="lwTab-scratch" tabindex="0" hidden>
            <p class="lw-editor-note"><strong>Scratch standalone editor.</strong> Use File → Save to your computer to keep your .sb3 project. It is not saved to your Tomato08 or Scratch account.</p>
            <div class="lw-scratch" id="lwScratchMount"><div class="lw-load-screen" id="lwScratchStart"><span class="lw-block-mark" aria-hidden="true">when ⚑ clicked<br><i>move 10 steps</i></span><h3>Build in Scratch</h3><p>Open the Scratch Foundation's editor inside this window.</p><button type="button" id="lwLoadScratch" class="lw-primary">Load Scratch editor</button><p>Switch tabs or minimize without reloading the editor.<br>Save the project before refreshing or leaving this page.</p></div></div>
            <div class="lw-resource-foot"><span id="lwScratchStatus" role="status">External editor loads only when requested.</span><a href="https://scratchfoundation.github.io/scratch-gui/" target="_blank" rel="noopener noreferrer">Open standalone ↗</a></div>
          </section>
          <section id="lwPanel-notes" role="tabpanel" aria-labelledby="lwTab-notes" tabindex="0" hidden><div id="lwNotesMount"></div><p class="lw-note-help">Your existing notebook: saved notes, topic links, revision history and optional Obsidian sync.</p></section>
          <section id="lwPanel-files" role="tabpanel" aria-labelledby="lwTab-files" tabindex="0" hidden><div class="lw-files"><h3>Lesson resources</h3><a id="lwOfficialLesson" class="lw-file" target="_blank" rel="noopener noreferrer"><strong>Official lesson & downloads ↗</strong><span>Harvard's notes, slides, transcript and source files.</span></a><button class="lw-file" type="button" id="lwDownloadInstructions"><strong>Download lesson instructions</strong><span>These lesson objectives and assignment requirements as Markdown.</span></button><button class="lw-file" type="button" data-action="backup"><strong>Export Foundation progress</strong><span>Use the existing course backup format. Does not include Scratch projects.</span></button><div class="lw-file"><strong>Scratch project files (.sb3)</strong><p>In the editor: File → Save to your computer. To restore: File → Load from your computer. A tab switch preserves the open editor; a page reload does not.</p><a href="https://scratch.mit.edu/projects/editor/" target="_blank" rel="noopener noreferrer">Open Scratch website for account saving / sharing ↗</a></div></div></section>
        </div>
        <p class="lw-minimized" id="lwMinimized" hidden>Tool minimized. <button type="button" id="lwRestore">Restore window</button></p>
      </div><aside class="lw-lesson-rail" aria-label="Lesson content">
        <h2>Lesson content</h2><details id="lwOverview"><summary>Overview & objectives</summary><div id="lwTheory"></div></details>
        <div class="lw-steps"><button type="button" data-lw-open="lecture">Watch lecture</button><button type="button" data-lw-open="scratch">Try in Scratch</button><button type="button" data-tab="quiz">Knowledge quiz</button><details class="lw-assignment-list"><summary>Practice & project</summary><div id="lwAssignments"></div></details></div>
        <div class="lw-quick"><h3>Quick actions</h3><button type="button" data-lw-open="scratch">Open Scratch here</button><button type="button" data-lw-open="notes">Take notes</button><button type="button" data-action="seen" class="lw-primary">Review & start quiz</button><p>Reviewing opens the existing quiz. Assignments still require their original evidence.</p></div>
      </aside></div>
      <footer class="lw-bottom"><div class="lw-notes-shortcut" id="lwNotesSlot"><span>Notebook</span></div><p id="lwStorage"></p><span class="lw-small">Tomato08 / CS50 Applied</span></footer>
    </div>`;
  main.append(root);
  const tabs = ['lecture', 'scratch', 'notes', 'files'];
  const labels = {lecture: ['Lecture video', 'Official CS50 lecture'], scratch: ['Scratch editor', 'Standalone · save .sb3 locally'], notes: ['Course notes', 'Existing account notebook'], files: ['Lesson files', 'Resources & backups']};
  let unit = null, theory = false, active = 'lecture', lastRender = null, queued = false;
  let video = null, scratch = null, approved = false, authRevision = 0, authAttached = false;
  let expanded = false, restoreFocus = null, inertNodes = [], notesClick = null, accountHome = null, notesHome = null;
  let switching = 0, scratchTimer = null;
  const minimized = new Set();
  const notebook = $('t08Notebook'), notesButton = $('courseNotesButton'), accountButton = $('accountButton');
  if (notesButton) { notesHome = notesButton.parentNode; notesClick = notesButton.onclick; }
  if (accountButton) accountHome = accountButton.parentNode;

  function pauseVideo() {
    video?.contentWindow?.postMessage(JSON.stringify({event: 'command', func: 'pauseVideo', args: []}), 'https://www.youtube-nocookie.com');
  }
  function say(text) { $('lwStorage').textContent = text; }
  function syncWindow() {
    const small = minimized.has(active);
    $('lwToolBody').hidden = small; $('lwMinimized').hidden = !small;
    $('lwMinimize').textContent = small ? '+' : '−';
    $('lwMinimize').setAttribute('aria-label', small ? 'Restore current tool' : 'Minimize current tool');
    $('lwMinimize').setAttribute('aria-expanded', String(!small));
    $('lwToolTitle').textContent = labels[active][0]; $('lwToolLabel').textContent = labels[active][1];
  }
  async function select(name, focus = false) {
    if (!tabs.includes(name)) return;
    const request = ++switching;
    try {
      if (active === 'notes' && name !== 'notes' && window.T08Notebook) {
        await T08Notebook.flush();
        if (request !== switching) return;
        await T08Notebook.close();
      }
    } catch (error) { say('Notes could not be saved: ' + error.message); return; }
    if (request !== switching) return;
    if (name !== 'lecture') pauseVideo();
    active = name;
    tabs.forEach(id => {
      $('lwTab-' + id).setAttribute('aria-selected', String(id === name));
      $('lwTab-' + id).tabIndex = id === name ? 0 : -1;
      $('lwPanel-' + id).hidden = id !== name;
    });
    syncWindow();
    if (focus) $('lwTab-' + name).focus();
    if (name === 'notes' && window.T08Notebook) {
      if (notebook && notebook.parentNode !== $('lwNotesMount')) $('lwNotesMount').append(notebook);
      await T08Notebook.open(contextNode());
      if (request !== switching) return;
      if (focus) $('lwTab-' + name).focus();
    }
  }
  function contextNode() {
    if (!unit) return null;
    const course = window.CS50Lab?.curriculum;
    // Same stable Foundation identity as the published plan; never a new note store.
    const ids = {scratch:'cs-scratch',c:'cs-c',arrays:'cs-arrays',algorithms:'cs-algorithms',memory:'cs-memory',structures:'cs-structures',python:'cs-python',sql:'cs-sql',ai:'cs-ai',web:'cs-web',flask:'cs-flask',capstone:'cs-capstone'};
    return {id: ids[unit.id], number: ({sql:29,ai:32,web:33,flask:36,capstone:39})[unit.id] || (course?.units.indexOf(unit) ?? 0) + 1, title: unit.title};
  }
  function navigateUnit(offset) {
    const units = window.CS50Lab?.curriculum?.units || [], next = units[units.indexOf(unit) + offset];
    if (next) location.hash = new URLSearchParams({view: 'course', unit: next.id, tab: 'theory'}).toString();
  }
  function maximize(next) {
    if (next === expanded) return;
    expanded = next;
    if (next) {
      minimized.delete(active); syncWindow(); restoreFocus = document.activeElement;
      let el = $('lwTool');
      while (el && el !== document.body) {
        for (const sibling of el.parentElement.children) if (sibling !== el && sibling instanceof HTMLElement) {
          inertNodes.push([sibling, sibling.inert]); sibling.inert = true;
        }
        el = el.parentElement;
      }
    } else {
      inertNodes.forEach(([el, was]) => el.inert = was); inertNodes = [];
    }
    $('lwTool').classList.toggle('lw-expanded', next); document.body.classList.toggle('lw-fullscreen', next);
    $('lwMaximize').setAttribute('aria-label', next ? 'Restore window size' : 'Maximize current tool');
    $('lwMaximize').setAttribute('aria-pressed', String(next));
    if (next) $('lwMaximize').focus(); else if (restoreFocus?.isConnected) restoreFocus.focus();
  }
  function clearMedia() {
    pauseVideo(); clearTimeout(scratchTimer); video?.remove(); scratch?.remove(); video = null; scratch = null;
    $('lwVideoStart').hidden = false; $('lwScratchStart').hidden = false;
    $('lwScratchStatus').textContent = 'External editor loads only when requested.';
  }
  async function authorize() {
    const request = ++authRevision; approved = false;
    try { const profile = await window.FC?.requireUser?.(); if (request !== authRevision) return; approved = !!profile; }
    catch (_) { if (request !== authRevision) return; approved = false; }
    if (!approved) clearMedia();
  }
  function mediaAllowed() {
    if (approved) return true;
    say('Sign in with your approved Tomato08 account before loading external tools.');
    accountButton?.click(); return false;
  }
  function loadVideo() {
    if (!unit || video || !mediaAllowed()) return;
    const url = media.videoURL(unit.id, location.origin); if (!url) return;
    video = document.createElement('iframe'); video.id = 'lwVideoFrame'; video.title = 'Official CS50 lecture: ' + unit.title;
    video.referrerPolicy = 'strict-origin-when-cross-origin';
    video.allow = 'encrypted-media; picture-in-picture; fullscreen'; video.allowFullscreen = true;
    video.src = url; $('lwVideoMount').append(video); $('lwVideoStart').hidden = true;
  }
  function loadScratch() {
    if (scratch || !mediaAllowed()) return;
    scratch = document.createElement('iframe'); scratch.id = 'lwScratchFrame'; scratch.title = 'Scratch Foundation standalone project editor';
    scratch.sandbox = 'allow-scripts allow-same-origin allow-downloads allow-modals';
    scratch.allow = 'fullscreen'; scratch.allowFullscreen = true; scratch.referrerPolicy = 'strict-origin-when-cross-origin';
    scratch.src = media.scratchEditor; $('lwScratchMount').append(scratch); $('lwScratchStart').hidden = true;
    $('lwScratchStatus').textContent = 'Opening editor. Save projects using its File menu.';
    // A cross-origin load event is not proof that an editor rendered successfully.
    scratchTimer = setTimeout(() => { if (scratch) $('lwScratchStatus').textContent = 'If the editor is blank or blocked, use Open standalone. Save .sb3 before leaving.'; }, 18000);
  }
  function downloadInstructions() {
    if (!unit) return;
    const text = ['# ' + unit.title, '', 'Source: ' + unit.source, '', ...unit.theory.flatMap(([heading, copy]) => ['## ' + heading, copy, '']), ...unit.tasks.flatMap(t => ['## ' + t.title, t.brief, ...t.requirements.map(r => '- ' + r), ''])].join('\n');
    const url = URL.createObjectURL(new Blob([text], {type: 'text/markdown;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = unit.id + '-lesson.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function placeNotes() {
    if (!notesButton) return;
    $('lwNotesSlot').append(notesButton);
    notesButton.onclick = () => { minimized.delete('notes'); select('notes'); root.scrollIntoView({block: 'start'}); };
  }
  function refresh() {
    queued = false;
    const course = window.CS50Lab?.curriculum, params = new URLSearchParams(location.hash.slice(1));
    if (!course?.units || !window.CS50Lab?.state) return;
    const eligible = (!params.get('view') || params.get('view') === 'course') && (params.has('unit') || params.has('task'));
    const next = course.units.find(u => u.id === params.get('unit')) || course.units[0];
    theory = eligible && !params.has('task') && (!params.get('tab') || params.get('tab') === 'theory');
    if (!eligible) {
      app.hidden = false; root.hidden = true; document.body.classList.remove('lw-theory', 'lw-support'); maximize(false); pauseVideo();
      if (accountButton && accountHome) accountHome.append(accountButton);
      if (notesButton && notesHome) { notesHome.insertBefore(notesButton, accountButton?.parentNode === notesHome ? accountButton : null); notesButton.onclick = notesClick; }
      if (notebook?.parentNode === $('lwNotesMount')) { document.body.append(notebook); window.T08Notebook?.close().catch(() => {}); }
      return;
    }
    root.hidden = false; app.hidden = theory;
    document.body.classList.toggle('lw-theory', theory); document.body.classList.toggle('lw-support', !theory);
    if (accountButton) (theory ? $('lwAccountSlot') : accountHome).append(accountButton);
    placeNotes();
    if (next !== unit) {
      unit = next; video?.remove(); video = null; $('lwVideoStart').hidden = false;
      $('lwTitle').textContent = unit.title; $('lwVideoTitle').textContent = unit.title;
      $('lwSection').textContent = 'Section ' + String(course.units.indexOf(unit)).padStart(2, '0') + ' · Foundation lesson';
      $('lwOfficialLesson').href = unit.source;
      $('lwVideoFallback').href = media.officialPlayer(unit.id) || unit.source;
      $('lwPrevious').disabled = course.units.indexOf(unit) === 0;
      $('lwNext').disabled = course.units.indexOf(unit) === course.units.length - 1;
      $('lwTheory').innerHTML = unit.theory.map(([title, text]) => '<article><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p></article>').join('');
      $('lwAssignments').innerHTML = unit.tasks.map(t => '<button type="button" data-task="' + esc(t.id) + '">' + esc(t.title) + '</button>').join('');
      root.querySelectorAll('[data-lw-open="scratch"]').forEach(el => el.hidden = unit.id !== 'scratch');
      window.T08Notebook?.setContext(contextNode());
    }
    $('lwProgress').textContent = CS50Lab.level(unit).text;
    $('lwStorage').textContent = $('saveStatus')?.textContent || '';
    if (app.firstElementChild !== lastRender) { lastRender = app.firstElementChild; authorize(); }
    if (!authAttached && window.FC?.client?.auth?.onAuthStateChange) {
      authAttached = true;
      FC.client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') { approved = false; authRevision++; clearMedia(); maximize(false); }
        else setTimeout(authorize, 0);
      });
    }
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(refresh); } }
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.lwTab) select(button.dataset.lwTab);
    if (button.dataset.lwOpen) { minimized.delete(button.dataset.lwOpen); select(button.dataset.lwOpen); }
    if (button.id === 'lwLoadVideo') loadVideo();
    if (button.id === 'lwLoadScratch') loadScratch();
    if (button.id === 'lwPrevious') navigateUnit(-1);
    if (button.id === 'lwNext') navigateUnit(1);
    if (button.id === 'lwDownloadInstructions') downloadInstructions();
    if (button.id === 'lwMaximize') maximize(!expanded);
    if (button.id === 'lwMinimize' || button.id === 'lwRestore') {
      if (minimized.has(active)) minimized.delete(active); else { minimized.add(active); if (active === 'lecture') pauseVideo(); }
      syncWindow();
    }
    if (button.id === 'lwMenu') { const open = root.classList.toggle('lw-nav-open'); button.setAttribute('aria-expanded', String(open)); }
  });
  root.querySelector('.lw-tablist').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const i = tabs.indexOf(event.target.dataset.lwTab); if (i < 0) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    select(tabs[next], true);
  });
  document.addEventListener('keydown', event => {
    if (!expanded) return;
    if (event.key === 'Escape') { event.preventDefault(); maximize(false); }
    if (event.key === 'Tab') {
      const controls = [...$('lwTool').querySelectorAll('button:not([disabled]),a[href],input,textarea,select,iframe,[tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[hidden]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  window.addEventListener('beforeunload', event => { if (scratch) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseVideo(); });
  window.addEventListener('hashchange', () => { maximize(false); schedule(); });
  document.addEventListener('t08-evidence-updated', schedule);
  if (notebook) notebook.addEventListener('click', event => { if (event.target.closest('#nbClose') && notebook.parentNode === $('lwNotesMount')) { event.preventDefault(); event.stopImmediatePropagation(); select('lecture'); } }, true);
  new MutationObserver(schedule).observe(app, {childList: true});
  if ($('saveStatus')) new MutationObserver(() => { $('lwStorage').textContent = $('saveStatus').textContent; }).observe($('saveStatus'), {childList: true, characterData: true, subtree: true});
  schedule();
})();
