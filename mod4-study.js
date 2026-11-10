/* Read-only course library. Local files never enter the cloud client. */
(function () {
  'use strict';
  function sourcePath(value) {
    const path = String(value || '').replace(/\\/g, '/').replace(/^supporting material\//, '');
    return path && !path.startsWith('/') && !path.includes(':') && !path.split('/').some(x => !x || x === '.' || x === '..') ? path : null;
  }
  function localURL(path) {
    const clean = sourcePath(path);
    return clean ? 'supporting%20material/' + clean.split('/').map(encodeURIComponent).join('/') : null;
  }
  function answerText(card) {
    if (card.type === 'flashcard') return card.answer?.text || '';
    if (card.type === 'multiple-choice' || card.type === 'multiple-select') return (card.choices || []).filter(x => x.correct).map(x => x.text).join('\n');
    if (card.type === 'numeric') return [card.entry?.value, card.entry?.unit].filter(x => x !== undefined && x !== null && x !== '').join(' ');
    if (card.type === 'matching') return (card.pairs || []).map(x => `${x.left?.text || ''} → ${x.right?.text || ''}`).join('\n');
    if (card.type === 'image-entry') return (card.diagram?.fields || []).map((x, i) => `${i + 1}. ${x.answer || ''}`).join('\n');
    return '';
  }
  function libraryCard(card, previousSources, metadataAPI) {
    const metadata = metadataAPI?.normalize(card.studyMetadata) || (card.studyMetadata ? {source_status:'pending',sources:[]} : null);
    const liveSources = (metadata?.sources || []).map(x => metadataAPI?.sourcePath(x)).filter(Boolean);
    // Audit references supersede older static mappings, including an explicit pending source.
    const status = metadata && !/^(reviewed|verified)$/.test(metadata.source_status) ? 'needs-review' : 'verified';
    return {...card, studyMetadata: metadata, status, answer: {text:answerText(card),image:card.answer?.image}, sources:metadata ? liveSources : previousSources};
  }
  const core = {sourcePath, localURL, answerText, libraryCard};
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  const manifest = window.M4_MANIFEST || {files: [], slots: []};
  const offline = window.M4_OFFLINE || null;
  const files = (manifest.files || []).filter(x => sourcePath(x.path) === x.path);
  const fileIndex = new Map(files.map(x => [x.path, x]));
  const slots = manifest.slots || [];
  const localFiles = new Map();
  let cards = [], groups = [], section = 'practice', limit = 30, page = 0, generation = 0;
  let galleryURLs = [], dialogURL = null, pendingSource = null, opener = null;
  const node = (tag, text, className) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; };
  function releaseGallery() { galleryURLs.forEach(url => URL.revokeObjectURL(url)); galleryURLs = []; }
  function clearSource() {
    $('sourceImage').removeAttribute('src');
    if (dialogURL) URL.revokeObjectURL(dialogURL);
    dialogURL = null;
    if (opener?.isConnected) opener.focus();
    opener = null;
  }
  function closeSource() { if ($('sourceDialog').open) $('sourceDialog').close(); clearSource(); }
  $('sourceDialog').addEventListener('close', () => { if (!$('sourceDialog').open) clearSource(); });
  $('closeSource').onclick = closeSource;
  function imageURL(path, dialog = false) {
    if (offline) return localURL(path);
    const file = localFiles.get(path);
    if (!file) return null;
    const url = URL.createObjectURL(file);
    if (dialog) dialogURL = url; else galleryURLs.push(url);
    return url;
  }
  function openSource(path, button) {
    if (!fileIndex.has(path)) return;
    if (!offline && !localFiles.has(path)) {
      pendingSource = path; showSection('sources');
      $('folderStatus').textContent = 'Choose your supporting material folder to open: ' + path;
      $('folder').focus(); return;
    }
    closeSource(); opener = button;
    const info = fileIndex.get(path);
    $('sourceTitle').textContent = path;
    $('sourceMessage').textContent = offline ? 'Original image from the accompanying source folder.' : 'Local image from your selected folder. Nothing was uploaded.';
    $('sourceHash').textContent = 'Reference SHA-256: ' + info.sha256 + ' · ' + info.bytes.toLocaleString() + ' bytes. This identifies the supplied archive; selected files are matched by path.';
    $('sourceImage').alt = 'Course source: ' + path;
    $('sourceImage').onerror = () => { $('sourceMessage').textContent = 'Image could not be opened. Keep index.html beside the supporting material folder, or select the correct source folder again.'; };
    $('sourceImage').src = imageURL(path, true);
    $('sourceDialog').showModal();
  }
  function references(paths) {
    const wrap = node('div', undefined, 'references');
    [...new Set((paths || []).map(sourcePath).filter(x => fileIndex.has(x)))].forEach(path => {
      const button = node('button', 'Source · ' + path); button.type = 'button'; button.onclick = () => openSource(path, button); wrap.append(button);
    });
    return wrap;
  }
  function cloudImage(url, alt) {
    if (!url || offline) return null;
    try {
      const target = new URL(url), base = new URL(window.FC_CONFIG.url);
      if (target.protocol !== 'https:' || target.origin !== base.origin || !target.pathname.startsWith('/storage/v1/object/sign/')) return null;
      const image = node('img'); image.src = target.href; image.alt = alt; image.loading = 'lazy'; image.decoding = 'async'; return image;
    } catch (_) { return null; }
  }
  function reviewRecords() {
    if (offline) return cards.filter(x => x.status !== 'verified');
    return [...slots.filter(x => x.status !== 'verified').map(x => ({
      id: x.id, groupId: 'quiz-' + x.quiz, label: `Quiz ${x.quiz} · Question ${x.number}`, status: 'needs-review',
      question: {text: 'Source check required'}, answer: {text: ''}, sources: x.sources,
      notes: 'This item is held out of practice. Open its source image or use the offline library to review the source wording.'
    })), ...cards.filter(x => x.studyMetadata && x.status !== 'verified')];
  }
  function updateGroups() {
    const previous = $('group').value;
    $('group').replaceChildren(new Option('All topics', ''));
    const options = section === 'review' ? [...Array.from({length: 8}, (_, i) => ({id: 'quiz-' + (i + 1), name: 'Course Quiz ' + (i + 1)})), ...groups.filter(g => cards.some(c => c.groupId === g.id && c.studyMetadata && c.status !== 'verified'))] : groups;
    options.forEach(g => $('group').add(new Option(g.name, g.id)));
    if ([...$('group').options].some(o => o.value === previous)) $('group').value = previous;
  }
  function renderQuestions() {
    const term = $('search').value.trim().toLowerCase(), group = $('group').value;
    const base = section === 'review' ? reviewRecords() : cards.filter(x => x.status === 'verified');
    const shown = base.filter(x => (!group || x.groupId === group) && (!term || [x.question?.text, x.answer?.text, x.label].join(' ').toLowerCase().includes(term)));
    $('questionCount').textContent = `${shown.length} ${section === 'review' ? 'items held for review' : 'questions'}${shown.length > limit ? ' · showing ' + limit : ''}`;
    $('questions').replaceChildren();
    shown.slice(0, limit).forEach(card => {
      const article = node('article', undefined, 'question');
      article.append(node('div', card.label || groups.find(g => g.id === card.groupId)?.name || 'MOD 4', 'tag'));
      if (card.studyMetadata) window.T08StudyMetadata?.appendLabels(article, card.studyMetadata);
      if (section === 'review') article.append(node('p', 'Needs review · not included in practice', 'review-badge'));
      article.append(node('h2', card.question?.text || 'Question is not visible in the supplied source.'));
      const qImage = cloudImage(card.question?.image, 'Question image'); if (qImage) article.append(qImage);
      if (card.answer?.text || card.answer?.image) {
        const details = node('details'), summary = node('summary', section === 'review' ? 'View source key for review' : 'Reveal answer');
        const answer = node('div', card.answer?.text || '', 'answer');
        const aImage = cloudImage(card.answer?.image, 'Answer image'); if (aImage) answer.append(aImage);
        details.append(summary, answer); article.append(details);
        if (card.studyMetadata) details.addEventListener('toggle', () => {
          if (!details.open || details.dataset.sourceNotesReady) return;
          details.dataset.sourceNotesReady = 'true';
          window.T08StudyMetadata?.appendDetails(details, card.studyMetadata, (path, button) => {
            if (fileIndex.has(path)) openSource(path, button);
            else { const message = node('p', 'This reference is not in the local source manifest. Locate the filename in your supplied material.', 'notes'); button.replaceWith(message); }
          });
        });
      } else article.append(node('p', section === 'review' ? 'No practice answer is supplied for this item.' : 'Use the original test view for this question’s interactive answer.', 'notes'));
      if (card.notes) article.append(node('p', card.notes, 'notes'));
      if (!card.studyMetadata) article.append(references(card.sources)); $('questions').append(article);
    });
    if (!shown.length) $('questions').append(node('p', 'No matching questions. Try another topic or search.', 'empty'));
    $('moreQuestions').hidden = shown.length <= limit;
  }
  function renderGallery() {
    releaseGallery(); $('gallery').replaceChildren();
    const term = $('sourceSearch').value.trim().toLowerCase(), folder = $('sourceGroup').value;
    const found = files.filter(f => (!folder || f.path.slice(0, f.path.lastIndexOf('/')) === folder) && (!term || f.path.toLowerCase().includes(term)));
    const pages = Math.max(1, Math.ceil(found.length / 24)); page = Math.min(page, pages - 1);
    $('sourceCount').textContent = `${found.length} source images · ${offline ? 'available beside this HTML file' : localFiles.size + ' matched local files'}`;
    found.slice(page * 24, page * 24 + 24).forEach(file => {
      const button = node('button', undefined, 'source-tile'); button.type = 'button';
      const thumb = node('span', undefined, 'source-thumb'), url = imageURL(file.path);
      if (url) { const img = node('img'); img.alt = ''; img.src = url; img.loading = 'lazy'; img.decoding = 'async'; img.onerror = () => { thumb.textContent = 'Image unavailable'; }; thumb.append(img); }
      else thumb.textContent = 'Choose your local source folder';
      const split = file.path.lastIndexOf('/'), caption = node('span', undefined, 'source-caption');
      caption.append(node('small', file.path.slice(0, split)), node('span', file.path.slice(split + 1)));
      button.append(thumb, caption); button.onclick = () => openSource(file.path, button); $('gallery').append(button);
    });
    if (!found.length) $('gallery').append(node('p', 'No matching source images.', 'empty'));
    $('sourcePage').textContent = `${page + 1} / ${pages}`; $('prevSource').disabled = page === 0; $('nextSource').disabled = page + 1 >= pages;
  }
  function showSection(next) {
    section = next; limit = 30;
    document.querySelectorAll('[data-section]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.section === next)));
    $('questionsPanel').hidden = next === 'sources'; $('sourcesPanel').hidden = next !== 'sources';
    if (next === 'sources') renderGallery(); else { releaseGallery(); $('gallery').replaceChildren(); updateGroups(); renderQuestions(); }
  }
  $('folder').addEventListener('change', () => {
    closeSource(); releaseGallery(); localFiles.clear();
    for (const file of $('folder').files) {
      const parts = String(file.webkitRelativePath || '').replace(/\\/g, '/').split('/');
      const index = parts.indexOf('supporting material');
      const path = sourcePath(parts.slice(index >= 0 ? index + 1 : 1).join('/'));
      if (path && fileIndex.has(path) && /\.png$/i.test(path)) localFiles.set(path, file);
    }
    $('folderStatus').textContent = `${localFiles.size} of ${files.length} reference images matched by path. Files remain on this device.`;
    renderGallery();
    if (pendingSource && localFiles.has(pendingSource)) { const path = pendingSource; pendingSource = null; openSource(path, $('folder')); }
  });
  document.querySelectorAll('[data-section]').forEach(button => button.onclick = () => showSection(button.dataset.section));
  $('search').oninput = $('group').onchange = () => { limit = 30; renderQuestions(); };
  $('moreQuestions').onclick = () => { limit += 30; renderQuestions(); };
  $('sourceSearch').oninput = $('sourceGroup').onchange = () => { page = 0; renderGallery(); };
  $('prevSource').onclick = () => { page--; renderGallery(); };
  $('nextSource').onclick = () => { page++; renderGallery(); };
  [...new Set(files.map(f => f.path.slice(0, f.path.lastIndexOf('/'))))].sort((a, b) => a.localeCompare(b, undefined, {numeric: true})).forEach(folder => $('sourceGroup').add(new Option(folder, folder)));
  function ready() {
    $('gate').hidden = true; $('library').hidden = false;
    $('reviewCount').textContent = String(reviewRecords().length);
    $('metrics').replaceChildren();
    for (const [count, label] of [[cards.filter(x => x.status === 'verified').length, 'practice questions'], [reviewRecords().length, 'items to review'], [files.length, 'source images']]) {
      const metric = node('div', undefined, 'metric'); metric.append(node('strong', String(count)), node('span', label)); $('metrics').append(metric);
    }
    updateGroups(); showSection(section);
  }
  function lock(message = 'Checking your existing account access.') {
    generation++; cards = []; groups = []; $('questions').replaceChildren(); $('gallery').replaceChildren(); $('metrics').replaceChildren();
    pendingSource = null; section = 'practice'; limit = 30; page = 0; $('search').value = ''; $('sourceSearch').value = ''; $('sourceGroup').value = ''; $('group').replaceChildren(new Option('All topics', ''));
    $('library').hidden = true; $('gate').hidden = false; $('gateTitle').textContent = 'MOD 4 study library'; $('gateMessage').textContent = message;
    closeSource(); releaseGallery(); localFiles.clear(); $('folder').value = ''; $('folderStatus').textContent = 'No local folder selected.';
    $('signIn').hidden = false; return generation;
  }
  async function boot() {
    const ticket = lock(); $('retry').hidden = true;
    try {
      if (!window.FC || !window.T08Security) throw Error('Account access checks could not load. Refresh the page to retry.');
      const profile = await FC.requireUser(); if (ticket !== generation) return;
      if (!profile) { $('gateMessage').textContent = 'Sign in through Communicator, then return to this library.'; return; }
      const bank = await FC.loadBank('mod4'); if (ticket !== generation) return;
      const provenance = new Map(); [...slots, ...(manifest.references || [])].forEach(slot => { if (slot.id) { const list = provenance.get(slot.id) || []; list.push(slot); provenance.set(slot.id, list); } });
      groups = bank.groups || [];
      cards = (bank.cards || []).map(card => libraryCard(card, (provenance.get(card.id) || []).flatMap(x => x.sources || []), window.T08StudyMetadata));
      ready();
    } catch (error) { if (ticket !== generation) return; $('gateMessage').textContent = error.message || 'The library could not be opened.'; $('retry').hidden = false; }
  }
  $('retry').onclick = boot;
  if (offline) {
    groups = Array.from({length: 8}, (_, i) => ({id: 'quiz-' + (i + 1), name: 'Course Quiz ' + (i + 1)}));
    cards = offline.records.map(x => ({id: x.id, groupId: 'quiz-' + x.quiz, label: `Quiz ${x.quiz} · Question ${x.number}`, status: x.status, question: {text: x.questionText}, answer: {text: x.answerText}, notes: x.notes, sources: x.sources}));
    $('sourceHelp').textContent = 'All original screenshots are in the supporting material folder beside this page. Browse them below or follow a question’s source reference.';
    document.querySelector('.folder-picker').hidden = true; $('folderStatus').textContent = 'Local archive · ' + files.length + ' source images';
    document.querySelector('.back').textContent = 'MOD 4 / Offline study library'; document.querySelector('.back').href = '#library';
    $('modeNote').textContent = 'Offline source review · 160 numbered slots across 8 quizzes. Only reviewed, complete items appear in practice. Reading or revealing an answer does not record a grade.';
    ready();
  } else {
    window.FC?.client?.auth?.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') lock('You are signed out. Sign in again to view questions.');
      else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') queueMicrotask(boot);
    });
    boot();
    window.addEventListener('pagehide', () => lock('Rechecking access…'));
    window.addEventListener('pageshow', event => { if (event.persisted) boot(); });
  }
})();
