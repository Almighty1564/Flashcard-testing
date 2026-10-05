/* Workspace presentation only. Roles are displayed from the existing authenticated controller. */
(function () {
  'use strict';
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    radio: '<path d="m7 21 5-16 5 16M9 15h6M8 19h8M5 5a10 10 0 0 0 0 10M19 5a10 10 0 0 1 0 10M8 7a6 6 0 0 0 0 6M16 7a6 6 0 0 1 0 6"/>',
    code: '<path d="m7 6-6 6 6 6m10-12 6 6-6 6M14 3l-4 18"/>',
    cloud: '<path d="M6 19a5 5 0 1 1 1-10 6 6 0 0 1 11 1 4.5 4.5 0 1 1 0 9Z"/>',
    edit: '<path d="m14 4 6 6M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15Zm7-15H3v17h18v-8"/>',
    shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 11 3 3 5-5"/>',
    logout: '<path d="M10 3H4v18h6m5-15 6 6-6 6M9 12h12"/>',
    terminal: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 8 4 4-4 4m7 0h5"/>',
    folder: '<path d="M2 6V3h7l3 3h10v15H2Z"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>'
  };
  document.querySelectorAll('[data-icon]').forEach(el => {
    if (icons[el.dataset.icon]) el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[el.dataset.icon] + '</svg>';
  });
  const nav = document.getElementById('workspaceNav');
  const menu = document.getElementById('menuButton');
  if (!nav || !menu) return;
  nav.querySelectorAll('[data-nav]').forEach(link => {
    if (link.dataset.nav === document.body.dataset.page) link.setAttribute('aria-current', 'page');
  });
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'w-nav w-nav-close'; close.style.display = 'none';
  close.textContent = 'Close navigation ×'; nav.prepend(close);
  const main = document.querySelector('.w-main');
  const mobile = matchMedia('(max-width: 900px)');
  let opened = false;
  let previousFocus = null;
  function setOpen(next) {
    next = Boolean(next && mobile.matches);
    if (next === opened) return;
    opened = next;
    nav.classList.toggle('is-open', opened);
    menu.setAttribute('aria-expanded', String(opened));
    if (opened) {
      previousFocus = document.activeElement;
      nav.setAttribute('role', 'dialog'); nav.setAttribute('aria-modal', 'true');
      main.inert = true;
      close.focus();
    } else {
      nav.removeAttribute('role'); nav.removeAttribute('aria-modal'); main.inert = false;
      if (previousFocus?.isConnected && mobile.matches) previousFocus.focus();
    }
  }
  menu.addEventListener('click', () => setOpen(!opened));
  close.addEventListener('click', () => setOpen(false));
  document.addEventListener('pointerdown', event => { if (opened && !nav.contains(event.target) && !menu.contains(event.target)) setOpen(false); });
  nav.addEventListener('click', event => { if (event.target.closest('a[href]')) setOpen(false); });
  document.addEventListener('keydown', event => {
    if (!opened) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
    if (event.key !== 'Tab') return;
    const controls = [...nav.querySelectorAll('a[href],button,input,summary')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  mobile.addEventListener('change', () => { if (!mobile.matches) setOpen(false); });
})();
