# Shared Digital-Human Workflow

Use the same local CLI and source identity; no local token setup is required. Base route:
`http://127.0.0.1:4198/api/agent/v1/avatar-workflow`.
The server executes these jobs. The browser does not need to remain open.

## Procedure

1. Run `avatar-library`. Select saved `voice.id`, `image.id`, and `workflow.id`, not the provider's voice ID. Read `image.voiceIds` and `defaultVoiceId` as manual recommendations, not identity inference.
2. Run `avatar-upload <file>` for a new image or input audio. Images enter the shared album; audio returns a local URL accepted in `input.audioUrl`.
3. Build a JSON input file and run `avatar-submit --input @file.json`. Preserve returned `job.id`.
4. Run `avatar-wait <job-id>` or `avatar-status <job-id>`. Completed audio/video/subtitle outputs appear in the workbench history, with source and input references.

```json
{
  "text": "The speech text to synthesize.",
  "voiceId": "saved-voice-record-id",
  "imageId": "saved-album-image-id",
  "workflowId": "kling",
  "prompt": "Natural expression and restrained gestures.",
  "options": {
    "speech": { "model": "speech-2.8-hd", "speed": 1 },
    "avatar": { "enabled": true },
    "subtitle": { "enabled": false }
  }
}
```

The example above is the backward-compatible combined pipeline. For independent steps, explicitly set `operation` and submit one of these inputs with the same `avatar-submit` command:

```json
{"operation":"speech","text":"The text to synthesize.","voiceId":"saved-voice-record-id","options":{"speech":{"model":"speech-2.8-hd","speed":1}}}
```

```json
{"operation":"avatar","audioUrl":"https://example.com/approved-audio.wav","imageId":"saved-album-image-id","workflowId":"kling","prompt":"Natural gestures."}
```

```json
{"operation":"subtitle","mediaUrl":"/api/control/v1/avatar-workflow/media/example.mp4","text":"Optional original transcript.","options":{"subtitle":{"mode":"sentence","model":"base","language":"auto"}}}
```

```json
{"operation":"adjustAudio","audioUrl":"https://example.com/approved-audio.wav","options":{"adjustAudio":{"speed":1.1,"trimStart":0}}}
```

Only the selected operation runs. Read `steps.speech.url`, `steps.adjustAudio.url`, `steps.avatar.url` or `steps.subtitle.url` after completion and explicitly provide it to a later operation. Passing a result does not itself submit another job. Subtitles require no saved voice or image. Use `avatar-upload <video-file>` for a local subtitle-source video; its returned URL belongs in `mediaUrl`. Generated videos are not automatically archived; user-selected uploaded inputs are stored locally for processing.
Select a RunningHub workflow by its saved record ID. Never put stored credentials in the task input; the service resolves them locally. Optional audio processing/subtitles need configured tools, visible through `GET /dependencies`.

## Library Access

- `GET /library`: public voices, workflows, image metadata, and redacted settings.
- `POST /library/voices` or `/workflows`: `{ "item": { ... } }`, create only for Agents.
- `POST /images`: multipart `file`, PNG/JPEG/WebP, at most 20 MiB, SHA-256 deduplicated.
- `POST /audio`: multipart `file`, at most 40 MiB.
- `POST /media`: multipart audio/video `file`, at most 64 MiB, for independent subtitles.
- `GET /jobs/:id`: durable step status, remote task IDs, result URLs.

Client shortcuts: `avatar-add-voice --input @voice.json`, `avatar-add-workflow --input @workflow.json`.
Agents cannot overwrite/delete existing library records or change machine dependencies/global keys. Manual browser edits use version checks and show conflicts instead of overwriting another browser's changes.

Do not resubmit `submission-unknown`: the provider may already have accepted it. Preserve the job ID and ask for manual verification. A task with a saved remote ID resumes polling after a service restart. `partial` means an earlier output succeeded but a later optional step failed; report both the output and the error.

Album originals and necessary intermediate audio/subtitle files live under the workbench shared data directory. Remote generated videos remain URLs and metadata; do not download full videos unless explicitly requested.
