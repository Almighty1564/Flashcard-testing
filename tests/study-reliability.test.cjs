const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadLayer() {
  const status = {textContent:'', style:{}, setAttribute(){}};
  const FC = {
    getSession: async () => null,
    client: { rpc: async () => ({data:null,error:null}) },
    saveCardProgress: async () => {},
    saveSession: async () => {}
  };
  const context = {
    console,
    FC,
    window: { FC, addEventListener(){}, location:{} },
    document: {
      body: {dataset:{page:'study'}},
      getElementById(id){ return id === 'progressSaveStatus' ? status : null; },
      createElement(){ return {id:'',className:'',textContent:'',style:{},setAttribute(){}}; },
      querySelector(){ return {appendChild(){}}; }
    },
    navigator: {onLine:false},
    localStorage: {getItem(){return null;},setItem(){},removeItem(){}},
    setInterval(){return 1;}, clearInterval(){}, setTimeout, clearTimeout,
    Date, JSON, Number, String, Object, Array, Set, Map, RegExp, Math, Promise
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('study-reliability.js','utf8'), context, {filename:'study-reliability.js'});
  return context.window.FC_STUDY_RELIABILITY;
}

const {gradeEntry, parseMeasured} = loadLayer();

test('accepts the deployed numeric answer with omitted or matching displayed unit', () => {
  const entry={value:'480',unit:'ms',tolerance:0,accept:['480 ms']};
  assert.equal(gradeEntry('480',entry),true);
  assert.equal(gradeEntry('480 ms',entry),true);
});

test('rejects a wrong supplied unit', () => {
  assert.equal(gradeEntry('7.25 MHz',{value:'7.25',unit:'GHz',tolerance:0,accept:[]}),false);
});

test('requires both endpoints of a range', () => {
  const entry={value:'7.25-7.75',unit:'GHz',tolerance:0,accept:[]};
  assert.equal(gradeEntry('7.25',entry),false);
  assert.equal(gradeEntry('7.25-8.40',entry),false);
  assert.equal(gradeEntry('7.25-7.75',entry),true);
  assert.equal(gradeEntry('7.25 to 7.75 GHz',entry),true);
});

test('tolerance applies to every value, not only a prefix', () => {
  const entry={value:'20-21',unit:'GHz',tolerance:0.05,accept:[]};
  assert.equal(gradeEntry('20.04-20.96 GHz',entry),true);
  assert.equal(gradeEntry('20.04-21.20 GHz',entry),false);
});

test('text alternatives remain case and whitespace insensitive', () => {
  const entry={value:'Single Channel Per Carrier',unit:'',tolerance:null,accept:['SCPC']};
  assert.equal(gradeEntry('  single   channel per carrier ',entry),true);
  assert.equal(gradeEntry('scpc',entry),true);
});

test('parser distinguishes scalar and range measurements', () => {
  assert.deepEqual(parseMeasured('7.25 GHz',''),{kind:'scalar',values:[7.25],unit:'ghz'});
  assert.deepEqual(parseMeasured('7.25 to 7.75 GHz',''),{kind:'range',values:[7.25,7.75],unit:'ghz'});
});
