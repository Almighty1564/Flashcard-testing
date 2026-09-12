/* Shared navigation only. The original page owns authentication and all data. */
(function () {
  'use strict';
  const body = document.body;
  if (!body || !body.hasAttribute('data-atelier') || ['portal', 'modules'].includes(body.dataset.page)) return;
  if (document.querySelector('.atelier-bar')) return;

  let embedded = false;
  try { embedded = window.self !== window.top; } catch (_) { embedded = true; }
  if (embedded) {
    body.classList.add('atelier-embedded');
    return;
  }

  const names = {
    study: 'Learning workspace', developer: 'Question studio',
    'legacy-study': 'Flashcard study', calculator: 'Calculation practice', antenna: 'Interactive visual'
  };
  const pageName = names[body.dataset.page] || 'Workspace';
  const main = document.querySelector('main.main') || document.querySelector('main') || document.querySelector('.wrap') || document.querySelector('#calcHost');
  const contentTarget = document.getElementById('atelierMain') || main;
  const sidebar = document.querySelector('#fcSidebar');
  const bar = document.createElement('header');
  bar.className = 'atelier-bar';
  bar.innerHTML = '<div class="atelier-bar-start"><a class="atelier-wordmark" href="./index.html" aria-label="Atelier home">' +
    '<span class="atelier-monogram" aria-hidden="true">t08</span><span class="atelier-wordmark-text">ATELIER</span></a>' +
    '<span class="atelier-bar-label"></span></div><nav class="atelier-bar-nav" aria-label="Workspace">' +
    '<a href="./index.html" data-atelier-home>Home</a><a href="./tester.html">Modules <span aria-hidden="true">↗</span></a></nav>';
  bar.querySelector('.atelier-bar-label').textContent = pageName;

  if (document.querySelector('main.main')) main.prepend(bar);
  else body.prepend(bar);
  body.classList.add('atelier-enhanced');

  if (contentTarget) {
    if (!contentTarget.id) contentTarget.id = 'atelier-main-content';
    const skip = document.createElement('a');
    skip.className = 'atelier-skip';
    skip.href = '#' + contentTarget.id;
    skip.textContent = 'Skip to content';
    body.prepend(skip);
    skip.addEventListener('click', function () {
      if (!contentTarget.hasAttribute('tabindex')) contentTarget.setAttribute('tabindex', '-1');
      contentTarget.focus({ preventScroll: false });
    });
  }

  if (!sidebar || !main) return;

  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'atelier-mobile-menu';
  menu.setAttribute('aria-label', 'Open ' + pageName.toLowerCase() + ' menu');
  menu.setAttribute('aria-controls', sidebar.id);
  menu.setAttribute('aria-expanded', 'false');
  menu.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span class="atelier-menu-word">Menu</span>';
  bar.querySelector('.atelier-bar-nav').append(menu);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'atelier-drawer-close';
  close.setAttribute('aria-label', 'Close workspace menu');
  close.innerHTML = '<span>Back to workspace</span><span aria-hidden="true">×</span>';
  sidebar.prepend(close);

  const shade = document.createElement('div');
  shade.className = 'atelier-drawer-shade';
  shade.setAttribute('aria-hidden', 'true');
  body.append(shade);

  const mobile = window.matchMedia('(max-width: 900px)');
  const originalRole = sidebar.getAttribute('role');
  const originalLabel = sidebar.getAttribute('aria-label');
  let opened = false;
  let restoreFocus = null;
  let mainWasInert = false;

  function setOpen(next, returnFocus) {
    next = !!next && mobile.matches;
    if (next === opened) return;
    opened = next;
    body.classList.toggle('atelier-nav-open', opened);
    menu.setAttribute('aria-expanded', String(opened));
    if (opened) {
      restoreFocus = document.activeElement;
      mainWasInert = main.inert;
      main.inert = true;
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
      sidebar.setAttribute('aria-label', pageName + ' menu');
      close.focus();
    } else {
      main.inert = mainWasInert;
      sidebar.removeAttribute('aria-modal');
      if (originalRole === null) sidebar.removeAttribute('role'); else sidebar.setAttribute('role', originalRole);
      if (originalLabel === null) sidebar.removeAttribute('aria-label'); else sidebar.setAttribute('aria-label', originalLabel);
      if (returnFocus !== false && restoreFocus && restoreFocus.isConnected) restoreFocus.focus();
    }
  }

  menu.addEventListener('click', function () { setOpen(!opened); });
  close.addEventListener('click', function () { setOpen(false); });
  shade.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (event) {
    if (!opened) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(sidebar.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]')).filter(function (element) {
      return !element.disabled && element.tabIndex >= 0 && element.getClientRects().length > 0;
    });
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  // View changes close the drawer; editor fields and disclosures keep it open.
  sidebar.addEventListener('click', function (event) {
    if (!opened) return;
    const action = event.target.closest('button[data-view], .group-btn, #customPickBtn, #customWeakBtn, #customUntestedBtn, #customAllCardsBtn, #calcBtn, #ringBtn');
    if (action && !action.disabled) setOpen(false);
  });
  function changedScreen(event) {
    if (!event.matches && opened) {
      setOpen(false, false);
      if (contentTarget) {
        if (!contentTarget.hasAttribute('tabindex')) contentTarget.setAttribute('tabindex', '-1');
        contentTarget.focus({ preventScroll: true });
      }
    }
  }
  if (mobile.addEventListener) mobile.addEventListener('change', changedScreen);
  else mobile.addListener(changedScreen);
})();
