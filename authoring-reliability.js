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
  async function stableLoad(slug) {
    const before = await revisionForSlug(slug);
    await originalLoad(slug);
    let after = await revisionForId(before.id);
    // If the module changed while the multi-query loader was running, reload once from the new revision.
    if (Number(before.revision) !== Number(after.revision)) {
      await originalLoad(slug);
      after = await revisionForId(before.id);
    }
    project.moduleRevision = Number(after.revision);
    setSyncStatus('Loaded ' + project.questions.length + ' questions · revision ' + project.moduleRevision, '#8b949e');
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
      is_active: true
    };
  }

  window.runSync = async function () {
    if (!cloudReady || !project.moduleId) return;
    if (syncing) { syncQueued = true; return; }
    if (!Number.isInteger(project.moduleRevision)) {
      cloudReady = false;
      setSyncStatus('Reload required before saving. Revision protection is not initialized.', '#f85149');
      return;
    }
    syncing = true;
    const expectedRevision = project.moduleRevision;
    try {
      await uploadPendingImages();
      const snapshot = {
        moduleId: project.moduleId,
        moduleName: project.moduleName || project.moduleSlug,
        isPublished: !!project.isPublished,
        groups: project.groups.map((g,i) => ({id:g.id,module_id:project.moduleId,name:g.name || 'Untitled group',sort_order:i+1})),
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
      project.moduleRevision = Number(result.data);
      setSyncStatus('Saved to cloud · revision ' + project.moduleRevision + ' · ' + new Date().toLocaleTimeString(), '#3fb950');
    } catch (error) {
      const message = String(error?.message || error || 'Save failed');
      if (/stale_module_revision/i.test(message)) {
        cloudReady = false;
        setSyncStatus('Conflict detected. This module changed elsewhere. Refresh From Cloud before saving again.', '#f85149');
        alert('This module changed in another tab or device. Your current editor was NOT allowed to overwrite it. Export your draft if needed, then use Refresh From Cloud before saving again.');
      } else {
        setSyncStatus('Not saved: ' + message, '#f85149');
      }
    } finally {
      syncing = false;
      if (syncQueued && cloudReady) { syncQueued = false; queueSync(); }
    }
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
