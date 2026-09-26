'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),core=require('../cs50/studio/core.js'),catalog=JSON.parse(fs.readFileSync(path.join(root,'cs50/studio/catalog.json'),'utf8'));
const event=(id,payload)=>({id:id||crypto.randomUUID(),client_at:'2026-01-01T00:00:00.000Z',payload:{schema:2,type:'draft',release_id:'fg-01',parents:[],text:'note',repo:'local fixture',...payload}});

test('15 versioned releases, 13 checked and 90 uniquely named cases',()=>{
 assert.equal(catalog.releases.length,15);assert.equal(catalog.releases.filter(x=>x.mode==='checked').length,13);assert.equal(catalog.releases.reduce((a,r)=>a+r.test_cases.length,0),90);
 for(const r of catalog.releases){assert.equal(new Set(r.test_cases).size,r.test_cases.length);assert.equal(r.version,'1.0.0');for(const id of r.requires)assert(catalog.releases.some(x=>x.id===id));}
});
test('starter fingerprints match every reference check',()=>{
 const templates=JSON.parse(fs.readFileSync(path.join(root,'cs50/studio/templates.json'),'utf8'));
 for(const r of catalog.releases.filter(x=>x.mode==='checked'))assert.equal(crypto.createHash('sha256').update(templates[r.project][r.test_file]).digest('hex'),r.checks_sha256);
});
test('starter contains TODO implementations, not reference solutions',()=>{
 const t=JSON.parse(fs.readFileSync(path.join(root,'cs50/studio/templates.json'),'utf8'));
 for(const p of catalog.projects)assert.match(t[p.id][`src/${p.package}/core.py`],/raise NotImplementedError/);
});
test('legacy unsupported versions and malformed data are preserved read-only',()=>{
 for(const raw of ['not-json','{"schema":1,"version":"future"}','null']){const r=core.loadLegacy(raw,'1.0.0',()=>true);assert(r.blocked);assert.equal(r.raw,raw);}
});
test('valid legacy state migrates without rewriting original',()=>{
 const raw='{"schema":1,"version":"1.0.0","events":[]}';const r=core.loadLegacy(raw,'1.0.0',()=>true);assert.equal(r.blocked,false);assert.deepEqual(r.state.events,[]);
});
test('concurrent drafts retain both heads until explicit merge',()=>{
 const a=event(),b=event(null,{parents:[a.id],text:'left'}),c=event(null,{parents:[a.id],text:'right'});
 assert.equal(core.drafts([a,b,c],'fg-01').length,2);
 const merged=event(null,{parents:[b.id,c.id],text:'combined'});assert.deepEqual(core.drafts([a,b,c,merged],'fg-01').map(e=>e.id),[merged.id]);
});
test('immutable id conflict rejects instead of replacing evidence',()=>{
 const a=event(),b=event(a.id,{text:'changed'});assert.throws(()=>core.mergeEvents([a],[b]),/Conflicting/);assert.equal(a.payload.text,'note');
});
test('identical import is idempotent',()=>{const a=event();assert.equal(core.mergeEvents([a],[a]).length,1);});
test('source manifest rejects escape and environment paths',()=>{
 for(const p of ['../secret','/tmp/x.py','src/../../x.py','src/.env','C:\\secret.py','.git/config'])assert.equal(core.safeCodePath(p),false);
 assert(core.safeCodePath('src/kit_manager/core.py'));
});
test('source hash matches Python canonical pair-list contract',async()=>{
 const files={'src/a.py':'print("é")\n','README.md':'example'};
 const pairs=Object.keys(files).sort().map(p=>[p,crypto.createHash('sha256').update(files[p]).digest('hex')]);
 assert.equal(await core.sourceHash(files),crypto.createHash('sha256').update(JSON.stringify(pairs)).digest('hex'));
});
test('unknown event kind and malformed source report rejected',()=>{
 assert.throws(()=>core.validateEvent(event(null,{type:'admin'})));
 assert.throws(()=>core.validateEvent(event(null,{type:'attempt',passed:true,assistance:'none',provenance:'local-unverified',release_version:'1.0.0',report:'not-a-report'})));
});
test('no blanket skill mastery from one successful release',()=>{
 const e=event(null,{type:'attempt',release_id:'fg-01',passed:true,assistance:'none',provenance:'local-unverified',release_version:'1.0.0',report:{source_sha256:'a'}});
 const s=core.skillEvidence(catalog,[e],Date.parse(e.client_at));assert.equal(s.find(x=>x.id==='files').contexts,1);assert.equal(s.find(x=>x.id==='sqlite').passes,0);assert(!s.some(x=>/master/i.test(x.status)));
});
test('self-review does not become behavior-checked implementation',()=>{
 const e=event(null,{type:'attempt',release_id:'kit-05',passed:true,assistance:'none',provenance:'self-review',release_version:'1.0.0'});
 assert.equal(core.skillEvidence(catalog,[e]).find(x=>x.id==='web').passes,0);
});
test('latest failed attempt stays visible after an earlier pass',()=>{
 const a=event(null,{type:'attempt',release_id:'fg-01',passed:true,assistance:'none',provenance:'local-unverified',release_version:'1.0.0'}),b=event(null,{...a.payload,passed:false});b.client_at='2026-01-02T00:00:00Z';
 const s=core.skillEvidence(catalog,[a,b]).find(x=>x.id==='files');assert.equal(s.passes,1);assert.match(s.status,/Latest check needs work/);
});
test('all new template paths are relative and safe',()=>{const t=JSON.parse(fs.readFileSync(path.join(root,'cs50/studio/templates.json'),'utf8'));for(const files of Object.values(t))for(const p of Object.keys(files))assert(core.validPath(p));});
