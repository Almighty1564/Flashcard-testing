import { wrap, angleError, numberIn, geoLookAngles, magneticField, phoneReading, circularMean, alignment } from './satellite-math.mjs?v=20260921-1';

// Nominal slots verified against SES's July 2026 fleet map and Eutelsat's 10°E page.
// No ephemeris claim. Custom entries and observer coordinates stay in memory only.
const PRESETS = [
  ['SES-1',-101],['SES-2',-87],['SES-3',-103],['SES-4',-22],['SES-5',5],['SES-6',-40.5],
  ['SES-9',108.2],['SES-10',-67],['SES-11',-105],['SES-12',95],['SES-14',-47.5],['SES-15',-129],
  ['SES-18',-103],['SES-19',-135],['SES-20',-103],['SES-21',-131],['SES-22',-139],
  ['Intelsat 22',72],['Intelsat 35e',-34.5],['Intelsat 37e',-18],['Intelsat 39',62],['Intelsat 40e',-91],
  ['Galaxy 19',-97],['GovSat-1',21.5],['NSS-12',57],['EUTELSAT 10B',10]
];
const $ = id => document.getElementById(id);
const setText = (id, text) => { const el = $(id); if (el.textContent !== text) el.textContent = text; };
const formatAngle = n => Number.isFinite(n) ? `${n.toFixed(1)}°` : '—';
const slot = n => `${Math.abs(n)}°${n < 0 ? 'W' : 'E'}`;
const satellites = PRESETS.map(([name, longitude], i) => ({ id: `preset-${i}`, name, longitude, custom: false }));
const state = { location: null, solution: null, field: null, modelError: '', satellite: null, running: false, starting: false, run: 0, geoRun: 0, geoID: null, gpsMessage: '', motionMessage: '', phone: null, headingAt: 0, tiltAt: 0, headings: [], tilts: [], inZoneSince: null, wake: null, fieldView: false };
const mode = () => $('pointMode').value;
const offsets = () => ({ azOffset: numberIn($('azOffset').value,-180,180), elOffset: numberIn($('elOffset').value,-90,90) });

function populateSatellites() {
  const selected = $('satelliteSelect').value;
  const fragment = document.createDocumentFragment();
  const blank = new Option('Choose a satellite…',''); fragment.append(blank);
  const group = document.createElement('optgroup'); group.label = 'Nominal GEO positions';
  const custom = document.createElement('optgroup'); custom.label = 'Added in this tab';
  for (const sat of satellites) {
    let label = `${sat.name} · ${slot(sat.longitude)}`;
    if (state.location) {
      const look = geoLookAngles(state.location.lat,state.location.lon,sat.longitude,state.location.alt);
      if (look.elevation <= 0) label += ' · below horizon';
    }
    (sat.custom ? custom : group).append(new Option(label,sat.id));
  }
  fragment.append(group); if (custom.children.length) fragment.append(custom);
  fragment.append(new Option('＋ Add a satellite / enter longitude','custom'));
  $('satelliteSelect').replaceChildren(fragment); $('satelliteSelect').value = selected;
}
function resetAlignment(clearConfirmation = false) {
  state.inZoneSince = null;
  if (clearConfirmation) $('mountConfirmed').checked = false;
}
function calculate() {
  const before = state.solution, priorDeclination = state.field?.declination;
  state.solution = null; state.field = null; state.modelError = '';
  if (state.location) {
    try { state.field = magneticField(state.location.lat,state.location.lon,state.location.alt); }
    catch (_) { state.modelError = 'WMM2025 unavailable: check your device date (valid 2025–2029).'; }
    if (state.satellite) state.solution = geoLookAngles(state.location.lat,state.location.lon,state.satellite.longitude,state.location.alt);
  }
  const after = state.solution;
  if (!before || !after || Math.abs(before.elevation-after.elevation)>0.1 || (Number.isFinite(before.azimuth) && Number.isFinite(after.azimuth) && Math.abs(angleError(before.azimuth,after.azimuth))>0.1) || (Number.isFinite(priorDeclination) && Number.isFinite(state.field?.declination) && Math.abs(priorDeclination-state.field.declination)>0.1)) resetAlignment();
  render();
}
function selectSatellite() {
  const id = $('satelliteSelect').value;
  $('customSatellite').hidden = id !== 'custom';
  state.satellite = satellites.find(s => s.id === id) || null;
  setText('satelliteInfo',state.satellite ? `${state.satellite.name} at ${slot(state.satellite.longitude)}. ${state.satellite.custom ? 'User-entered position.' : 'Nominal slot, not live tracking.'} Confirm this is your assigned satellite and current position.` : 'Nominal GEO slots, not live tracking. Confirm the assigned orbital position with your provider.');
  resetAlignment(true); calculate();
}
$('satelliteSelect').addEventListener('change', selectSatellite);
$('addSatellite').addEventListener('click', () => {
  const longitude = numberIn($('customLongitude').value,0,180);
  if (longitude === null) { setText('customStatus','Enter a longitude from 0° to 180° and choose E or W.'); return; }
  const sat = { id: `custom-${satellites.length}`, name: $('customName').value.trim().slice(0,60) || 'Custom GEO satellite', longitude: longitude * Number($('customHemisphere').value), custom: true };
  satellites.push(sat); populateSatellites(); $('satelliteSelect').value = sat.id; setText('customStatus',''); selectSatellite();
});

