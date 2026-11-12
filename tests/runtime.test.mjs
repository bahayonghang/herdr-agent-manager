import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
const H = await import('herdr');
const { context, find, text, errors } = await import('./mocks/gpui-kit.mjs');
const { fresh, registry, updateHost, validate } = await import('../src/model.js');
const R = await import('../src/runtime.js');
const { default: Manager } = await import('../src/manager.js');
const { default: Menu } = await import('../src/menu.js');
const settle = () => new Promise(resolve => setImmediate(resolve));
function click(root, id) { const n = find(root, id); assert.ok(n, `Missing ${id}`); n.events.on_click({}, context()); }
const first = (c = R.store.read()) => registry(c, null, H.state.agents).find(e => e.agentKey === 'codex');
test.beforeEach(() => { H.reset(); errors.length = 0; });
test.afterEach(() => assert.deepEqual(errors, []));
test('launch explicitly pins Space and working folder', () => {
  R.executePlan(R.buildPlan(R.store.read(), H.state.spaces[0], first()));
  const args = H.state.calls.find(c => c[0] === 'run')[2]; assert.equal(args.space, 's1'); assert.equal(args.folder, '/project'); assert.deepEqual(args.argv, ['codex', '--no-daemon']);
});
test('stale preview and entry revisions are rejected', () => {
  const plan = R.buildPlan(R.store.read(), H.state.spaces[0], first()), old = first(); R.store.change(c => c);
  assert.throws(() => R.executePlan(plan), /Settings changed/); assert.throws(() => R.buildPlan(R.store.read(), H.state.spaces[0], old), /Settings changed/);
});
test('changed folder, offline host and closed Space are rejected', () => {
  const plan = R.buildPlan(R.store.read(), H.state.spaces[0], first()); H.state.spaces[0].folder = '/different'; assert.throws(() => R.executePlan(plan), /working folder changed/);
  H.state.machines[0].layout = 'unavailable'; assert.throws(() => R.buildPlan(R.store.read(), H.state.spaces[0], first()), /offline/);
  H.state.spaces = []; assert.throws(() => R.executePlan(plan), /Select a Space/);
});
test('YOLO requires review before execution', () => {
  R.store.change(c => updateHost(c, null, { permission: 'full-access' })); R.requestLaunch(first(), H.state.spaces[0]);
  assert.equal(H.state.overlays[0].props.screen, 'launch'); assert.ok(!H.state.calls.some(c => c[0] === 'run'));
});
test('unverified executable always requires review', () => {
  const c = validate({ ...fresh(), confirmRisk: false, profiles: [{ id: 'x', agent: 'codex', name: 'Custom', run: ['/opt/codex'] }] }); H.setShared('agent-manager.config', c);
  R.requestLaunch(registry(c, null, H.state.agents).find(e => e.profile), H.state.spaces[0]); assert.equal(H.state.overlays.length, 1);
});
test('CLI probing is explicit and absent flags block managed modes', async () => {
  H.state.execResult = { code: 0, stdout: 'old cli --help', stderr: '' }; await R.probeCLI(first(), null);
  assert.equal(H.state.calls.filter(c => c[0] === 'exec').length, 2); R.store.change(c => updateHost(c, null, { permission: 'full-access' }));
  assert.throws(() => R.buildPlan(R.store.read(), H.state.spaces[0], first()), /does not list/);
});
test('custom registration preserves unrelated fields and original backup', async () => {
  H.state.files.set('/app/programs.json', '{"programs":{"claude":{"name":"Mine"}},"other":1}');
  await R.saveProgram({ key: 'ham-test', name: 'Test', run: ['test-cli'] });
  const data = JSON.parse(H.state.files.get('/app/programs.json')); assert.equal(data.programs.claude.name, 'Mine'); assert.equal(data.other, 1);
  assert.ok([...H.state.files.keys()].some(k => k.includes('programs-')));
  await assert.rejects(R.saveProgram({ key: 'claude', name: 'bad', run: ['x'] }), /Only manager-owned/);
});
test('invalid JSON and invalid adapter never overwrite programs.json', async () => {
  H.state.files.set('/app/programs.json', 'not json'); await assert.rejects(R.saveProgram({ key: 'ham-x', name: 'X', run: ['x'] }));
  assert.equal(H.state.files.get('/app/programs.json'), 'not json'); H.state.files.clear();
  await assert.rejects(R.saveProgram({ key: 'ham-x', name: 'X', run: ['x'], adapter: 'untrusted' }), /Unknown adapter/); assert.equal(H.state.files.size, 0);
});
test('manager renders loading/loaded/filter states and toggles entries', async () => {
  const view = new Manager(), cx = context(); view.init({}, cx); assert.ok(view.render(cx)); await settle();
  assert.match(text(view.render(cx)), /Codex/); click(view.render(cx), 'enabled-agent:codex'); assert.equal(first().enabled, false);
  view.filter = 'Disabled'; assert.match(text(view.render(cx)), /Codex/); view.filter = 'Missing'; assert.match(text(view.render(cx)), /No matching agents/);
});
test('real profile save and duplicate handlers persist configuration', async () => {
  const view = new Manager(), cx = context(); view.init({}, cx); await settle(); click(view.render(cx), 'edit-agent:codex');
  view.editor.name.data = 'My Codex'; view.editor.args.data = '["--verbose"]'; click(view.render(cx), 'profile-save');
  const p = R.store.read().profiles[0]; assert.equal(p.name, 'My Codex'); click(view.render(cx), `copy-profile:${p.id}`); click(view.render(cx), 'profile-save'); assert.equal(R.store.read().profiles.length, 2);
});
test('custom/import/export/confirmation/offline render branches work', async () => {
  const view = new Manager(), cx = context(); view.init({}, cx); await settle(); view.addAgent(cx); assert.match(text(view.render(cx)), /Register a custom/);
  view.transfer('import', cx); view.editor.value = fresh(); assert.ok(find(view.render(cx), 'import-apply'));
  view.transfer('export', cx); assert.match(text(view.render(cx)), /Export configuration/); view.confirm = { message: 'Confirm', action() {} }; assert.ok(find(view.render(cx), 'confirm-apply'));
  H.state.machines[0].layout = 'unavailable'; assert.match(text(view.render(cx)), /offline/);
});
test('menu digits match current order and disabled items disappear', async () => {
  R.store.change(c => updateHost(c, null, { order: ['agent:codex', 'agent:claude'], disabled: ['agent:claude'] }));
  const view = new Menu(), cx = context(); view.init({}, cx); await settle(); const tree = view.render(cx);
  assert.ok(!find(tree, 'menu-agent:claude')); tree.events.on_key_down({ key: '1', modifiers: {} }, cx); assert.equal(H.state.calls.find(c => c[0] === 'run')[2].argv[0], 'codex');
});
test('menu remains pinned when active Space changes', async () => {
  const view = new Menu(), cx = context(); view.init({}, cx); await settle(); H.state.spaces[0].active = false; H.state.spaces[1].active = true;
  click(view.render(cx), 'menu-agent:codex'); assert.equal(H.state.calls.find(c => c[0] === 'run')[2].space, 's1');
});
test('launch dialog double click launches only once', async () => {
  H.state.props = { screen: 'launch', entry: 'agent:codex', space: 's1', overlay: 'test' };
  const view = new Manager(), cx = context(); view.init({}, cx); assert.ok(view.render(cx)); await settle(); const tree = view.render(cx);
  assert.match(text(tree), /Working folder/); click(tree, 'launch-confirm'); click(tree, 'launch-confirm'); assert.equal(H.state.calls.filter(c => c[0] === 'run').length, 1);
});
test('discovery and schema errors remain visible without destructive reset', async () => {
  H.state.discoveryError = new Error('host offline'); const menu = new Menu(), cx = context(); menu.init({}, cx); await settle(); assert.match(text(menu.render(cx)), /host offline/);
  H.setShared('agent-manager.config', { version: 999 }); const view = new Manager(); view.init({}, cx); await settle(); assert.match(text(view.render(cx)), /could not be loaded/); assert.equal(H.shared('agent-manager.config').version, 999);
});
test('Shift plus number previews without starting a session', async () => {
  const view = new Menu(), cx = context(); view.init({}, cx); await settle(); view.render(cx).events.on_key_down({ key: '!', modifiers: { shift: true } }, cx);
  assert.equal(H.state.overlays[0].props.screen, 'launch'); assert.ok(!H.state.calls.some(c => c[0] === 'run'));
});
