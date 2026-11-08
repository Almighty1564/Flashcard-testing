'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {sourcePath, localURL, answerText} = require('../mod4-study.js');
const root = path.resolve(__dirname, '..');
const context = {window: {}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'mod4-study-data.js'), 'utf8'), context);
const manifest = JSON.parse(JSON.stringify(context.window.M4_MANIFEST));
function keys(record, wanted) { assert.deepEqual(Object.keys(record).sort(), [...wanted].sort()); }
test('public source metadata contains only the explicit filename/provenance schema, never Q/A or notes', () => {
  keys(manifest, ['version', 'files', 'slots', 'references']);
  manifest.files.forEach(f => keys(f, ['path', 'bytes', 'sha256']));
  manifest.slots.forEach(s => keys(s, ['id', 'quiz', 'number', 'status', 'incomplete', 'sources']));
  manifest.references.forEach(r => keys(r, ['id', 'sources']));
  assert.equal(manifest.slots.length, 160);
  assert.equal(new Set(manifest.slots.map(s => `${s.quiz}:${s.number}`)).size, 160);
  for (let quiz = 1; quiz <= 8; quiz++) assert.deepEqual(manifest.slots.filter(s => s.quiz === quiz).map(s => s.number), Array.from({length: 20}, (_, i) => i + 1));
  assert.equal(manifest.slots.filter(s => s.status === 'verified').length, 120);
  assert.equal(manifest.slots.filter(s => s.incomplete).length, 3);
  assert.ok(manifest.slots.filter(s => s.incomplete).every(s => s.status === 'needs-review'));
});
test('every course and prior-practice reference resolves to an inventoried source', () => {
  const paths = new Set(manifest.files.map(f => f.path));
  assert.equal(paths.size, 985);
  for (const file of manifest.files) {
    assert.equal(sourcePath(file.path), file.path);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0);
  }
  for (const record of [...manifest.slots, ...manifest.references]) for (const source of record.sources) assert.ok(paths.has(source), source);
  assert.equal(manifest.references.length, 58);
});
test('source paths stay relative and URL encoding preserves filenames without traversal', () => {
  for (const bad of ['../x.png', 'a/../x.png', '/x.png', 'https://host/x.png', 'C:\\private.png', 'a//x.png', 'a/./x.png']) {
    assert.equal(sourcePath(bad), null, bad); assert.equal(localURL(bad), null, bad);
  }
  assert.equal(sourcePath('supporting material/mod 4 tests/quiz 1/1.PNG'), 'mod 4 tests/quiz 1/1.PNG');
  assert.equal(localURL('A & B/a#1?.png'), 'supporting%20material/A%20%26%20B/a%231%3F.png');
  assert.equal(localURL('literal/%2f.png'), 'supporting%20material/literal/%252f.png');
});
test('read-only answers use existing objective keys without inventing grades or choices', () => {
  assert.equal(answerText({type:'flashcard',answer:{text:'Exact\nanswer'}}), 'Exact\nanswer');
  assert.equal(answerText({type:'multiple-select',choices:[{text:'a',correct:true},{text:'b',correct:false},{text:'c',correct:true}]}), 'a\nc');
  assert.equal(answerText({type:'numeric',entry:{value:0,unit:'ms'}}), '0 ms');
  assert.equal(answerText({type:'matching',pairs:[{left:{text:'DNS'},right:{text:'Name resolution'}}]}), 'DNS → Name resolution');
  assert.equal(answerText({type:'unknown'}), '');
});
