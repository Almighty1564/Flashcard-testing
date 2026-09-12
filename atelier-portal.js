/* Presentation adapter. FC remains the original shared data/auth layer. */
(function () {
  'use strict';
  const isModules = document.body.dataset.page === 'modules';
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

  const nav = byId('workspaceNav'), menu = byId('menuButton');
  nav.classList.add('p-collapsible'); menu.classList.add('is-ready');
  function closeNav() { nav.classList.remove('is-open'); menu.setAttribute('aria-expanded', 'false'); }
  menu.addEventListener('click', () => { const open = nav.classList.toggle('is-open'); menu.setAttribute('aria-expanded', String(open)); if (open) nav.querySelector('nav a').focus(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { closeNav(); menu.focus(); } });

  function updateAccount(next) {
    profile = next;
    document.querySelectorAll('[data-developer]').forEach(el => { el.hidden = !next || next.role !== 'developer'; });
    document.querySelectorAll('[data-avatar]').forEach(el => { el.textContent = next?.username ? next.username.slice(0, 2).toUpperCase() : '08'; });
    const who = byId('whoami');
    if (who) who.textContent = next ? (next.username || 'Signed in') : '';
    if (byId('sidebarAccount')) byId('sidebarAccount').textContent = next?.username ? 'Signed in as ' + next.username : 'Your learning workspace';
    if (byId('backToModes')) byId('backToModes').hidden = !next || next.role !== 'developer';
    signOutBtn.hidden = !next;
  }

  function showGate(message, focus) {
    moduleRequest++;
    updateAccount(null); stopHeartbeat(); app.hidden = true; gate.hidden = false;
    errorEl.textContent = message || '';
    byId('sessionStatus').hidden = true;
    if (isModules) { modules = []; byId('moduleSearch').value = ''; byId('modList').replaceChildren(); }
    if (focus) user.focus();
  }

  async function enter(next) {
    if (!next) { showGate('Please sign in to continue.'); return; }
    if (!isModules && next.role !== 'developer') { showGate('Opening your modules…'); location.replace('./tester.html'); return; }
    updateAccount(next); gate.hidden = true; app.hidden = false; errorEl.textContent = '';
    if (isModules) { startHeartbeat(); await loadModules(); }
  }

  function renderModules() {
    const query = byId('moduleSearch').value.trim().toLocaleLowerCase();
    const filtered = modules.filter(m => (String(m.name || '') + ' ' + String(m.description || '')).toLocaleLowerCase().includes(query));
    byId('moduleCount').textContent = String(modules.length);
    byId('moduleStatus').textContent = filtered.length + (filtered.length === 1 ? ' module' : ' modules') + (query ? ' matching your search.' : ' available.');
    if (!filtered.length) {
      const title = query ? 'No matching modules' : 'Your collection starts here';
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
    list.innerHTML = '<div class="p-empty"><h3>Opening your collection…</h3><p>Loading your published modules.</p></div>';
    try {
      const result = await FC.listModules();
      if (request !== moduleRequest || !profile) return;
      modules = result.filter(m => m.is_published);
      renderModules();
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
  signOutBtn.addEventListener('click', async () => { signOutBtn.disabled = true; try { await FC.signOut(); user.value = ''; pass.value = ''; showGate('', true); } finally { signOutBtn.disabled = false; } });
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
  window.addEventListener('pageshow', async e => { if (!e.persisted || !window.FC) return; try { const next = await FC.requireUser(); if (next) await enter(next); else showGate('Your session ended. Please sign in again.'); } catch (_) { showGate('Please sign in again.'); } });
  (async function boot() {
    if (!window.FC) { showGate('The sign-in service could not load. Check your internet connection and reload this page.'); return; }
    submit.disabled = true;
    try { const next = await FC.requireUser(); if (next) await enter(next); else showGate(''); }
    catch (error) { showGate(error.message || 'Your session could not be checked. Please sign in.'); }
    finally { submit.disabled = false; byId('sessionStatus').hidden = true; }
  })();
})();
