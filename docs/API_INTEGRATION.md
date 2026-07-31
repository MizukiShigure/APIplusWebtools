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

The supported automation boundary is `http://127.0.0.1:4198/api/agent/v1`. Authenticate with the environment-provided bearer token shown in the browser's Agent API settings. Do not embed the token in task payloads or source files.

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/capabilities` | Live task families and model parameter choices |
| POST | `/assets` | Multipart `file` plus `mediaType`; returns a temporary asset descriptor |
| POST | `/tasks` | Idempotent task envelope keyed by `clientTaskId` |
| GET | `/tasks/:id` | Task state, upstream IDs, progress, results and errors |
| GET | `/tasks/:id/events` | Append-only events after an optional sequence |
| POST | `/tasks/:id/cancel` | Provider cancellation when configured, otherwise local cancellation |
| GET | `/history?taskId=...` | Unified result metadata for one task |

Supported task families are `image`, `imageVideo`, `motion`, `multiVideo`, and `avatar`. Clients must query capabilities before constructing model-specific input. See [the bundled Agent reference](../skills/api-plus-agent/references/agent-api.md) for the envelope and asset-key map.

The API intentionally has no Agent delete endpoint. Keep `clientTaskId` stable across retries; changing it creates a new logical generation request.

The browser worker automatically obtains a fresh same-origin control session and re-registers after the local service restarts. Tasks that already have upstream IDs resume polling; a task interrupted while submitting without an upstream ID becomes `submission-unknown` and is never auto-resubmitted.
