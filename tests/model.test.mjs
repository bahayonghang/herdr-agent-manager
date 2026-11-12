import test from 'node:test';
import assert from 'node:assert/strict';
import { fresh, validate, hostKey, hostConfig, updateHost, registry, toggle, move, defaultEntry, deleteProfile, exportConfig, parseImport, permission } from '../src/model.js';
import { createStore } from '../src/store.js';
const agents = [{ key: 'codex', name: 'Codex', run: ['codex', '--no-daemon'], installed: true }, { key: 'claude', name: 'Claude', run: ['claude'], installed: true }, { key: 'pi', name: 'Pi', run: ['pi'], installed: false }];
const preset = (p = {}) => ({ id: 'safe', agent: 'codex', name: 'Codex Safe', scope: '*', permission: 'prompt', args: [], ...p });
test('fresh configuration never adds YOLO', () => { assert.equal(validate(fresh()).defaultPermission, 'native'); assert.equal(fresh().confirmRisk, true); });
test('host keys cannot collide', () => { assert.equal(hostKey(null), 'local'); assert.equal(hostKey('local'), 'remote:local'); });
test('legacy order/default migrate once', () => {
  const c = validate({ version: 1, hosts: { local: { order: ['codex'], disabled: ['pi'], defaultAgent: 'codex' } } });
  assert.deepEqual(c.hosts.local.order, ['agent:codex']); assert.equal(c.hosts.local.defaultEntry, 'agent:codex'); assert.ok(!('defaultAgent' in c.hosts.local));
});
test('unknown schemas and duplicate IDs fail closed', () => {
  assert.throws(() => validate({ ...fresh(), version: 4 }), /Unsupported/);
  assert.throws(() => validate({ ...fresh(), profiles: [preset(), preset()] }), /Duplicate/);
});
test('prototype pollution keys are rejected', () => { assert.throws(() => parseImport('{"__proto__":{"polluted":true}}'), /Forbidden/); assert.equal({}.polluted, undefined); });
test('invalid args, environment, executable and NUL are rejected', () => {
  for (const p of [{ args: 'x' }, { env: { 'bad-name': 'x' } }, { run: [] }, { name: '\0' }]) assert.throws(() => validate({ ...fresh(), profiles: [preset(p)] }));
});
test('configuration count and size limits apply', () => {
  assert.throws(() => validate({ ...fresh(), profiles: Array.from({ length: 201 }, (_, i) => preset({ id: `p${i}` })) }), /max 200/);
  assert.throws(() => parseImport(' '.repeat(500001)), /500 KB/);
});
test('host visibility does not leak', () => {
  const c = toggle(fresh(), null, 'agent:codex');
  assert.equal(registry(c, null, agents).find(e => e.agentKey === 'codex').enabled, false);
  assert.equal(registry(c, 'server', agents).find(e => e.agentKey === 'codex').enabled, true);
});
test('ordering is deterministic across discovery refreshes', () => {
  const c = updateHost(fresh(), null, { order: ['agent:pi', 'agent:codex'] });
  for (const list of [agents, [...agents].reverse()]) assert.deepEqual(registry(c, null, list).map(e => e.agentKey), ['pi', 'codex', 'claude']);
});
test('all reorder permutations retain every entry', () => {
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    const c = fresh(), rows = registry(c, null, agents), next = registry(move(c, null, rows, rows[a].id, rows[b].id), null, agents);
    assert.equal(next[b].id, rows[a].id); assert.equal(new Set(next.map(e => e.id)).size, 3);
  }
  const c = fresh(); assert.equal(move(c, null, [], 'a', 'b'), c);
});
test('scoped executable overrides remain unverified', () => {
  const c = validate({ ...fresh(), profiles: [preset({ scope: 'remote:server', run: ['/opt/codex'] })] });
  assert.equal(registry(c, null, agents).length, 3); assert.equal(registry(c, 'server', agents).find(e => e.profile).installed, null);
});
test('a missing inherited base is not claimed to be installed', () => {
  const c = validate({ ...fresh(), profiles: [preset()] }); assert.equal(registry(c, null, []).find(e => e.profile).installed, false);
});
test('entry > preset > host > global permission precedence', () => {
  let c = validate({ ...fresh(), defaultPermission: 'prompt', profiles: [preset({ permission: 'inherit' })] });
  c = updateHost(c, null, { permission: 'auto' }); assert.equal(registry(c, null, agents).find(e => e.profile).permission, 'auto');
  c.profiles[0].permission = 'native'; const entry = registry(c, null, agents).find(e => e.profile); assert.equal(entry.permission, 'native');
  c = updateHost(c, null, { permissions: { 'profile:safe': 'full-access' } }); assert.equal(permission(c, null, entry), 'full-access');
});
test('invalid Space preference falls back to host before alphabetical fallback', () => {
  const c = updateHost(fresh(), null, { defaultEntry: 'agent:codex' }); c.spaces.s1 = 'gone';
  assert.equal(defaultEntry(c, null, 's1', registry(c, null, agents)).id, 'agent:codex');
  c.spaces.s1 = 'agent:claude'; assert.equal(defaultEntry(c, null, 's1', registry(c, null, agents)).id, 'agent:claude');
});
test('disabled defaults are not launched', () => {
  let c = updateHost(fresh(), null, { defaultEntry: 'agent:codex' }); c = toggle(c, null, 'agent:codex');
  assert.equal(defaultEntry(c, null, 's1', registry(c, null, agents)).id, 'agent:claude');
});
test('preset deletion cleans dependent preferences', () => {
  let c = validate({ ...fresh(), profiles: [preset()], spaces: { s: 'profile:safe' } });
  c = updateHost(c, null, { order: ['profile:safe'], disabled: ['profile:safe'], defaultEntry: 'profile:safe', permissions: { 'profile:safe': 'auto' } });
  const n = deleteProfile(c, 'safe'); assert.equal(n.profiles.length, 0); assert.deepEqual(n.spaces, {}); assert.equal(hostConfig(n, null).defaultEntry, null);
});
test('shortcut collisions account for overlapping scopes', () => {
  assert.throws(() => validate({ ...fresh(), profiles: [preset({ shortcut: 'g' }), preset({ id: 'other', shortcut: 'g', scope: 'remote:x' })] }), /Duplicate shortcut/);
  validate({ ...fresh(), profiles: [preset({ shortcut: 'g', scope: 'local' }), preset({ id: 'other', shortcut: 'g', scope: 'remote:x' })] });
  assert.throws(() => validate({ ...fresh(), profiles: [preset({ shortcut: '1' })] }), /digits/);
});
test('export strips environment without altering live data', () => {
  const c = validate({ ...fresh(), profiles: [preset({ env: { TOKEN: 'secret' } })] });
  assert.ok(!exportConfig(c).includes('secret')); assert.deepEqual(parseImport(exportConfig(c)).profiles[0].env, {}); assert.equal(c.profiles[0].env.TOKEN, 'secret');
});
test('store rejects stale editors and restores import backup', () => {
  const map = new Map(), s = createStore({ shared: k => map.get(k), setShared: (k, v) => map.set(k, v) });
  s.change(c => ({ ...c, defaultPermission: 'prompt' }), 0); assert.throws(() => s.change(c => c, 0), /Settings changed/);
  s.replace({ ...fresh(), confirmRisk: false }, 1); assert.equal(s.read().confirmRisk, true);
  s.restore(); assert.equal(s.read().defaultPermission, 'prompt'); assert.equal(s.read().revision, 3);
});
