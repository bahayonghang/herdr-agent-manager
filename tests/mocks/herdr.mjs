export const state = {};
export function reset() {
  Object.assign(state, { shared: new Map(), files: new Map(), props: {}, calls: [], overlays: [], notifications: [],
    spaces: [{ id: 's1', name: 'Local project', machine: null, active: true, folder: '/project' }, { id: 'remote/s2', name: 'Remote project', machine: 'remote', active: false, folder: '/remote' }],
    machines: [{ name: null, layout: 'ready' }, { name: 'remote', layout: 'ready' }], platform: 'linux',
    agents: [{ key: 'codex', name: 'Codex', run: ['codex', '--no-daemon'], installed: true }, { key: 'claude', name: 'Claude', run: ['claude'], installed: true }], discoveryError: null,
    execResult: { code: 0, stdout: '1.0\n--sandbox --ask-for-approval --dangerously-bypass-approvals-and-sandbox --permission-mode --dangerously-skip-permissions', stderr: '' } });
}
reset();
export const shared = k => state.shared.get(k);
export const setShared = (k, v) => state.shared.set(k, v);
export const props = () => state.props;
export const spaces = () => state.spaces;
export const machines = () => state.machines;
export const window = () => ({ platform: state.platform });
export const theme = () => Object.fromEntries('popover surface raised foreground muted dim accent border input background selected hover blocked'.split(' ').map(k => [k, '#444444']));
export const knownAgents = async ({ on } = {}) => { state.calls.push(['knownAgents', on]); if (state.discoveryError) throw state.discoveryError; return state.agents; };
export const exec = async (...args) => { state.calls.push(['exec', ...args]); return state.execResult; };
export const run = (...args) => { state.calls.push(['run', ...args]); };
export const openOverlay = spec => { state.overlays.push(spec); return 'overlay'; };
export const closeOverlay = id => { state.calls.push(['closeOverlay', id]); };
export const notify = n => { state.notifications.push(n); };
export const nextCommand = () => new Promise(() => {});
export const appHome = () => '/app';
export const readTextFile = async p => state.files.get(p) ?? null;
export const writeTextFile = async (p, text, expected) => { if ((state.files.get(p) ?? null) !== expected) throw new Error('stale snapshot'); state.files.set(p, text); };
