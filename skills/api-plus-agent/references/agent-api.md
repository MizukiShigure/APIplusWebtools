# Local Agent API Reference

## Connection

- Base URL: `http://127.0.0.1:4198/api/agent/v1`
- Authentication: no token setup for the local CLI; existing `Authorization: Bearer $API_PLUS_AGENT_TOKEN` integrations remain compatible.
- Access scope: loopback only in this release.
- Execution: the local Node service runs supported models without a browser. The CLI automatically starts it when needed using a hidden process.
- Persistence: task/history metadata and remote result URLs are recorded. Full result media is not copied into the Agent event store.

Never call a provider or company gateway directly from an Agent: use this client so uploads and generations enter shared history. Never put credentials in prompts, source files, JSON payloads, commits, or command arguments.

The CLI uses `X-API-Plus-Client: cli-v1` with loopback/origin checks. `API_PLUS_WORKBENCH_ROOT` selects an installed source root; otherwise the client resolves its enclosing workbench. `API_PLUS_AGENT_BASE_URL` selects a loopback API URL; `API_PLUS_AGENT_AUTOSTART=0` disables automatic startup. Data follows `API_BATCH_DATA_DIR`, otherwise Git installations use sibling `APIplusWebtools-data` and portable installs use their own `data`. Keep the same installation/data directory when resuming tasks.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/capabilities` | Read task families, models, versions, sizes, qualities, durations, media requirements, and cancellation support. |
| `POST` | `/assets` | Stage one local file as multipart fields `file` and `mediaType`. |
| `POST` | `/tasks` | Submit one task or `{ "tasks": [...] }`. |
| `GET` | `/tasks/{taskId}` | Read current state, progress, upstream IDs, results, and errors. |
| `GET` | `/tasks/{taskId}/events?after=N` | Read append-only task events. |
| `POST` | `/tasks/{taskId}/cancel` | Cancel local tracking/queue work; remote job/billing cancellation is not established by this response. |
| `GET` | `/history?taskId={taskId}` | Read unified generation records written by the service. |

There is intentionally no Agent delete or history-overwrite endpoint. Only the browser UI can remove records.

## Task Envelope

This is the full HTTP `/tasks` envelope. For CLI `submit --task-type ... --input @file.json`, save only the inner `input` object in the JSON file; the CLI supplies `taskType`, `origin`, and `clientTaskId`. Do not copy the outer envelope into `--input`.

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

For example, the input file for an image-generation request can contain:

```json
{
  "model": "nano",
  "version": "nano_banana_2",
  "prompt": "A warm editorial photograph of a ceramic cup on a wooden table.",
  "count": 1,
  "options": { "size": "1:1", "quality": "1K" },
  "assets": { "images": [] }
}
```

Submit this with `--task-type image`; confirm model/version choices with current capabilities first. For reference images, place the complete returned upload objects into `assets.images`. The abbreviated asset in the HTTP envelope is illustrative; retain all fields from `upload` in real input files.

## Task Families And Asset Keys

Always use `/capabilities` as the source of truth before choosing parameters.

| `taskType` | Purpose | `input.assets` keys |
| --- | --- | --- |
| `image` | Image generation/editing | `images` array |
| `imageVideo` | Text/image-to-video | `firstFrame`, optional `lastFrame` |
| `motion` | Motion imitation | `image`, `video` |
| `multiVideo` | Multimodal video | `refs` array containing image/video/audio assets |
| `avatar` | Digital human | `image`, `audio` |
| `audio` | Speech/music/sound operations | Model-specific text and audio/video inputs from `capabilities` |

Common input fields are `prompt`, `model`, `version`, `count`, and `options`. Common options are `size`, `quality`, `duration`, `generateAudio`, `autoMultiShot`, and `mode`. Only send values advertised for the chosen model by `/capabilities`.

For `audio`, the deployed gateway models use these CLI input fields (confirm current capabilities before submission):

| Model | Input object fields |
| --- | --- |
| `minimaxTts` | `text`, `version`, `options.voiceId`, `options.speed`, `options.volume`. |
| `suno` | `prompt`; this wrapper exposes prompt generation only, not separate custom-lyrics, extension, or stems modes. |
| `seedAudio` | `text`, `version`, `options.speechRate`, `options.loudnessRate`, `options.pitchRate`; optional `assets.referenceAudio` or `assets.referenceImage`, not both. |
| `wooshSound` | English `prompt`; no invented duration parameter. |
| `klingVideoAudio` | `assets.video`; this gateway wrapper does not accept a prompt and usually returns a video with sound. |

For Kling editing use `multiVideo`, model `kling3Omni`, `options.klingMode: "video_edit"`, `options.klingKeepVideoSound`, and one source video plus optional images in `assets.refs`. This edits the source duration/aspect ratio through the gateway's edit operation; it does not establish a selectable upstream 3.0 edit model. Source video currently requires MP4/MOV, 3–10 seconds, each edge 720–2160 pixels, at most 200 MB. The uploader reads common MP4/MOV/M4A, PNG/JPEG, and WAV metadata without external tools. If metadata is unavailable, supply measured `--duration`, `--width`, and `--height`; do not invent those values.

## CLI Examples

These direct Node examples assume the current directory is `<installed-workbench>/skills/api-plus-agent`, where the client can resolve its enclosing workbench. From the outer portable skill folder, use `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workbench.ps1` in place of `node scripts/api-plus-agent-client.mjs` for every command; it selects the embedded installation and Node runtime each time.

Set Agent/task source identity; no token setup is required:

```powershell
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

Use the PowerShell wrapper `scripts/run-workbench.ps1` when Node is bundled inside the portable skill. Additional commands:

```powershell
node scripts/api-plus-agent-client.mjs start
node scripts/api-plus-agent-client.mjs history --task-id <task-id>
node scripts/api-plus-agent-client.mjs events <task-id>
node scripts/api-plus-agent-client.mjs recreate <task-id>
```

`recreate` deliberately uses a fresh client request ID and links back to the original task. Use it for a requested new draw, not to recover a timeout. Uploads persist the original filename, source path, SHA-256, media metadata, and Agent identity. Task records persist the complete input, prompt/options, upstream IDs, progress/errors, and result URLs. The browser merges these records when opened; it is optional for execution. Remote input/result URLs may expire.

For Kling source-video editing, choose the actual editing operation and video role advertised by the selected model; do not assume a generic reference video is automatically treated as an edited source. For sound models, use each model's real text, voice, audio, video, or reference fields from capabilities. Preserve the complete asset object returned by `upload`.

## States And Recovery

- `waiting_for_worker`: inspect local service health, installed version, and headless capability; do not resubmit or require a browser for a supported model.
- `pending`, `claimed`, `validating`, `uploading`, `submitting`, `submitted`, `partial`, `polling`: continue checking the same `taskId`.
- `submission-unknown`: stop. The worker lost its lease during submission and automatic resubmission is deliberately disabled to avoid duplicate provider jobs.
- `completed`, `failed`, `canceled`: terminal.

If the service restarts after an upstream task ID was received, it resumes polling that task. A CLI exit, timeout, or lost poll does not mean the upstream job failed. Continue using its existing task ID.