function clearGPS() {
  ++state.geoRun;
  if (state.geoID !== null && navigator.geolocation) navigator.geolocation.clearWatch(state.geoID);
  state.geoID = null;
}
function startGPS() {
  clearGPS(); state.location = null; state.gpsMessage = 'Requesting precise location…'; resetAlignment(true); calculate();
  if (!window.isSecureContext || !navigator.geolocation) { state.gpsMessage = 'GPS unavailable. Use HTTPS or enter coordinates manually.'; render(); return; }
  const token = state.geoRun;
  try {
    state.geoID = navigator.geolocation.watchPosition(position => {
      if (token !== state.geoRun) return;
      const c = position.coords, lat = numberIn(c.latitude,-90,90), lon = numberIn(c.longitude,-180,180);
      if (lat === null || lon === null || !Number.isFinite(position.timestamp) || position.timestamp > Date.now()+60000) { state.gpsMessage = 'Invalid location reading; retry GPS.'; state.location = null; calculate(); return; }
      const alt = Number.isFinite(c.altitude) ? numberIn(c.altitude/1000,-1,100) : null;
      state.location = { lat, lon, alt: alt ?? 0, altMeasured: alt !== null, source: 'GPS', accuracy: numberIn(c.accuracy,0,1000000), at: position.timestamp };
      state.gpsMessage = ''; populateSatellites(); calculate();
    }, error => {
      if (token !== state.geoRun) return;
      state.gpsMessage = ({ 1: 'Location permission denied. Allow precise location or enter coordinates manually.', 2: 'Location unavailable. Move outdoors and retry GPS, or enter coordinates.', 3: 'GPS timed out. Retry outdoors, or enter coordinates manually.' })[error.code] || 'GPS failed. Retry or enter coordinates manually.';
      state.location = null; calculate();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  } catch (_) { state.gpsMessage = 'GPS access was blocked. Enter coordinates manually.'; }
  render();
}
$('useGPS').addEventListener('click', startGPS);
$('locationForm').addEventListener('submit', e => {
  e.preventDefault();
  const lat = numberIn($('latitude').value,0,90), lon = numberIn($('longitude').value,0,180);
  if (lat === null || lon === null) { setText('locationError','Enter a valid latitude and longitude.'); return; }
  clearGPS(); state.gpsMessage = ''; setText('locationError','');
  state.location = { lat: lat*Number($('latitudeHemisphere').value), lon: lon*Number($('longitudeHemisphere').value), alt: 0, altMeasured: false, source: 'Manual', accuracy: null, at: Date.now() };
  resetAlignment(true); populateSatellites(); calculate();
});
function pruneSamples(now) {
  state.headings = state.headings.filter(s => now-s.at <= 1300);
  state.tilts = state.tilts.filter(s => now-s.at <= 1300);
}
function onOrientation(event) {
  if (!state.running || document.hidden) return;
  const now = Date.now(), reading = phoneReading(event);
  if (!state.phone) state.phone = { heading: null, accuracy: null, tilt: null, flat: false, usableTilt: false, source: '' };
  if (reading.tilt !== null) {
    Object.assign(state.phone, { tilt: reading.tilt, flat: reading.flat, usableTilt: reading.usableTilt });
    state.tiltAt = now; state.tilts.push({ at: now, value: reading.tilt });
  }
  if (reading.heading !== null) {
    Object.assign(state.phone, { heading: reading.heading, accuracy: reading.accuracy, source: reading.source });
    state.headingAt = now; state.headings.push({ at: now, value: reading.heading });
  } else if ('webkitCompassHeading' in event || event.absolute === true) {
    state.phone.heading = null; state.phone.accuracy = null; state.headingAt = 0; state.headings = []; resetAlignment();
  }
  pruneSamples(now);
}
async function releaseWake() {
  const wake = state.wake; state.wake = null;
  try { if (wake && !wake.released) await wake.release(); } catch (_) { /* No effect on sensor readings. */ }
}
async function acquireWake() {
  if (!state.running || !$('keepAwake').checked || document.hidden) return;
  if (!navigator.wakeLock) { setText('wakeStatus','Screen wake lock is not supported in this browser.'); return; }
  const token = state.run;
  try {
    const wake = await navigator.wakeLock.request('screen');
    if (token !== state.run || !state.running || !$('keepAwake').checked) { await wake.release(); return; }
    await releaseWake(); state.wake = wake; setText('wakeStatus','Keeping the screen awake.');
    wake.addEventListener('release', () => { if (state.wake === wake) { state.wake = null; setText('wakeStatus','Screen wake lock released by the browser.'); } });
  } catch (_) { setText('wakeStatus','Screen wake lock unavailable. Check your auto-lock setting.'); }
}
function stopSensors(message = 'Sensors stopped. Calculated targets remain available.') {
  ++state.run; state.running = false; state.starting = false;
  window.removeEventListener('deviceorientation',onOrientation);
  window.removeEventListener('deviceorientationabsolute',onOrientation);
  clearGPS(); state.phone = null; state.headingAt = 0; state.tiltAt = 0; state.headings = []; state.tilts = [];
  state.motionMessage = message; resetAlignment(); releaseWake(); render();
}
function startSensors() {
  stopSensors('Starting sensors…');
  if (!window.isSecureContext) { state.motionMessage = 'Sensors require HTTPS. Manual pointing calculations still work.'; render(); return; }
  state.running = true; state.starting = true; state.motionMessage = 'Waiting for motion/orientation permission…';
  const token = state.run;
  // This request must happen synchronously inside the tap, before awaiting GPS or wake lock.
  let permission;
  try {
    permission = typeof window.DeviceOrientationEvent === 'undefined' ? Promise.resolve('unsupported') : typeof window.DeviceOrientationEvent.requestPermission === 'function' ? window.DeviceOrientationEvent.requestPermission(true) : Promise.resolve('granted');
  } catch (_) { permission = Promise.resolve('denied'); }
  if (!state.location || state.location.source !== 'Manual') startGPS();
  acquireWake();
  Promise.resolve(permission).then(result => {
    if (token !== state.run) return;
    state.starting = false;
    if (result !== 'granted') state.motionMessage = result === 'unsupported' ? 'This browser has no orientation API. Manual target calculations are available.' : 'Motion/orientation permission denied. Allow it in site settings, then tap Enable sensors again.';
    else {
      window.addEventListener('deviceorientation',onOrientation,{ passive: true });
      window.addEventListener('deviceorientationabsolute',onOrientation,{ passive: true });
      state.motionMessage = 'Waiting for phone sensors. If nothing arrives, check permissions or try Safari on iPhone / Chrome on Android.';
    }
    render();
  }).catch(() => { if (token === state.run) { state.starting = false; state.motionMessage = 'Motion access failed. Retry from the Enable sensors button.'; render(); } });
  render();
}
$('startSensors').addEventListener('click', startSensors);
$('stopSensors').addEventListener('click', () => stopSensors());
$('keepAwake').addEventListener('change', () => { if ($('keepAwake').checked) acquireWake(); else { releaseWake(); setText('wakeStatus',''); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && (state.running || state.geoID !== null)) stopSensors('Paused while the page was hidden. Tap Enable sensors to resume.'); });
window.addEventListener('pagehide', () => stopSensors());

function stableSamples(samples, circular, threshold) {
  if (samples.length < 4 || samples.at(-1).at-samples[0].at < 800) return false;
  const values = samples.map(s => s.value), mean = circular ? circularMean(values) : values.reduce((a,b)=>a+b,0)/values.length;
  return mean !== null && values.every(v => Math.abs(circular ? angleError(v,mean) : v-mean) <= threshold);
}
function render() {
  const now = Date.now(), m = mode(), needAz = m !== 'elevation', needEl = m !== 'azimuth', { azOffset, elOffset } = offsets();
  const tolerance = numberIn($('tolerance').value,1,20), loc = state.location, sol = state.solution, dec = state.field?.declination;
  const targetMag = Number.isFinite(sol?.azimuth) && Number.isFinite(dec) ? wrap(sol.azimuth-dec) : null;
  const headingFresh = state.running && now-state.headingAt <= 2000;
  const tiltFresh = state.running && now-state.tiltAt <= 2000;
  const positionOK = !!loc && (loc.source === 'Manual' || (Number.isFinite(loc.accuracy) && loc.accuracy <= 100 && now-loc.at <= 300000 && now-loc.at >= -60000));
  const fresh = state.running && !document.hidden && tiltFresh && (!needAz || headingFresh);
  const input = { mode: m, target: sol ? { azimuth: targetMag, elevation: sol.elevation } : null, reading: state.phone, tolerance, fresh, positionOK, mountOK: $('mountConfirmed').checked, fieldOK: state.field?.reliable === true, stable: false, azOffset, elOffset };
  let result = alignment(input);
  pruneSamples(now);
  if (result.state === 'near') {
    if (state.inZoneSince === null) state.inZoneSince = now;
    const stable = now-state.inZoneSince >= 900 && (!needAz || stableSamples(state.headings,true,Math.min(2,tolerance/2))) && (!needEl || stableSamples(state.tilts,false,Math.min(1,tolerance/2)));
    result = alignment({ ...input, stable });
  } else state.inZoneSince = null;
  $('instrument').dataset.state = result.state; setText('alignmentStatus',result.message);
  setText('targetTrue',formatAngle(sol?.azimuth)); setText('targetMagnetic',formatAngle(targetMag)); setText('targetElevation',formatAngle(sol?.elevation));
  if (loc) {
    setText('positionStatus',`${Math.abs(loc.lat).toFixed(5)}°${loc.lat<0?'S':'N'} / ${Math.abs(loc.lon).toFixed(5)}°${loc.lon<0?'W':'E'}`);
    setText('positionDetail',loc.source === 'Manual' ? 'Manual position. Verify it is still current. Sea-level altitude assumed.' : `GPS ${Number.isFinite(loc.accuracy)?`±${Math.round(loc.accuracy)} m`:'accuracy unknown'} · ${Math.max(0,Math.floor((now-loc.at)/1000))} s old. ${!positionOK?'A fresh fix within 100 m is required for green. Tap Use GPS.':loc.altMeasured?'GPS ellipsoid altitude used.':'Sea-level altitude assumed.'}`);
  } else { setText('positionStatus',state.gpsMessage || 'Location not set'); setText('positionDetail','Allow precise location, or enter coordinates manually.'); }
  const liveMag = headingFresh && Number.isFinite(state.phone?.heading) && azOffset !== null ? wrap(state.phone.heading+azOffset) : null;
  const liveTrue = Number.isFinite(liveMag) && Number.isFinite(dec) ? wrap(liveMag+dec) : null;
  const liveEl = tiltFresh && Number.isFinite(state.phone?.tilt) && elOffset !== null ? state.phone.tilt+elOffset : null;
  setText('liveMagnetic',formatAngle(liveMag)); setText('liveTrue',formatAngle(liveTrue)); setText('liveElevation',needEl?formatAngle(liveEl):'Not measured');
  const trueDial = $('northReference').value === 'true';
  setText('dialReference',trueDial?'True north':'Magnetic north');
  const targetDial = trueDial ? sol?.azimuth : targetMag, phoneDial = trueDial ? liveTrue : liveMag;
  for (const [id,angle] of [['targetNeedle',targetDial],['phoneNeedle',phoneDial]]) {
    $(id).setAttribute('visibility',Number.isFinite(angle)?'visible':'hidden');
    if (Number.isFinite(angle)) $(id).setAttribute('transform',`rotate(${angle} 140 140)`);
  }
  document.querySelector('.sp-dial').hidden = m === 'elevation';
  // SVG hidden support differs; explicit display keeps the two displays mutually exclusive.
  document.querySelector('.sp-dial').style.display = m === 'elevation' ? 'none' : '';
  $('tiltDisplay').hidden = m !== 'elevation'; $('dialLegend').hidden = m === 'elevation';
  setText('liveTiltLarge',formatAngle(liveEl)); $('tiltMarker').style.left = `${Math.max(0,Math.min(100,(liveEl??0)/90*100))}%`;
  const adjust = (error,positive,negative) => Number.isFinite(error) ? Math.abs(error)<0.15 ? 'Centered on target' : `${error>0?positive:negative} ${formatAngle(Math.abs(error))}` : 'Waiting for valid sensor alignment';
  setText('turnInstruction',needAz?adjust(result.azError,'Turn right','Turn left'):adjust(result.elError,'Raise','Lower'));
  setText('tiltInstruction',m==='azimuth'?`Elevation not measured. Set ${formatAngle(sol?.elevation)} using the antenna scale.`:m==='elevation'?'Azimuth is not verified in elevation mode.':adjust(result.elError,'Raise','Lower'));
  setText('modeWarning',m==='azimuth'?'AZIMUTH ONLY · elevation is not measured on a level base.':m==='elevation'?'ELEVATION ONLY · azimuth is not verified in this mode.':'BOTH AXES · the phone mount must follow the antenna beam.');
  let sensor = state.motionMessage || 'Sensors off. Nothing is simulated.';
  if (state.running && state.phone) {
    if (needAz && !headingFresh) sensor = 'No fresh north-referenced compass. Relative rotation cannot determine north.';
    else if (!tiltFresh) sensor = 'Tilt readings are stale. Resume motion/orientation access.';
    else sensor = `${state.phone.source || 'Tilt sensor'} · ${Number.isFinite(state.phone.accuracy) && state.phone.accuracy>=0?`reported accuracy ±${state.phone.accuracy.toFixed(1)}°`:'compass accuracy not reported / uncalibrated'} · ${state.phone.flat?'phone level':`top-edge tilt ${formatAngle(state.phone.tilt)}`}.`;
  }
  setText('sensorStatus',sensor);
  const note = state.modelError || (Number.isFinite(dec)?`WMM2025 declination ${Math.abs(dec).toFixed(2)}° ${dec>=0?'east':'west'}. ${state.field.reliable?'':'Weak horizontal magnetic field: azimuth green disabled. '}${sol && sol.elevation>0 && sol.elevation<5?'Low elevation: terrain and refraction may matter. ':''}Coordinates stay in this tab.`:'Your location is used only in this page. No location upload or account login is needed.');
  setText('solutionNote',note);
  $('startSensors').disabled = state.starting;
  setText('startSensors',state.starting?'Requesting access…':state.running?'Restart sensors':'Enable sensors');
  $('stopSensors').disabled = !state.running && state.geoID === null;
}
$('pointMode').addEventListener('change', () => {
  resetAlignment(true);
  setText('mountHelp',mode()==='azimuth'?'Lay the phone flat, screen up, with its physical top/camera edge pointing in the antenna’s direction. The phone must rotate with the antenna.':mode()==='elevation'?'Place the phone along a surface that tilts with the antenna. Enter the correct elevation offset below. The physical top edge should rise as the antenna rises.':'Use a fixed mount with the phone’s physical top edge along the beam direction, or enter known offsets. It must follow both azimuth and elevation. A level base cannot measure both.');
  render();
});
for (const id of ['azOffset','elOffset']) $(id).addEventListener('input',() => { resetAlignment(true); render(); });
for (const id of ['tolerance','northReference','mountConfirmed']) $(id).addEventListener('change',() => { resetAlignment(); render(); });
const otherRegions = ['workspaceNav','setupPanel','helpPanel'];
function fieldView(on) {
  state.fieldView = on; document.body.classList.toggle('sp-field-view',on);
  for (const id of otherRegions) $(id).inert = on;
  document.querySelector('.sp-intro').inert = on; document.querySelector('.sp-topbar').inert = on;
  $('fieldView').setAttribute('aria-pressed',String(on)); setText('fieldView',on?'Exit field view':'Field view');
  if (on) { $('instrument').setAttribute('role','dialog'); $('instrument').setAttribute('aria-modal','true'); }
  else { $('instrument').removeAttribute('role'); $('instrument').removeAttribute('aria-modal'); }
  $('fieldView').focus();
}
$('fieldView').addEventListener('click',() => fieldView(!state.fieldView));
document.addEventListener('keydown', e => {
  if (!state.fieldView) return;
  if (e.key === 'Escape') { e.preventDefault(); fieldView(false); }
  if (e.key === 'Tab') {
    const controls = [...$('instrument').querySelectorAll('button:not(:disabled),a[href],input,select')].filter(el=>el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
populateSatellites(); render();
setInterval(render,150);
