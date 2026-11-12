import test from 'node:test';
import assert from 'node:assert/strict';
import { adapt, supportedModes, stripOptions, riskOf, withEnvironment, utf16base64, redact, adapterFor } from '../src/adapters.js';
test('Codex keeps no-daemon and strips conflicting permission switches', () => {
  assert.deepEqual(adapt(['codex', '--no-daemon', '--sandbox=read-only', '-a', 'on-request'], ['--full-auto'], 'full-access', 'codex'), ['codex', '--no-daemon', '--dangerously-bypass-approvals-and-sandbox']);
});
test('Codex restricted mode uses read-only and on-request', () => {
  assert.deepEqual(adapt(['codex', '--yolo'], [], 'prompt', 'codex'), ['codex', '--sandbox', 'read-only', '--ask-for-approval', 'on-request']);
});
test('native mode preserves explicit existing configuration', () => {
  const argv = ['codex', '--config', 'approval_policy="never"']; assert.deepEqual(adapt(argv, [], 'native', 'codex'), argv);
});
test('managed Codex refuses ambiguous config/profile/compact options', () => {
  for (const args of [['-c', 'x=1'], ['--profile', 'x'], ['-sdanger-full-access'], ['-cfoo=bar']]) assert.throws(() => adapt(['codex', ...args], [], 'prompt', 'codex'), /conflict/);
});
test('Claude restricted mode removes both bypass flags', () => {
  assert.deepEqual(adapt(['claude', '--dangerously-skip-permissions', '--allow-dangerously-skip-permissions'], [], 'prompt', 'claude'), ['claude', '--permission-mode', 'default']);
});
test('Claude auto means acceptEdits and explicit settings are ambiguous', () => {
  assert.deepEqual(adapt(['claude'], [], 'auto', 'claude'), ['claude', '--permission-mode', 'acceptEdits']);
  assert.throws(() => adapt(['claude', '--settings', 'x'], [], 'prompt', 'claude'), /ambiguous/);
});
test('Grok does not retain an old YOLO alias', () => {
  assert.deepEqual(adapt(['grok', '--yolo', '--permission-mode=auto'], [], 'full-access', 'grok'), ['grok', '--permission-mode', 'bypassPermissions']);
});
test('Copilot and generic adapters do not claim unsupported permissions', () => {
  assert.deepEqual(supportedModes('copilot'), ['native', 'full-access']); assert.equal(adapterFor('opencode'), 'generic');
  assert.throws(() => adapt(['pi'], [], 'full-access', 'generic'), /does not support/);
});
test('option delimiter protects positional arguments', () => {
  assert.deepEqual(adapt(['claude', '--', '--yolo'], [], 'prompt', 'claude'), ['claude', '--permission-mode', 'default', '--', '--yolo']);
  assert.throws(() => stripOptions(['--sandbox'], ['--sandbox'], []), /Missing value/);
});
test('model override replaces long and short flags', () => {
  assert.deepEqual(adapt(['codex', '-m', 'old'], ['--model=another'], 'native', 'codex', 'new'), ['codex', '--model', 'new']);
  assert.throws(() => adapt(['pi'], [], 'native', 'generic', 'new'), /no model flag/);
});
test('native risky arguments still trigger risk detection', () => {
  assert.ok(riskOf(['claude', '--dangerously-skip-permissions'], 'native')); assert.ok(riskOf(['codex', '-a', 'never'], 'native'));
  assert.ok(riskOf(['custom'], 'native', true)); assert.equal(riskOf(['codex', '--no-daemon'], 'native'), false);
});
test('Unix environment uses a literal argument array', () => {
  assert.deepEqual(withEnvironment(['agent', '$(unsafe)'], { X: "a'; bad" }, 'unix'), ['env', "X=a'; bad", 'agent', '$(unsafe)']);
  assert.throws(() => withEnvironment(['agent'], { X: '1' }, 'auto'), /platform/);
});
test('PowerShell wrapper encodes UTF16 and quotes every literal', () => {
  const args = withEnvironment(['agent.exe', "'; bad; '", ''], { X: "a'$()中文" }, 'windows');
  assert.equal(args[0], 'pwsh'); const code = Buffer.from(args.at(-1), 'base64').toString('utf16le');
  assert.match(code, /'a''\$\(\)中文'/); assert.match(code, /& 'agent\.exe' '''; bad; ''' ''/);
  assert.equal(utf16base64('🙂中文'), Buffer.from('🙂中文', 'utf16le').toString('base64'));
});
test('known credentials are redacted', () => { assert.deepEqual(redact(['cli', '--api-key', 'secret', '--token=xxx', 'ok']), ['cli', '--api-key', '<redacted>', '--token=<redacted>', 'ok']); });
test('managed modes remove conflicting approval automation options', () => {
  assert.deepEqual(adapt(['codex', '--approve-for-me', '--not-so-yolo'], [], 'prompt', 'codex'), ['codex', '--sandbox', 'read-only', '--ask-for-approval', 'on-request']);
});
