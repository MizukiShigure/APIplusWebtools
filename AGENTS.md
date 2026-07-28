# Agent Project Guide

## Mission

APIplusWebtools is a local-first browser console for batch media generation. Keep it usable by non-developers through the Windows launchers while preserving a clear path for developers and coding agents to extend task pages, model adapters, queue behavior, and local storage.

## Read First

Before changing code, read these files in order:

1. `README.md` for the user-facing contract.
2. `docs/ARCHITECTURE.md` for runtime boundaries and data flow.
3. `docs/DEVELOPMENT.md` for commands and extension points.
4. `docs/API_INTEGRATION.md` before changing provider payloads or polling.
5. `docs/DATA_AND_PRIVACY.md` before touching persistence or packaging.
6. `docs/RELEASE_CHECKLIST.md` before publishing a package or tag.

## Hard Safety Rules

- Never commit or package `data/history.json`, browser exports, queue snapshots, prompts, generated URLs, API keys, tokens, logs, or personal RunningHub configurations.
- Never replace a user's browser or disk history with an empty collection. Empty writes are intentionally guarded.
- Do not change existing storage keys without a backward-compatible migration.
- Do not resubmit an asynchronous job after refresh when a remote task ID already exists. Resume the query endpoint instead.
- Do not revert unrelated user changes in a dirty worktree.
- Keep the distributable API Base empty. The package builder sanitizes it and the package test enforces it.
- Keep the local server bound to `127.0.0.1` by default. A broader host binding is an explicit deployment decision.
- Provider credentials belong in runtime configuration, never source code.

## Project Map

- `index.html`: shell markup, dialogs, and script/style loading order.
- `styles.css`: all application styling and responsive layout rules.
- `app.js`: browser state, rendering, task pages, model adapters, queues, history, uploads, and interactions.
- `model-contracts.js`: isolated provider validation and payload rules that can be tested without a browser.
- `server.cjs`: static server, history disk backup, and the small RunningHub proxy.
- `Start_API_Tool.bat` / `Stop_API_Tool.bat`: supported Windows lifecycle.
- `launcher-*.ps1`: port and PM2 ownership helpers used by the launchers.
- `*.test.cjs`: dependency-free Node contract tests.
- `scripts/build-portable.ps1`: allowlisted, privacy-clean distribution builder.
- `data/`: local runtime data; ignored by Git and excluded from packages except `.keep`.
- `runtime/`: optional portable `node.exe`; excluded from Git and packages except `.keep`.

## Runtime Contract

The browser talks directly to the configured company API Base for most models. The local Node server only serves static files, stores a structured history backup, and proxies RunningHub operations that cannot safely or reliably run in the browser.

Rows use the status lifecycle `pending`, `queued`, `running`, `partial`, `done`, `failed`, `canceled`, and `dirty`. A row with queued or running jobs is locked against parameter mutation. Copying a row remains available while it runs.

Every asynchronous submission must persist its task ID and query metadata before polling. Refresh recovery reconstructs polling jobs from those persisted records. The default task deadline is 30 minutes and the poll interval is 60 seconds.

## Change Strategy

- Prefer a focused pure helper in `model-contracts.js` when the behavior is provider validation, option mapping, or payload construction.
- Follow the existing model configuration objects in `app.js` for endpoints, versions, dimensions, quality options, validation, payload construction, and async query behavior.
- Keep page-specific row normalization, persistence, queue, renderer, and submit flow aligned. A new task page normally needs all five.
- Reuse asset helpers instead of creating a second upload or clipboard representation.
- Preserve reference identity when copying assets; do not upload the same URL again without a provider-specific reason.
- Keep visible controls compatible with the actual backend contract. A UI label is not a substitute for mapping to provider fields.
- Add server routes only for local persistence, CORS/auth boundaries, or provider operations that require a trusted local hop.

## Test-First Workflow

1. Add or update the narrowest `*.test.cjs` contract that expresses the requested behavior.
2. Run that test and confirm it fails for the intended reason.
3. Make the smallest implementation change.
4. Run the focused test.
5. Run `npm test` before claiming completion.
6. For packaging changes, run `npm run package` and inspect the ZIP contents.

The tests intentionally use Node built-ins only. Do not add a dependency merely to write a small contract test.

## Commands

```powershell
npm start
npm test
npm run package
```

The app is then available at `http://127.0.0.1:4198/`. A custom port can be supplied through the `PORT` environment variable.

## Definition Of Done

- The requested workflow works in the browser without breaking existing task pages.
- Persisted rows survive a refresh with compatible state.
- Existing remote task IDs resume polling and are not submitted twice.
- Error messages preserve useful provider details without exposing credentials.
- `npm test` passes.
- The generated ZIP contains the user runtime, engineering docs, Agent guide, and tests, but no private state.
- User-facing behavior changes are recorded in `CHANGELOG.md` and the release version files stay consistent when making a release.
