#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = 'agent-manager-install.json';
const OWNED = ['agent-manager', 'agent-manager-menu', 'agent-manager-tabs'];
const digest = data => createHash('sha256').update(data).digest('hex');
const read = file => fs.readFile(file).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
const safeName = name => typeof name === 'string' && /^[a-zA-Z0-9_-]+$/.test(name);
export function patchTabs(source) {
  const regex = /openOverlay\(\{([^{}]*\bmod:\s*["']new-menu["'][^{}]*)\}\)/g;
  const matches = [...source.matchAll(regex)];
  if (matches.length !== 1) throw new Error('Incompatible tabs Mod: expected exactly one new-menu overlay. Official files were not modified.');
  let options = matches[0][1].replace(/\bmod:\s*["']new-menu["']/, 'mod: "agent-manager-menu"');
  options = /\bwidth\s*:/.test(options) ? options.replace(/\bwidth:\s*\d+/, 'width: 370') : options + ', width: 370';
  options = /\bheight\s*:/.test(options) ? options.replace(/\bheight:\s*\d+/, 'height: 570') : options + ', height: 570';
  return source.replace(matches[0][0], `openOverlay({${options}})`).replaceAll('mods/tabs/', 'mods/agent-manager-tabs/');
}
export function patchLayout(original) {
  const layout = JSON.parse(JSON.stringify(original)); let count = 0;
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.content?.mod === 'tabs') { node.content.mod = 'agent-manager-tabs'; count++; }
    for (const child of node.children ?? []) visit(child);
  };
  visit(layout);
  if (!count) throw new Error('Selected layout has no stock tabs block. See INSTALL.md for manual integration.');
  delete layout.version; delete layout.cloned_from;
  return layout;
}
async function walk(folder, prefix = '') {
  const result = new Map();
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.endsWith('.error') || entry.name.endsWith('.d.ts') || entry.name === 'jsconfig.json') continue;
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink inside Mod: ${entry.name}`);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) for (const pair of await walk(path.join(folder, entry.name), name)) result.set(...pair);
    else if (entry.isFile()) result.set(name, await fs.readFile(path.join(folder, entry.name)));
  }
  return result;
}
async function pruneEmpty(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
  for (const entry of entries) if (entry.isDirectory() && !entry.isSymbolicLink()) await pruneEmpty(path.join(folder, entry.name));
  await fs.rmdir(folder).catch(e => { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(e.code)) throw e; });
}
function ownedPath(name) {
  return typeof name === 'string' && !name.includes('..') && !name.includes('\\') &&
    (name === 'layouts/agent-manager.json' || OWNED.some(mod => name.startsWith(`mods/${mod}/`)));
}
function parseManifest(raw) {
  if (!raw) return null;
  const value = JSON.parse(raw.toString());
  if (value.application !== 'herdr-agent-manager' || !value.files || typeof value.files !== 'object' || Array.isArray(value.files) || !safeName(value.sourceLayout)) throw new Error('Unrecognized installation manifest');
  for (const [name, hash] of Object.entries(value.files)) if (!ownedPath(name) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Unsafe installation manifest');
  return value;
}
async function atomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.ham-tmp-${process.pid}`;
  try { await fs.writeFile(temp, data, { flag: 'wx' }); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }); }
}
export function command(binary, args, home) {
  const result = spawnSync(binary, args, { encoding: 'utf8', shell: false, timeout: 60000, windowsHide: true, env: { ...process.env, HERDR_APP_HOME: home } });
  if (result.error || result.status !== 0) throw new Error(`Herdr command failed: ${binary} ${args.join(' ')}\n${result.error?.message ?? (result.stderr || result.stdout)}`);
  return result.stdout;
}
export async function install(options = {}) {
  const home = path.resolve(options.home ?? process.env.HERDR_APP_HOME ?? path.join(os.homedir(), '.config', 'herdr-app'));
  const source = options.source ?? ROOT, check = options.check !== false, activate = options.activate !== false && check;
  const binary = options.binary ?? 'herdr-app';
  if (!(await fs.stat(home).catch(() => null))?.isDirectory()) throw new Error(`Herdr home does not exist: ${home}. Start Herdr once or pass --home.`);
  const lockPath = path.join(home, '.agent-manager-install.lock');
  const lock = await fs.open(lockPath, 'wx').catch(e => { throw new Error(`Another install may be running (${lockPath}): ${e.message}`); });
  try {
    const manifestPath = path.join(home, MANIFEST), oldRaw = await read(manifestPath), old = parseManifest(oldRaw);
    const sourceLayout = options.layout ?? old?.sourceLayout ?? 'main';
    if (!safeName(sourceLayout) || sourceLayout === 'agent-manager') throw new Error('Choose an existing source layout, not agent-manager');
    if (options.uninstall) {
      if (!old) return { home, removed: [], preserved: [], message: 'No managed installation found.' };
      if (activate) command(binary, ['do', 'layout.switch', '--name', old.sourceLayout], home);
      const removed = [], preserved = [], remaining = {};
      for (const [name, hash] of Object.entries(old.files)) {
        const bytes = await read(path.join(home, name));
        if (bytes && digest(bytes) !== hash) { preserved.push(name); remaining[name] = hash; continue; }
        if (bytes) { await fs.unlink(path.join(home, name)); removed.push(name); }
      }
      if (preserved.length) await atomic(manifestPath, JSON.stringify({ ...old, files: remaining }, null, 2));
      else await fs.unlink(manifestPath);
      for (const mod of OWNED) await pruneEmpty(path.join(home, 'mods', mod));
      return { home, removed, preserved, message: 'Removed unchanged owned files. Preferences, custom programs and edited files were retained.' };
    }
    const output = new Map();
    for (const mod of ['agent-manager', 'agent-manager-menu'])
      for (const [name, bytes] of await walk(path.join(source, 'mods', mod))) output.set(`mods/${mod}/${name}`, bytes);
    const tabs = await walk(path.join(home, 'mods', 'tabs'));
    if (!tabs.has('main.js')) throw new Error('Installed stock tabs Mod not found');
    tabs.set('main.js', Buffer.from(patchTabs(tabs.get('main.js').toString())));
    const tabMeta = JSON.parse(tabs.get('mod.json')?.toString() ?? '{}'); delete tabMeta.version; delete tabMeta.cloned_from;
    tabs.set('mod.json', Buffer.from(JSON.stringify({ ...tabMeta, title: 'Agent Manager Tabs' }, null, 2) + '\n'));
    for (const [name, bytes] of tabs) output.set(`mods/agent-manager-tabs/${name}`, bytes);
    const original = JSON.parse(await fs.readFile(path.join(home, 'layouts', `${sourceLayout}.json`), 'utf8'));
    output.set('layouts/agent-manager.json', Buffer.from(JSON.stringify(patchLayout(original), null, 2) + '\n'));
    if (!old) for (const mod of OWNED) {
      if (await fs.stat(path.join(home, 'mods', mod)).catch(() => null)) throw new Error(`Name collision: mods/${mod} exists without our manifest. Nothing was overwritten.`);
    }
    const paths = [...new Set([...output.keys(), ...Object.keys(old?.files ?? {})])], before = new Map();
    for (const name of paths) {
      const bytes = await read(path.join(home, name)); before.set(name, bytes);
      if (bytes && (!old?.files[name] || digest(bytes) !== old.files[name])) throw new Error(`Refusing to overwrite a modified or unowned file: ${name}. Back up and reconcile it first.`);
    }
    const manifest = { application: 'herdr-agent-manager', version: 1, packageVersion: '1.0.0', sourceLayout,
      installedAt: new Date().toISOString(), files: Object.fromEntries([...output].map(([name, bytes]) => [name, digest(bytes)])) };
    const changed = []; let activationAttempted = false;
    try {
      for (const name of paths) {
        const now = await read(path.join(home, name)), expected = before.get(name);
        if ((now === null) !== (expected === null) || (now && digest(now) !== digest(expected))) throw new Error(`File changed during installation: ${name}`);
        if (output.has(name)) await atomic(path.join(home, name), output.get(name));
        else if (now) await fs.unlink(path.join(home, name));
        changed.push(name);
      }
      if (check) for (const mod of OWNED) command(binary, ['check', path.join(home, 'mods', mod)], home);
      await atomic(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      if (activate) { activationAttempted = true; command(binary, ['do', 'layout.switch', '--name', 'agent-manager'], home); }
    } catch (error) {
      for (const name of changed.reverse()) {
        const bytes = before.get(name);
        if (bytes === null) await fs.rm(path.join(home, name), { force: true }); else await atomic(path.join(home, name), bytes);
      }
      if (oldRaw) await atomic(manifestPath, oldRaw); else await fs.rm(manifestPath, { force: true });
      for (const mod of OWNED) await pruneEmpty(path.join(home, 'mods', mod));
      if (activationAttempted) { try { command(binary, ['do', 'layout.switch', '--name', sourceLayout], home); } catch { /* Preserve original failure. */ } }
      throw new Error(`Installation rolled back. ${error.message}`);
    }
    return { home, installed: output.size, checked: check, activated: activate,
      message: check ? 'Installed; native initial-render checks passed.' : 'Installed without native checks. Not activated.' };
  } finally { await lock.close(); await fs.unlink(lockPath); }
}
function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--uninstall') result.uninstall = true;
    else if (a === '--no-check') result.check = false;
    else if (a === '--no-activate') result.activate = false;
    else if (['--home', '--layout', '--herdr'].includes(a) && args[i + 1]) result[a === '--herdr' ? 'binary' : a.slice(2)] = args[++i];
    else throw new Error(`Unknown or incomplete option: ${a}`);
  }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await install(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
