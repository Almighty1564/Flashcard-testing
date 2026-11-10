/* Display-only source notes. All database text remains untrusted plain text. */
(function () {
  'use strict';
  const text = (value, max = 2000) => typeof value === 'string' ? value.slice(0, max).trim() : '';
  const list = value => Array.isArray(value) ? value.slice(0, 30).map(x => text(x)).filter(Boolean) : [];
  function sourcePath(source) {
    const folder = text(source?.folder, 500), file = text(source?.file, 500);
    const path = folder + '/' + file;
    return folder && file && !path.includes(':') && !path.includes('\\') && !path.split('/').some(x => !x || x === '.' || x === '..') ? path : null;
  }
  function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const result = {
      audit_id: text(value.audit_id, 80), provenance: text(value.provenance, 80),
      assessment_kind: ['direct recall', 'application'].includes(value.assessment_kind) ? value.assessment_kind : '',
      source_status: text(value.source_status, 80), source_topic: text(value.source_topic, 500),
      sources: Array.isArray(value.sources) ? value.sources.slice(0, 50).filter(x => x && typeof x === 'object').map(x => ({folder:text(x.folder,500),file:text(x.file,500),heading:text(x.heading,500)})).filter(x => x.folder || x.file) : [],
      grading_criteria: list(value.grading_criteria), notes: list(value.notes),
      source_qualification: text(value.source_qualification, 4000),
      retired: value.retired === true, retirement_reason: text(value.retirement_reason),
      external_source: null
    };
    if (value.external_source && typeof value.external_source === 'object') {
      let url = '';
      try { const parsed = new URL(text(value.external_source.url, 2000)); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) url = parsed.href; } catch (_) {}
      const title = text(value.external_source.title, 500);
      if (title || url) result.external_source = {title, url};
    }
    return result;
  }
  function appendLabels(container, value) {
    const data = normalize(value); if (!data) return;
    const labels = [data.audit_id && 'Reference ' + data.audit_id, data.provenance && 'Origin: ' + data.provenance, data.assessment_kind && (data.assessment_kind === 'application' ? 'Application' : 'Direct recall')].filter(Boolean);
    labels.forEach(label => { const span = document.createElement('span'); span.className = 'badge'; span.textContent = label; span.dataset.studyMetadataLabel = 'true'; container.append(' ', span); });
  }
  // Call only after reveal. No source headings, grading criteria or notes are inserted beforehand.
  function appendDetails(container, value, openSource) {
    const data = normalize(value); if (!data) return;
    const section = document.createElement('section'); section.className = 'study-source-notes'; section.dataset.studyMetadataDetails = 'true';
    function line(copy) { const p = document.createElement('p'); p.textContent = copy; section.append(p); return p; }
    const title = document.createElement('h3'); title.textContent = 'Source and study notes'; section.append(title);
    if (data.source_topic) line('Source topic: ' + data.source_topic);
    if (/pending|unresolved|needs.review/i.test(data.source_status)) line('Source verification pending');
    if (!data.sources.length) line('No source image reference is available for this item.');
    data.sources.forEach(source => {
      const p = line([source.folder, source.file, source.heading].filter(Boolean).join(' · '));
      const path = sourcePath(source);
      if (path && typeof openSource === 'function') {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Open local source';
        button.addEventListener('click', () => openSource(path, button)); p.append(' ', button);
      }
    });
    if (data.grading_criteria.length) {
      line('Answer checklist'); const ul = document.createElement('ul');
      data.grading_criteria.forEach(copy => { const li = document.createElement('li'); li.textContent = copy; ul.append(li); }); section.append(ul);
    }
    data.notes.forEach(line);
    if (data.source_qualification) line(data.source_qualification);
    if (data.external_source) {
      const p = line('Technical clarification: ');
      if (data.external_source.url) {
        const a = document.createElement('a'); a.textContent = data.external_source.title || data.external_source.url; a.href = data.external_source.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; p.append(a);
      } else p.append(data.external_source.title);
    }
    if (data.retired) line('Retired' + (data.retirement_reason ? ': ' + data.retirement_reason : ''));
    container.append(section);
  }
  const api = {normalize, sourcePath, appendLabels, appendDetails};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.T08StudyMetadata = api;
})();
