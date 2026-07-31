---
name: api-plus-agent
description: Use when an Agent needs to generate or edit images, create videos, imitate motion, or create digital-human media through the locally running API Plus Webtools browser worker.
---

# API Plus Agent

## Overview

Use the local append-only Agent API to operate the same models and history pool as the browser UI. Keep the browser tab open: it is the authenticated execution worker that talks to the configured company gateway.

## Required Workflow

1. Confirm `http://127.0.0.1:4198/` is open in a browser on this computer.
2. Read `API_PLUS_AGENT_TOKEN` from the environment. Never request it in chat or put it in source, task JSON, logs, or commits.
3. Run `capabilities` before selecting a task family, model, version, size, quality, duration, or media combination.
4. Run `upload` for every local image, video, or audio file. Put each returned asset object under the task-family key documented in [references/agent-api.md](references/agent-api.md).
5. Run `submit`. Keep the returned `taskId`; the client generates a stable `clientTaskId`, so an exact retry is idempotent.
6. Run `wait` or `status` on that same `taskId`. Do not resubmit a task in `waiting_for_worker`, `polling`, or `submission-unknown`.
7. Return result URLs, task state, task ID, and any provider error. The browser worker writes completed outputs, prompt, parameters, assets, and Agent source into the shared history cache.

Use the bundled client:

```powershell
node skills/api-plus-agent/scripts/api-plus-agent-client.mjs capabilities
node skills/api-plus-agent/scripts/api-plus-agent-client.mjs upload D:\media\reference.png --media-type image
node skills/api-plus-agent/scripts/api-plus-agent-client.mjs submit --task-type image --input '@D:\jobs\image.json'
node skills/api-plus-agent/scripts/api-plus-agent-client.mjs wait <task-id>
```

Commands: `capabilities`, `upload`, `submit`, `status`, `wait`, and `cancel`. Output is machine-readable JSON except `--help`.

## Operating Rules

- Use only the loopback Agent API. Never call model providers or the company gateway directly.
- Treat `/capabilities` as authoritative; model contracts can change.
- Agents may append tasks and history but cannot delete or overwrite history. Record deletion remains a manual browser action.
- A task in `waiting_for_worker` is queued correctly. Open or restore the browser tab and continue waiting.
- A task in `submission-unknown` might already exist upstream. Report it for manual recovery; never submit it automatically again.
- `cancel` attempts provider cancellation only when the selected model advertises it; otherwise cancellation remains local.
- Do not download or persist full result media unless the user explicitly asks. The shared cache stores metadata and remote result URLs.
- Set a stable source identity with `API_PLUS_AGENT_SOURCE_CLIENT`, `API_PLUS_AGENT_SOURCE_ID`, and `API_PLUS_AGENT_SOURCE_LABEL` so history filters can distinguish Codex, Minimax Code, and browser work.

## Setup And Schema

Read [references/agent-api.md](references/agent-api.md) for environment setup, task envelopes, asset keys, states, and recovery rules. Run the client with `--help` for command syntax.

For Codex, place or link this `api-plus-agent` folder in the configured Codex skills directory. For Minimax Code or another Agent, expose this folder through that Agent's local skill/instruction discovery mechanism and invoke the bundled Node client. The execution contract remains the same.

## Common Mistakes

| Problem | Correction |
| --- | --- |
| Model or duration rejected | Refresh `capabilities` and use only advertised values. |
| Local file path placed directly in task JSON | Run `upload`, then reference the returned asset object. |
| Task stays `waiting_for_worker` | Keep the local browser page open; do not create another task. |
| Browser refresh occurs after provider submission | Continue `status`/`wait` on the existing task ID. |
| `submission-unknown` appears | Stop automatic retries and report the uncertain submission. |
| Token appears in a prompt or file | Remove it and rotate the token in the browser settings. |
