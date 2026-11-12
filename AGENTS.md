# Contributor instructions

This is Herdr native GPUI JavaScript, not Node/browser/React at runtime.

- src is authoritative; run npm run build and commit generated mods with source. npm run check verifies equality and tests without dependencies.
- A mock test is NOT a native check. Run herdr-app check for both Mods and the generated tabs on a Herdr-equipped machine; manually test focus, drag, scrolling, async errors, Windows argument transport and SSH targeting. Report only checks actually executed.
- Never retain a GPUI cx for later. Use fresh callback contexts, cx.spawn and cx.timer. Avoid module-global mutable UI state and top-level host calls.
- Pin Space, machine and folder across asynchronous launch operations. Reject stale config revisions. Do not infer a remote OS from the local OS.
- Use argv arrays, not shell concatenation. Quote every PowerShell literal. Never introduce execution-policy bypass or invent CLI permission flags.
- Shared storage is plaintext and last-write-wins across clients, not a transactional encrypted database. Never log environment values.
- Preserve official Mods, keys, unrelated program definitions and unowned/modified files. Keep conflict checks, backups and rollback.
- Do not create a fake native screenshot. Gallery preview.png must come from the real running app after acceptance.
