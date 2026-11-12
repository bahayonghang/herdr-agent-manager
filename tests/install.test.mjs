import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { install, patchTabs, patchLayout, command } from '../scripts/install.mjs';
async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ham-')); t.after(() => fs.rm(home, { recursive: true, force: true }));
  await fs.mkdir(path.join(home, 'mods/tabs'), { recursive: true }); await fs.mkdir(path.join(home, 'layouts'));
  await fs.writeFile(path.join(home, 'mods/tabs/main.js'), 'const icon="mods/tabs/test.svg"; openOverlay({mod:"new-menu",kind:"popup",width:250,height:512})');
  await fs.writeFile(path.join(home, 'mods/tabs/mod.json'), '{"place":"none"}');
  await fs.writeFile(path.join(home, 'layouts/main.json'), JSON.stringify({ children: [{ content: { mod: 'tabs' } }, { content: { mod: 'files' } }], theme: 'paper' }));
  await fs.writeFile(path.join(home, 'keys.json'), '{"global":{"ctrl-k":"terminal"}}'); return home;
}
test('tabs integration refuses upstream drift', () => {
  const src = 'openOverlay({mod:"new-menu",kind:"popup",width:250,height:512})';
  assert.throws(() => patchTabs('unknown'), /exactly one/); assert.throws(() => patchTabs(src + src), /exactly one/);
  assert.match(patchTabs(src), /agent-manager-menu/); assert.match(patchTabs(src), /width: 370/);
});
test('layout cloning preserves unrelated content and original', () => {
  const original = { theme: 'paper', children: [{ content: { mod: 'tabs' } }, { content: { mod: 'files' } }] };
  const clone = patchLayout(original); assert.equal(clone.children[0].content.mod, 'agent-manager-tabs'); assert.equal(original.children[0].content.mod, 'tabs'); assert.equal(clone.theme, 'paper');
  assert.throws(() => patchLayout({ content: { mod: 'custom-tabs' } }), /no stock tabs/);
});
test('install is repeatable and never changes stock files or keys', async t => {
  const home = await fixture(t), tabs = await fs.readFile(path.join(home, 'mods/tabs/main.js')), keys = await fs.readFile(path.join(home, 'keys.json'));
  const result = await install({ home, check: false }); assert.equal(result.activated, false); assert.ok(result.installed >= 17);
  await install({ home, check: false }); assert.deepEqual(await fs.readFile(path.join(home, 'mods/tabs/main.js')), tabs); assert.deepEqual(await fs.readFile(path.join(home, 'keys.json')), keys);
});
test('name collisions and local edits are not overwritten', async t => {
  const home = await fixture(t); await fs.mkdir(path.join(home, 'mods/agent-manager')); await assert.rejects(install({ home, check: false }), /Name collision/);
  await fs.rmdir(path.join(home, 'mods/agent-manager')); await install({ home, check: false });
  await fs.appendFile(path.join(home, 'mods/agent-manager/main.js'), '\n// edit'); await assert.rejects(install({ home, check: false }), /modified or unowned/);
});
test('native check failure rolls back all generated files', async t => {
  const home = await fixture(t); await assert.rejects(install({ home, binary: 'definitely-not-a-herdr-binary' }), /rolled back/);
  await assert.rejects(fs.stat(path.join(home, 'agent-manager-install.json')), /ENOENT/); await assert.rejects(fs.stat(path.join(home, 'mods/agent-manager')), /ENOENT/);
  assert.ok(await fs.stat(path.join(home, 'mods/tabs/main.js')));
});
test('uninstall retains shared state and locally edited owned files', async t => {
  const home = await fixture(t); await install({ home, check: false }); await fs.writeFile(path.join(home, 'shared.json'), '{}');
  await fs.appendFile(path.join(home, 'mods/agent-manager/main.js'), '\n// keep'); const r = await install({ home, check: false, uninstall: true });
  assert.deepEqual(r.preserved, ['mods/agent-manager/main.js']); assert.ok(await fs.stat(path.join(home, 'shared.json')));
});
test('unsafe manifest paths and source layout names fail closed', async t => {
  const home = await fixture(t); await assert.rejects(install({ home, check: false, layout: '../private' }), /existing source layout/);
  await fs.writeFile(path.join(home, 'agent-manager-install.json'), JSON.stringify({ application: 'herdr-agent-manager', sourceLayout: 'main', files: { '../private': '0'.repeat(64) } }));
  await assert.rejects(install({ home, check: false }), /Unsafe/);
});
test('Herdr child processes receive custom home', () => {
  const home = path.join(os.tmpdir(), 'custom herdr home'); assert.equal(command(process.execPath, ['-e', 'process.stdout.write(process.env.HERDR_APP_HOME)'], home), home);
});
test('rollback cleans empty nested clone assets and permits retry', async t => {
  const home = await fixture(t); await fs.mkdir(path.join(home, 'mods/tabs/assets')); await fs.writeFile(path.join(home, 'mods/tabs/assets/a.svg'), '<svg/>');
  await assert.rejects(install({ home, binary: 'definitely-not-a-herdr-binary' }), /rolled back/); await assert.rejects(fs.stat(path.join(home, 'mods/agent-manager-tabs')), /ENOENT/);
  await install({ home, check: false });
});
