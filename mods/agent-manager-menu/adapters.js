// Mappings checked against primary documentation, 2026-11-12. See docs/COMPATIBILITY.md.
// A permission request is not a sandbox and cannot override organization policies.
const MAP = {
  claude: {
    modes: { prompt: ["--permission-mode", "default"], auto: ["--permission-mode", "acceptEdits"], "full-access": ["--dangerously-skip-permissions"] },
    values: ["--permission-mode"], flags: ["--dangerously-skip-permissions", "--allow-dangerously-skip-permissions"], model: "--model"
  },
  codex: {
    modes: { prompt: ["--sandbox", "read-only", "--ask-for-approval", "on-request"],
      auto: ["--sandbox", "workspace-write", "--ask-for-approval", "on-request"],
      "full-access": ["--dangerously-bypass-approvals-and-sandbox"] },
    values: ["--sandbox", "-s", "--ask-for-approval", "-a"],
    flags: ["--full-auto", "--approve-for-me", "--not-so-yolo", "--yolo", "--dangerously-bypass-approvals-and-sandbox"], model: "--model"
  },
  grok: {
    modes: { prompt: ["--permission-mode", "default"], auto: ["--permission-mode", "auto"], "full-access": ["--permission-mode", "bypassPermissions"] },
    values: ["--permission-mode"], flags: ["--always-approve", "--yolo"], model: "--model"
  },
  copilot: {
    modes: { "full-access": ["--allow-all"] },
    values: [], flags: ["--allow-all", "--yolo", "--allow-all-tools", "--allow-all-paths", "--allow-all-urls"], model: "--model"
  },
  generic: { modes: {}, values: [], flags: [], model: null }
};
export function adapterFor(key, override) {
  if (override) return override;
  if (["claude", "claude-code"].includes(key)) return "claude";
  if (["codex", "grok", "copilot"].includes(key)) return key;
  if (key === "github-copilot") return "copilot";
  return "generic";
}
export function supportedModes(adapter) { return ["native", ...Object.keys(MAP[adapter]?.modes ?? {})]; }
export function stripOptions(args, valueFlags, booleanFlags) {
  const result = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") { result.push(...args.slice(i)); break; }
    const key = arg.split("=", 1)[0];
    if (valueFlags.includes(key)) {
      if (!arg.includes("=")) {
        if (i + 1 >= args.length || args[i + 1].startsWith("-")) throw new Error(`Missing value for ${key}`);
        i++;
      }
    } else if (!booleanFlags.includes(key)) result.push(arg);
  }
  return result;
}
function insertBeforeDelimiter(args, options) {
  const at = args.indexOf("--");
  return at < 0 ? [...args, ...options] : [...args.slice(0, at), ...options, ...args.slice(at)];
}
export function adapt(run, extra, mode, adapter, model = "") {
  if (!Array.isArray(run) || !run.length || !run[0]) throw new Error("No executable configured");
  const spec = MAP[adapter] ?? MAP.generic;
  if (mode !== "native" && !spec.modes[mode]) throw new Error(`${adapter} does not support managed '${mode}' permissions. Use CLI native settings.`);
  let args = [...run.slice(1), ...extra];
  if (mode !== "native") {
    const options = args.slice(0, args.indexOf("--") < 0 ? args.length : args.indexOf("--"));
    if (adapter === "codex" && options.some(a => /^(?:-c|--config|--profile|-p)(?:=|$)/.test(a) || /^-[caspm][^=]/.test(a)))
      throw new Error("Codex config/profile/compact options conflict with managed permissions; use CLI native or remove overrides");
    if (adapter === "claude" && options.some(a => /^(?:--settings|--allowedTools|--allowed-tools)(?:=|$)/.test(a)))
      throw new Error("Claude settings/allow rules require CLI native mode; managed permissions would be ambiguous");
    args = stripOptions(args, spec.values, spec.flags);
    args = insertBeforeDelimiter(args, spec.modes[mode]);
  }
  if (model) {
    if (!spec.model) throw new Error("This adapter has no model flag. Put the explicit flag in Arguments JSON instead.");
    args = stripOptions(args, [spec.model, "-m"], []);
    args = insertBeforeDelimiter(args, [spec.model, model]);
  }
  return [run[0], ...args];
}
export function riskOf(argv, mode, hasOverride = false) {
  const joined = argv.join(" ");
  return mode === "full-access" || hasOverride || /--(?:yolo|always-approve|dangerously-|allow-all)|bypassPermissions|danger-full-access|\bdontAsk\b|(?:--ask-for-approval|-a)[= ]+never/.test(joined);
}
export function requiredFlags(adapter, mode) {
  return (MAP[adapter]?.modes[mode] ?? []).filter(s => s.startsWith("--"));
}
export function redact(argv) {
  let hide = false;
  return argv.map(arg => {
    if (hide) { hide = false; return "<redacted>"; }
    if (/^--?[^=]*(?:token|password|secret|api[-_]?key)/i.test(arg)) {
      if (arg.includes("=")) return arg.split("=", 1)[0] + "=<redacted>";
      hide = true;
    }
    return arg;
  });
}
function quotePS(value) { return "'" + value.replace(/'/g, "''") + "'"; }
export function utf16base64(text) {
  const bytes = []; for (let i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i) & 255, text.charCodeAt(i) >>> 8);
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2], n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += abc[(n >>> 18) & 63] + abc[(n >>> 12) & 63] + (b === undefined ? "=" : abc[(n >>> 6) & 63]) + (c === undefined ? "=" : abc[n & 63]);
  }
  return out;
}
export function withEnvironment(argv, env, platform) {
  const pairs = Object.entries(env);
  if (!pairs.length) return argv;
  if (platform === "unix") return ["env", ...pairs.map(([k, v]) => `${k}=${v}`), ...argv];
  if (platform !== "windows") throw new Error("Select the remote host platform before using environment overrides");
  const code = "$ErrorActionPreference='Stop'; $PSNativeCommandArgumentPassing='Standard'; " +
    pairs.map(([k, v]) => `[Environment]::SetEnvironmentVariable(${quotePS(k)},${quotePS(v)},'Process'); `).join("") +
    "& " + argv.map(quotePS).join(" ") + "; exit $LASTEXITCODE";
  return ["pwsh", "-NoLogo", "-NoProfile", "-EncodedCommand", utf16base64(code)];
}
