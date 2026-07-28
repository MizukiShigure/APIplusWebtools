# Development Guide

## Prerequisites

- Node.js 20 or newer.
- A modern Chromium-based browser.
- Windows 10/11 for the supported batch launchers.
- Access to a compatible API gateway for real generation calls.

The project currently has no npm runtime dependencies. Node is used for the local server and contract tests.

## Start The Application

For normal Windows use, run `Start_API_Tool.bat`. For development:

```powershell
npm start
```

Open `http://127.0.0.1:4198/`. Stop the foreground process with `Ctrl+C`, or use `Stop_API_Tool.bat` when the launcher owns the process.

Custom port example:

```powershell
$env:PORT = "4300"
npm start
```

Browser storage is origin-scoped. Changing `127.0.0.1` to `localhost`, changing the port, or changing browsers creates a different IndexedDB/localStorage namespace.

## Fast Development Loop

1. Read the relevant model/page configuration and its tests.
2. Add a focused failing `*.test.cjs` contract.
3. Run that single test with `node <test-file>`.
4. Make a minimal code change.
5. Refresh the browser with a changed query string if cache is suspected.
6. Run `npm test`.
7. Build the distribution with `npm run package` when package contents or defaults changed.

No bundler or compile step is required. Browser source changes are loaded directly.

## Where To Make Changes

### Add or adjust a model

Start in the matching catalog near the top of `app.js`:

- `IMAGE_MODELS`
- `IMAGE_VIDEO_MODELS`
- `MOTION_MODELS`
- `MULTI_VIDEO_MODELS`
- `VIDU_REF_VIDEO_MODEL`
- `AVATAR_MODELS`

A model usually defines labels, create/query endpoints, versions, sizes, qualities, durations, capability checks, validation, and `build(row)`. Keep option lists aligned with what the actual gateway accepts, not only the provider's public API.

When validation or mapping can be expressed without DOM/state access, place it in `model-contracts.js` and cover it in `model-contracts.test.cjs`.

### Add a task page

A complete task page normally needs:

1. An entry in `TASK_PAGES`.
2. A storage key and normalized row shape.
3. State fields for rows, queue, running count, and scroll target.
4. A page renderer and row renderer.
5. Event bindings for add, edit, upload, paste, copy, submit, cancel, and delete.
6. A persistence function.
7. Queue processing, result appending, and recovery pipeline registration.
8. Generation-history metadata sufficient to recreate the original row.
9. Tests for the UI contract and runtime behavior.

Do not advertise a page as ready until its create payload, query behavior, errors, and history reuse are functional.

### Add a local server route

Add a route only when browser-only code is insufficient, such as disk persistence, CORS, streamed file upload, or a credentialed provider hop. Implement a small handler, register it in `routeApi`, enforce body limits, return JSON, and avoid logging credentials or payload contents.

### Change persistence

Rows and settings use `localStorage`; large histories use IndexedDB with a disk mirror. New fields must be normalized so older saved rows still load. New storage keys should be stable and versioned only when the schema is incompatible.

Never write an empty history snapshot over a non-empty source during startup or recovery.

## UI Conventions

- Keep the left navigation and page toolbar stable while table content scrolls.
- Preserve row position during operations; avoid full-page jumps after every update.
- Use fixed media preview dimensions and thumbnails in dense grids.
- Running rows lock mutable inputs, submit, and delete; row copy remains enabled.
- Long prompts show a short preview and open in a detail panel with references.
- Keep provider-specific controls conditional on the selected model/version.

## Debugging

### Page does not open

Run `node server.cjs` in a terminal and inspect the startup message. Check whether port 4198 is already occupied. The batch launcher can select another port through `PORT`.

### Requests fail but the UI works

Inspect the row error and browser Network panel. Separate local failures from gateway failures:

- `Failed to fetch` usually means network/CORS/service reachability.
- HTTP 404 usually means the configured gateway route does not exist.
- HTTP 400 usually means a field name or value is invalid.
- HTTP 403 usually means permission or account access.
- HTTP 429 usually means quota or capacity exhaustion.
- HTTP 500 usually means gateway/provider failure; preserve the returned message.

### Refresh interrupted a task

If a task ID was persisted, startup should place the row back into polling. A row is only released for resubmission when no recoverable remote task ID/query endpoint exists.

### History appears empty

Confirm the same browser origin is in use. Then inspect IndexedDB and the local `/api/local/history` response. See `docs/DATA_AND_PRIVACY.md` before attempting recovery.

## Agent Handoff Checklist

A coding agent should begin by reporting:

- current branch and dirty files;
- the focused files and tests it expects to touch;
- any data migration or provider contract risk;
- the exact verification commands it will run.

It should finish by reporting changed files, test results, package path when built, and anything it could not verify against a live provider.
