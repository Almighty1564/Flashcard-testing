/* Reliability layer for Question Studio. Loaded after the original builder. */
(function () {
  'use strict';
  if (!window.FC || document.body?.dataset.page !== 'developer') return;

  const realSignOut = FC.signOut.bind(FC);
  FC.signOut = async function () {
    const lock = document.getElementById('developerLock');
    const app = document.getElementById('developerApp');
    if (lock && !lock.hidden && app?.hidden) {
      try {
        const p = await FC.getProfile();
        if (p && p.role !== 'developer') return; // A wrong route must not terminate a valid learner session.
      } catch (_) { /* Fall through to a real sign-out. */ }
    }
    return realSignOut();
  };

  function loginUrl() {
    const here = location.pathname + location.search + location.hash;
    return './index.html?return=' + encodeURIComponent(here);
  }

  // Restore native keyboard activation while neutralizing the old target-level blocker.
  document.addEventListener('keydown', event => {
    const button = event.target?.closest?.('#saveQuestionBtn,#newQuestionBtn');
    if (!button || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!button.disabled) button.click();
  }, true);

  const originalLoad = window.loadModuleIntoBuilder;
  const originalQueueSync = window.queueSync;
  let operations = Promise.resolve(), dirty = false, editVersion = 0;
  let knownModule = null, knownGroups = new Map(), knownQuestions = new Map();
  const controls = window.T08AuthoringState = {busy:false,pendingGroup:null,message:''};
  function renderControls() { if (typeof renderGroupManager === 'function') renderGroupManager(); }
  function enqueue(action) {
    const next = operations.then(async () => {
      controls.busy = true;
      const app = document.getElementById('developerApp');
      if (app) app.inert = true;
      renderControls();
      try { return await action(); }
      finally { controls.busy = false; controls.pendingGroup = null; if (app) app.inert = false; renderControls(); }
    });
    operations = next.catch(() => {});
    return next;
  }
  function cancelTimer() { clearTimeout(syncTimer); syncTimer = null; }
  window.queueSync = function () { dirty = true; editVersion++; originalQueueSync(); };
  function rememberFlags() {
    knownModule = project.moduleId;
    knownGroups = new Map(project.groups.map(g => [g.id, g.isEnabled !== false]));
    knownQuestions = new Map(project.questions.map(q => [q.id, q.isActive !== false]));
  }
  window.reconcileAuthoringFlags = function () {
    if (knownModule !== project.moduleId) return;
    project.groups.forEach(g => { g.isEnabled = knownGroups.has(g.id) ? knownGroups.get(g.id) : true; });
    project.questions.forEach(q => { q.isActive = knownQuestions.has(q.id) ? knownQuestions.get(q.id) : q.isActive !== false; });
  };
  function failed(error, sectionChange = false) {
    const message = String(error?.message || error || 'Save failed');
    cloudReady = false;
    controls.message = sectionChange ? 'Section change not confirmed. Refresh from Cloud before trying again. ' + message : '';
    setSyncStatus(/stale_module_revision/i.test(message)
      ? 'Conflict detected. Refresh From Cloud before saving again.'
      : 'Not confirmed: ' + message + ' · Refresh From Cloud before saving again.', '#f85149');
  }
  async function revisionForSlug(slug) {
    const r = await FC.client.from('modules').select('id,revision').eq('slug', slug).single();
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }
  async function revisionForId(id) {
    const r = await FC.client.from('modules').select('id,revision').eq('id', id).single();
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }
  function stableLoad(slug, options = {}) {
    return enqueue(async () => {
      cancelTimer(); controls.message = '';
      try {
        if (options.discard) dirty = false;
        else if (dirty) await flushDirty();
        for (let attempt = 0; attempt < 3; attempt++) {
          cloudReady = false;
          const before = await revisionForSlug(slug);
          await originalLoad(slug);
          cloudReady = false;
          const after = await revisionForId(before.id);
          if (project.moduleId === before.id && Number(before.revision) === Number(after.revision)) {
            project.moduleRevision = Number(after.revision);
            if (!Number.isInteger(project.moduleRevision)) throw new Error('Invalid module revision.');
            dirty = false; cloudReady = true; rememberFlags();
            setSyncStatus('Loaded ' + project.questions.length + ' questions · revision ' + project.moduleRevision, '#8b949e');
            return;
          }
        }
        throw new Error('This module kept changing while loading. Refresh From Cloud to retry.');
      } catch (error) { failed(error); throw error; }
    });
  }
  window.loadModuleIntoBuilder = stableLoad;

  function questionRow(q, moduleId, index) {
    return {
      id: q.id,
      module_id: moduleId,
      group_id: q.groupId || null,
      question_type: q.type === 'image-entry' ? 'numeric' : q.type,
      question_text: q.questionText || '',
      question_image_path: q.questionImagePath || null,
      answer_data: answerDataFor(q),
      sort_order: index + 1,
      is_active: q.isActive !== false
    };
  }

  async function saveSnapshot() {
    if (!dirty) return;
    if (!cloudReady || !project.moduleId || !Number.isInteger(project.moduleRevision)) throw new Error('Reload required before saving.');
    syncing = true;
    const target = project, expectedRevision = project.moduleRevision;
    try {
      await uploadPendingImages();
      if (project !== target) throw new Error('The module changed while saving.');
      window.reconcileAuthoringFlags();
      const savedVersion = editVersion;
      const snapshot = {
        moduleId: project.moduleId,
        moduleName: project.moduleName || project.moduleSlug,
        isPublished: !!project.isPublished,
        groups: project.groups.map((g,i) => ({id:g.id,module_id:project.moduleId,name:g.name || 'Untitled group',sort_order:i+1,is_enabled:g.isEnabled!==false})),
        questions: project.questions.map((q,i) => questionRow(q, project.moduleId, i))
      };
      const result = await FC.client.rpc('sync_module_snapshot', {
        p_module_id: snapshot.moduleId,
        p_expected_revision: expectedRevision,
        p_module_name: snapshot.moduleName,
        p_is_published: snapshot.isPublished,
        p_groups: snapshot.groups,
        p_questions: snapshot.questions
      });
      if (result.error) throw result.error;
      if (project !== target || project.moduleId !== snapshot.moduleId) throw new Error('The module changed before the save finished.');
      if (!Number.isInteger(Number(result.data)) || Number(result.data) <= expectedRevision) throw new Error('Invalid saved revision. Refresh From Cloud.');
      project.moduleRevision = Number(result.data);
      dirty = editVersion !== savedVersion; rememberFlags();
      setSyncStatus('Saved to cloud · revision ' + project.moduleRevision + ' · ' + new Date().toLocaleTimeString(), '#3fb950');
    } finally { syncing = false; syncQueued = false; }
  }
  async function flushDirty() {
    cancelTimer();
    for (let attempt = 0; dirty && attempt < 3; attempt++) await saveSnapshot();
    if (dirty) throw new Error('Edits are still pending. Wait for saving to finish.');
  }
  window.runSync = function () {
    return enqueue(async () => {
      try { await flushDirty(); return true; }
      catch (error) { failed(error); return false; }
    });
  };
  window.setQuestionGroupEnabled = function (groupId, enabled) {
    const target = project, moduleId = project.moduleId;
    return enqueue(async () => {
      controls.pendingGroup = groupId; controls.message = 'Saving section availability…'; renderControls();
      try {
        if (typeof enabled !== 'boolean') throw new Error('A section must be enabled or disabled.');
        if (project !== target || project.moduleId !== moduleId) throw new Error('The selected module changed.');
        if (!cloudReady || !Number.isInteger(project.moduleRevision)) throw new Error('Refresh From Cloud before changing a section.');
        await flushDirty();
        const group = project.groups.find(g => g.id === groupId);
        if (!group) throw new Error('This section no longer exists in the module.');
        if ((group.isEnabled !== false) === enabled) { controls.message = 'Section is already ' + (enabled ? 'enabled.' : 'disabled.'); return true; }
        const revision = project.moduleRevision;
        const result = await FC.client.rpc('set_question_group_enabled', {
          p_module_id: moduleId, p_group_id: groupId, p_enabled: enabled, p_expected_revision: revision
        });
        if (result.error) throw result.error;
        if (project !== target || project.moduleId !== moduleId) throw new Error('The selected module changed before the response arrived.');
        if (!Number.isInteger(Number(result.data)) || Number(result.data) < revision) throw new Error('Invalid saved revision.');
        project.moduleRevision = Number(result.data); group.isEnabled = enabled;
        knownGroups.set(groupId, enabled);
        controls.message = 'Section ' + (enabled ? 'enabled' : 'disabled') + '. Questions and history are kept. Refresh already-open study tabs to use the change.';
        setSyncStatus('Section saved · revision ' + project.moduleRevision, '#3fb950');
        return true;
      } catch (error) { failed(error, true); return false; }
    });
  };

  // If the original boot finished before this deferred layer attached, reload once to establish a safe revision baseline.
  let attempts = 0;
  const init = setInterval(async () => {
    attempts++;
    if (Number.isInteger(project?.moduleRevision)) { clearInterval(init); return; }
    if (cloudReady && project?.moduleSlug) {
      clearInterval(init);
      try { await stableLoad(project.moduleSlug); }
      catch (error) { cloudReady = false; setSyncStatus('Reload failed: ' + (error.message || error), '#f85149'); }
    } else if (attempts > 40) clearInterval(init);
  }, 100);

  // Single sign-in entry: signed-out studio links return through the branded portal.
  FC.requireUser().then(profile => {
    if (!profile) location.replace(loginUrl());
  }).catch(() => location.replace(loginUrl()));

  const errorNode = document.getElementById('developerError');
  if (errorNode) new MutationObserver(() => {
    if (!/does not have developer access/i.test(errorNode.textContent || '')) return;
    if (document.getElementById('developerBackToLearning')) return;
    const link = document.createElement('a');
    link.id = 'developerBackToLearning'; link.href = './tester.html'; link.className = 'btn';
    link.style.display = 'inline-block'; link.style.marginTop = '12px'; link.textContent = 'Back to Learning';
    errorNode.insertAdjacentElement('afterend', link);
  }).observe(errorNode, {childList:true,characterData:true,subtree:true});
})();
