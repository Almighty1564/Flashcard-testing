'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const metadata = require('../study-metadata.js');
const {libraryCard} = require('../mod4-study.js');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8').replace(/\r\n/g,'\n');
const sample = {audit_id:'A021',provenance:'new addition',assessment_kind:'application',source_status:'reviewed',sources:[{folder:'Topic',file:'slide.png',heading:'Answer clue'}],grading_criteria:['Private answer checklist'],notes:['Private note']};
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.events = {}; this.value = ''; }
  append(...children) { this.children.push(...children); }
  set textContent(value) { this.value = value; this.children = []; }
  get textContent() { return this.value + this.children.map(x => typeof x === 'string' ? x : x.textContent).join(''); }
  set innerHTML(_) { throw Error('Metadata must not interpret HTML'); }
  addEventListener(name, callback) { this.events[name] = callback; }
}
global.document = {createElement: tag => new Element(tag)};

test('labels cannot reveal source headings, notes, checklist or external clarification', () => {
  const host = new Element('div'); metadata.appendLabels(host, sample);
  assert.match(host.textContent, /Reference A021.*Origin: new addition.*Application/);
  for (const text of ['Answer clue','Private answer','Private note','slide.png']) assert.ok(!host.textContent.includes(text));
  const legacy = new Element('div'); metadata.appendLabels(legacy, undefined); metadata.appendDetails(legacy, undefined);
  assert.equal(legacy.children.length, 0);
});
test('post-reveal details preserve unknown source filenames, pending status, and plain-text content', () => {
  const host = new Element('div');
  metadata.appendDetails(host, {...sample,source_status:'pending',notes:['<img src=x onerror=bad()>'],source_qualification:'Course wording differs',external_source:{url:'javascript:bad()',title:'Clarification'}});
  assert.match(host.textContent, /Source verification pending/);
  for (const text of ['Topic','slide.png','Answer clue','Private answer checklist','<img src=x onerror=bad()>','Course wording differs','Clarification']) assert.ok(host.textContent.includes(text));
  const empty = new Element('div'); metadata.appendDetails(empty,{source_status:'pending',sources:[]});
  assert.match(empty.textContent,/Source verification pending/); assert.match(empty.textContent,/No source image reference/);
});
test('source paths and technical links reject traversal, credentials and active URL schemes', () => {
  for (const folder of ['../bad','/bad','https://bad','x\\bad','x//bad']) assert.equal(metadata.sourcePath({folder,file:'a.png'}),null);
  assert.equal(metadata.sourcePath({folder:'A & B',file:'Screenshot #1.png'}),'A & B/Screenshot #1.png');
  for (const url of ['javascript:alert(1)','data:text/html,bad','http://example.com','https://user:secret@example.com']) assert.equal(metadata.normalize({external_source:{url,title:'Source'}}).external_source.url,'');
  assert.equal(metadata.normalize({external_source:{url:'https://example.com/docs'}}).external_source.url,'https://example.com/docs');
  assert.equal(metadata.normalize({sources:Array(100).fill({folder:'a',file:'b'})}).sources.length,50);
});
test('cloud conversion carries metadata and preserves existing card fields', () => {
  const code = read('cloud.js').match(/function toCard\(row, index\) \{[\s\S]*?\n    return card;\n  \}/)[0];
  const ctx = {signedUrl:x=>x}; vm.runInNewContext(code,ctx);
  const row={id:'stable',group_id:'g',question_type:'flashcard',question_text:'Question',answer_data:{text:'Answer',image_path:null,study_metadata:sample}};
  const card=ctx.toCard(row,0); assert.equal(card.id,'stable'); assert.equal(card.answer.text,'Answer'); assert.equal(card.studyMetadata,sample);
  delete row.answer_data.study_metadata; assert.ok(!('studyMetadata' in ctx.toCard(row,0)));
});
test('existing authoring roundtrip preserves metadata and future extra keys', () => {
  const html=read('developer.html');
  const code=html.slice(html.indexOf('function answerDataFor(q)'),html.indexOf('function answerBodyFor(q)'));
  const ctx={answerBodyFor:q=>({text:q.answerText,image_path:null})}; vm.runInNewContext(code,ctx);
  const extra=ctx.answerDataExtras({text:'Old answer',study_metadata:sample,future_key:{value:1}});
  const data=ctx.answerDataFor({answerDataExtra:extra,answerText:'Edited answer'});
  assert.equal(data.text,'Edited answer'); assert.equal(data.study_metadata,sample); assert.equal(data.future_key.value,1);
  assert.match(html,/isActive:row\.is_active!==false,answerDataExtra:answerDataExtras\(ad\)/);
});
test('actual flashcard renderer adds source details only once after reveal, outside the swipe card', () => {
  const html=read('mod1.html'), code=html.slice(html.indexOf('function renderFlashcard(el)'),html.indexOf('function renderChoices(el,multi)'));
  const events={},answerContent={},answer={hidden:true,querySelector:()=>answerContent},hint={},direction={},legend={hidden:true};
  const card={classList:{add(){}},setAttribute(){},addEventListener:(name,fn)=>events[name]=fn,querySelector:s=>({'.swipe-face-answer':answer,'.swipe-hint':hint,'.swipe-direction':direction}[s])};
  const el={innerHTML:'',querySelector:s=>s==='#swipeCard'?card:legend};
  const calls=[]; const ctx={currentCard:{question:{text:'Prompt'},answer:{text:'Key'},studyMetadata:sample},esc:x=>x,imageHtml:()=>'',window:{T08StudyMetadata:{appendDetails:(...args)=>calls.push(args)}}};
  vm.runInNewContext(code,ctx);ctx.renderFlashcard(el);assert.equal(calls.length,0);assert.equal(answer.hidden,true);
  events.click();assert.equal(calls.length,1);assert.equal(calls[0][0],el);assert.equal(calls[0][1],sample);assert.equal(answer.hidden,false);
  events.click();assert.equal(calls.length,1);
});
test('release loads helper on both study entry points and audit sources supersede stale static mappings', () => {
  for(const file of ['mod1.html','mod4-study.html']) {
    assert.match(read(file),/study-metadata\.js\?v=20261109-source-notes-v1/);
    assert.ok(read(file).indexOf('study-metadata.js') < read(file).indexOf('cloud.js'));
  }
  const library=read('mod4-study.js');
  assert.match(library,/sources:metadata \? liveSources :/);
  assert.match(library,/if \(!details\.open \|\| details\.dataset\.sourceNotesReady\) return/);
  assert.match(library,/if \(!card\.studyMetadata\) article\.append\(references\(card\.sources\)\)/);
});
test('library keeps pending sources in review and never substitutes stale manifest references', () => {
  const base={id:'audit',type:'flashcard',question:{text:'Prompt'},answer:{text:'Key'}};
  for(const source_status of ['pending','unresolved','unexpected','']) {
    const card=libraryCard({...base,studyMetadata:{source_status,sources:[]}},['stale/image.png'],metadata);
    assert.equal(card.status,'needs-review');assert.deepEqual(card.sources,[]);assert.equal(card.answer.text,'Key');
  }
  const reviewed=libraryCard({...base,studyMetadata:sample},['stale/image.png'],metadata);
  assert.equal(reviewed.status,'verified');assert.deepEqual(reviewed.sources,['Topic/slide.png']);
  const legacy=libraryCard(base,['original-quiz/image.png'],metadata);
  assert.equal(legacy.status,'verified');assert.deepEqual(legacy.sources,['original-quiz/image.png']);
  assert.equal(libraryCard({...base,studyMetadata:sample},[],undefined).status,'needs-review');
});
