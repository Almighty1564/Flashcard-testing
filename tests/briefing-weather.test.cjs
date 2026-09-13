const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../briefing-data.js');
const fixture = require('./briefing-fixture.cjs');
const NOW = Date.parse('2026-09-13T18:30:00Z');

test('requests seven days, all daily fields and hourly UV without credentials', () => {
  const u = new URL(D.weatherURL(D.defaultLocation));
  assert.equal(u.hostname,'api.open-meteo.com');
  assert.equal(u.searchParams.get('forecast_days'),'7');
  assert.equal(u.searchParams.get('timezone'),'auto');
  assert.equal(u.searchParams.get('timeformat'),'unixtime');
  for (const key of ['weather_code','temperature_2m_max','temperature_2m_min','precipitation_probability_max','sunrise','sunset','uv_index_max']) assert.ok(u.searchParams.get('daily').split(',').includes(key));
  assert.ok(u.searchParams.get('hourly').split(',').includes('uv_index'));
  assert.equal(u.searchParams.has('apikey'),false);
  assert.throws(()=>D.weatherURL({name:'Invalid'}));
});
test('retains today and six subsequent days, paired fields and existing current/hourly data', () => {
  const w=D.normalizeWeather(fixture(),NOW);
  assert.equal(w.days.length,7); assert.equal(w.days[0].date,'2026-09-13'); assert.equal(w.days[6].date,'2026-09-19');
  assert.equal(w.days[2].code,61); assert.equal(w.days[2].high,29); assert.equal(w.days[2].rainChance,80);
  assert.equal(w.daily,w.days[0]); assert.equal(w.current.temp,26); assert.equal(w.hours.length,6);
  assert.ok(w.hours.every(h=>h.time>=NOW/1000));
});
test('UV now is this hour, never the daily maximum or next hour', () => {
  const p=fixture(); p.hourly.uv_index[15]=11;
  const w=D.normalizeWeather(p,NOW);
  assert.equal(w.current.uv,6.4); assert.equal(w.current.uvTime,Date.parse('2026-09-13T18:00:00Z')/1000);
  assert.equal(w.daily.uv,7.8); assert.equal(w.hours[0].uv,11);
});
test('current UV switches exactly at the hour, including fractional-offset locations', () => {
  const p=fixture(); p.hourly.uv_index[15]=2.7;
  assert.equal(D.normalizeWeather(p,Date.parse('2026-09-13T19:00:00Z')).current.uv,2.7);
  p.hourly.time=p.hourly.time.map(t=>t+1800);
  assert.equal(D.normalizeWeather(p,Date.parse('2026-09-13T19:15:00Z')).current.uvTime,Date.parse('2026-09-13T18:30:00Z')/1000);
});
test('missing hourly UV remains unavailable even when peak UV exists', () => {
  const p=fixture(); p.hourly.uv_index[14]=null;
  const w=D.normalizeWeather(p,NOW); assert.equal(w.current.uv,null); assert.equal(w.current.uvTime,null); assert.equal(w.daily.uv,7.8);
});
test('hourly gaps and expired forecasts never provide current UV', () => {
  const p=fixture(); p.hourly.time[14]=null;
  assert.equal(D.normalizeWeather(p,NOW).current.uv,null);
  assert.equal(D.normalizeWeather(p,Date.parse('2026-09-21T18:30:00Z')).current.uv,null);
});
test('zero is valid; negative, string, NaN, undefined and infinity are not readings', () => {
  assert.deepEqual(D.uvRisk(0),{value:0,label:'Low',level:'low'});
  for(const x of [null,undefined,'0',-1,NaN,Infinity]) assert.equal(D.uvRisk(x).value,null);
  const p=fixture(); p.daily.uv_index_max[0]=0; p.hourly.uv_index[14]=0;
  const w=D.normalizeWeather(p,NOW); assert.equal(w.daily.uv,0); assert.equal(w.current.uv,0);
});
test('UV category thresholds and displayed rounding agree', () => {
  for(const [x,level] of [[0,'low'],[2.9,'low'],[3,'moderate'],[5.9,'moderate'],[6,'high'],[7.9,'high'],[8,'very-high'],[10.9,'very-high'],[11,'extreme'],[17,'extreme'],[2.99,'moderate']]) assert.equal(D.uvRisk(x).level,level);
});
test('missing daily fields and polar zero timestamps do not become fabricated weather', () => {
  const p=fixture(); p.daily.uv_index_max=[null]; p.daily.sunrise=[0]; p.daily.sunset=[]; p.daily.precipitation_probability_max=[101];
  const w=D.normalizeWeather(p,NOW);
  assert.equal(w.daily.uv,null); assert.equal(w.daily.sunrise,null); assert.equal(w.daily.sunset,null); assert.equal(w.daily.rainChance,null);
  assert.equal(w.days[6].uv,null);
});
test('selected-city date is independent of the browser/process timezone', () => {
  const now=Date.parse('2026-09-14T02:30:00Z');
  assert.equal(D.localDate(now/1000,'America/New_York'),'2026-09-13');
  assert.equal(D.localDate(now/1000,'Asia/Tokyo'),'2026-09-14');
  assert.equal(D.normalizeWeather(fixture(),now).today,'2026-09-13');
});
test('cached data rolls forward at city-local midnight, not UTC midnight', () => {
  const p=fixture(); const before=D.normalizeWeather(p,Date.parse('2026-09-14T03:59:59Z'));
  const after=D.normalizeWeather(p,Date.parse('2026-09-14T04:00:00Z'));
  assert.equal(before.daily.date,'2026-09-13'); assert.equal(after.daily.date,'2026-09-14');
  assert.equal(after.daily.high,28); assert.equal(after.days[6].date,'2026-09-20'); assert.equal(after.days[6].available,false); assert.equal(after.days[6].uv,null);
});
test('future-only or missing daily data is not substituted for today', () => {
  const p=fixture(); for (const key of Object.keys(p.daily)) p.daily[key]=p.daily[key].slice(1);
  const w=D.normalizeWeather(p,NOW); assert.equal(w.daily.available,false); assert.equal(w.daily.sunrise,null); assert.equal(w.days[1].high,28);
});
test('daily fields stay aligned when the provider returns unsorted or duplicate dates', () => {
  const p=fixture(); for (const key of Object.keys(p.daily)) p.daily[key]=[p.daily[key][2],p.daily[key][0],p.daily[key][1],p.daily[key][1]];
  const w=D.normalizeWeather(p,NOW); assert.equal(w.daily.high,27); assert.equal(w.days[2].high,29); assert.equal(w.days[3].available,false);
});
test('fallback DST: daily calendar keys use provider offset, sun times remain real instants', () => {
  const p=fixture(); p.utc_offset_seconds=-14400;
  p.daily.time=Array.from({length:7},(_,i)=>Date.parse('2026-10-31T04:00:00Z')/1000+i*86400);
  p.daily.sunrise[2]=Date.parse('2026-11-02T11:30:00Z')/1000;
  const w=D.normalizeWeather(p,Date.parse('2026-11-02T05:30:00Z'));
  assert.equal(w.today,'2026-11-02'); assert.equal(w.daily.high,29);
  assert.match(new Intl.DateTimeFormat('en-US',{timeZone:w.timezone,hour:'numeric',minute:'2-digit'}).format(new Date(w.daily.sunrise*1000)),/6:30/);
});
test('spring DST: calendar sequence has no skipped or duplicated dates', () => {
  const p=fixture(); p.utc_offset_seconds=-18000;
  p.daily.time=Array.from({length:7},(_,i)=>Date.parse('2026-03-07T05:00:00Z')/1000+i*86400);
  const w=D.normalizeWeather(p,Date.parse('2026-03-09T04:30:00Z'));
  assert.equal(w.today,'2026-03-09'); assert.equal(w.daily.high,29); assert.equal(new Set(w.days.map(d=>d.date)).size,7);
});
test('extreme east and west timezones retain their own calendar date', () => {
  for(const [zone,offset,first] of [['Pacific/Kiritimati',50400,'2026-09-14T00:00:00Z'],['Pacific/Honolulu',-36000,'2026-09-13T00:00:00Z']]) {
    const p=fixture();p.timezone=zone;p.utc_offset_seconds=offset;
    p.daily.time=Array.from({length:7},(_,i)=>Date.parse(first)/1000-offset+i*86400);
    const w=D.normalizeWeather(p,NOW);assert.equal(w.daily.date,first.slice(0,10));assert.equal(w.daily.high,27);
  }
});
test('invalid payloads fail cleanly; unknown timezone explicitly falls back to UTC', () => {
  for(const x of [null,undefined,[],{},'text',{error:true}]) assert.equal(D.normalizeWeather(x,NOW),null);
  const p=fixture();p.timezone='Not/A_Zone';assert.equal(D.normalizeWeather(p,NOW).timezone,'UTC');
  assert.equal(D.localDate(NaN,'UTC'),null);
});
test('normalization does not mutate cached response data', () => {
  const p=fixture(), before=JSON.stringify(p);D.normalizeWeather(p,NOW);D.normalizeWeather(p,NOW+86400000);assert.equal(JSON.stringify(p),before);
});
test('unit conversion, weather advice and safe news links still work', () => {
  assert.equal(D.fahrenheit(0),32); assert.equal(D.mph(1.609344),1); assert.equal(D.fahrenheit(null),null);
  assert.match(D.advice(D.normalizeWeather(fixture(),NOW)),/sunscreen/);
  assert.equal(D.safeURL('javascript:alert(1)'),null);assert.equal(D.safeURL('https://example.com/a'),'https://example.com/a');
  assert.equal(D.normalizeNews({status:'ok',items:[{title:'Hello',link:'https://example.com/a',pubDate:'2026-09-13 12:00:00'}]},'Test')[0].title,'Hello');
});
test('HTML loads versioned assets without removing authentication or podcast scripts', () => {
  const s=fs.readFileSync(path.join(__dirname,'../tester.html'),'utf8');
  for(const f of ['briefing-weather.css?v=20260913-1','briefing-data.js?v=20260913-1','briefing.js?v=20260913-1','cloud.js?v=9','atelier-portal.js?v=2','./podcast.html']) assert.ok(s.includes(f));
  assert.match(s,/<section id="testerApp" hidden/);
});
