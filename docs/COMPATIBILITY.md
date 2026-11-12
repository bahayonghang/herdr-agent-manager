# Compatibility and permissions

Primary documentation checked on 2026-11-12. These mappings are not a claim that all released CLI versions or administrative policies have been end-to-end tested.

| Adapter | Ask / restricted | Auto | YOLO |
| --- | --- | --- | --- |
| Claude Code | --permission-mode default | --permission-mode acceptEdits | --dangerously-skip-permissions |
| Codex | --sandbox read-only --ask-for-approval on-request | --sandbox workspace-write --ask-for-approval on-request | --dangerously-bypass-approvals-and-sandbox |
| Grok | --permission-mode default | --permission-mode auto | --permission-mode bypassPermissions |
| GitHub Copilot | Unsupported | Unsupported | --allow-all |
| Generic | Unsupported | Unsupported | Unsupported |

All support CLI native, which preserves existing permission arguments/settings, not necessarily restricted. Generic commands can use explicit custom arguments. Claude Auto here is acceptEdits, not its separately named classifier mode. Codex preserves Herdr's existing --no-daemon and rejects ambiguous config/profile overrides in managed modes. Grok bypassPermissions is also called always-approve; deny rules/hooks/admin controls may still apply. Copilot exposes only verified native/full-access modes here.

Check CLI explicitly executes the executable's --version and --help on the selected host (8-second timeout each). It checks option names, not all values. Refresh after CLI upgrades. Wrappers such as npx package cannot be reliably inspected by probing npx alone; use a dedicated executable or native mode.

Remote OS must be selected before environment overrides. Unix uses env plus literal argv, requiring a real executable. Windows uses pwsh -NoProfile -EncodedCommand with quoted literals and UTF-16LE. PowerShell 7.3+ is required for Standard argument passing. Profile-only functions are unavailable; .cmd/.bat forwarding, empty arguments and Unicode still need real Windows acceptance. No hard-coded model list is provided.

## Primary references

- [Herdr Mod guide](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md)
- [Herdr API](https://github.com/herdrdev/herdr-app/blob/master/defaults/herdr.d.ts)
- [Official menu](https://github.com/herdrdev/herdr-app/blob/master/defaults/mods/new-menu/main.js)
- [Official tabs](https://github.com/herdrdev/herdr-app/blob/master/defaults/mods/tabs/main.js)
- [Claude Code CLI](https://code.claude.com/docs/en/cli-reference)
- [Codex CLI](https://developers.openai.com/codex/cli/reference/)
- [Grok permissions](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/22-permissions-and-safety.md)
- [Copilot CLI options](https://docs.github.com/en/copilot/reference/cli-command-reference)
