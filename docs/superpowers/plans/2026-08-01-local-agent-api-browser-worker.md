# Local Agent API And Browser Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a localhost-only Agent API that lets Codex, Minimax Code, and other local Agents submit media tasks through the existing browser execution engine, while manual and Agent records share one append-only, origin-aware history.

**Architecture:** `server.cjs` owns an authenticated task ledger and append-only history journal under a configurable external data directory. A new browser runtime claims tasks using a lease, maps them into the existing row/queue implementations in `app.js`, and reports upstream IDs, progress, results, and cancellation back to the server. IndexedDB remains a browser read cache; generated binaries remain remote URLs.

**Tech Stack:** Node.js 20 built-ins (`http`, `fs`, `crypto`, `node:test`), browser JavaScript, IndexedDB, existing dependency-free HTML/CSS application, PowerShell portable packager, PM2 launcher.

## Global Constraints

- Bind the server to `127.0.0.1` by default and reject non-loopback `HOST` unless private remote access is explicitly implemented later.
- Keep `remoteAccess.enabled` present but `false`; do not expose a public or LAN listener.
- Never package or commit user history, API tokens, staged files, or browser state.
- Never persist generated image/video/audio bytes; keep metadata and provider URLs only.
- Agent routes may append/read/cancel their tasks, but cannot delete, clear, favorite, or overwrite history.
- Manual UI deletion remains a separate same-origin control capability and writes tombstones.
- Empty legacy-history input must never replace non-empty history.
- Preserve all existing provider adapters, validations, upload rules, queue concurrency, refresh recovery, and manual task behavior.
- Preserve the unrelated untracked `runninghub-auth.cjs` and `runninghub-auth.test.cjs` files.

---

## Task 1: Append-Only Event Store

**Files:**
- Create: `local-event-store.cjs`
- Create: `local-event-store.test.cjs`
- Modify: `package.json`

- [ ] Write failing tests for serial append, first-writer-wins IDs, atomic snapshot rebuild, tombstones, retention by media type, and recovery from a truncated final NDJSON line.
- [ ] Run `node local-event-store.test.cjs` and confirm it fails because the module does not exist.
- [ ] Implement `createEventStore({ journalFile, snapshotFile, project, applyEvent })` with an in-process promise write queue.
- [ ] Implement UTF-8 NDJSON append followed by atomic snapshot temp-file rename.
- [ ] Implement idempotent event IDs and deterministic replay; ignore only a malformed trailing line while surfacing earlier corruption.
- [ ] Implement reusable history projection helpers for `record-created`, `favorite-set`, and `record-deleted` events.
- [ ] Implement reusable task projection helpers for legal state transitions and event timelines.
- [ ] Run `node local-event-store.test.cjs`; expect all tests to pass.
- [ ] Add syntax checks and the new test to `npm test`.
- [ ] Commit: `feat: add append-only local event store`.

## Task 2: Local Authentication, Data Directory, And Agent Service

**Files:**
- Create: `agent-service.cjs`
- Create: `agent-service.test.cjs`
- Modify: `server.cjs`
- Modify: `ecosystem.config.cjs`
- Modify: `package.json`

- [ ] Write failing tests for data-directory precedence, generated token persistence, bearer authentication, loopback-only binding validation, and origin normalization.
- [ ] Write failing HTTP tests for capabilities, single/batch task creation, task reads, event reads, cancellation, asset staging, and the absence of Agent delete/history-update routes.
- [ ] Run `node agent-service.test.cjs`; confirm the missing-module failures.
- [ ] Implement `resolveDataDirectory()` with `API_BATCH_DATA_DIR`, launcher environment, then `<project>/data` precedence.
- [ ] Implement `config/agent-auth.json` creation and rotation with `crypto.randomBytes`, without logging the token.
- [ ] Implement `createAgentService(options)` and its `/api/agent/v1` router.
- [ ] Validate task envelope fields (`clientTaskId`, `taskType`, `input`, `origin`) and make duplicate `clientTaskId` submissions idempotent.
- [ ] Implement metadata-only multipart staging under `staging/`; remove staged files after browser upload acknowledgement or expiry.
- [ ] Implement worker session, heartbeat, claim lease, progress report, history append, legacy merge, and manual tombstone routes under a separate same-origin control session.
- [ ] Reject untrusted `Host`, `Origin`, and CORS requests; issue `HttpOnly; SameSite=Strict` control cookies.
- [ ] Keep `/api/local/history` as a compatibility read/merge route and reject empty replacement writes.
- [ ] Wire `server.cjs` to the service without changing RunningHub proxy behavior.
- [ ] Set `API_BATCH_DATA_DIR` in PM2 to `D:\\Codex test\\APItools\\APIplusWebtools-data` when no explicit value is supplied.
- [ ] Run `node agent-service.test.cjs` and `node --check server.cjs`; expect pass.
- [ ] Commit: `feat: add authenticated localhost agent service`.

