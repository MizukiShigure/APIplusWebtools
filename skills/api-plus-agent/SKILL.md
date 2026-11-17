---
name: api-plus-agent
description: Use when an Agent needs to generate or edit media through API Plus Webtools, install its workbench and Skill, or synchronize the installed project with GitHub.
---

# API Plus Agent

## Overview

Run media tasks through the local CLI. It starts the service in the background when needed; no open browser tab or local Agent token setup is required. Every uploaded input and submitted task is recorded in the same history cache used by the workbench UI.

## Required Workflow

For a Git checkout, installation and “同步项目” are documented in [Git workflow](../../docs/GIT_WORKFLOW.md). Run `node scripts/workbench-manage.cjs setup` from the checkout to register a lightweight Skill that follows this source; run `node scripts/workbench-manage.cjs sync` to update code, private-data backup and installed Skill together. Use `node scripts/workbench-manage.cjs cli <command>` to honor saved port/data settings. Contributions go through a separate branch/PR for the maintainer to choose.

Use `scripts/run-workbench.ps1` from this skill folder. In the full skill release it extracts the embedded workbench and Windows x64 Node runtime on first use; in a source checkout it uses that checkout. Read [portable setup](references/portable-setup.md) for installation or migration. Set `API_PLUS_WORKBENCH_ROOT` only when intentionally selecting another existing installation.

For the shared voice IDs, image album, or independent speech/avatar/subtitle stages, read [references/avatar-workflow.md](references/avatar-workflow.md).

1. Run `start` or any normal command to ensure the local service is available. Browser operation is optional.
2. Set a recognizable Agent/task source identity using the environment fields below. No local token setup is needed; `API_PLUS_AGENT_TOKEN` remains optional compatibility configuration.
3. Run `capabilities` before selecting a task family, model, version, size, quality, duration, or media combination.
4. Run `upload` for every local image, video, or audio file. Put each returned asset object under the task-family key documented in [references/agent-api.md](references/agent-api.md).
5. Run `submit`. Keep the returned `taskId`; the client generates a stable `clientTaskId`, so an exact retry is idempotent.
6. Run `wait` or `status` on that same `taskId`. Do not resubmit a task in `waiting_for_worker`, `polling`, or `submission-unknown`.
7. Use `history --task-id <id>` and `events <id>` to inspect saved inputs, settings, progress, and results. Return result URLs, task state, task ID, and any provider error. The service writes prompts, parameters, assets, and Agent source into the shared history cache.
8. For an explicitly requested new draw, use `recreate <task-id>`. It gets a fresh request identity linked to the original; retrying the original submit remains idempotent.

Use the bundled client:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workbench.ps1 capabilities
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workbench.ps1 upload D:\media\reference.png --media-type image
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workbench.ps1 submit --task-type image --input '@D:\jobs\image.json'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workbench.ps1 wait <task-id>
```

Commands: `start`, `capabilities`, `upload`, `submit`, `status`, `wait`, `history`, `events`, `recreate`, and `cancel`. Output is machine-readable JSON except `--help`. Use the wrapper for every command from an installed skill so it selects the correct embedded workbench and runtime.

## Operating Rules

- Use only the loopback Agent API. Never call model providers or the company gateway directly.
- Treat `/capabilities` as authoritative; model contracts can change.
- Agents may append tasks and history but cannot delete or overwrite history. Record deletion remains a manual browser action.
- A task in `waiting_for_worker` needs service/version/capability diagnosis. A supported headless model does not require opening a browser worker.
- A task in `submission-unknown` might already exist upstream. Report it for manual recovery; never submit it automatically again.
- `cancel` stops local queue work/tracking. Do not claim the remote job or billing stopped unless provider cancellation is explicitly verified for that operation.
- Do not download or persist full result media unless the user explicitly asks. The shared cache stores metadata and remote result URLs.
- Set a recognizable source identity with `API_PLUS_AGENT_SOURCE_CLIENT`, `API_PLUS_AGENT_SOURCE_ID`, and `API_PLUS_AGENT_SOURCE_LABEL` so history filters distinguish Codex, Minimax Code, and individual tasks. Uploads retain original filename, source path, hash, and media metadata locally.
- Keep the service loopback-only. Tokenless local access does not authorize LAN/public exposure. Keep credentials out of prompts, task JSON, logs, and distribution archives.

## Setup And Schema

Read [references/agent-api.md](references/agent-api.md) for environment setup, task envelopes, asset keys, states, and recovery rules. Run the client with `--help` for command syntax.

For Codex, place or link the full `api-plus-agent` release folder in its configured skills directory. For Minimax Code or another Agent, expose that folder through its supported discovery mechanism and invoke `scripts/run-workbench.ps1`. The wrapper keeps the selected installation consistent across calls; do not call the top-level copied Node client directly after extracting a portable skill.

## Common Mistakes

| Problem | Correction |
| --- | --- |
| Model or duration rejected | Refresh `capabilities` and use only advertised values. |
| Local file path placed directly in task JSON | Run `upload`, then reference the returned asset object. |
| Task stays `waiting_for_worker` | Inspect service health, installed version, and headless support; do not create another task. |
| Browser refresh occurs after provider submission | Continue `status`/`wait` on the existing task ID. |
| `submission-unknown` appears | Stop automatic retries and report the uncertain submission. |
| Token appears in a prompt or file | Remove it and rotate it if it was exposed. Local CLI use does not need token configuration. |
