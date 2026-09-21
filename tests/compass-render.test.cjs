'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const core=import('../compass-core.mjs');
const approx=(actual,expected,tol=1e-7)=>assert.ok(Math.abs(actual-expected)<tol,`${actual} != ${expected}`);
test('Smoothing crosses north by the short path, never a full revolution',async()=>{
 const {smoothAngle}=await core; const a=smoothAngle(359,1,16.67);assert.ok(a>359&&a<361);
 const b=smoothAngle(1,359,16.67);assert.ok(b<1&&b>-1);
 assert.equal(smoothAngle(null,299,16),299); assert.equal(smoothAngle(30,null,16),30);
});
test('Animation smoothing is time based at 30, 60 and 120Hz',async()=>{
 const {smoothAngle}=await core;const output=[];
 for(const hz of [30,60,120]){let a=0;for(let i=0;i<hz;i++)a=smoothAngle(a,60,1000/hz);output.push(a);}
 approx(output[0],output[1]);approx(output[1],output[2]);
});
test('DMS carries rounded seconds and keeps correct hemispheres',async()=>{
 const {dms}=await core; assert.equal(dms(12.5),'12°30′0″ N');assert.equal(dms(-45.75,false),'45°45′0″ W');
 assert.equal(dms(12.999999),'13°0′0″ N');assert.equal(dms(-0.0003),'0°0′1″ S');assert.equal(dms(null),'—');assert.equal(dms(95),'—');
});
test('Eight compass points, zero and exact wrapping',async()=>{
 const {cardinal}=await core;assert.equal(cardinal(299),'NW');assert.equal(cardinal(359),'N');assert.equal(cardinal(360),'N');assert.equal(cardinal(-90),'W');assert.equal(cardinal(null),'');
});
test('Unknown altitude is not zero; units preserve negative altitude',async()=>{
 const {altitudeLabel}=await core; assert.equal(altitudeLabel(null),'GPS elevation unavailable');assert.equal(altitudeLabel(0),'0 ft GPS elevation');assert.equal(altitudeLabel(152.4),'500 ft GPS elevation');assert.equal(altitudeLabel(-50,'m'),'-50 m GPS elevation');
});
test('Dial marker and deviation band use correct sign and center',async()=>{
 const {bearingPoint,deviationArc}=await core;assert.deepEqual(bearingPoint(0,146),[200,54]);approx(bearingPoint(90,146)[0],346);approx(bearingPoint(90,146)[1],200);
 assert.match(deviationArc(30),/0 0 1/);assert.match(deviationArc(-30),/0 0 0/);assert.equal(deviationArc(null),'');
});
test('No stable result for short history, shaky headings or wrong tilt',async()=>{
 const {stableSamples}=await core;const s=[0,250,500,800,1000].map(at=>({heading:359,tilt:30,at}));assert.equal(stableSamples(s,1000,10),true);
 assert.equal(stableSamples(s.slice(-2),1000,10),false);assert.equal(stableSamples(s.map((v,i)=>({...v,heading:i*8})),1000,10),false);
 assert.equal(stableSamples(s.map((v,i)=>({...v,tilt:i*8})),1000,10,true),false);assert.equal(stableSamples(s,10000,10),false);
});
test('Place lookup rejects manual, stale, missing and future positions before network',async()=>{
 const {lookupPlace}=await core;
 for(const p of [null,{source:'Manual',lat:12,lon:-45,at:Date.now()},{source:'GPS',lat:12,lon:-45,at:Date.now()-90000},{source:'GPS',lat:null,lon:-45,at:Date.now()}]) await assert.rejects(()=>lookupPlace(p));
});
test('Controller caches elements, uses rAF, avoids interval/DOM rebuild on each frame',()=>{
 const root=path.join(__dirname,'..');const js=fs.readFileSync(path.join(root,'satellite-pointer.mjs'),'utf8');const html=fs.readFileSync(path.join(root,'satellite-pointer.html'),'utf8');
 assert.match(js,/requestAnimationFrame\(frame\)/);assert.doesNotMatch(js,/setInterval\(/);assert.doesNotMatch(js,/localStorage|sessionStorage|supabase|sendBeacon/);
 assert.doesNotMatch(html,/portal\.css|liquid-glass|cloud\.js/);
 const names=new Set([...js.matchAll(/ui\.([A-Za-z][A-Za-z0-9]*)/g)].map(m=>m[1]));for(const name of names)assert.ok(html.includes(`id="${name}"`),`Missing ${name}`);
 assert.match(js,/!ui\.placeConsent\.checked/);assert.match(js,/abortPlace\(\)/);assert.match(js,/cancelAnimationFrame/);
 assert.match(html,/not satellite lock/);assert.match(html,/GPS elevation/);assert.match(html,/aria-live="polite"/);
});
