const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../authoring-reliability.js'), 'utf8');

async function fixture({snapshotError, toggleError} = {}) {
  const calls = [];
  const group = {id: 'section', name: 'First section', isEnabled: true};
  const project = {
    moduleId: 'module', moduleSlug: 'module-one', moduleName: 'Module One',
    groups: [group],
    questions: [{id: 'active', isActive: true}, {id: 'held', isActive: false}]
  };
  const FC = {
    signOut: async () => {},
    requireUser: async () => ({role: 'developer'}),
    client: {
      from() { return {select() {return this;}, eq() {return this;}, single: async () => ({data:{id:'module',revision:3}})}; },
      async rpc(name, args) {
        calls.push({name, args: JSON.parse(JSON.stringify(args))});
        const message = name === 'sync_module_snapshot' ? snapshotError : toggleError;
        return message ? {error: {message}} : {data: name === 'sync_module_snapshot' ? 4 : args.p_expected_revision + 1};
      }
    }
  };
  const ctx = {
    FC, project, cloudReady: true, syncTimer: null, syncing: false, syncQueued: false,
    document: {body: {dataset:{page:'developer'}}, addEventListener() {}, getElementById() {return null;}},
    clearTimeout() {}, clearInterval() {}, setInterval() {},
    setSyncStatus() {}, uploadPendingImages: async () => {}, answerDataFor: () => ({}),
    loadModuleIntoBuilder: async () => {}, queueSync() {}
  };
  ctx.window = ctx;
  vm.runInNewContext(script, ctx);
  await ctx.loadModuleIntoBuilder('module-one');
  return {ctx, group, project, calls};
}

test('a clean section change updates only section availability through the targeted RPC', async () => {
  const {ctx, group, project, calls} = await fixture();
  assert.equal(await ctx.setQuestionGroupEnabled(group.id, false), true);
  assert.deepEqual(calls, [{name:'set_question_group_enabled', args:{
    p_module_id:'module', p_group_id:'section', p_enabled:false, p_expected_revision:3
  }}]);
  assert.equal(group.isEnabled, false);
  assert.equal(project.moduleRevision, 4);
  assert.equal(project.questions[1].isActive, false);
});

test('pending edits save with original question flags before using the new revision for the toggle', async () => {
  const {ctx, group, calls} = await fixture();
  ctx.queueSync();
  assert.equal(await ctx.setQuestionGroupEnabled(group.id, false), true);
  assert.deepEqual(calls.map(call => call.name), ['sync_module_snapshot', 'set_question_group_enabled']);
  assert.deepEqual(calls[0].args.p_questions.map(row => [row.id, row.is_active]), [['active', true], ['held', false]]);
  assert.equal(calls[1].args.p_expected_revision, 4);
});

test('failed pending save and stale toggle leave the confirmed state untouched', async () => {
  const pending = await fixture({snapshotError:'Offline'});
  pending.ctx.queueSync();
  assert.equal(await pending.ctx.setQuestionGroupEnabled(pending.group.id, false), false);
  assert.deepEqual(pending.calls.map(call => call.name), ['sync_module_snapshot']);
  assert.equal(pending.group.isEnabled, true);
  const stale = await fixture({toggleError:'stale_module_revision'});
  assert.equal(await stale.ctx.setQuestionGroupEnabled(stale.group.id, false), false);
  assert.equal(stale.group.isEnabled, true);
  assert.equal(stale.project.moduleRevision, 3);
  assert.match(stale.ctx.T08AuthoringState.message, /refresh from cloud/i);
});
