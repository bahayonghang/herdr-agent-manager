# Architecture

`model.js` validates configuration, merges discovery and profiles, resolves defaults/permissions, and implements filtering/order/export. `adapters.js` transforms argv with explicit CLI mappings. `store.js` handles shared state, revision checks and backups. `runtime.js` bridges discovery, launch, probes and files. `ui.js` defines themed controls; manager/menu are native Views.

Build copies shared modules into each installable Mod, so cross-Mod module resolution is not required. Shared persisted state, not module globals, synchronizes views.

## Configuration and precedence

Key `agent-manager.config`: `{version:1, revision:0, defaultPermission:"native", confirmRisk:true, hosts:{}, profiles:[], spaces:{}, adapters:{}}`.

Host keys are `local` or `remote:<machine>`. Host settings are order, disabled, defaultEntry, permission, permissions, platform. Entry IDs are `agent:<key>` or `profile:<id>`. A profile stores id, agent, name, scope (`*` or host), permission, optional complete run array, extra args, model, env and optional letter shortcut.

Permissions: entry → preset → host → global. Defaults: valid Space choice → valid host choice → first enabled installed entry. The menu omits unsupported entries from default/digit selection. Original planning-schema bare keys and defaultAgent are migrated. Unknown versions, prototype keys, duplicate IDs, shortcut collisions, malformed data and oversized inputs are rejected.

## Launch and storage

Pin the target Space/host; discover there; merge a configuration revision; validate readiness and capability; resolve argv; optionally preview; recheck revision/Space/machine/folder before explicit tab.new. Executable overrides remain unverified and require review. Help probes check option names, not every version's semantics.

Preferences use shared storage. Custom commands register under ham-* in programs.json via full-file merge, untouched-text backup and expected-content atomic write. Official definitions are not changed. CLI global settings remain untouched. Shared revision guards catch stale same-client views, not distributed concurrency; setShared is not a cross-client transaction.

## Installer and boundary

Exclusive local lock, owned-file SHA-256 manifest, prewrite snapshots, rollback, and native-check-before-activation. Original Mods, keys and layout stay intact. Drift in the single new-menu hook fails closed. Custom home propagates to CLI subprocesses. Uninstall retains modified files/configs.

This Mod runs with the user's authority; it is not a sandbox. Permission labels request CLI behavior and cannot override organizational controls. Profiles are executable configuration. Arguments/environment are plaintext, not a secret store; trusted imports are mandatory. Arbitrary wrappers and inherited CLI policy cannot be fully analyzed by static argument filtering.
