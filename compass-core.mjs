/* Rendering utilities. Pointing decisions always use unsmoothed measurements. */
import { wrap, angleError } from './satellite-math.mjs?v=20260921-1';
export function smoothAngle(current, target, dt, tau = 55) {
  if (!Number.isFinite(target)) return current;
  if (!Number.isFinite(current)) return target;
  return current + angleError(target, current) * -Math.expm1(-Math.max(0, Math.min(dt, 100)) / tau);
}
export function cardinal(angle) {
  return Number.isFinite(angle) ? ['N','NE','E','SE','S','SW','W','NW'][Math.round(wrap(angle)/45)%8] : '';
}
export function dms(value, latitude = true) {
  if (!Number.isFinite(value) || Math.abs(value) > (latitude ? 90 : 180)) return '—';
  const seconds = Math.round(Math.abs(value)*3600);
  return `${Math.floor(seconds/3600)}°${Math.floor(seconds%3600/60)}′${seconds%60}″ ${latitude ? (value<0?'S':'N') : (value<0?'W':'E')}`;
}
export function altitudeLabel(meters, unit = 'ft') {
  if (!Number.isFinite(meters)) return 'GPS elevation unavailable';
  return `${Math.round(unit==='ft' ? meters/0.3048 : meters).toLocaleString('en-US')} ${unit} GPS elevation`;
}
export function bearingPoint(degrees, radius, center = 200) {
  const a=degrees*Math.PI/180;
  return [center+radius*Math.sin(a),center-radius*Math.cos(a)];
}
export function deviationArc(degrees) {
  if (!Number.isFinite(degrees) || Math.abs(degrees)<0.3) return '';
  const a=Math.max(-179.99,Math.min(179.99,degrees));
  const [x,y]=bearingPoint(a,146);
  return `M200 54 A146 146 0 0 ${a>0?1:0} ${x.toFixed(2)} ${y.toFixed(2)}`;
}
export function stableSamples(samples, now, tolerance, both = false) {
  const recent=samples.filter(s=>now-s.at<=1100);
  if(recent.length<4 || recent.at(-1).at-recent[0].at<800) return false;
  const last=recent.at(-1);
  return recent.every(s=>Number.isFinite(s.heading) && Math.abs(angleError(s.heading,last.heading))<=Math.min(2,tolerance/2) && (!both || (Number.isFinite(s.tilt)&&Math.abs(s.tilt-last.tilt)<=Math.min(1,tolerance/2))));
}
/* Explicit, opt-in browser lookup only. No IP fallback, stored coordinates or server calls.
 * https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api */
export async function lookupPlace(position, signal) {
  if (!position || position.source!=='GPS' || (!Number.isFinite(position.at)||Date.now()-position.at>60000||Date.now()-position.at < -1000) || !Number.isFinite(position.lat) || !Number.isFinite(position.lon)) throw new Error('A fresh GPS position is required');
  const lat=position.lat.toFixed(3),lon=position.lon.toFixed(3);
  const url=`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
  if(!response.ok) throw new Error('Place lookup unavailable');
  const data=await response.json();
  if(!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude) || Math.abs(data.latitude-Number(lat))>0.02 || Math.abs(data.longitude-Number(lon))>0.02 || /ip/i.test(data.lookupSource||'')) throw new Error('No GPS-based place result');
  const clean=s=>typeof s==='string'?s.trim().slice(0,90):'';
  const town=clean(data.locality)||clean(data.city);
  const region=data.countryCode==='US'?clean(data.principalSubdivisionCode).replace(/^US-/, ''):clean(data.principalSubdivision);
  return [...new Set([town,region||clean(data.countryName)].filter(Boolean))].join(', ') || 'Place name unavailable';
}
