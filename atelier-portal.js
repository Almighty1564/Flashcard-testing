/* Presentation adapter. FC remains the original shared data/auth layer. */
(function () {
  'use strict';
  const page = document.body.dataset.page;
  const isModules = page === 'modules';
  const isPortal = page === 'portal';
  const byId = id => document.getElementById(id);
  const gate = byId(isModules ? 'testerLock' : 'gate');
  const app = byId(isModules ? 'testerApp' : 'modePicker');
  const user = byId(isModules ? 'testerUsernameInput' : 'userInput');
  const pass = byId(isModules ? 'testerPasswordInput' : 'passInput');
  const errorEl = byId(isModules ? 'testerLockError' : 'gateError');
  const submit = byId(isModules ? 'testerUnlockBtn' : 'signInBtn');
  const signOutBtn = byId('signOutBtn');
  let modules = [], profile = null, heartbeat = null, busy = false, moduleRequest = 0;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function currentReturnPath() {
    return location.pathname + location.search + location.hash;
  }
  function loginUrl(returnPath) {
    const url = new URL('./index.html', location.href);
    if (returnPath) url.searchParams.set('return', returnPath);
    return url.pathname + url.search;
  }
  function safeReturnDestination() {
    const raw = new URLSearchParams(location.search).get('return');
    if (!raw) return null;
    try {
      const url = new URL(raw, location.origin);
      if (url.origin !== location.origin) return null;
      const routes = ['tester.html','mod1.html','study.html','developer.html','podcast.html','mod1-calc.html','antenna-pattern.html','security.html','dev.html','weather.html','cs50/index.html','cs50/path.html','cs50/practice.html','cs50/projects.html'];
      const allowed = new Set(routes.map(route => new URL('./' + route, location.href).pathname));
      if (!allowed.has(url.pathname)) return null;
      return url.pathname + url.search + url.hash;
    } catch (_) { return null; }
  }
  function destinationFor(profile) {
    const requested = safeReturnDestination();
    if (requested && /\/developer\.html(?:[?#]|$)/.test(requested) && profile?.role !== 'developer') return './tester.html';
    return requested;
  }

  function updateAccount(next) {
    profile = next;
    document.querySelectorAll('[data-developer]').forEach(el => { el.hidden = !next || next.role !== 'developer'; });
    document.querySelectorAll('[data-avatar]').forEach(el => { el.textContent = next?.username ? next.username.slice(0, 2).toUpperCase() : '08'; });
    const who = byId('whoami');
    if (who) who.textContent = next ? (next.username || 'Signed in') : '';
    if (byId('sidebarAccount')) byId('sidebarAccount').textContent = next?.username ? 'Signed in as ' + next.username : 'Not signed in';
    if (byId('backToModes')) byId('backToModes').hidden = !next || next.role !== 'developer';
    signOutBtn.hidden = !next;
    document.dispatchEvent(new CustomEvent('workspace:account', {detail:{signedIn:Boolean(next)}}));
  }

  function showGate(message, focus) {
    moduleRequest++;
    updateAccount(null); stopHeartbeat(); app.hidden = true; gate.hidden = false;
    errorEl.textContent = message || '';
    byId('sessionStatus').hidden = true;
    if (isModules) { modules = []; byId('moduleSearch').value = ''; byId('modList').replaceChildren(); if (byId('mod2PodcastLink')) byId('mod2PodcastLink').hidden = true; }
    if (focus) user.focus();
  }

  async function enter(next) {
    if (!next) {
      if (!isPortal) { location.replace(loginUrl(currentReturnPath())); return; }
      showGate('Please sign in to continue.');
      return;
    }
    const destination = isPortal ? destinationFor(next) : null;
    if (destination) { location.replace(destination); return; }
    updateAccount(next); gate.hidden = true; app.hidden = false; errorEl.textContent = '';
    document.dispatchEvent(new CustomEvent('workspace:ready'));
    startHeartbeat();
    if (isModules) await loadModules();
  }

  function renderModules() {
    const query = byId('moduleSearch').value.trim().toLocaleLowerCase();
    const filtered = modules.filter(m => (String(m.name || '') + ' ' + String(m.description || '')).toLocaleLowerCase().includes(query));
    byId('moduleCount').textContent = String(modules.length);
    byId('moduleStatus').textContent = filtered.length + (filtered.length === 1 ? ' module' : ' modules') + (query ? ' matching your search.' : ' available.');
    if (!filtered.length) {
      const title = query ? 'No matching modules' : 'No published modules';
      const copy = query ? 'Try a different name or clear your search.' : 'Published modules will appear here when they are ready.';
      byId('modList').innerHTML = '<div class="p-empty"><h3>' + title + '</h3><p>' + copy + '</p>' + (query ? '<button type="button" class="p-button" id="clearSearch">Clear search</button>' : '') + '</div>';
      byId('clearSearch')?.addEventListener('click', () => { byId('moduleSearch').value = ''; renderModules(); byId('moduleSearch').focus(); });
    } else {
      byId('modList').innerHTML = filtered.map((m, i) => '<a class="p-module" href="./mod1.html?module=' + encodeURIComponent(m.slug) + '"><div class="p-module-top"><span class="p-module-icon" aria-hidden="true">▤</span><span>MODULE / ' + String(i + 1).padStart(2, '0') + '</span></div><h3>' + escapeHTML(m.name) + '</h3><p>' + escapeHTML(m.description || 'Flashcards, practice tests, and your saved progress.') + '</p><div class="p-module-link">Open module <span aria-hidden="true">↗</span></div></a>').join('');
    }
  }

  async function loadModules() {
    const request = ++moduleRequest, list = byId('modList');
    list.setAttribute('aria-busy', 'true'); byId('firstModuleLink').hidden = true;
    list.innerHTML = '<div class="p-empty"><h3>Loading modules…</h3><p>Loading your published modules.</p></div>';
    try {
      const result = await FC.listModules();
      if (request !== moduleRequest || !profile) return;
      modules = result.filter(m => m.is_published);
      if (byId('mod2PodcastLink')) byId('mod2PodcastLink').hidden = !modules.some(m => m.slug === 'mod2');
      renderModules();
      const requested = new URLSearchParams(location.search).get('module');
      if (requested) {
        const key = text => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const match = modules.find(m => m.slug === requested || key(m.name) === key(requested));
        if (match) { location.replace('./mod1.html?module=' + encodeURIComponent(match.slug)); return; }
        const status = byId('requestedModuleStatus');
        if (status) { status.hidden = false; status.textContent = 'That module is not currently published. Choose an available module below.'; }
      }
      if (modules.length) { const first = byId('firstModuleLink'); first.href = './mod1.html?module=' + encodeURIComponent(modules[0].slug); first.hidden = false; }
    } catch (error) {
      if (request !== moduleRequest || !profile) return;
      byId('moduleCount').textContent = '—';
      list.innerHTML = '<div class="p-empty"><h3>Your modules could not be loaded</h3><p>' + escapeHTML(error.message || 'Check your connection and try again.') + '</p><button class="p-button" id="retryModules" type="button">Try again</button></div>';
      byId('moduleStatus').textContent = 'Modules could not be loaded.';
      byId('retryModules').addEventListener('click', loadModules);
    } finally { if (request === moduleRequest) list.setAttribute('aria-busy', 'false'); }
  }

  async function signIn(event) {
    event.preventDefault();
    if (busy || submit.disabled) return;
    if (!window.FC) { showGate('The sign-in service could not load. Check your internet connection and reload this page.'); return; }
    busy = true; submit.disabled = true; errorEl.textContent = ''; const label = submit.innerHTML; submit.textContent = 'Signing in…';
    try { await FC.signIn(user.value, pass.value); const next = await FC.getProfile(); if (!next) throw new Error('Your session could not be opened. Please try again.'); pass.value = ''; await enter(next); }
    catch (error) { try { await FC.signOut(); } catch (_) {} showGate(error.message || 'Sign in failed.', false); pass.focus(); pass.select(); }
    finally { busy = false; submit.disabled = false; submit.innerHTML = label; }
  }
  byId('signInForm').addEventListener('submit', signIn);
  signOutBtn.addEventListener('click', async () => {
    signOutBtn.disabled = true;
    try {
      await FC.signOut(); user.value = ''; pass.value = '';
      if (!isPortal) location.replace('./index.html'); else showGate('', true);
    } finally { signOutBtn.disabled = false; }
  });
  if (isModules) byId('moduleSearch').addEventListener('input', renderModules);

  // Preserve the original learner-presence feature; suspend it in hidden tabs.
  async function beat() {
    if (!profile || document.hidden) return;
    try { const {data: {user: current}} = await FC.client.auth.getUser(); if (current && profile && current.id === profile.id) await FC.client.from('presence').upsert({user_id:current.id,last_seen_at:new Date().toISOString()},{onConflict:'user_id'}); } catch (_) { /* Presence is best effort. */ }
  }
  function startHeartbeat() { if (heartbeat || !isModules || !profile || document.hidden) return; beat(); heartbeat = setInterval(beat, 30000); }
  function stopHeartbeat() { if (heartbeat) clearInterval(heartbeat); heartbeat = null; }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopHeartbeat(); else startHeartbeat(); });
  window.addEventListener('pagehide', stopHeartbeat);
  window.addEventListener('pageshow', async e => {
    if (!e.persisted || !window.FC) return;
    app.hidden = true;
    try { const next = await FC.requireUser(); if (next) await enter(next); else if (!isPortal) location.replace(loginUrl(currentReturnPath())); else showGate('Your session ended. Please sign in again.'); }
    catch (_) { if (!isPortal) location.replace(loginUrl(currentReturnPath())); else showGate('Please sign in again.'); }
  });
  (async function boot() {
    if (!window.FC) { showGate('The sign-in service could not load. Check your internet connection and reload this page.'); return; }
    submit.disabled = true;
    try {
      const next = await FC.requireUser();
      if (next) await enter(next);
      else if (!isPortal) location.replace(loginUrl(currentReturnPath()));
      else showGate('');
    } catch (error) {
      if (!isPortal) location.replace(loginUrl(currentReturnPath()));
      else showGate(error.message || 'Your session could not be checked. Please sign in.');
    } finally { submit.disabled = false; byId('sessionStatus').hidden = true; }
  })();
})();
