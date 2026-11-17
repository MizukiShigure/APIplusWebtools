# API Integration Guide

## Two Integration Paths

### Company gateway models

Most model definitions use relative endpoints. `postJson` resolves them against the API Base configured in the browser. This is the preferred path when the company backend owns provider credentials and exposes create/query routes.

### Local proxy models

Endpoints under `/api/runninghub/` are sent to `server.cjs`. Use a local proxy only when a browser call is blocked by CORS, must stream/download a file, or needs a provider-specific authorization hop.

Do not expose a general arbitrary proxy route.

## Model Configuration Contract

A model entry in `app.js` normally provides:

```js
{
  label: "Display name",
  endpoint: "/create_route",
  queryEndpoint: "/query_route",
  async: true,
  versions: [{ label: "Version", value: "provider-value" }],
  sizes: ["16:9", "9:16"],
  qualities: ["720p", "1080p"],
  build(row) {
    return { prompt: row.prompt };
  },
  validate(row) {
    return "";
  }
}
```

Some catalogs use capability functions such as `sizesFor`, `qualitiesFor`, `durationsFor`, `supportsLastFrame`, or `supportsAutoMultiShot`. Use them when options depend on the selected version or other row fields.

`validate(row)` returns an empty string when valid and a user-facing reason when invalid. Validate before enqueueing whenever possible.

## Gateway Envelope

The browser accepts the explicit envelope:

```json
{
  "success": true,
  "data": {}
}
```

It also normalizes common responses that contain a successful numeric `code`, `data`, `result`, a task ID, or a URL. Non-success codes are converted to `success: false` while preserving the provider message.

For an asynchronous create route, `data` must contain one of:

- `task_id`
- `taskId`
- `id`

An optional `task_path` or `taskPath` is persisted with the task.

A query route receives at least:

```json
{
  "task_id": "<remote-task-id>"
}
```

RunningHub query calls also receive `taskId`. Returning `data: null` means “still processing”; returning result data completes the job.

Result normalization recognizes strings, arrays, `urls`, `image_urls`, `video_urls`, `audio_urls`, nested `results`, and singular media URL fields.

## Assets

Assets in rows use a shared normalized structure with an ID, type, name, accessible URL, optional preview, dimensions, duration, size, and timestamps. Reuse `normalizeAssets`, `assetUrl`, `mergeAssets`, and the existing upload functions.

Do not replace an existing accessible URL with a local file path. The remote gateway must be able to fetch every reference URL supplied in a payload.

When a provider requires a different upload namespace, upload once and cache the provider file identifier on the asset. RunningHub uses `runningHubFileName` for this purpose.

## Asynchronous Safety

After a create call succeeds:

1. Normalize the task ID.
2. Add it to the row.
3. Persist `remoteTasks` with task ID, query endpoint, task path, and any runtime query credential required for that integration.
4. Render/persist before the first poll.
5. Poll until data, failure, cancellation, or the 30-minute deadline.

This order is required for refresh recovery. Never retry the create route merely because the page reloaded.

## Optional Remote Cancellation

Cancellation is capability-based. A model may declare `cancelEndpoint`, `cancelEndpoints`, or candidate-specific cancellation metadata. The UI always stops local tracking; it additionally tries declared or convention-derived remote endpoints when a task ID exists.

A remote cancel attempt is best effort. A failed cancel request must not reactivate the local row or hide the original task ID.

## RunningHub Workflow Adapter

The local routes are:

- `POST /api/runninghub/upload-url`
- `POST /api/runninghub/run`
- `POST /api/runninghub/query`

Workflow configurations bind imported node parameters to dynamic row values such as prompt, reference image/video/audio, duration, frame count, FPS, dimensions, aspect ratio, and table size. At submission time the adapter:

1. uploads referenced media to RunningHub;
2. derives duration and dimensions from row/assets;
3. replaces only nodes with a dynamic binding;
4. preserves manually fixed node values;
5. submits the final `nodeInfoList`;
6. persists the returned task ID and polls through the local query route.

The API key is user-supplied runtime configuration. Trim whitespace before placing it in an authorization header and never print it in errors or logs.

## Provider Change Checklist

- Confirm the gateway route exists; public provider documentation does not prove the company proxy implements it.
- Confirm exact model/version values accepted by the gateway.
- Confirm field names, casing, units, and allowed combinations.
- Confirm whether create is synchronous or asynchronous.
- Confirm the query completion shape and error envelope.
- Confirm whether remote cancellation exists.
- Add focused tests for payload mapping and invalid combinations.
- Test one minimal live request only after static tests pass.

## Local Agent API

The supported automation boundary is `http://127.0.0.1:4198/api/agent/v1`. The bundled local CLI works without manual token configuration and automatically starts the hidden service. Loopback/browser-origin checks still apply. Existing bearer clients remain compatible; never embed credentials in task inputs or source files.

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/capabilities` | Live task families and model parameter choices |
| POST | `/assets` | Multipart `file` plus `mediaType`; returns a temporary asset descriptor |
| POST | `/tasks` | Idempotent task envelope keyed by `clientTaskId` |
| GET | `/tasks/:id` | Task state, upstream IDs, progress, results and errors |
| GET | `/tasks/:id/events` | Append-only events after an optional sequence |
| POST | `/tasks/:id/cancel` | Local cancellation; do not infer that a remote job or its billing stopped |
| GET | `/history?taskId=...` | Unified result metadata for one task |

Supported task families are advertised dynamically, including `image`, `imageVideo`, `motion`, `multiVideo`, `avatar`, and `audio`. Clients must query capabilities before constructing model-specific input. See [the bundled Agent reference](../skills/api-plus-agent/references/agent-api.md) for the envelope and asset-key map.

The API intentionally has no Agent delete endpoint. Keep `clientTaskId` stable across retries; changing it creates a new logical generation request.

The background executor runs supported tasks without a browser. Tasks that already have upstream IDs resume polling after service restart; a task interrupted while submitting without an upstream ID becomes `submission-unknown` and is never auto-resubmitted. `history`/`events` inspect the persisted work; `recreate` deliberately starts a new draw linked to the original input.

### Kling source-video editing

Select `multiVideo` with Kling editing mode `options.klingMode: "video_edit"` and `options.klingKeepVideoSound`. Supply exactly one source video in `assets.refs`, with known duration, width, and height, and up to four images. Current gateway limits are MP4/MOV, 3–10 seconds, each edge 720–2160 pixels, at most 200 MB. Image references are JPG/JPEG/PNG, at most 10 MB, minimum edge 300 pixels, ratio 0.4–2.5.

The editing route follows the source through `duration: 0` and `aspect_ratio: ""`; it omits `model_name` and generic `sound`. This gateway contract does not prove a selectable 3.0 editing backend. Keep the label `Kling Omni 视频编辑`, preserve reference order, and distinguish live job evidence from documented route/parameter checks.

For explicit Kling Omni video generation ratios, the verified options are `16:9`, `9:16`, and `1:1`; the deployed gateway also exposes an empty/omitted ratio choice for applicable source-following workflows. This is different from Omni image generation, which supports `4:3` and `3:4` among its image sizes. An empty ratio control does not prove a particular nonstandard video output size without generating and inspecting that output.
