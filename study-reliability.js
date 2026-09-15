/* Reliability layer for the study page. Loaded after the original study engine. */
(function () {
  'use strict';
  if (!window.FC || document.body?.dataset.page !== 'study') return;

  const CARD_KEY = 'tomato08.progress.outbox.';
  const SESSION_KEY = 'tomato08.session.outbox.';
  let userId = null;
  let draining = false;
  let retryTimer = null;

  function clone(value) { return JSON.parse(JSON.stringify(value ?? null)); }
  function read(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value && typeof value === 'object' ? value : fallback; }
    catch (_) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }
  function statusElement() {
    let el = document.getElementById('progressSaveStatus');
    if (el) return el;
    el = document.createElement('span');
    el.id = 'progressSaveStatus';
    el.className = 'small muted';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.display = 'inline-block';
    el.style.marginTop = '7px';
    const sub = document.getElementById('pageSub');
    (sub?.parentElement || document.querySelector('.topbar') || document.body).appendChild(el);
    return el;
  }
  function setStatus(text, bad) {
    const el = statusElement();
    el.textContent = text;
    el.style.color = bad ? 'var(--bad)' : '';
  }
  function pendingCount() {
    if (!userId) return 0;
    return Object.keys(read(CARD_KEY + userId, {})).length + Object.keys(read(SESSION_KEY + userId, {})).length;
  }

  async function identifyUser() {
    const session = await FC.getSession();
    userId = session?.user?.id || null;
    return userId;
  }

  function queueCardNow(questionId, p, mastery) {
    if (!userId) return false;
    const key = CARD_KEY + userId;
    const outbox = read(key, {});
    outbox[questionId] = {
      questionId,
      progress: clone(p) || {},
      mastery: clone(mastery) || {},
      queuedAt: new Date().toISOString()
    };
    const stored = write(key, outbox);
    if (stored) setStatus('Saving progress…');
    else setStatus('Progress is not saved on this device. Keep this page open and retry.', true);
    return stored;
  }

  function queueSessionNow(moduleId, summary) {
    if (!userId) return false;
    const key = SESSION_KEY + userId;
    const outbox = read(key, {});
    const eventId = String(summary?.id || ('session_' + Date.now()));
    outbox[eventId] = { eventId, moduleId, summary: clone(summary) || {}, queuedAt: new Date().toISOString() };
    const stored = write(key, outbox);
    if (stored) setStatus('Saving progress…');
    else setStatus('Session history is not saved on this device. Keep this page open and retry.', true);
    return stored;
  }

  async function saveCardItem(item) {
    const p = item.progress || {};
    const m = item.mastery || {};
    const result = await FC.client.rpc('save_card_progress_safe', {
      p_question_id: item.questionId,
      p_last_result: m.lastResult || null,
      p_due_at: p.dueAt ? new Date(p.dueAt).toISOString() : null,
      p_interval_days: Number(p.intervalDays) || 0,
      p_ease: Number(p.ease) || 2.5,
      p_reps: Number(p.reps) || 0,
      p_lapses: Number(p.lapses) || 0,
      p_total_reviews: Number(p.totalReviews) || 0,
      p_last_reviewed_at: m.lastReviewedAt || item.queuedAt
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function saveSessionItem(item) {
    const s = item.summary || {};
    const result = await FC.client.rpc('save_test_session_safe', {
      p_event_id: item.eventId,
      p_module_id: item.moduleId || null,
      p_mode: s.mode || 'unknown',
      p_selected_group_ids: s.scopeGroups || [],
      p_result_counts: s.counts || {},
      p_total_questions: Number(s.total) || 0,
      p_started_at: s.startedAt || null,
      p_completed_at: s.completedAt || new Date().toISOString()
    });
    if (result.error) throw result.error;
  }

  async function drain() {
    if (draining || !navigator.onLine) return;
    if (!userId && !(await identifyUser())) return;
    draining = true;
    try {
      let cardBox = read(CARD_KEY + userId, {});
      for (const id of Object.keys(cardBox)) {
        const item = cardBox[id];
        try {
          await saveCardItem(item);
          cardBox = read(CARD_KEY + userId, {});
          if (cardBox[id]?.queuedAt === item.queuedAt) {
            delete cardBox[id];
            write(CARD_KEY + userId, cardBox);
          }
        } catch (error) {
          setStatus('Progress pending · reconnect or use Refresh From Cloud to retry.', true);
          return;
        }
      }
      let sessionBox = read(SESSION_KEY + userId, {});
      for (const id of Object.keys(sessionBox)) {
        const item = sessionBox[id];
        try {
          await saveSessionItem(item);
          sessionBox = read(SESSION_KEY + userId, {});
          if (sessionBox[id]?.queuedAt === item.queuedAt) {
            delete sessionBox[id];
            write(SESSION_KEY + userId, sessionBox);
          }
        } catch (error) {
          setStatus('Session history pending · it will retry automatically.', true);
          return;
        }
      }
      setStatus(pendingCount() ? 'Saving progress…' : 'Progress saved to cloud.');
    } finally { draining = false; }
  }

  FC.saveCardProgress = function (questionId, p, mastery) {
    if (userId) {
      queueCardNow(questionId, p, mastery);
      drain();
      return Promise.resolve({ queued: true });
    }
    return identifyUser().then(id => {
      if (!id) { setStatus('Sign in again to save progress.', true); return { queued: false }; }
      queueCardNow(questionId, p, mastery); drain(); return { queued: true };
    }).catch(() => ({ queued: false }));
  };

  FC.saveSession = function (moduleId, summary) {
    if (userId) {
      queueSessionNow(moduleId, summary); drain(); return Promise.resolve({ queued: true });
    }
    return identifyUser().then(id => {
      if (!id) { setStatus('Sign in again to save session history.', true); return { queued: false }; }
      queueSessionNow(moduleId, summary); drain(); return { queued: true };
    }).catch(() => ({ queued: false }));
  };

  // ----- Strict type-in grading -------------------------------------------------
  function normUnit(value) {
    const u = String(value || '').trim().toLowerCase().replace(/μ/g, 'µ');
    const aliases = {
      hertz:'hz', hz:'hz', kilohertz:'khz', khz:'khz', megahertz:'mhz', mhz:'mhz', gigahertz:'ghz', ghz:'ghz',
      second:'s', seconds:'s', sec:'s', s:'s', millisecond:'ms', milliseconds:'ms', msec:'ms', ms:'ms',
      volt:'v', volts:'v', v:'v', amp:'a', amps:'a', ampere:'a', amperes:'a', a:'a',
      watt:'w', watts:'w', w:'w', ohm:'ohm', ohms:'ohm', 'ω':'ohm', 'Ω':'ohm', db:'db', dbm:'dbm', dbw:'dbw',
      percent:'%', '%':'%'
    };
    return aliases[u] || u;
  }
  function parseMeasured(value, fallbackUnit) {
    const text = String(value ?? '').trim().replace(/[–—]/g, '-');
    if (!text) return null;
    const n = '[-+]?\\d+(?:,\\d{3})*(?:\\.\\d+)?';
    const range = text.match(new RegExp('^\\s*(' + n + ')\\s*(?:-|\\bto\\b)\\s*(' + n + ')\\s*([^\\d\\s].*?)?\\s*$', 'i'));
    if (range) return { kind:'range', values:[Number(range[1].replace(/,/g,'')),Number(range[2].replace(/,/g,''))], unit:normUnit(range[3] || fallbackUnit) };
    const scalar = text.match(new RegExp('^\\s*(' + n + ')\\s*([^\\d\\s].*?)?\\s*$', 'i'));
    if (scalar) return { kind:'scalar', values:[Number(scalar[1].replace(/,/g,''))], unit:normUnit(scalar[2] || fallbackUnit) };
    return null;
  }
  function closeEnough(a, b, tolerance) { return Math.abs(a - b) <= tolerance; }
  function measurementMatches(given, expected, tolerance) {
    if (!given || !expected || given.kind !== expected.kind || given.values.length !== expected.values.length) return false;
    if ((given.unit || '') !== (expected.unit || '')) return false;
    return expected.values.every((value, i) => closeEnough(given.values[i], value, tolerance));
  }
  function strictGradeEntry(input, entry) {
    const raw = String(input ?? '').trim();
    if (!raw) return false;
    const defaultUnit = normUnit(entry?.unit || '');
    const tolerance = Number.isFinite(Number(entry?.tolerance)) ? Math.abs(Number(entry.tolerance)) : 0;
    const candidates = [entry?.value, ...(Array.isArray(entry?.accept) ? entry.accept : [])]
      .filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    const givenMeasured = parseMeasured(raw, defaultUnit);
    for (const candidate of candidates) {
      const expectedMeasured = parseMeasured(candidate, defaultUnit);
      if (givenMeasured && expectedMeasured && measurementMatches(givenMeasured, expectedMeasured, tolerance)) return true;
      if (String(candidate).trim().toLowerCase().replace(/\s+/g,' ') === raw.toLowerCase().replace(/\s+/g,' ')) return true;
    }
    return false;
  }
  window.gradeEntry = strictGradeEntry;

  // ----- Honest progress labels -------------------------------------------------
  window.renderSidebar = function () {
    if (!bank) {
      document.getElementById('sideModule').textContent = 'Study Program';
      document.getElementById('groupList').innerHTML = '';
      updateRing(); return;
    }
    document.getElementById('sideModule').textContent = bank.module?.name || 'Question Bank';
    document.getElementById('groupCount').textContent = '(' + groups().length + ')';
    updateRing();
    document.getElementById('groupList').innerHTML = groups().map((g,i) => {
      const all = cardsForGroup(g.id);
      const due = all.filter(isDue).length;
      const reviewed = all.filter(c => (state.progress[c.id]?.totalReviews || state.progress[c.id]?.reps || 0) > 0).length;
      const strong = all.filter(c => ['correct','confident'].includes(state.mastery[c.id]?.lastResult)).length;
      return `<button class="group-btn ${selectedGroupId===g.id?'active':''}" data-group="${esc(g.id)}"><div class="group-name">${i+1}. ${esc(g.name)}</div><div class="group-meta">${due} due · ${reviewed}/${all.length} reviewed · ${strong} strong</div></button>`;
    }).join('');
    document.querySelectorAll('[data-group]').forEach(b => b.onclick = () => {
      selectedGroupId = b.dataset.group; renderSidebar(); openDueReviews();
    });
  };

  const originalShowMenu = window.showMenu;
  if (typeof originalShowMenu === 'function') {
    window.showMenu = function (title, text) {
      const pending = pendingCount();
      if (pending && /saved/i.test(String(text || ''))) text = String(text).replace(/answered and saved/gi, 'answered and queued safely on this device').replace(/Progress is saved\.?/gi, 'Progress is pending cloud sync.');
      return originalShowMenu(title, text);
    };
  }

  // ----- Keyboard-operable matching --------------------------------------------
  const originalMatching = window.renderMatching;
  if (typeof originalMatching === 'function') {
    window.renderMatching = function (el) {
      originalMatching(el);
      const activate = node => node.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); node.click();
      });
      el.querySelectorAll('[data-source]').forEach(node => {
        node.tabIndex = 0; node.setAttribute('role','button'); node.setAttribute('aria-pressed','false'); activate(node);
        node.addEventListener('click', () => setTimeout(() => node.setAttribute('aria-pressed', String(node.classList.contains('selected'))), 0));
      });
      el.querySelectorAll('[data-drop]').forEach(node => {
        node.tabIndex = 0; node.setAttribute('role','button'); node.setAttribute('aria-label','Matching destination. Activate after selecting a right-side item.'); activate(node);
      });
      document.getElementById('submitMatchBtn')?.addEventListener('click', () => setTimeout(() => {
        el.querySelectorAll('[data-drop]').forEach(node => {
          if (node.classList.contains('correct-reveal')) node.setAttribute('aria-label','Correct match.');
          else if (node.classList.contains('wrong-reveal')) node.setAttribute('aria-label','Incorrect match.');
        });
      }, 0));
    };
  }

  window.addEventListener('online', drain);
  window.addEventListener('storage', event => { if (userId && (event.key === CARD_KEY + userId || event.key === SESSION_KEY + userId)) drain(); });
  retryTimer = setInterval(drain, 10000);
  window.addEventListener('pagehide', () => clearInterval(retryTimer), {once:true});
  identifyUser().then(() => { setStatus(pendingCount() ? 'Progress pending · syncing…' : 'Progress saved to cloud.'); drain(); });

  window.FC_STUDY_RELIABILITY = Object.freeze({ parseMeasured, gradeEntry: strictGradeEntry });
})();