## Task 3: Browser Worker Protocol

**Files:**
- Create: `agent-runtime.js`
- Create: `agent-runtime.test.cjs`
- Modify: `index.html`
- Modify: `package.json`

- [ ] Write failing tests for worker registration, 10-second heartbeat scheduling, lease-aware claiming, legal lifecycle reports, cancellation delivery, exponential reconnect, and refresh recovery decisions.
- [ ] Run `node agent-runtime.test.cjs`; confirm failure before implementation.
- [ ] Implement a UMD-style `window.ApiBatchAgentRuntime` module whose pure helpers are also importable by Node tests.
- [ ] Implement `createWorker({ getCapabilities, executeTask, cancelTask, onStatus })`.
- [ ] Ensure only one tab owns an active lease and a second tab remains standby.
- [ ] Implement refresh rules: resume polling when upstream IDs exist; return pre-submit work to pending; mark unknown submit outcome as `submission-unknown` and never auto-resubmit.
- [ ] Load `agent-runtime.js` before `app.js` in `index.html`.
- [ ] Run `node agent-runtime.test.cjs` and syntax checks; expect pass.
- [ ] Commit: `feat: add browser worker protocol runtime`.

## Task 4: Capability Manifest And Agent Task Mapping

**Files:**
- Modify: `app.js`
- Create: `agent-task-adapter.test.cjs`
- Modify: `package.json`

- [ ] Write failing source/VM tests asserting that live model maps produce capabilities for `image`, `imageVideo`, `motion`, `multiVideo`, and `avatar`, while locked pages are omitted.
- [ ] Write failing tests for mapping Agent task inputs into each existing row constructor, including assets, provider parameters, count, origin, and stable Agent task IDs.
- [ ] Add `agentTaskId`, `origin`, and `executedBy` fields to all usable row constructors and normalizers without changing existing saved rows.
- [ ] Implement `buildAgentCapabilityManifest()` directly from the live model configuration objects and per-model option helpers.
- [ ] Implement `createRowFromAgentTask(task)` and route it to the correct state array without changing the visible page.
- [ ] Attach each imported row to its existing queue and reuse existing provider validation/upload/submit/poll functions.
- [ ] Report every status change, upstream task ID, partial result, final result, failure, and cancellation through the browser worker.
- [ ] Preserve the upstream-ID refresh rule so already-submitted Agent work resumes polling rather than resubmitting.
- [ ] Run `node agent-task-adapter.test.cjs` and existing model/queue tests; expect pass.
- [ ] Commit: `feat: execute agent tasks through browser queues`.

## Task 5: Unified Incremental History And Origin Metadata

**Files:**
- Modify: `app.js`
- Create: `history-origin-sync.test.cjs`
- Modify: `package.json`

- [ ] Write failing tests for stable history IDs, origin normalization, first-writer-wins merge, legacy origin fallback, incremental server merge, and empty-write protection.
- [ ] Update upload and generation history creation to append records through the control API and retain IndexedDB as a read cache.
- [ ] Include original Agent `origin` and browser `executedBy` on Agent-created upload and generation records.
- [ ] Assign browser origins to manual records using a persistent browser ID and user-editable browser label.
- [ ] Add one-time migration of disk `history.json`, fallback AppData history, and current IndexedDB records; write the migration marker only after successful journal persistence.
- [ ] Replace periodic full-snapshot writes with incremental record events while retaining compatibility reads during migration.
- [ ] Make manual favorite/delete actions append control events; keep those routes unavailable to Agent tokens.
- [ ] Enforce retained projection limits of 1000 records per media type without storing remote binaries.
- [ ] Run `node history-origin-sync.test.cjs`, `node history-recovery.test.cjs`, and `node history-viewer-group-navigation.test.cjs`; expect pass.
- [ ] Commit: `feat: unify origin-aware append-only history`.

## Task 6: Source Filter And Agent Settings UI

**Files:**
- Modify: `app.js`
- Modify: `index.html`
- Modify: `styles.css`
- Create: `agent-ui-contract.test.cjs`
- Modify: `package.json`

