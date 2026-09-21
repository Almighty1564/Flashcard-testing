'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const math = import('../satellite-math.mjs');
const close = (a,b,tolerance=0.001) => assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
// NOAA official WMM2025_TEST_VALUES.txt: all 12 test positions, field components and declination.
const reference = [
 [2025,0,80,0,6521.6,145.9,54791.5,1.28],
 [2025,0,0,120,39677.8,-109.6,-10580.2,-0.16],
 [2025,0,-80,-120,6117.5,15751.9,-52022.5,68.78],
 [2025,100,80,0,6216.0,92.4,52598.8,0.85],
 [2025,100,0,120,37688.6,-96.2,-10152.1,-0.15],
 [2025,100,-80,-120,5907.6,14780.3,-49540.7,68.21],
 [2027.5,0,80,0,6500.8,294.5,54869.4,2.59],
 [2027.5,0,0,120,39701.6,-167.4,-10381.8,-0.24],
 [2027.5,0,-80,-120,6200.7,15730.3,-51783.7,68.49],
 [2027.5,100,80,0,6196.7,233.8,52670.5,2.16],
 [2027.5,100,0,120,37711.5,-148.7,-9969.8,-0.23],
 [2027.5,100,-80,-120,5984.0,14760.1,-49317.7,67.93]
];
for (const [year,alt,lat,lon,x,y,z,dec] of reference) test(`WMM2025 NOAA ${year} ${lat} ${lon} ${alt}km`,async()=>{
 const {magneticField}=await math; const f=magneticField(lat,lon,alt,year);
 close(f.x,x,0.11); close(f.y,y,0.11); close(f.z,z,0.11); close(f.declination,dec,0.011);
});
test('Input validation does not turn absent data into zero',async()=>{
 const {numberIn}=await math;
 for(const n of [null,undefined,'',' ',NaN,Infinity,'abc',true,false,{},[]]) assert.equal(numberIn(n,-90,90),null);
 assert.equal(numberIn('0',-90,90),0); assert.equal(numberIn('-90',-90,90),-90); assert.equal(numberIn(91,-90,90),null);
});
test('WMM expires instead of silently using an outdated model',async()=>{
 const {magneticField}=await math;
 for(const year of [2024.99,2030,NaN]) assert.throws(()=>magneticField(30,-80,0,year),RangeError);
});
test('GEO equatorial overhead, far-side obstruction and undefined azimuth',async()=>{
 const {geoLookAngles}=await math;
 const overhead=geoLookAngles(0,0,0); close(overhead.elevation,90); assert.equal(overhead.azimuth,null); close(overhead.rangeKm,42164-6378.137);
 close(geoLookAngles(0,0,180).elevation,-90); assert.equal(geoLookAngles(90,0,0).azimuth,null);
 close(geoLookAngles(35,-79,-79).azimuth,180); close(geoLookAngles(-35,-79,-79).azimuth,0);
});
test('Independent equatorial spherical look angle and date-line wrapping',async()=>{
 const {geoLookAngles}=await math;
 const d=30*Math.PI/180;
 const expected=Math.atan2(Math.cos(d)-6378.137/42164,Math.sin(d))*180/Math.PI;
 close(geoLookAngles(0,0,30).elevation,expected,1e-10); close(geoLookAngles(0,0,30).azimuth,90);
 close(geoLookAngles(0,179,-179).azimuth,90); close(geoLookAngles(0,-179,179).azimuth,270);
});
test('Circular headings and short-way steering across north',async()=>{
 const {wrap,angleError,circularMean}=await math;
 assert.equal(wrap(-1),359); assert.equal(wrap(360),0); assert.equal(angleError(1,359),2); assert.equal(angleError(359,1),-2);
 close(Math.abs(angleError(circularMean([359,0,1]),0)),0); assert.equal(circularMean([0,180]),null);
});
test('Relative orientation and null headings never manufacture north',async()=>{
 const {phoneReading}=await math;
 assert.equal(phoneReading({alpha:0,beta:0,gamma:0,absolute:false}).heading,null);
 assert.equal(phoneReading({alpha:null,beta:0,gamma:0,absolute:true}).heading,null);
 const apple=phoneReading({webkitCompassHeading:0,webkitCompassAccuracy:5,beta:0,gamma:0});
 assert.equal(apple.heading,0); assert.equal(apple.accuracy,5); assert.equal(apple.flat,true);
 const android=phoneReading({alpha:90,beta:0,gamma:0,absolute:true}); assert.equal(android.heading,270); assert.equal(android.accuracy,null);
});
test('Top-edge tilt is not screen-normal tilt or UI rotation',async()=>{
 const {phoneReading}=await math;
 close(phoneReading({beta:35,gamma:15}).tilt,35);
 assert.equal(phoneReading({beta:0,gamma:45}).flat,false);
 assert.equal(phoneReading({beta:90,gamma:0}).usableTilt,false);
 assert.equal(phoneReading({beta:180,gamma:0}).flat,false);
});
function healthy(extra={}) { return {mode:'azimuth',target:{azimuth:200,elevation:35},reading:{heading:200,accuracy:5,tilt:35,flat:true,usableTilt:true},tolerance:10,fresh:true,positionOK:true,mountOK:true,fieldOK:true,stable:true,...extra}; }
test('Green requires current measurements, trustworthy heading, mount and dwell',async()=>{
 const {alignment}=await math; assert.equal(alignment(healthy()).state,'aligned');
 for(const key of ['fresh','positionOK','mountOK','fieldOK','stable']) assert.notEqual(alignment(healthy({[key]:false})).state,'aligned',key);
 for(const accuracy of [null,undefined,NaN,-1,11]) assert.notEqual(alignment(healthy({reading:{...healthy().reading,accuracy}})).state,'aligned',String(accuracy));
 for(const heading of [null,undefined,NaN]) assert.notEqual(alignment(healthy({reading:{...healthy().reading,heading}})).state,'aligned');
 assert.equal(alignment(healthy({target:{azimuth:200,elevation:-1}})).state,'blocked');
 assert.notEqual(alignment(healthy({tolerance:null})).state,'aligned');
 assert.notEqual(alignment(healthy({azOffset:null})).state,'aligned');
});
test('Azimuth is separate from elevation; both mode requires both angles',async()=>{
 const {alignment}=await math;
 const wrongEl={...healthy().reading,tilt:5};
 assert.equal(alignment(healthy({reading:wrongEl})).message,'AZIMUTH IN ZONE');
 assert.equal(alignment(healthy({mode:'both',reading:wrongEl})).state,'outside');
 assert.equal(alignment(healthy({mode:'elevation',fieldOK:false,reading:{...healthy().reading,heading:null,accuracy:null}})).message,'ELEVATION IN ZONE');
 assert.notEqual(alignment(healthy({reading:{...healthy().reading,flat:false}})).state,'aligned');
});
test('Offsets, east-positive declination and signed instructions',async()=>{
 const {alignment,wrap}=await math;
 assert.equal(wrap(220-(-10)),230); assert.equal(wrap(230+(-10)),220);
 const a=alignment(healthy({azOffset:5})); assert.equal(a.azError,-5);
 assert.equal(alignment(healthy({mode:'both',elOffset:20})).state,'outside');
});
test('Pointer stays independent from backend credentials and location persistence',()=>{
 const root=path.join(__dirname,'..'), js=fs.readFileSync(path.join(root,'satellite-pointer.mjs'),'utf8'), html=fs.readFileSync(path.join(root,'satellite-pointer.html'),'utf8');
 assert.doesNotMatch(js,/localStorage|sessionStorage|fetch\(|XMLHttpRequest|sendBeacon|supabase|\.coords\.heading/);
 assert.doesNotMatch(html,/cloud\.js|supabase-config|supabase-js/);
 for(const id of [...js.matchAll(/\$\('([A-Za-z][A-Za-z0-9]+)'\)/g)].map(m=>m[1])) assert.ok(html.includes(`id="${id}"`),`Missing control ${id}`);
 assert.match(html,/not satellite lock/); assert.match(html,/aria-live="polite"/);
});
