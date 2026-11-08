const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const cloudScript = fs.readFileSync(path.join(__dirname, '../cloud.js'), 'utf8');

function loadCloudFixture() {
  const modules = [
    {id: 'm1', slug: 'first', name: 'First', is_published: true},
    {id: 'm2', slug: 'second', name: 'Second', is_published: true}
  ];
  const groups = [
    {id: 'enabled', module_id: 'm1', is_enabled: true},
    {id: 'paused', module_id: 'm1', is_enabled: false},
    {id: 'legacy', module_id: 'm1'},
    {id: 'elsewhere', module_id: 'm2', is_enabled: true}
  ].map(group => ({...group, name: group.id}));
  const question = (id, group_id, is_active = true, module_id = 'm1') => ({
    id, group_id, is_active, module_id, question_type: 'flashcard',
    question_text: id, question_image_path: id + '.png', answer_data: {text: 'Fixture answer'}
  });
  const questions = [
    question('visible', 'enabled'),
    question('held', 'enabled', false),
    question('paused-question', 'paused'),
    question('paused-and-held', 'paused', false),
    question('ungrouped', null),
    question('legacy-question', 'legacy'),
    question('unknown-group', 'unknown'),
    question('foreign-group', 'elsewhere'),
    question('other-module-question', 'elsewhere', true, 'm2')
  ];
  const signatures = [];
  const selections = [];
  const tables = {modules, question_groups: groups, questions};
  const client = {
    from(table) {
      assert.ok(tables[table], 'unexpected table access: ' + table);
      let rows = tables[table].slice();
      return {
        select(columns) { selections.push([table, columns]); return this; },
        eq(key, value) { rows = rows.filter(row => row[key] === value); return this; },
        maybeSingle() { return Promise.resolve({data: rows[0] || null}); },
        order() { return Promise.resolve({data: rows}); }
      };
    },
    storage: {from: () => ({
      async createSignedUrls(paths) {
        signatures.push(...paths);
        return {data: paths.map(path => ({path, signedUrl: 'https://fixture.invalid/' + path}))};
      }
    })}
  };
  const window = {supabase: {createClient: () => client}};
  vm.runInNewContext(cloudScript, {window, console});
  return {FC: window.FC, groups, signatures, selections};
}

function ids(items) { return Array.from(items, item => item.id); }

test('learner bank excludes paused, held and unknown-group questions before signing images', async () => {
  const {FC, signatures, selections} = loadCloudFixture();
  const bank = await FC.loadBank('first');
  assert.equal(bank.module.id, 'm1');
  assert.deepEqual(ids(bank.groups), ['enabled', 'legacy']);
  assert.deepEqual(ids(bank.cards), ['visible', 'ungrouped', 'legacy-question']);
  assert.deepEqual(signatures, ['visible.png', 'ungrouped.png', 'legacy-question.png']);
  assert.ok(selections.some(([table, cols]) => table === 'question_groups' && cols.includes('is_enabled')));
});

test('enabling a group restores the same active card ID but does not expose its held card or another module', async () => {
  const {FC, groups, signatures} = loadCloudFixture();
  await FC.loadBank('first');
  groups.find(group => group.id === 'paused').is_enabled = true;
  const first = await FC.loadBank('first');
  assert.deepEqual(ids(first.cards), ['visible', 'paused-question', 'ungrouped', 'legacy-question']);
  assert.deepEqual(signatures, ['visible.png', 'ungrouped.png', 'legacy-question.png', 'paused-question.png']);
  const second = await FC.loadBank('second');
  assert.deepEqual(ids(second.groups), ['elsewhere']);
  assert.deepEqual(ids(second.cards), ['other-module-question']);
});