- [ ] Write failing UI contract tests for a Source filter and an Agent API settings dialog.
- [ ] Add Source filtering by origin type, client, ID, and label; compose it with existing media/model/size/search/favorite filters.
- [ ] Display concise origin labels on history cards, with legacy records shown as `Legacy browser`.
- [ ] Add an Agent API settings button/dialog showing localhost URL, worker online/standby state, browser label, queue counts, token reveal/copy/rotate controls, and disabled private-remote-access status.
- [ ] Keep the dialog compact, white, keyboard accessible, and fixed within the viewport.
- [ ] Ensure worker status changes do not force page navigation or reset scroll position.
- [ ] Run `node agent-ui-contract.test.cjs` and existing UI tests; expect pass.
- [ ] Commit: `feat: add agent settings and history source filters`.

## Task 7: Specialized Agent Skill And Client

**Files:**
- Create: `skills/api-plus-agent/SKILL.md`
- Create: `skills/api-plus-agent/references/agent-api.md`
- Create: `skills/api-plus-agent/scripts/api-plus-agent-client.mjs`
- Create: `agent-skill-package.test.cjs`
- Modify: `package.json`

- [ ] Load and follow the local `skill-creator` instructions before creating the skill files.
- [ ] Write failing tests that validate the skill metadata, local-only URL, environment-token usage, supported commands, and the absence of embedded credentials.
- [ ] Implement a dependency-free CLI with `capabilities`, `upload`, `submit`, `status`, `wait`, and `cancel` commands.
- [ ] Make the CLI generate stable `clientTaskId` values, attach Agent origin metadata, and print machine-readable JSON.
- [ ] Document how Codex and Minimax Code discover/install the skill and how to set `API_PLUS_AGENT_TOKEN` without copying it into prompts or source files.
- [ ] Document the open-browser-worker requirement and `waiting_for_worker` behavior.
- [ ] Run `node agent-skill-package.test.cjs` and CLI help smoke tests; expect pass.
- [ ] Commit: `feat: add local agent api skill and client`.

## Task 8: Launchers, Documentation, And Portable Package

**Files:**
- Modify: `Start_API_Tool.bat`
- Modify: `ecosystem.config.cjs`
- Modify: `scripts/build-portable.ps1`
- Modify: `portable-package.test.cjs`
- Modify: `launcher-contract.test.cjs`
- Modify: `README.md`
- Modify: `README_START.txt`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/API_INTEGRATION.md`
- Modify: `docs/DATA_AND_PRIVACY.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `CHANGELOG.md`
- Modify: `VERSION`
- Modify: `package.json`

- [ ] Write failing launcher tests for explicit external data-directory propagation and loopback binding.
- [ ] Write failing package tests requiring the new runtime modules, tests, Agent skill, and docs while rejecting `data`, tokens, journals, and staged media.
- [ ] Update launchers to create/use the external data directory on this workstation and portable `data` fallback elsewhere.
- [ ] Update the portable allowlist with every required runtime, test, document, and skill file.
- [ ] Document local Agent setup, token rotation, browser-worker lifecycle, source labels, storage paths, migration, backup, and future private-access extension point.
- [ ] Bump the version and changelog only after the complete test suite passes.
- [ ] Run `node launcher-contract.test.cjs` and `node portable-package.test.cjs`; expect pass.
- [ ] Commit: `docs: document and package local agent workflow`.

## Task 9: End-To-End Verification

**Files:**
- Create: `agent-worker-integration.test.cjs`
- Modify: `package.json`

- [ ] Add an integration test that starts an isolated server with a temporary data directory, registers a fake browser worker, submits an Agent task, claims it, reports an upstream ID and partial/final results, and verifies unified history.
- [ ] Verify duplicate Agent submissions and duplicate history events are idempotent.
- [ ] Verify Agent delete/history overwrite requests return `404` or `403`.
- [ ] Verify refresh recovery with an upstream ID resumes polling and a submission-unknown task is never resubmitted automatically.
- [ ] Run `npm test`; expect zero failures.
- [ ] Start/reload PM2 with `Start_API_Tool.bat` or `pm2 startOrReload ecosystem.config.cjs --only api-plus-webtools --update-env`.
- [ ] Verify `GET http://127.0.0.1:4198/api/agent/v1/capabilities` rejects missing auth and succeeds with the generated token.
- [ ] Use the in-app browser to verify settings, worker online state, source filtering, task appearance on the correct page, stable scroll position, and persisted history after refresh.
- [ ] Build the portable ZIP with `npm run package` and inspect it for source/runtime completeness and absence of personal data.
- [ ] Commit: `feat: complete local agent api browser worker`.

