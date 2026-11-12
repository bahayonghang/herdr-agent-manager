import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
export async function build({ check = false } = {}) {
  for (const [name, entry, width, height] of [['agent-manager', 'manager.js', 1080, 780], ['agent-manager-menu', 'menu.js', 370, 570]]) {
    const folder = path.join(root, 'mods', name);
    if (!check) await mkdir(folder, { recursive: true });
    const files = new Map(await Promise.all(['model.js', 'adapters.js', 'store.js', 'runtime.js', 'ui.js', entry].map(async file => [file === entry ? 'main.js' : file, await readFile(path.join(root, 'src', file), 'utf8')])));
    files.set('mod.json', JSON.stringify({ place: 'none', title: name === 'agent-manager' ? 'Agent Manager' : 'Agent Manager Menu', focusable: true, overlay: { width, height } }, null, 2) + '\n');
    for (const [file, content] of files) {
      const target = path.join(folder, file);
      if (check) {
        if (await readFile(target, 'utf8').catch(() => null) !== content) throw new Error(`Stale generated file: ${path.relative(root, target)}. Run npm run build.`);
      } else await writeFile(target, content);
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build({ check: process.argv.includes('--check') }); console.log('Native Mod sources verified/built.');
}
