# Herdr Agent Manager

A native agent management dialog and replacement new-agent popup. Open + → Manage… to arrange entries, choose permissions and maintain launch presets. A native preview.png is intentionally absent: the development environment has no Herdr desktop runtime. Capture it from the real app after native acceptance before Gallery submission.

## What you see

A 1080×780 themed dialog: title and current host, host strip, global/host permission controls, search and import/export, filters, vertically scrollable Agent cards. Each card shows name/type/install state, ordering, visibility, defaults, permissions, preview/launch, preset and diagnostic actions. Editors appear above the list. A 370×570 popup holds Manage, Terminal, default action, ordered entries and Space/Worktree actions. A separate 760×460 launch modal shows host/Space/folder, redacted command and warnings. Colors follow the active Herdr theme.

## What you can do

Drag or use arrows to reorder; enable/disable; select host or Space defaults; choose native/managed permissions; create/edit/duplicate/delete profiles; register custom commands; explicitly inspect CLI version/help; import/export, restore and reset. 1–9 and preset letters launch; Enter starts the default; Shift+shortcut previews. YOLO and unverified executable overrides receive review by default.

## How it behaves

Entry permission overrides preset, host and global permission. Preferences are per client, separated by host. Native mode preserves existing arguments. Unsupported managed permissions block launch. Missing/offline hosts and changed configuration/target folder reject execution rather than redirecting. Existing sessions never change.

## Built from

Native gpui-kit View/div/svg/image and gpui-base flex/Input controls. Herdr supplies discovery, live state/themes, persistence, file CAS writes, overlays and tab.new. Pure modules handle schema, registry and adapters. A Node-only installer clones installed tabs, changes its unique menu hook, and generates a separate layout; native checks gate activation. No browser, server, telemetry or npm dependencies.

## Watch out

Mocks do not validate native pixels/focus/drag or real CLI sessions. Windows environment overrides need pwsh 7.3+; remote OS must be explicit. Generic Agents have no managed permission modes. Discovery may cache one minute. Imported profiles execute commands; only trust known files. Environment/arguments persist plaintext; exports strip environment values, not arbitrary argument secrets. Shared state is not a cross-client transaction. No Settings-category injection or chat protocol adapter.

## Done when

Node tests and native checks pass; + reaches this manager; order/visibility/defaults survive restart; menu shortcuts match entries; CLI argv are correct; cancelled reviews start nothing; remote sessions stay in target Space/folder; stale previews fail; file conflicts preserve edits; uninstall retains personal files. Record actual native outcomes in docs/VALIDATION.md.
