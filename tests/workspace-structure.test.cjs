'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('Overview has exactly two discipline entries, not an authoring-mode chooser',()=>{
 const page=read('index.html');
 assert.equal((page.match(/class="w-discipline /g)||[]).length,2);
 assert.match(page,/class="w-discipline w-communicator" href="\.\/tester.html"/);
 assert.match(page,/class="w-discipline w-development" href="\.\/dev.html"/);
 assert.ok(!page.includes('dailyBriefing'));
 assert.ok(!/Small steps|Lasting knowledge|Different paths|place to think|LEARN SOMETHING|Good to have/i.test(page));
});
test('all entry pages have a consistent grouped sidebar and role-protected utility links',()=>{
 for(const file of ['index.html','tester.html','dev.html','weather.html']){
  const s=read(file);
  for(const name of ['Communicator','DEV (Coding)','Utilities','Account'])assert.ok(s.includes(name),file+': '+name);
  assert.match(s,/href="\.\/developer.html" data-developer hidden/);
  assert.match(s,/href="\.\/security.html" data-developer hidden/);
  assert.ok(!/satellite-pointer|compass-core/.test(s));
 }
});
test('all entry pages retain FC and server security checks before showing content',()=>{
 for(const f of ['index.html','tester.html','dev.html','weather.html']){
  const s=read(f);
  assert.ok(s.includes('cloud.js?v=11'));
  assert.ok(s.includes('security-auth.js?v=20260926-1'));
  assert.ok(s.indexOf('security-auth.js')<s.indexOf('atelier-portal.js'));
  assert.match(s,/<section id="(?:modePicker|testerApp)" hidden/);
 }
});
test('default Overview has no unconditional Learning redirect; requested route remains allowlisted',()=>{
 const s=read('atelier-portal.js');
 assert.ok(!s.includes("return requested || './tester.html'"));
 assert.ok(s.includes('return requested;'));
 assert.ok(s.includes('url.origin !== location.origin'));
 assert.ok(s.includes('FC.requireUser()'));
 assert.ok(s.includes('FC.listModules()'));
});
test('retired pointing implementation and dedicated tests are deleted',()=>{
 for(const f of ['satellite-pointer.html','satellite-pointer.css','satellite-pointer.mjs','satellite-math.mjs','compass-core.mjs','COMPASS-UPDATE.md','tests/satellite-pointer.test.cjs','tests/compass-render.test.cjs'])assert.ok(!fs.existsSync(path.join(root,f)),f);
});
test('compact weather uses validated locations, public requests, cancellation and no fabricated readings',()=>{
 const s=read('workspace-weather.js');
 for(const text of ['D.validLocation','D.normalizeWeather','credentials:\'omit\'','AbortController','Weather unavailable','app.hidden'])assert.ok(s.includes(text),text);
 assert.ok(!/getCurrentPosition|service_role/.test(s));
});
test('code lessons and study data engines remain separate from the new workspace',()=>{
 const s=read('dev.html');
 for(const file of ['cs50/path.html','cs50/practice.html','cs50/projects.html']){
  assert.ok(s.includes('./'+file));assert.ok(fs.existsSync(path.join(root,file)));
 }
 assert.ok(read('mod1.html').includes('study'));
 assert.ok(read('tester.html').includes('mod2PodcastLink'));
});
