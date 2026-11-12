// Pure configuration and registry logic. No Herdr, Node or DOM dependencies.
export const KEY = "agent-manager.config";
export const VERSION = 1;
export const MODES = ["inherit", "native", "prompt", "auto", "full-access"];
const BAD = new Set(["__proto__", "constructor", "prototype"]);
export const clone = value => JSON.parse(JSON.stringify(value));
export const hostKey = machine => machine == null || machine === "" ? "local" : `remote:${machine}`;
export const entryId = key => `agent:${key}`;
export const profileId = id => `profile:${id}`;
export function fresh() {
  return { version: VERSION, revision: 0, defaultPermission: "native", confirmRisk: true,
    hosts: {}, profiles: [], spaces: {}, adapters: {} };
}
export function freshHost() {
  return { order: [], disabled: [], defaultEntry: null, permission: "inherit", permissions: {}, platform: "auto" };
}
function assert(ok, message) { if (!ok) throw new Error(message); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function safeTree(value, depth = 0) {
  assert(depth < 24, "Configuration nesting is too deep");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert(!BAD.has(key), `Forbidden configuration key: ${key}`);
    safeTree(child, depth + 1);
  }
}
function text(v, label, max = 4096) {
  assert(typeof v === "string" && v.length <= max && !v.includes("\0"), `${label} must be a string without NUL (max ${max})`);
}
function mode(v) { assert(MODES.includes(v), `Unknown permission mode: ${v}`); }
export function stringArray(v, label, nonempty = false) {
  assert(Array.isArray(v) && v.length <= 512, `${label} must be an array of at most 512 strings`);
  v.forEach(x => text(x, label));
  if (nonempty) assert(v.length > 0 && v[0].trim().length > 0, `${label} needs an executable`);
  return v;
}
export function validate(raw) {
  assert(object(raw), "Configuration must be an object"); safeTree(raw);
  const c = { ...fresh(), ...clone(raw) };
  assert(c.version === VERSION, `Unsupported config version ${c.version}; upgrade the mod first`);
  assert(Number.isSafeInteger(c.revision) && c.revision >= 0, "Invalid revision");
  mode(c.defaultPermission); assert(c.defaultPermission !== "inherit", "Global permissions cannot inherit");
  assert(typeof c.confirmRisk === "boolean", "confirmRisk must be boolean");
  for (const name of ["hosts", "spaces", "adapters"]) assert(object(c[name]), `${name} must be an object`);
  assert(Object.keys(c.hosts).length <= 100, "Too many hosts");
  for (const [key, value] of Object.entries(c.hosts)) {
    assert(object(value), "Host configuration must be an object");
    const h = { ...freshHost(), ...value }; c.hosts[key] = h;
    stringArray(h.order, "order"); stringArray(h.disabled, "disabled");
    const ref = id => id.startsWith("agent:") || id.startsWith("profile:") ? id : `agent:${id}`;
    h.order = [...new Set(h.order.map(ref))]; h.disabled = [...new Set(h.disabled.map(ref))];
    if (h.defaultEntry === null && typeof h.defaultAgent === "string") h.defaultEntry = ref(h.defaultAgent);
    delete h.defaultAgent;
    assert(h.defaultEntry === null || typeof h.defaultEntry === "string", "Invalid default entry");
    mode(h.permission); assert(["auto", "unix", "windows"].includes(h.platform), "Invalid platform");
    assert(object(h.permissions), "permissions must be an object"); Object.values(h.permissions).forEach(mode);
  }
  assert(Array.isArray(c.profiles) && c.profiles.length <= 200, "profiles must be an array (max 200)");
  const ids = new Set();
  c.profiles = c.profiles.map(rawProfile => {
    assert(object(rawProfile), "Profile must be an object");
    const p = { scope: "*", permission: "inherit", args: [], run: null, env: {}, model: "", shortcut: "", ...rawProfile };
    text(p.id, "Profile ID", 100); assert(/^[a-zA-Z0-9_-]+$/.test(p.id), "Invalid profile ID");
    assert(!ids.has(p.id), `Duplicate profile ID ${p.id}`); ids.add(p.id);
    text(p.agent, "Agent key", 200); assert(p.agent.length > 0 && !BAD.has(p.agent), "Invalid agent key");
    text(p.name, "Profile name", 100); assert(p.name.trim(), "Profile name is required");
    text(p.scope, "Profile scope", 200); mode(p.permission);
    stringArray(p.args, "Profile args"); if (p.run !== null) stringArray(p.run, "Profile run", true);
    text(p.model, "Model", 200); text(p.shortcut, "Shortcut", 1);
    assert(p.shortcut === "" || /^[a-z]$/.test(p.shortcut), "Shortcuts are one lowercase letter; digits are reserved");
    assert(object(p.env) && Object.keys(p.env).length <= 100, "Environment must be an object (max 100)");
    for (const [key, value] of Object.entries(p.env)) {
      assert(/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !BAD.has(key), `Invalid environment variable ${key}`);
      text(value, `Environment ${key}`);
    }
    return p;
  });
  for (let i = 0; i < c.profiles.length; i++) for (let j = i + 1; j < c.profiles.length; j++) {
    const a = c.profiles[i], b = c.profiles[j];
    assert(!a.shortcut || a.shortcut !== b.shortcut || (a.scope !== "*" && b.scope !== "*" && a.scope !== b.scope),
      `Duplicate shortcut '${a.shortcut}' in overlapping scopes`);
  }
  for (const value of Object.values(c.spaces)) text(value, "Space default", 250);
  for (const value of Object.values(c.adapters)) assert(["generic", "claude", "codex", "grok", "copilot"].includes(value), "Unknown adapter");
  assert(JSON.stringify(c).length <= 500000, "Configuration exceeds 500 KB");
  return c;
}
export function hostConfig(c, machine) { return { ...freshHost(), ...c.hosts[hostKey(machine)] }; }
export function updateHost(c, machine, change) {
  const next = clone(c), key = hostKey(machine); next.hosts[key] = { ...hostConfig(c, machine), ...change }; return validate(next);
}
export function permission(c, machine, entry) {
  const h = hostConfig(c, machine);
  return [h.permissions[entry.id], entry.profile?.permission, h.permission, c.defaultPermission]
    .find(m => m && m !== "inherit") ?? "native";
}
export function registry(c, machine, agents) {
  const h = hostConfig(c, machine), disabled = new Set(h.disabled);
  const entries = agents.map(a => ({ ...a, id: entryId(a.key), agentKey: a.key, profile: null }));
  for (const p of c.profiles.filter(p => p.scope === "*" || p.scope === hostKey(machine))) {
    const base = agents.find(a => a.key === p.agent);
    entries.push({ ...(base ?? { key: p.agent, icon: null, installed: false, run: [] }), id: profileId(p.id),
      name: p.name, agentKey: p.agent, profile: p, run: p.run ?? base?.run ?? [],
      installed: p.run && p.run[0] !== base?.run?.[0] ? null : base?.installed ?? false });
  }
  const rank = new Map(h.order.map((id, i) => [id, i]));
  return entries.map(e => ({ ...e, enabled: !disabled.has(e.id), configRevision: c.revision, permission: permission(c, machine, e) }))
    .sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
export function visibleEntries(entries) { return entries.filter(e => e.enabled); }
export function defaultEntry(c, machine, space, entries) {
  for (const id of [c.spaces[space], hostConfig(c, machine).defaultEntry]) {
    const entry = entries.find(e => e.id === id && e.enabled && e.installed !== false);
    if (entry) return entry;
  }
  return entries.find(e => e.enabled && e.installed === true) ?? null;
}
export function move(c, machine, entries, from, to) {
  const order = entries.map(e => e.id), a = order.indexOf(from), b = order.indexOf(to);
  if (a < 0 || b < 0 || a === b) return c;
  order.splice(a, 1); order.splice(b, 0, from);
  return updateHost(c, machine, { order });
}
export function toggle(c, machine, id) {
  const disabled = new Set(hostConfig(c, machine).disabled);
  if (disabled.has(id)) disabled.delete(id); else disabled.add(id);
  return updateHost(c, machine, { disabled: [...disabled] });
}
export function deleteProfile(c, id) {
  const next = clone(c), ref = profileId(id); next.profiles = next.profiles.filter(p => p.id !== id);
  for (const h of Object.values(next.hosts)) {
    h.order = h.order.filter(x => x !== ref); h.disabled = h.disabled.filter(x => x !== ref);
    delete h.permissions[ref]; if (h.defaultEntry === ref) h.defaultEntry = null;
  }
  for (const key of Object.keys(next.spaces)) if (next.spaces[key] === ref) delete next.spaces[key];
  return validate(next);
}
export function exportConfig(c) {
  const copy = validate(c); copy.revision = 0;
  copy.profiles.forEach(p => { p.env = {}; });
  return JSON.stringify(copy, null, 2) + "\n";
}
export function parseImport(text) {
  assert(typeof text === "string" && text.length <= 500000, "Import exceeds 500 KB");
  return validate(JSON.parse(text));
}
export function parseJson(text, fallback) { return text.trim() ? JSON.parse(text) : fallback; }
export function newId() { return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
