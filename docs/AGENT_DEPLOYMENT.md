# Agent Deployment Runbook

For a Git clone, start with [the Git workflow](GIT_WORKFLOW.md). `Setup_Workbench.ps1` can provision a private Windows Node runtime, start the selected checkout, and install a linked Skill. `node scripts/workbench-manage.cjs sync` preserves local settings/data while updating code and registered Skills. The portable ZIP instructions below apply to fixed snapshots.

Use this guide to configure a recipient's local installation. The portable Windows x64 package includes `runtime/node.exe`, its license, source, tests, docs, and `skills/api-plus-agent`. The full skill release embeds this package and bootstraps it with `scripts/run-workbench.ps1`.

## Safety Boundaries

- Keep the server on `127.0.0.1`. Do not configure firewall openings, public tunnels, or remote access as part of setup.
- Preserve existing data, tokens, browser storage, and running tasks. Never clear history to fix startup.
- No company gateway is embedded. Check `capabilities.gateway.configured`; if false, guide the recipient to fill API Base on the local page using the address privately supplied by their administrator. Keep it in local `gateway.json`; never guess, retrieve it from historical Git commits, or add it to public source. Do not invent routes/model IDs.
- Never ask the user to paste credentials into chat. Credentials stay in the local browser configuration or process environment.
- Read-only startup and capability checks verify deployment. Submit real media when the user's request authorizes it; document live provider evidence separately from local/mock checks.
- Back up data before upgrades. Do not stop an unrelated Node process or another PM2 project to free a port.

## Local Setup Checklist

1. Read `README.md`, `docs/LOCAL_DEPLOYMENT.md`, and `AGENTS.md`. Confirm the extraction directory and Windows x64 architecture.
2. Read `VERSION` and `PORTABLE_BUILD.json`. Check the SHA-256 of `runtime/node.exe` against the manifest, then run `runtime/node.exe --version`. The manifest checks integrity, not publisher authenticity; use a trusted distribution source.
3. Confirm the installation directory is writable and `data` is private. Portable installs default to package-local `data`; Git installs use the sibling `APIplusWebtools-data`. An explicit `API_BATCH_DATA_DIR` overrides both.
4. Inspect port 4198 and process ownership. If another application owns it, report it or choose an agreed port. Never kill unknown listeners. Keep a chosen port stable because browser storage is origin-scoped.
5. For Agent-only setup run `scripts/run-workbench.ps1 capabilities` from the skill; it starts the service hidden. For manual UI use run `Start_API_Tool.bat`. Bundled-runtime launchers bypass global PM2 by default; do not install PM2 as a prerequisite.
6. Verify HTTP 200 at `/`, `/model-contracts.js`, and `/agent-runtime.js`, then inspect CLI capabilities/history without a browser. Check browser rendering only when UI validation is requested. History should be empty only on a genuinely new install; never overwrite a populated response.
7. Test company-network reachability without submitting jobs. An HTTP 401/403 proves reachability but not authorization. A GET 404 on an API base does not prove model POST routes are missing. Resolve authorized network/account access with the user, not by changing model endpoints at random.
8. Configure RunningHub only if requested, using the recipient's own key and workflow payload. Do not transfer the maintainer's browser configuration.

For automated verification, set `API_BATCH_NO_BROWSER=1` before starting and `API_BATCH_NO_PAUSE=1` before stopping. These affect launch UX only. Use a fresh browser profile and isolated data directory for tests, never the user's production origin/storage. Server logs are in the selected data directory under `logs`.

## Agent Generation Access

Read `skills/api-plus-agent/SKILL.md` and its `references/agent-api.md`. Register the full skill release through the receiving Agent's supported discovery mechanism; do not assume Codex and Minimax Code use identical install paths. No browser worker is required for supported headless tasks.

The CLI starts the local service automatically and requires no local token setup. Existing `API_PLUS_AGENT_TOKEN` integrations remain compatible. Keep optional provider credentials in the recipient's local runtime configuration, not in prompts, source, arguments, task JSON, or release archives.

From the package root, without globally installed Node:

```powershell
$env:API_PLUS_AGENT_SOURCE_CLIENT = 'codex'
$env:API_PLUS_AGENT_SOURCE_ID = 'recipient-workstation'
$env:API_PLUS_AGENT_SOURCE_LABEL = 'Codex on this PC'
& .\runtime\node.exe .\skills\api-plus-agent\scripts\api-plus-agent-client.mjs capabilities
```

For another Agent, set a distinct source identity. With a custom port, set `API_PLUS_AGENT_BASE_URL` to the corresponding loopback `/api/agent/v1` URL. Run the client with `--help` and verify the actual environment variable names against its source before configuring automation.

Upload local references through the client, submit using advertised capabilities, and retain the returned task ID. Agent and manual generations share the history pool with their source labels, source paths/hashes, complete input, prompts/options, and upstream IDs. Inspect `history --task-id <id>` / `events <id>`, and use `recreate <id>` for a requested new draw. `waiting_for_worker` needs service/version/capability diagnosis; opening a browser is not required for supported headless models. `submission-unknown` requires recovery, not automatic resubmission.

For an installed full skill, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workbench.ps1 capabilities`. It selects the bundled runtime and extracts the embedded workbench when needed. For this workstation only, the separate `local-api-workbench` skill invokes the verified fixed installation path and carries no application or runtime copy.

## Development And Repackaging

Read `docs/DEVELOPMENT.md` and the task-specific tests before editing. The bundled runtime contains Node only, not npm, Playwright or PM2. No npm dependency installation is needed to serve the application.

Run the same contract suite as `npm test` using the bundled runtime:

```powershell
$env:PATH = "$PWD\runtime;$env:PATH"
$commands = (Get-Content -LiteralPath package.json -Raw -Encoding UTF8 | ConvertFrom-Json).scripts.test
cmd /d /c $commands
```

Browser layout tests may report skips unless Playwright/Chrome is configured as documented by those tests. Report skips separately. Browser-assisted checks must use mock provider responses unless live generation has been authorized.

Rebuild a clean full package (choose a new output name):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-portable.ps1 -NodeRuntimePath runtime/node.exe -NodeLicensePath runtime/LICENSE -OutputPath dist/Workbench-Windows-x64.zip
```

Without the two runtime parameters the builder produces a source-only package. It always uses an explicit public-file allowlist; never ZIP a used working directory recursively. Inspect the archive for personal records, gateway addresses and credentials. Source-only and full packages both leave API Base empty and preserve neutral node templates.

## Handoff Report

Report version, install path, URL/port, actual data directory, runtime version, browser-free/tokenless startup result, company-network check result, test passes/skips, and unresolved issues. Verify effective shared-skill paths after synchronization. Do not claim another already-running Agent has reloaded a skill without evidence, or claim live model generation from a capability response alone.
