# Validation record

2026-11-12, Linux development container, Node.js v22.16.0.

**Executed:** npm run build; npm run check; **59 tests passed, zero failures/skips**. Generated files match source. JavaScript syntax checks also pass.

Tests cover schema/migrations/limits, host isolation, all reorder permutations, permission/default precedence, profile cleanup, shortcut scopes, export redaction, revision checks, exact launch targets, YOLO review, CLI probes, program registration, actual View handlers via strict mocks, installer ownership/conflicts/rollback, nested assets, custom-home propagation and conservative uninstall.

**Not executed:** herdr-app check/shot (binary unavailable); native pixel rendering, focus/drag/DPI; real Windows/macOS/SSH Agent sessions; PowerShell transport; authentication and actual CLI approval/sandbox behavior. Mock render tests execute actual handlers but do not emulate native painting/input routing.

CI is configured for Linux/Windows/macOS × Node 20/22, not the Herdr desktop. Workflow configuration alone is not evidence that remote jobs passed; inspect GitHub Actions results.

## Native acceptance

Default installation checks both Mods and the cloned tabs before activation, rolling back on failure. After that, test +/Manage, unclipped light/dark UI, text focus, scrolling, drag and arrows, restart persistence, shortcuts, supported/unsupported modes, preview/cancel/double confirm, changed config/folder and closed Space guards, SSH host/folder isolation and offline behavior, Windows paths/quotes/Unicode/empty argv with and without env overrides, invalid import and restore, programs.json conflicts and backups, uninstall preservation.

Record installed Herdr/CLI versions and actual outcomes. Capture preview.png only from the real running GUI; never represent a mock render as native evidence.
