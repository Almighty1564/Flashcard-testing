'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const media = require('../cs50/lesson/media.js');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
test('Every Foundation unit has its own official lecture, not the full video at time zero', () => {
  const manifest = JSON.parse(read('cs50/manifest.json'));
  for (const file of manifest.unitFiles) {
    const unit = JSON.parse(read('cs50/' + file));
    assert.match(media.lectures[unit.id], /^[A-Za-z0-9_-]{11}$/);
    assert.equal(new URL(media.videoURL(unit.id,'https://www.tomato08.com/cs50/')).origin,'https://www.youtube-nocookie.com');
  }
  assert.equal(Object.keys(media.lectures).length,12);
  assert.equal(new Set(Object.values(media.lectures)).size,12);
});
test('Embed URL contains an origin, no credentials/hash, and does not autoplay', () => {
  const url = new URL(media.videoURL('scratch','https://www.tomato08.com/path?return=account#secret'));
  assert.equal(url.searchParams.get('origin'),'https://www.tomato08.com');
  assert.equal(url.searchParams.get('autoplay'),'0');
  assert.equal(url.searchParams.get('enablejsapi'),'1');
  assert.equal(url.hash,''); assert.equal(url.username,'');
  assert.equal(media.videoURL('__proto__','https://www.tomato08.com'),null);
  assert.equal(media.videoURL('scratch','javascript:alert(1)'),null);
  assert.equal(media.videoURL('scratch','null'),null);
});
test('Editor is the official standalone GUI, not a blocked project page or just a player', () => {
  assert.equal(media.scratchEditor,'https://scratchfoundation.github.io/scratch-gui/');
  assert.doesNotMatch(media.scratchEditor,/\/embed|projects\/editor/);
});
test('Existing engine and notebook load before the isolated presentation adapter', () => {
  const html = read('cs50/index.html');
  assert(html.indexOf('app.js?v=6') < html.indexOf('lesson/workspace.js'));
  assert(html.indexOf('path/notebook.js?v=2') < html.indexOf('lesson/workspace.js'));
  assert.match(html,/lesson\/workspace.css/);
});
test('Tab panels, window controls and honest file storage guidance are explicit', () => {
  const src = read('cs50/lesson/workspace.js');
  for(const name of ['lecture','scratch','notes','files']) assert(src.includes('id="lwPanel-'+name+'"'));
  assert.match(src,/lwMinimize/); assert.match(src,/lwMaximize/);
  assert.match(src,/allow-scripts allow-same-origin allow-downloads allow-modals/);
  assert.doesNotMatch(src,/allow-top-navigation|allow-popups-to-escape-sandbox/);
  assert.match(src,/not saved to your Tomato08 or Scratch account/);
  assert.doesNotMatch(src,/localStorage\.setItem|\.from\(|\.rpc\(/);
});
test('Unit-to-notebook identity matches the published plan', () => {
  const src = read('cs50/lesson/workspace.js');
  const plan = JSON.parse(read('cs50/path/plan.json'));
  for(const item of plan.objectives.filter(n=>n.kind==='foundation')) assert(src.includes(item.ref+":'"+item.id+"'"));
});
