/* Appearance only: no account, learning-data, sensor, or network access. */
(function () {
  'use strict';

  // Embedded calculators and visuals keep their original page-owned appearance.
  let embedded = false;
  try { embedded = window.self !== window.top; } catch (_) { embedded = true; }
  if (embedded) {
    document.querySelectorAll('link[data-lg-stylesheet]').forEach(function (link) { link.disabled = true; });
    return;
  }
  const root = document.documentElement;
  if (!root || root.hasAttribute('data-lg-controller')) return;
  root.setAttribute('data-lg-controller', 'true');

  const STORAGE_KEY = 'tomato08.appearance.v1';
  const PALETTES = ['dawn', 'dusk', 'atelier'];
  const MATERIALS = ['glass', 'solid'];
  const PANELS = '.p-mode-card, .p-sidebar, .b-briefing, .atelier-bar';
  const THEME_COLORS = { dawn: '#d9e3f0', dusk: '#25354f', atelier: '#191a1e' };
  let storageAvailable = true;
  let controls = null;
  let activePanel = null;

  function validate(raw) {
    let value = {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed;
    } catch (_) { /* A damaged setting falls back to a usable default. */ }
    return {
      palette: PALETTES.includes(value.palette) ? value.palette : 'atelier',
      material: MATERIALS.includes(value.material) ? value.material : 'glass',
      tint: typeof value.tint === 'number' && Number.isFinite(value.tint) && value.tint >= 35 && value.tint <= 90 ? Math.round(value.tint) : 45,
      opaque: typeof value.opaque === 'boolean' ? value.opaque : false
    };
  }

  function read() {
    try { return validate(window.localStorage.getItem(STORAGE_KEY)); }
    catch (_) { storageAvailable = false; return validate(null); }
  }

  // Keep user choices separate from the effective system accessibility settings.
  let preferences = read();
  function media(query) {
    try { return window.matchMedia(query); } catch (_) { return { matches: false }; }
  }
  const transparency = media('(prefers-reduced-transparency: reduce)');
  const contrast = media('(prefers-contrast: more)');
  const motion = media('(prefers-reduced-motion: reduce)');
  const finePointer = media('(hover: hover) and (pointer: fine)');
  const systemOpaque = () => transparency.matches || contrast.matches;
  const effectiveOpaque = () => preferences.opaque || systemOpaque();

  function resetLight() {
    if (!activePanel) return;
    activePanel.style.removeProperty('--lg-light-x');
    activePanel.style.removeProperty('--lg-light-y');
    activePanel = null;
  }

  function syncControls() {
    if (!controls) return;
    controls.querySelectorAll('button[data-lg-material]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-lg-material') === preferences.material));
    });
    controls.querySelectorAll('button[data-lg-palette]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-lg-palette') === preferences.palette));
    });
    const tint = controls.querySelector('#lg-tint');
    tint.value = String(preferences.tint);
    tint.disabled = preferences.material === 'solid' || effectiveOpaque();
    controls.querySelector('#lg-tint-value').textContent = preferences.tint + '%';
    const opaque = controls.querySelector('#lg-opaque');
    opaque.checked = effectiveOpaque();
    opaque.disabled = systemOpaque();
    let note = storageAvailable ? 'Appearance saves on this device.' : 'Appearance applies here. This browser cannot save settings.';
    if (systemOpaque()) note += ' Your system requires opaque surfaces; your transparency choice is kept for later.';
    else if (preferences.material === 'solid' || preferences.opaque) note += ' Select Glass and turn off Reduce transparency to adjust the tint.';
    controls.querySelector('#lg-appearance-note').textContent = note;
  }

  function apply() {
    root.setAttribute('data-lg-palette', preferences.palette);
    root.setAttribute('data-lg-material', preferences.material);
    root.setAttribute('data-lg-opaque', String(effectiveOpaque()));
    root.style.setProperty('--lg-opacity', String(preferences.tint / 100));
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute('content', THEME_COLORS[preferences.palette]);
    resetLight();
    syncControls();
  }

  function save() {
    try {
      // Serialize only the validated appearance fields, never system overrides.
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      storageAvailable = true;
    } catch (_) { storageAvailable = false; }
    apply();
  }

  function light(event) {
    if (motion.matches || effectiveOpaque() || preferences.material !== 'glass') return;
    if (event.type === 'pointermove' && (event.pointerType !== 'mouse' || !finePointer.matches)) return;
    const panel = event.target && event.target.closest ? event.target.closest(PANELS) : null;
    if (!panel) { resetLight(); return; }
    if (activePanel !== panel) resetLight();
    const rect = panel.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    activePanel = panel;
    const percent = (position, start, size) => Math.max(0, Math.min(100, Math.round((position - start) / size * 100))) + '%';
    panel.style.setProperty('--lg-light-x', percent(event.clientX, rect.left, rect.width));
    panel.style.setProperty('--lg-light-y', percent(event.clientY, rect.top, rect.height));
  }

  function mount() {
    const host = document.querySelector('.p-sidebar') || document.querySelector('.atelier-bar');
    if (!host || document.querySelector('.lg-controls')) return;
    controls = document.createElement('details');
    controls.className = 'lg-controls';
    controls.innerHTML = '<summary>Appearance</summary><div class="lg-control-content">' +
      '<div class="lg-segmented" role="group" aria-label="Surface material">' +
      '<button type="button" data-lg-material="solid" aria-pressed="false">Solid</button>' +
      '<button type="button" data-lg-material="glass" aria-pressed="true">Glass</button></div>' +
      '<div class="lg-swatches" role="group" aria-label="Color palette">' +
      '<button class="lg-palette" type="button" data-lg-palette="dawn" aria-pressed="true"><span class="lg-swatch" aria-hidden="true"></span>Dawn</button>' +
      '<button class="lg-palette" type="button" data-lg-palette="dusk" aria-pressed="false"><span class="lg-swatch" aria-hidden="true"></span>Dusk</button>' +
      '<button class="lg-palette" type="button" data-lg-palette="atelier" aria-pressed="false"><span class="lg-swatch" aria-hidden="true"></span>Atelier</button></div>' +
      '<div class="lg-range"><label for="lg-tint">Glass tint <output id="lg-tint-value" for="lg-tint">55%</output></label>' +
      '<input id="lg-tint" type="range" min="35" max="90" step="1" value="55" aria-describedby="lg-appearance-note"></div>' +
      '<label class="lg-check"><input id="lg-opaque" type="checkbox" aria-describedby="lg-appearance-note">Reduce transparency</label>' +
      '<p class="lg-control-note" id="lg-appearance-note" role="status" aria-live="polite"></p></div>';
    host.append(controls);

    controls.addEventListener('click', function (event) {
      const button = event.target && event.target.closest ? event.target.closest('button[data-lg-material], button[data-lg-palette]') : null;
      if (!button || !controls.contains(button)) return;
      const material = button.getAttribute('data-lg-material');
      const palette = button.getAttribute('data-lg-palette');
      if (MATERIALS.includes(material)) preferences.material = material;
      else if (PALETTES.includes(palette)) preferences.palette = palette;
      else return;
      save();
    });
    controls.querySelector('#lg-tint').addEventListener('input', function (event) {
      if (event.target.disabled) return;
      const tint = Number(event.target.value);
      if (!Number.isFinite(tint) || tint < 35 || tint > 90) return;
      preferences.tint = Math.round(tint);
      save();
    });
    controls.querySelector('#lg-opaque').addEventListener('change', function (event) {
      if (systemOpaque()) return;
      preferences.opaque = !!event.target.checked;
      save();
    });
    controls.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && controls.open) {
        event.preventDefault();
        event.stopPropagation();
        controls.open = false;
        controls.querySelector('summary').focus();
      }
    });

    // One delegated set of input listeners covers only the fixed outer panels.
    // No animation loop, dynamic-card listener, timer, or motion sensor is used.
    document.addEventListener('pointermove', light, { passive: true });
    document.addEventListener('pointerdown', light, { passive: true });
    document.addEventListener('pointerout', function (event) {
      if (activePanel && (!event.relatedTarget || !activePanel.contains(event.relatedTarget))) resetLight();
    }, { passive: true });
    document.addEventListener('pointerup', function (event) {
      if (event.pointerType !== 'mouse') resetLight();
    }, { passive: true });
    document.addEventListener('pointercancel', resetLight, { passive: true });
    window.addEventListener('blur', resetLight);
    document.addEventListener('visibilitychange', function () { if (document.hidden) resetLight(); });
    apply();
  }

  [transparency, contrast].forEach(function (preference) {
    if (preference.addEventListener) preference.addEventListener('change', apply);
    else if (preference.addListener) preference.addListener(apply);
  });
  [motion, finePointer].forEach(function (preference) {
    if (preference.addEventListener) preference.addEventListener('change', resetLight);
    else if (preference.addListener) preference.addListener(resetLight);
  });
  window.addEventListener('storage', function (event) {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    preferences = validate(event.newValue);
    apply();
  });
  // This script belongs in <head> without defer so stored colors precede paint.
  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
