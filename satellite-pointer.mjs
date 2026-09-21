/* Native-style compass view. Raw measurements, not animation, decide alignment.
 * Browser animation: https://developer.mozilla.org/docs/Web/API/Window/requestAnimationFrame
 * Physical phone top edge (+Y) is the heading axis, independent of UI rotation.
 */
import { wrap, angleError, numberIn, geoLookAngles, magneticField, phoneReading, alignment } from './satellite-math.mjs?v=20260921-1';
import { smoothAngle, cardinal, dms, altitudeLabel, bearingPoint, deviationArc, stableSamples, lookupPlace } from './compass-core.mjs?v=20260921-4';

const PRESETS = [
  ['SES-1',-101],['SES-2',-87],['SES-3',-103],['SES-4',-22],['SES-5',5],['SES-6',-40.5],
  ['SES-9',108.2],['SES-10',-67],['SES-11',-105],['SES-12',95],['SES-14',-47.5],['SES-15',-129],
  ['SES-18',-103],['SES-19',-135],['SES-20',-103],['SES-21',-131],['SES-22',-139],
  ['Intelsat 22',72],['Intelsat 35e',-34.5],['Intelsat 37e',-18],['Intelsat 39',62],['Intelsat 40e',-91],
  ['Galaxy 19',-97],['GovSat-1',21.5],['NSS-12',57],['EUTELSAT 10B',10]
];
const satellites = PRESETS.map(([name, longitude], i) => ({ id: `preset-${i}`, name, longitude }));
// Resolve DOM references once. No layout reads or rebuilding the dial in the frame loop.
const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(el => [el.id, el]));
const text = (id, value) => { if (ui[id].textContent !== value) ui[id].textContent = value; };
const attr = (el, key, value) => { if (el.getAttribute(key) !== String(value)) el.setAttribute(key, String(value)); };
const deg = n => Number.isFinite(n) ? `${n.toFixed(1)}°` : '—';
const slot = n => `${Math.abs(n)}°${n < 0 ? 'W' : 'E'}`;
const now = () => performance.now();
const state = {
  running: false, starting: false, generation: 0, geoID: null, raf: null, lastFrame: null,
  position: null, field: null, target: null, satellite: null, reference: 'magnetic', unit: 'ft',
  reading: null, beta: null, gamma: null, headingAt: -Infinity, tiltAt: -Infinity, samples: [],
  shownHeading: null, bubbleX: 0, bubbleY: 0, heldMagnetic: null, alignedSince: null,
  gpsMessage: '', motionMessage: '', modelError: '', wake: null, focus: false,
  nextStatus: 0, nextAccessible: 0, statsAt: 0, frameCount: 0, eventCount: 0,
  place: '', placeCell: '', placeAttempt: -Infinity, placeError: '', placeAbort: null, placeToken: 0,
  dirty: true, sensorSource: '', lastGeoLabelCell: '', sourceDate: new Date().toISOString().slice(0,10)
};
let settings = { mode: 'azimuth', tolerance: 10, azOffset: 0, elOffset: 0, mountOK: false };
const labels = [];
const NS = 'http://www.w3.org/2000/svg';
function buildDial() {
  let fine = '', major = '';
  for (let a = 0; a < 360; a += 2) {
    const long = a % 30 === 0, [x1,y1] = bearingPoint(a, long ? 124 : 127), [x2,y2] = bearingPoint(a,146);
    const path = `M${x1.toFixed(3)} ${y1.toFixed(3)}L${x2.toFixed(3)} ${y2.toFixed(3)}`;
    if (long) major += path; else fine += path;
  }
  ui.ticksFine.setAttribute('d',fine); ui.ticksMajor.setAttribute('d',major);
  for (let a = 0; a < 360; a += 30) addLabel(a,181,String(a),'dial-number');
  ['N','E','S','W'].forEach((value,i) => addLabel(i*90,100,value,'dial-cardinal'));
  function addLabel(a,r,value,cls) {
    const [x,y] = bearingPoint(a,r), label = document.createElementNS(NS,'text');
    label.setAttribute('x',x); label.setAttribute('y',y); label.setAttribute('class',cls); label.textContent=value;
    ui.dialLabels.append(label); labels.push({ element:label,x,y });
  }
}
function populateSatellites() {
  const group = document.createElement('optgroup'); group.label='Nominal GEO slots';
  for (const sat of satellites) group.append(new Option(`${sat.name} · ${slot(sat.longitude)}`,sat.id));
  ui.satelliteSelect.replaceChildren(new Option('Compass only / choose satellite',''),group,new Option('＋ Custom satellite','custom'));
}
function resetAlignment(clearMount = false) {
  state.alignedSince=null;
  if (clearMount) { ui.mountConfirmed.checked=false; settings.mountOK=false; }
  document.body.classList.remove('is-aligned'); state.dirty=true;
}
function calculate() {
  state.field=null; state.target=null; state.modelError='';
  const p=state.position;
  if (p) {
    try { state.field=magneticField(p.lat,p.lon,(p.altitude??0)/1000); }
    catch (_) { state.modelError='WMM2025 unavailable. Check device date (2025–2029).'; }
    if (state.satellite) state.target=geoLookAngles(p.lat,p.lon,state.satellite.longitude,(p.altitude??0)/1000);
  }
  resetAlignment(); state.sourceDate=new Date().toISOString().slice(0,10); refreshPosition(); requestFrame();
}
function selectSatellite() {
  ui.customSatellite.hidden=ui.satelliteSelect.value!=='custom';
  state.satellite=satellites.find(s=>s.id===ui.satelliteSelect.value)||null;
  state.heldMagnetic=null; resetAlignment(true); calculate(); renderStatus(now());
}
ui.satelliteSelect.addEventListener('change',selectSatellite);
ui.customSatellite.addEventListener('submit',e=>{
  e.preventDefault(); const n=numberIn(ui.customLongitude.value,0,180); if(n===null)return;
  const sat={id:`custom-${satellites.length}`,name:ui.customName.value.trim().slice(0,60)||'Custom GEO satellite',longitude:n*Number(ui.customHemisphere.value)};
  satellites.push(sat); populateSatellites(); ui.satelliteSelect.value=sat.id; selectSatellite();
});

