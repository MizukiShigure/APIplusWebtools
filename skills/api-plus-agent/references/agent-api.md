# Local Agent API Reference

## Connection

- Base URL: `http://127.0.0.1:4198/api/agent/v1`
- Authentication: `Authorization: Bearer $API_PLUS_AGENT_TOKEN`
- Access scope: loopback only in this release.
- Execution: a browser tab at `http://127.0.0.1:4198/` must stay open. Tasks remain `waiting_for_worker` when no browser worker is online.
- Persistence: task/history metadata and remote result URLs are recorded. Full result media is not copied into the Agent event store.

Never call a provider or company gateway directly from an Agent. Never put the bearer token in prompts, source files, JSON payloads, commits, or command arguments.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/capabilities` | Read task families, models, versions, sizes, qualities, durations, media requirements, and cancellation support. |
| `POST` | `/assets` | Stage one local file as multipart fields `file` and `mediaType`. |
| `POST` | `/tasks` | Submit one task or `{ "tasks": [...] }`. |
| `GET` | `/tasks/{taskId}` | Read current state, progress, upstream IDs, results, and errors. |
| `GET` | `/tasks/{taskId}/events?after=N` | Read append-only task events. |
| `POST` | `/tasks/{taskId}/cancel` | Request provider cancellation when supported; otherwise cancel local tracking/queue work. |
| `GET` | `/history?taskId={taskId}` | Read unified generation records written by the browser worker. |

There is intentionally no Agent delete or history-overwrite endpoint. Only the browser UI can remove records.

## Task Envelope

```json
{
  "clientTaskId": "agent-stable-id",
  "taskType": "imageVideo",
  "origin": {
    "type": "agent",
    "client": "codex",
    "id": "codex-workstation",
    "label": "Codex workstation"
  },
  "input": {
    "prompt": "Camera slowly pushes toward the subject.",
    "model": "kling",
    "version": "kling-v3",
    "count": 1,
    "options": {
      "size": "16:9",
      "quality": "pro",
      "duration": 5
    },
    "assets": {
      "firstFrame": {
        "assetId": "asset-id-from-upload",
        "workerUrl": "/api/control/v1/assets/asset-id-from-upload",
        "mediaType": "image",
        "name": "frame.png"
      }
    }
  }
}
```

The CLI builds `clientTaskId` from canonical task content when it is omitted. Repeating the same submit command is idempotent and returns the existing task instead of generating another job.

## Task Families And Asset Keys

Always use `/capabilities` as the source of truth before choosing parameters.

| `taskType` | Purpose | `input.assets` keys |
| --- | --- | --- |
| `image` | Image generation/editing | `images` array |
| `imageVideo` | Text/image-to-video | `firstFrame`, optional `lastFrame` |
| `motion` | Motion imitation | `image`, `video` |
| `multiVideo` | Multimodal video | `refs` array containing image/video/audio assets |
| `avatar` | Digital human | `image`, `audio` |

Common input fields are `prompt`, `model`, `version`, `count`, and `options`. Common options are `size`, `quality`, `duration`, `generateAudio`, `autoMultiShot`, and `mode`. Only send values advertised for the chosen model by `/capabilities`.

## CLI Examples

Set secrets in the process environment, not in a prompt or command line:

```powershell
$env:API_PLUS_AGENT_TOKEN = '<token copied from the local settings dialog>'
$env:API_PLUS_AGENT_SOURCE_CLIENT = 'codex'
$env:API_PLUS_AGENT_SOURCE_ID = 'editing-pc'
$env:API_PLUS_AGENT_SOURCE_LABEL = 'Codex on editing PC'
```

Inspect capabilities:

```powershell
node scripts/api-plus-agent-client.mjs capabilities
```

Stage an asset:

```powershell
node scripts/api-plus-agent-client.mjs upload D:\media\frame.png --media-type image
```

Submit from a UTF-8 JSON file, then wait using the returned `taskId`:

```powershell
node scripts/api-plus-agent-client.mjs submit --task-type imageVideo --input '@D:\jobs\shot.json'
node scripts/api-plus-agent-client.mjs wait 11111111-2222-3333-4444-555555555555
```

All normal command results and errors are JSON except `--help`. A completed `wait` response includes the matching unified history records.

## States And Recovery

- `waiting_for_worker`: keep the page open and wait; do not resubmit.
- `pending`, `claimed`, `validating`, `uploading`, `submitting`, `submitted`, `partial`, `polling`: continue checking the same `taskId`.
- `submission-unknown`: stop. The worker lost its lease during submission and automatic resubmission is deliberately disabled to avoid duplicate provider jobs.
- `completed`, `failed`, `canceled`: terminal.

If a refresh occurs after an upstream task ID was received, the browser worker resumes polling that task. Do not create a replacement task merely because the browser refreshed.
