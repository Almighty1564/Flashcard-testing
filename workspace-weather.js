/* Compact, authenticated Overview weather. Uses the same city and units as the full briefing. */
(function () {
  'use strict';
  const D = window.BriefingData;
  const root = document.getElementById('compactWeather');
  const app = document.getElementById('modePicker');
  if (!D || !root || !app) return;
  const prefsKey = 'tomato08.briefing.preferences.v1';
  const cacheKey = 'tomato08.workspace.weather.v1';
  const ttl = 15 * 60 * 1000;
  const $ = id => document.getElementById(id);
  let request = null, timer = null, lastAttempt = 0;
  function settings() {
    let prefs = null;
    try { prefs = JSON.parse(localStorage.getItem(prefsKey)); } catch (_) { /* No valid saved preference. */ }
    return {location:D.validLocation(prefs?.location) || D.defaultLocation, units:prefs?.units === 'c' ? 'c' : 'f'};
  }
  function cityLabel(city) { return [city.name, city.admin1 || city.country].filter(Boolean).join(', '); }
  function readCache() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(cacheKey));
      return saved && Number.isFinite(saved.checked) && typeof saved.url === 'string' ? saved : null;
    } catch (_) { return null; }
  }
  function render(entry, prefs, stale) {
    const weather = D.normalizeWeather(entry.raw);
    if (!weather || !Number.isFinite(weather.current.temp)) return false;
    const current = weather.current;
    const temp = Math.round(prefs.units === 'f' ? D.fahrenheit(current.temp) : current.temp);
    const description = D.description(current.code, current.isDay).label;
    $('weatherLocation').textContent = cityLabel(prefs.location);
    $('weatherSummary').textContent = temp + '°' + prefs.units.toUpperCase() + ' · ' + description;
    const time = new Intl.DateTimeFormat('en-US', {hour:'numeric', minute:'2-digit', timeZone:weather.timezone}).format(new Date(entry.checked));
    $('weatherTime').textContent = (stale ? 'Saved forecast · ' : 'Updated ') + time + ' · Full forecast →';
    root.setAttribute('aria-label', cityLabel(prefs.location) + ', ' + $('weatherSummary').textContent + '. ' + (stale ? 'Saved forecast may be outdated. ' : '') + 'Open full forecast.');
    return true;
  }
  async function load(force = false) {
    if (document.hidden || app.hidden || request) return;
    const prefs = settings(), url = D.weatherURL(prefs.location), saved = readCache();
    const matches = saved?.url === url;
    const fresh = matches && Date.now() - saved.checked >= 0 && Date.now() - saved.checked < ttl;
    $('weatherLocation').textContent = cityLabel(prefs.location);
    if (fresh && !force && render(saved, prefs, false)) return;
    if (matches) render(saved, prefs, true);
    if (!force && Date.now() - lastAttempt < ttl) return;
    lastAttempt = Date.now();
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {signal:controller.signal, credentials:'omit', referrerPolicy:'no-referrer'});
      if (!response.ok) throw new Error('Weather unavailable');
      const entry = {url, raw:await response.json(), checked:Date.now()};
      if (request !== controller || controller.signal.aborted || app.hidden || !render(entry, prefs, false)) throw new Error('No current weather');
      try { sessionStorage.setItem(cacheKey, JSON.stringify(entry)); } catch (_) { /* Display still works. */ }
    } catch (_) {
      if (app.hidden || request !== controller) return;
      if (!matches || !render(saved, prefs, true)) {
        $('weatherSummary').textContent = 'Weather unavailable';
        $('weatherTime').textContent = 'Open forecast to retry →';
        root.setAttribute('aria-label', 'Weather unavailable. Open forecast to retry.');
      }
    } finally { clearTimeout(timeout); if (request === controller) request = null; }
  }
  function visibility() {
    if (document.hidden || app.hidden) { request?.abort(); request = null; lastAttempt = 0; clearInterval(timer); timer = null; return; }
    load();
    if (!timer) timer = setInterval(() => load(), 60000);
  }
  new MutationObserver(visibility).observe(app,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('workspace:ready', visibility);
  window.addEventListener('pageshow', visibility);
  window.addEventListener('pagehide', () => { request?.abort(); request = null; lastAttempt = 0; clearInterval(timer); timer = null; });
  window.addEventListener('storage', event => { if (event.key === prefsKey || event.key === null) { request?.abort(); request = null; lastAttempt = 0; load(true); } });
  visibility();
})();
