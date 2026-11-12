import * as H from "herdr";
import { createStore } from "./store.js";
import { KEY, hostConfig, hostKey, registry, stringArray, validate } from "./model.js";
import { adapterFor, adapt, riskOf, redact, requiredFlags, withEnvironment } from "./adapters.js";
export const store = createStore(H);
export const currentSpace = () => H.spaces().find(s => s.active) ?? null;
export const findSpace = id => H.spaces().find(s => s.id === id) ?? null;
export const labelHost = machine => machine ?? "This computer";
export function showError(error) { H.notify({ title: "Agent Manager", body: String(error?.message ?? error), level: "error" }); }
export function asyncAction(cx, action, done) {
  cx.spawn(async cx => { try { const result = await action(); done?.(result, cx); } catch (e) { showError(e); } cx.notify(); });
}
export function platformFor(config, machine) {
  const override = hostConfig(config, machine).platform;
  if (override !== "auto") return override;
  return machine == null ? (H.window().platform === "windows" ? "windows" : "unix") : "auto";
}
export function assertReady(space) {
  if (!space) throw new Error("Select a Space on the target host first");
  const current = findSpace(space.id);
  if (!current || current.machine !== space.machine) throw new Error("The target Space was closed or moved");
  const host = H.machines().find(m => (m.name ?? null) === (space.machine ?? null));
  if (!host || host.layout !== "ready") throw new Error("The target host is offline or its layout is not ready");
}
export async function loadAgents(machine) { return await H.knownAgents({ on: machine }); }
export function buildPlan(config, space, entry) {
  assertReady(space);
  if (entry.configRevision !== config.revision) throw new Error("Settings changed. Reopen the launcher before starting this entry.");
  if (!entry.enabled) throw new Error("This entry is disabled");
  if (entry.installed === false) throw new Error("Agent is not installed, or its base agent is missing on this host");
  const adapter = adapterFor(entry.agentKey, config.adapters[entry.agentKey]);
  const argv = adapt(entry.run, entry.profile?.args ?? [], entry.permission, adapter, entry.profile?.model ?? "");
  const probe = H.shared(`${KEY}.probes`)?.[hostKey(space.machine)]?.[argv[0]];
  if (probe?.help) {
    const missing = requiredFlags(adapter, entry.permission).filter(flag => !probe.help.includes(flag));
    if (missing.length) throw new Error(`Installed CLI help does not list ${missing.join(", ")}. Refresh Check CLI or use CLI native.`);
  }
  const env = entry.profile?.env ?? {}, command = withEnvironment(argv, env, platformFor(config, space.machine)), notices = [];
  if (entry.permission === "full-access") notices.push("YOLO requests skipped approvals. Codex also disables its sandbox. Only launch in a trusted or isolated workspace.");
  if (entry.installed === null) notices.push("This preset overrides the executable. Herdr has not verified this command on the selected host.");
  if (!probe) notices.push("Installed CLI version has not been checked. Use Check CLI in the manager to inspect supported flags.");
  if (entry.permission === "native") notices.push("CLI native preserves existing arguments and CLI settings; it is not a safety mode.");
  if (Object.keys(env).length) notices.push("Environment values are stored in Herdr shared.json in plaintext. Windows overrides require PowerShell 7.3+ (pwsh).");
  return { revision: config.revision, entryId: entry.id, name: entry.name, space: space.id, machine: space.machine,
    folder: space.folder, argv: command, display: JSON.stringify(redact(argv)), environment: Object.keys(env), notices,
    risky: riskOf(argv, entry.permission, entry.installed === null), unverified: entry.installed === null };
}
export function executePlan(plan) {
  const target = findSpace(plan.space); assertReady(target);
  if (target.machine !== plan.machine || target.folder !== plan.folder) throw new Error("The target host or working folder changed. Refresh the preview.");
  if (store.read().revision !== plan.revision) throw new Error("Settings changed after this preview. Reopen the launch preview.");
  H.run("tab.new", { name: plan.name, space: plan.space, ...(plan.folder ? { folder: plan.folder } : {}), argv: plan.argv });
}
export function requestLaunch(entry, space, preview = false) {
  const c = store.read(), plan = buildPlan(c, space, entry);
  if (preview || plan.unverified || (plan.risky && c.confirmRisk)) {
    H.openOverlay({ mod: "agent-manager", kind: "dialog", modal: true, width: 760, height: 460,
      props: { screen: "launch", entry: entry.id, space: space.id } });
  } else executePlan(plan);
}
export async function resolvePlan(id, spaceId) {
  const space = findSpace(spaceId); assertReady(space);
  const agents = await loadAgents(space.machine), c = store.read();
  const entry = registry(c, space.machine, agents).find(e => e.id === id);
  if (!entry) throw new Error("This launch entry no longer exists");
  return buildPlan(c, space, entry);
}
export async function probeCLI(entry, machine) {
  if (!entry.run?.[0]) throw new Error("Executable is missing");
  const executable = entry.run[0];
  const version = await H.exec(executable, ["--version"], { on: machine, timeout: 8000 });
  const help = await H.exec(executable, ["--help"], { on: machine, timeout: 8000 });
  if (help.code !== 0) throw new Error(`CLI help exited ${help.code}; wrapper commands may require a dedicated launcher`);
  const result = { version: (version.stdout || version.stderr).trim().slice(0, 240),
    help: (help.stdout + "\n" + help.stderr).slice(0, 40000), checkedAt: Date.now() };
  const key = `${KEY}.probes`, all = H.shared(key) ?? {}, host = hostKey(machine);
  H.setShared(key, { ...all, [host]: { ...all[host], [executable]: result } });
  return result;
}
export async function saveProgram({ key, name, run, icon = null, adapter = "generic" }, remove = false) {
  if (!/^ham-[a-z0-9-]+$/.test(key)) throw new Error("Only manager-owned ham-* program keys can be changed");
  if (!remove) {
    stringArray(run, "Command", true);
    if (typeof name !== "string" || !name.trim() || name.length > 100 || name.includes("\0")) throw new Error("Agent name is required (max 100, no NUL)");
    validate({ ...store.read(), adapters: { ...store.read().adapters, [key]: adapter } });
  }
  if (icon && (icon.includes("..") || /^[a-z]+:/i.test(icon) || /^[\\/]/.test(icon))) throw new Error("Use a relative icon path inside Herdr's home");
  const path = `${H.appHome()}/programs.json`, before = await H.readTextFile(path);
  const data = before === null ? { programs: {} } : JSON.parse(before);
  if (!data || typeof data !== "object" || Array.isArray(data) || (data.programs && (typeof data.programs !== "object" || Array.isArray(data.programs))))
    throw new Error("programs.json has an unexpected shape; it has not been modified");
  data.programs ??= {};
  if (remove) delete data.programs[key];
  else {
    if (Object.prototype.hasOwnProperty.call(data.programs, key)) throw new Error("Program key already exists; choose another key");
    data.programs[key] = { name: name.trim(), run, icon, agent: true };
  }
  if (before !== null) await H.writeTextFile(`${H.appHome()}/agent-manager-programs-${Date.now()}.json`, before, null);
  await H.writeTextFile(path, JSON.stringify(data, null, 2) + "\n", before);
  store.change(c => { if (remove) delete c.adapters[key]; else c.adapters[key] = adapter; return c; });
  H.notify({ title: "Agent Manager", body: "programs.json updated. Refresh after Herdr reloads the file.", level: "success" });
}