function locationUsable() {
  const p=state.position;
  return !!p && (p.source==='Manual' || (Number.isFinite(p.accuracy)&&p.accuracy<=100&&Date.now()-p.at<=300000&&Date.now()-p.at>=-1000));
}
function stopGPS() {
  if (state.geoID!==null) navigator.geolocation?.clearWatch(state.geoID);
  state.geoID=null;
}
function startGPS(token) {
  state.gpsMessage='Finding your location…';
  if (!navigator.geolocation) { state.gpsMessage='GPS unavailable. Use manual coordinates in Settings.'; return; }
  try {
    state.geoID=navigator.geolocation.watchPosition(result=>{
      if(token!==state.generation||!state.running)return;
      const c=result.coords,lat=numberIn(c.latitude,-90,90),lon=numberIn(c.longitude,-180,180);
      if(lat===null||lon===null||!Number.isFinite(result.timestamp)||Math.abs(Date.now()-result.timestamp)>300000) {
        state.gpsMessage='Invalid or old GPS fix. Retry outdoors.'; state.position=null; calculate(); return;
      }
      const old=state.position;
      state.position={lat,lon,altitude:numberIn(c.altitude,-1000,100000),accuracy:numberIn(c.accuracy,0,1000000),altitudeAccuracy:numberIn(c.altitudeAccuracy,0,1000000),at:result.timestamp,source:'GPS'};
      state.gpsMessage='';
      // A new fix normally only changes the displayed coordinates. Do not reset the
      // alignment dwell or re-run WMM on every watch callback when stationary.
      if(!old||old.source!=='GPS'||Math.abs(old.lat-lat)>0.00005||Math.abs(old.lon-lon)>0.00005||Math.abs((old.altitude??0)-(state.position.altitude??0))>20||state.sourceDate!==new Date().toISOString().slice(0,10)) calculate();
      else { state.dirty=true; refreshPosition(); }
      const cell=`${lat.toFixed(2)},${lon.toFixed(2)}`;
      if(cell!==state.lastGeoLabelCell) {
        for(const option of ui.satelliteSelect.options) {
          const sat=satellites.find(s=>s.id===option.value); if(!sat)continue;
          option.textContent=`${sat.name} · ${slot(sat.longitude)}${geoLookAngles(lat,lon,sat.longitude).elevation<=0?' · below horizon':''}`;
        }
        state.lastGeoLabelCell=cell;
      }
      if(cell!==state.placeCell) { state.place=''; state.placeError=''; }
      maybeLookupPlace(); requestFrame();
    },error=>{
      if(token!==state.generation||!state.running)return;
      state.gpsMessage=({1:'GPS permission denied. Allow precise location or use manual coordinates.',2:'GPS unavailable. Move outdoors or use manual coordinates.',3:'GPS timed out. Retry outdoors.'})[error.code]||'GPS unavailable.';
      state.position=null; abortPlace(); state.place=''; calculate();
    },{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  } catch (_) { state.gpsMessage='GPS blocked. Use HTTPS or manual coordinates.'; }
}
function onOrientation(event) {
  if(!state.running||document.hidden)return;
  const t=now(), r=phoneReading(event);
  // Do not let relative events replace the absolute compass or duplicate samples.
  const hasHeading=r.heading!==null;
  if(hasHeading && state.sensorSource==='Apple magnetic compass' && r.source!=='Apple magnetic compass')return;
  if(!state.reading)state.reading={heading:null,accuracy:null,tilt:null,flat:false,usableTilt:false};
  if(r.tilt!==null) {
    state.tiltAt=t; state.beta=numberIn(event.beta,-180,180); state.gamma=numberIn(event.gamma,-90,90);
    Object.assign(state.reading,{tilt:r.tilt,flat:r.flat,usableTilt:r.usableTilt});
  }
  if(hasHeading) {
    Object.assign(state.reading,{heading:r.heading,accuracy:r.accuracy}); state.headingAt=t; state.sensorSource=r.source; state.eventCount++;
    state.samples.push({heading:r.heading,tilt:r.tilt,at:t});
    if(state.samples.length>256)state.samples.splice(0,state.samples.length-256);
  } else if('webkitCompassHeading' in event || event.absolute===true) {
    state.reading.heading=null; state.reading.accuracy=null; state.headingAt=-Infinity; state.samples.length=0; resetAlignment();
  }
  requestFrame();
}
async function releaseWake() {
  const wake=state.wake; state.wake=null;
  try { if(wake&&!wake.released)await wake.release(); } catch (_) { /* Already released. */ }
}
async function keepAwake() {
  if(!state.running||!ui.keepAwake.checked||document.hidden||!navigator.wakeLock)return;
  const token=state.generation;
  try {
    const wake=await navigator.wakeLock.request('screen');
    if(token!==state.generation||!state.running||!ui.keepAwake.checked){await wake.release();return;}
    await releaseWake(); state.wake=wake; text('wakeStatus','Screen kept awake while sensors run.');
    wake.addEventListener('release',()=>{if(state.wake===wake){state.wake=null;text('wakeStatus','Screen wake lock released.');}});
  }catch(_){text('wakeStatus','Wake lock unavailable. Check your screen auto-lock setting.');}
}
function stopSensors(message='Sensors off. Enable GPS to resume.') {
  state.generation++; state.running=false; state.starting=false; stopGPS(); abortPlace(); releaseWake();
  window.removeEventListener('deviceorientation',onOrientation); window.removeEventListener('deviceorientationabsolute',onOrientation);
  if(state.raf!==null)cancelAnimationFrame(state.raf); state.raf=null; state.lastFrame=null;
  state.reading=null; state.headingAt=-Infinity; state.tiltAt=-Infinity; state.shownHeading=null; state.samples.length=0; state.sensorSource='';
  state.motionMessage=message; resetAlignment(); draw(null,0,now()); renderStatus(now());
}
function startSensors(useGPS=true) {
  stopSensors('Requesting sensor access…');
  if(!window.isSecureContext){state.motionMessage='Sensor access needs HTTPS.';renderStatus(now());return;}
  state.running=true; state.starting=true; state.gpsMessage=''; const token=state.generation;
  state.frameCount=0;state.eventCount=0;state.statsAt=now();
  // Called directly from the tap, before any await. iOS requires user activation.
  let permission;
  try {
    permission=typeof window.DeviceOrientationEvent==='undefined'?Promise.resolve('unsupported'):typeof window.DeviceOrientationEvent.requestPermission==='function'?window.DeviceOrientationEvent.requestPermission(true):Promise.resolve('granted');
  }catch(_){permission=Promise.resolve('denied');}
  if(useGPS){state.position=null;state.place='';calculate();startGPS(token);}
  keepAwake();
  Promise.resolve(permission).then(value=>{
    if(token!==state.generation||!state.running)return;
    state.starting=false;
    if(value==='granted') {
      window.addEventListener('deviceorientation',onOrientation,{passive:true}); window.addEventListener('deviceorientationabsolute',onOrientation,{passive:true});
      state.motionMessage='Waiting for compass. Allow motion/orientation access.';
    }else state.motionMessage=value==='unsupported'?'This browser has no compass sensor API. Targets still calculate.':'Compass permission denied. Allow motion/orientation in site settings, then retry.';
    state.dirty=true; requestFrame();
  }).catch(()=>{if(token===state.generation){state.starting=false;state.motionMessage='Motion access failed. Restart sensors.';state.dirty=true;requestFrame();}});
  requestFrame(); renderStatus(now());
}
ui.gpsToggle.addEventListener('click',()=>{if(state.running)stopSensors();else startSensors(state.position?.source!=='Manual');});
ui.retrySensors.addEventListener('click',()=>startSensors(state.position?.source!=='Manual'));
ui.keepAwake.addEventListener('change',()=>{if(ui.keepAwake.checked)keepAwake();else{releaseWake();text('wakeStatus','');}});
ui.manualPosition.addEventListener('submit',e=>{
  e.preventDefault();const lat=numberIn(ui.latitude.value,-90,90),lon=numberIn(ui.longitude.value,-180,180);if(lat===null||lon===null)return;
  stopSensors(); state.position={lat,lon,altitude:null,accuracy:null,at:Date.now(),source:'Manual'}; state.place=''; state.placeError='';
  resetAlignment(true); calculate(); startSensors(false);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSensors('Paused while hidden. Enable GPS to resume.');});
window.addEventListener('pagehide',()=>stopSensors('Paused. Enable GPS to resume.'));

function readings(t) {
  const r=state.reading, freshHeading=state.running&&Number.isFinite(r?.heading)&&t-state.headingAt<=2000;
  const freshTilt=state.running&&Number.isFinite(r?.tilt)&&t-state.tiltAt<=2000;
  const magnetic=freshHeading&&settings.azOffset!==null?wrap(r.heading+settings.azOffset):null;
  const dec=state.field?.declination;
  return {magnetic,trueHeading:Number.isFinite(magnetic)&&Number.isFinite(dec)?wrap(magnetic+dec):null,freshHeading,freshTilt};
}
function targetMagnetic() {
  return Number.isFinite(state.target?.azimuth)&&Number.isFinite(state.field?.declination)?wrap(state.target.azimuth-state.field.declination):null;
}
function alignmentResult(t,live) {
  if(!state.satellite)return {state:'idle',message:'',azError:null,elError:null};
  const base={mode:settings.mode,target:state.target?{azimuth:targetMagnetic(),elevation:state.target.elevation}:null,reading:state.reading,tolerance:settings.tolerance,fresh:live.freshHeading&&live.freshTilt&&!document.hidden,positionOK:locationUsable(),mountOK:settings.mountOK,fieldOK:state.field?.reliable===true,stable:false,azOffset:settings.azOffset,elOffset:settings.elOffset};
  let result=alignment(base);
  if(result.state==='near') {
    if(state.alignedSince===null)state.alignedSince=t;
    if(t-state.alignedSince>=900&&stableSamples(state.samples,t,settings.tolerance,settings.mode==='both'))result=alignment({...base,stable:true});
  } else state.alignedSince=null;
  return result;
}
function draw(heading,dt,t) {
  const live=readings(t), result=alignmentResult(t,live);
  const aligned=result.state==='aligned';
  document.body.classList.toggle('is-aligned',aligned);
  document.body.classList.toggle('is-stale',!Number.isFinite(heading));
  if(ui.instrument.dataset.state!==result.state){ui.instrument.dataset.state=result.state;state.dirty=true;}
  if(Number.isFinite(heading)) {
    state.shownHeading=smoothAngle(state.shownHeading,heading,dt);
    const a=state.shownHeading;
    ui.rose.style.transform=`rotate(${-a}deg)`;
    // Labels orbit with the rose but stay upright, as on the native compass.
    for(const label of labels)label.element.setAttribute('transform',`rotate(${a} ${label.x} ${label.y})`);
    const rounded=Math.round(wrap(a))%360;
    text('headingValue',`${rounded}°`);text('headingCardinal',cardinal(a));
    if(t>=state.nextAccessible){text('bearingAccessible',`${rounded} degrees ${cardinal(a)}, ${state.reference} north`);state.nextAccessible=t+1000;}
  }else{state.shownHeading=null;text('headingValue','—°');text('headingCardinal','');text('bearingAccessible','Heading unavailable');}
  ui.compassFace.disabled=!live.freshHeading;
  const markerMag=state.satellite?targetMagnetic():state.heldMagnetic;
  const marker=state.reference==='true'?(Number.isFinite(markerMag)&&Number.isFinite(state.field?.declination)?wrap(markerMag+state.field.declination):null):markerMag;
  const visible=Number.isFinite(marker)&&Number.isFinite(state.shownHeading);
  attr(ui.targetMarker,'visibility',visible?'visible':'hidden');
  if(visible)ui.targetMarker.setAttribute('transform',`rotate(${angleError(marker,state.shownHeading)} 200 200)`);
  const arc=!state.satellite&&state.heldMagnetic!==null&&visible?deviationArc(angleError(marker,state.shownHeading)):'';
  attr(ui.bearingArc,'d',arc);
  const ratio=-Math.expm1(-Math.max(0,Math.min(dt,100))/65);
  const bx=live.freshTilt?Math.max(-30,Math.min(30,(state.gamma??0)*1.2)):0;
  const by=live.freshTilt?Math.max(-30,Math.min(30,(state.beta??0)*1.2)):0;
  state.bubbleX+=(bx-state.bubbleX)*ratio;state.bubbleY+=(by-state.bubbleY)*ratio;
  ui.levelBubble.setAttribute('transform',`translate(${state.bubbleX.toFixed(2)} ${state.bubbleY.toFixed(2)})`);
  if(state.dirty||t>=state.nextStatus){renderStatus(t,live,result);state.dirty=false;state.nextStatus=t+250;}
}
function requestFrame() {
  if(state.raf===null&&!document.hidden)state.raf=requestAnimationFrame(frame);
}
function frame(t) {
  state.raf=null;
  if(document.hidden)return;
  const dt=state.lastFrame===null?16.67:Math.max(0,t-state.lastFrame);state.lastFrame=t;
  const live=readings(t), heading=state.reference==='true'?live.trueHeading:live.magnetic;
  draw(heading,dt,t); state.frameCount++;
  if(state.running&&t-state.statsAt>=1000) {
    const seconds=(t-state.statsAt)/1000;
    text('frameStats',`Animation ${Math.round(state.frameCount/seconds)} fps · compass ${Math.round(state.eventCount/seconds)} samples/s. Browser/device controlled; animation is not extra sensor data.`);
    state.statsAt=t;state.frameCount=0;state.eventCount=0;
  }
  if(state.running)requestFrame();else state.lastFrame=null;
}
function renderStatus(t,live=readings(t),result=alignmentResult(t,live)) {
  attr(ui.gpsToggle,'aria-checked',state.running);attr(ui.gpsToggle,'aria-label',state.running?'Stop GPS and compass':'Enable GPS and compass');
  text('gpsSummary',state.starting?'Allow sensor access…':state.running?(state.gpsMessage|| (state.position?.source==='Manual'?'Manual position · compass enabled':state.position?'Location acquired':'Finding GPS…')):'GPS + compass off');
  attr(ui.magneticReference,'aria-pressed',state.reference==='magnetic');attr(ui.trueReference,'aria-pressed',state.reference==='true');
  text('referenceLabel',state.reference==='true'?'TRUE NORTH':'MAGNETIC NORTH');
  let message=state.running?'':state.motionMessage||'Enable GPS to begin';
  if(state.running&&!live.freshHeading)message=state.motionMessage||'Waiting for fresh compass data';
  else if(state.running&&state.reference==='true'&&!Number.isFinite(live.trueHeading))message='True north needs a current position and magnetic correction';
  else if(state.satellite)message=result.message;
  else if(state.heldMagnetic!==null)message=`Bearing held · ${deg(Math.abs(angleError(state.heldMagnetic,live.magnetic)))} off course`;
  else if(state.running&&!state.reading?.flat)message='Hold the phone flat to align the crosshairs';
  else if(state.running)message='';
  if(state.satellite&&result.message==='Confirm phone placement below')message='Confirm the phone alignment below to enable green';
  text('alignmentStatus',message);
  document.body.classList.toggle('has-target',!!state.satellite);
  ui.targetStrip.hidden=!state.satellite;ui.signalNote.hidden=!state.satellite;ui.mountCheck.hidden=!state.satellite;
  text('mountLabel',settings.mode==='both'?'I verified the fixed mount follows both axes and the beam offsets.':'Phone top edge is aligned with the antenna on its rotating base.');
  const target=state.reference==='true'?state.target?.azimuth:targetMagnetic();
  text('targetBearing',deg(target));text('targetElevation',deg(state.target?.elevation));
  const delta=Number.isFinite(targetMagnetic())&&Number.isFinite(live.magnetic)?angleError(targetMagnetic(),live.magnetic):null;
  text('turnInstruction',delta===null?'—':Math.abs(delta)<0.15?'Centered':`${delta>0?'→':'←'} ${deg(Math.abs(delta))}`);
  text('holdHint',state.satellite?`${state.satellite.name} · dot is the target`:state.heldMagnetic!==null?'Bearing held · tap the dial to release':'Tap the dial to hold a bearing');
  attr(ui.compassFace,'aria-pressed',state.heldMagnetic!==null&&!state.satellite);
  attr(ui.compassFace,'aria-label',state.satellite?'Compass dial with satellite target':state.heldMagnetic!==null?'Release held bearing':'Hold this bearing');
  text('modeNote',state.satellite?(settings.mode==='both'?'Both axes: phone mount and offsets must follow the beam.':'Azimuth only. Set dish elevation separately; phone flat, top edge with antenna.'):'Keep the phone flat. Its top edge is your pointing direction.');
  const r=state.reading;
  text('sensorStatus',live.freshHeading?`${state.sensorSource}. ${Number.isFinite(r.accuracy)&&r.accuracy>=0?`Reported uncertainty ±${r.accuracy.toFixed(1)}°.`:'Uncertainty unknown; no green satellite alignment.'} ${live.freshTilt?`Phone tilt ${deg(r.tilt)}.`:'Tilt unavailable.'}`:state.motionMessage||'Sensors off.');
  text('modelStatus',state.modelError||(state.field?`WMM2025: ${Math.abs(state.field.declination).toFixed(2)}° ${state.field.declination>=0?'east':'west'}. ${state.field.reliable?'':'Weak horizontal field; no green alignment.'}`:'True north uses on-device WMM2025; position required.'));
  refreshPosition();
}
function refreshPosition() {
  const p=state.position;
  ui.coordinates.disabled=!p;
  text('coordinates',p?`${dms(p.lat)}  ${dms(p.lon,false)}`:'Coordinates unavailable');
  text('altitude',altitudeLabel(p?.altitude,state.unit));
  text('positionDetail',p?(p.source==='Manual'?'Manual position. Verify it is current; altitude unavailable.':`GPS ±${Number.isFinite(p.accuracy)?Math.round(p.accuracy):'?'} m · fix ${Math.max(0,Math.round((Date.now()-p.at)/1000))} s old. Altitude uncertainty ${Number.isFinite(p.altitudeAccuracy)?`±${Math.round(p.altitudeAccuracy)} m`:'unavailable'}. ${locationUsable()?'':'Fresh ≤100 m horizontal accuracy is required for green.'}`):state.gpsMessage||'No location received.');
  text('placeName',state.place||state.placeError||(p?.source==='Manual'?'Manual position':state.placeAbort?'Looking up place…':'Show place name'));
  attr(ui.placeName,'data-empty',!state.place);
}
function changeReference(reference) {state.reference=reference;state.shownHeading=null;state.dirty=true;requestFrame();renderStatus(now());}
ui.magneticReference.addEventListener('click',()=>changeReference('magnetic'));ui.trueReference.addEventListener('click',()=>changeReference('true'));
ui.altitude.addEventListener('click',()=>{state.unit=state.unit==='ft'?'m':'ft';refreshPosition();});
ui.coordinates.addEventListener('click',()=>{
  const p=state.position;if(p)window.open(`https://maps.apple.com/?ll=${encodeURIComponent(`${p.lat},${p.lon}`)}`,'_blank','noopener,noreferrer');
});
ui.compassFace.addEventListener('click',()=>{
  const r=readings(now());if(state.satellite||!r.freshHeading)return;
  state.heldMagnetic=state.heldMagnetic===null?r.magnetic:null;state.dirty=true;requestFrame();
});
function updateSettings(clearMount) {
  settings={mode:ui.pointMode.value,tolerance:numberIn(ui.tolerance.value,1,20),azOffset:numberIn(ui.azOffset.value,-180,180),elOffset:numberIn(ui.elOffset.value,-90,90),mountOK:ui.mountConfirmed.checked};
  resetAlignment(clearMount);state.shownHeading=null;requestFrame();renderStatus(now());
}
ui.pointMode.addEventListener('change',()=>updateSettings(true));
for(const id of ['azOffset','elOffset'])ui[id].addEventListener('input',()=>updateSettings(true));
for(const id of ['tolerance','mountConfirmed'])ui[id].addEventListener('change',()=>updateSettings(false));

// Place lookup is separate from location permission and never part of animation.
function abortPlace() {state.placeToken++;if(state.placeAbort)state.placeAbort.abort();state.placeAbort=null;}
async function maybeLookupPlace(force=false) {
  const p=state.position;
  if(!ui.placeConsent.checked||!state.running||document.hidden||p?.source!=='GPS'||!locationUsable()||Date.now()-p.at>60000||state.placeAbort)return;
  const cell=`${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
  if((!force&&cell===state.placeCell&&state.place)||now()-state.placeAttempt<60000)return;
  state.placeAttempt=now();state.placeError='';state.placeCell=cell;
  const token=++state.placeToken,controller=new AbortController();state.placeAbort=controller;refreshPosition();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try {
    const place=await lookupPlace(p,controller.signal);
    const current=state.position;
    if(token===state.placeToken&&ui.placeConsent.checked&&state.running&&current?.source==='GPS'&&`${current.lat.toFixed(2)},${current.lon.toFixed(2)}`===cell)state.place=place;
  }catch(_){if(token===state.placeToken)state.placeError='Place unavailable · tap to retry';}
  finally{clearTimeout(timeout);if(token===state.placeToken){state.placeAbort=null;refreshPosition();}}
}
ui.placeName.addEventListener('click',()=>{
  if(ui.placeConsent.checked){maybeLookupPlace(true);return;}
  ui.placeDialog.showModal();
});
ui.denyPlace.addEventListener('click',()=>ui.placeDialog.close());
ui.allowPlace.addEventListener('click',()=>{ui.placeConsent.checked=true;ui.placeDialog.close();maybeLookupPlace();});
ui.placeConsent.addEventListener('change',()=>{if(ui.placeConsent.checked)maybeLookupPlace();else{abortPlace();state.place='';state.placeError='';state.placeAttempt=-Infinity;refreshPosition();}});
const focusRegions=[document.querySelector('.topbar'),ui.controls,ui.settings];
function focusView(on) {
  state.focus=on;document.body.classList.toggle('focus-mode',on);
  focusRegions.forEach(el=>{el.inert=on;});
  attr(ui.fieldView,'aria-pressed',on);text('fieldView',on?'Done':'Expand ⛶');
  if(on){attr(ui.instrument,'role','dialog');attr(ui.instrument,'aria-modal','true');}else{ui.instrument.removeAttribute('role');ui.instrument.removeAttribute('aria-modal');}
  ui.fieldView.focus({preventScroll:true});
}
ui.fieldView.addEventListener('click',()=>focusView(!state.focus));
document.addEventListener('keydown',event=>{
  if(!state.focus||ui.placeDialog.open)return;
  if(event.key==='Escape'){event.preventDefault();focusView(false);}
  if(event.key==='Tab') {
    const controls=[...ui.instrument.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
buildDial();populateSatellites();renderStatus(now());requestFrame();
