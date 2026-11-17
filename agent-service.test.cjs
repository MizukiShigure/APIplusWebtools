const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const {
  createAgentService,
  createTaskState,
  resolveDataDirectory,
  normalizeOrigin,
  validateLoopbackHost
} = require("./agent-service.cjs");

async function createFixture(t, options = {}) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "api-plus-agent-"));
  const dataDir = path.join(root, "external-data");
  if (options.seedTasks) {
    const state = createTaskState();
    for (const task of options.seedTasks) {
      state.tasksById[task.taskId] = task;
      state.taskOrder.push(task.taskId);
      state.taskIdByClientId[task.clientTaskId] = task.taskId;
    }
    await fs.promises.mkdir(path.join(dataDir, "tasks"), { recursive: true });
    await fs.promises.writeFile(path.join(dataDir, "tasks", "snapshot.json"), JSON.stringify({
      version: 1, lastSequence: 0, eventIds: [], state
    }), "utf8");
  }
  const service = await createAgentService({ root, dataDir, leaseMs: 5000, ...options });
  const server = http.createServer(async (request, response) => {
    const parsed = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    if (await service.route(request, response, parsed.pathname, parsed)) return;
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.promises.rm(root, { recursive: true, force: true });
  });
  return { root, dataDir, service, baseUrl };
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { response, json: text ? JSON.parse(text) : {} };
}

async function controlSession(baseUrl) {
  const response = await fetch(`${baseUrl}/api/control/v1/session`);
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}

test("resolves data directory from env, launcher value, then portable fallback", () => {
  const root = path.resolve("C:/portable/app");
  assert.equal(resolveDataDirectory({ root, env: { API_BATCH_DATA_DIR: "D:/agent-data" } }), path.resolve("D:/agent-data"));
  assert.equal(resolveDataDirectory({ root, env: { API_BATCH_LAUNCHER_DATA_DIR: "D:/launcher-data" } }), path.resolve("D:/launcher-data"));
  assert.equal(resolveDataDirectory({ root, env: {} }), path.join(root, "data"));
});

test("normalizes origin metadata and accepts only loopback hosts", () => {
  assert.deepEqual(normalizeOrigin({ type: "agent", client: "codex", id: " codex-local ", label: " Codex local " }), {
    type: "agent",
    client: "codex",
    id: "codex-local",
    label: "Codex local"
  });
  assert.equal(validateLoopbackHost("127.0.0.1:4198"), true);
  assert.equal(validateLoopbackHost("localhost:4198"), true);
  assert.equal(validateLoopbackHost("[::1]:4198"), true);
  assert.equal(validateLoopbackHost("192.168.1.8:4198"), false);
});

test("persists a generated token and protects every public Agent route", async t => {
  const fixture = await createFixture(t);
  const authFile = path.join(fixture.dataDir, "config", "agent-auth.json");
  const auth = JSON.parse(await fs.promises.readFile(authFile, "utf8"));
  assert.match(auth.token, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(fixture.service.getAgentToken(), auth.token);

  const denied = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/capabilities`);
  assert.equal(denied.response.status, 401);

  const allowed = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/capabilities`, {
    headers: { Authorization: `Bearer ${auth.token}` }
  });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.json.worker.online, false);
  assert.deepEqual(allowed.json.taskFamilies, []);
});

test("registers a browser worker and publishes its live capability manifest", async t => {
  const fixture = await createFixture(t);
  const cookie = await controlSession(fixture.baseUrl);
  const manifest = {
    taskFamilies: [{ id: "image", label: "生图", models: [{ id: "nano", label: "Nano Banana" }] }]
  };
  const registered = await jsonRequest(`${fixture.baseUrl}/api/control/v1/worker/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ workerId: "browser-one", label: "Main Edge", capabilities: manifest })
  });
  assert.equal(registered.response.status, 200);
  assert.equal(registered.json.worker.id, "browser-one");

  const capabilities = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/capabilities`, {
    headers: { Authorization: `Bearer ${fixture.service.getAgentToken()}` }
  });
  assert.equal(capabilities.json.worker.online, true);
  assert.deepEqual(capabilities.json.taskFamilies, manifest.taskFamilies);
});

test("creates single and batch tasks idempotently and exposes their event streams", async t => {
  const fixture = await createFixture(t);
  const token = fixture.service.getAgentToken();
  const origin = { type: "agent", client: "codex", id: "codex-local", label: "Codex local" };
  const submit = body => jsonRequest(`${fixture.baseUrl}/api/agent/v1/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const first = await submit({ clientTaskId: "stable-one", taskType: "image", input: { prompt: "hello" }, origin });
  const duplicate = await submit({ clientTaskId: "stable-one", taskType: "image", input: { prompt: "changed" }, origin });
  assert.equal(first.response.status, 202);
  assert.equal(duplicate.response.status, 200);
  assert.equal(first.json.task.taskId, duplicate.json.task.taskId);
  assert.equal(duplicate.json.task.input.prompt, "hello");

  const batch = await submit({ tasks: [
    { clientTaskId: "batch-a", taskType: "image", input: { prompt: "a" }, origin },
    { clientTaskId: "batch-b", taskType: "motion", input: { prompt: "b" }, origin }
  ] });
  assert.equal(batch.response.status, 202);
  assert.equal(batch.json.tasks.length, 2);

  const taskId = first.json.task.taskId;
  const task = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const events = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/tasks/${taskId}/events`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(task.json.task.state, "waiting_for_worker");
  assert.equal(events.json.events[0].type, "task-created");
});

test("claims work with a lease, reports upstream progress, and appends unified history", async t => {
  const fixture = await createFixture(t);
  const token = fixture.service.getAgentToken();
  const cookie = await controlSession(fixture.baseUrl);
  await jsonRequest(`${fixture.baseUrl}/api/control/v1/worker/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ workerId: "worker-a", label: "Chrome worker", capabilities: { taskFamilies: [] } })
  });
  const submitted = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      clientTaskId: "claim-me",
      taskType: "imageVideo",
      input: { prompt: "move" },
      origin: { type: "agent", client: "minimax-code", id: "minimax-local", label: "Minimax Code" }
    })
  });
  const taskId = submitted.json.task.taskId;

  const claimed = await jsonRequest(`${fixture.baseUrl}/api/control/v1/worker/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ workerId: "worker-a" })
  });
  assert.equal(claimed.json.task.taskId, taskId);
  assert.equal(claimed.json.task.state, "claimed");

  const reported = await jsonRequest(`${fixture.baseUrl}/api/control/v1/worker/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      workerId: "worker-a",
      taskId,
      state: "completed",
      upstreamTaskIds: ["provider-123"],
      results: [{ url: "https://cdn.example/video.mp4", type: "video" }],
      historyRecords: [{
        recordId: "generation-1",
        kind: "generation",
        mediaType: "video",
        taskId,
        prompt: "move",
        createdAt: 100
      }]
    })
  });
  assert.equal(reported.response.status, 200);

  const task = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const history = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/history?taskId=${taskId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(task.json.task.state, "completed");
  assert.deepEqual(task.json.task.upstreamTaskIds, ["provider-123"]);
  assert.equal(history.json.records.length, 1);
  assert.equal(history.json.records[0].origin.client, "minimax-code");
  assert.equal(history.json.records[0].executedBy.id, "worker-a");
});

test("delivers cancellation to an active worker and provides no Agent delete route", async t => {
  const fixture = await createFixture(t);
  const token = fixture.service.getAgentToken();
  const cookie = await controlSession(fixture.baseUrl);
  await jsonRequest(`${fixture.baseUrl}/api/control/v1/worker/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ workerId: "worker-cancel", label: "Worker", capabilities: { taskFamilies: [] } })
  });
  const submitted = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ clientTaskId: "cancel-me", taskType: "image", input: {}, origin: { type: "agent", client: "codex" } })
  });
  const taskId = submitted.json.task.taskId;
  await jsonRequest(`${fixture.baseUrl}/api/control/v1/worker/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ workerId: "worker-cancel" })
  });
  const canceled = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/tasks/${taskId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(canceled.response.status, 202);

  const heartbeat = await jsonRequest(`${fixture.baseUrl}/api/control/v1/worker/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ workerId: "worker-cancel" })
  });
  assert.deepEqual(heartbeat.json.cancelTaskIds, [taskId]);

  const forbidden = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/history/generation-1`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(forbidden.response.status, 404);
});

test("stages multipart assets without exposing a permanent public file URL", async t => {
  const fixture = await createFixture(t);
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("sample")], { type: "image/png" }), "sample.png");
  form.append("mediaType", "image");
  const uploaded = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${fixture.service.getAgentToken()}` },
    body: form
  });
  assert.equal(uploaded.response.status, 201);
  assert.equal(uploaded.json.asset.name, "sample.png");
  assert.equal(uploaded.json.asset.mediaType, "image");
  assert.match(uploaded.json.asset.workerUrl, /^\/api\/control\/v1\/assets\//);
  assert.equal(Object.hasOwn(uploaded.json.asset, "publicUrl"), false);
  assert.equal(fs.existsSync(path.join(fixture.dataDir, "staging", uploaded.json.asset.assetId)), true);
});

test("browser control can delete one generated result without deleting the record", async t => {
  const fixture = await createFixture(t);
  const cookie = await controlSession(fixture.baseUrl);
  const record = {
    recordId: "generation-many",
    kind: "generation",
    mediaType: "image",
    results: ["https://cdn.example/a.png", "https://cdn.example/b.png"],
    createdAt: 100
  };
  const created = await jsonRequest(`${fixture.baseUrl}/api/control/v1/history/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ records: [record] })
  });
  assert.equal(created.response.status, 200);

  const deleted = await jsonRequest(`${fixture.baseUrl}/api/control/v1/history/generation-many/results/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ results: [record.results[0]] })
  });
  assert.equal(deleted.response.status, 200);

  const history = await jsonRequest(`${fixture.baseUrl}/api/control/v1/history`, {
    headers: { Cookie: cookie }
  });
  assert.deepEqual(history.json.records[0].results, [record.results[1]]);
});

test("bounds background task reads and snapshots with a large completed queue", async t => {
  const clock = 1_800_000_000_000;
  const seedTasks = Array.from({ length: 500 }, (_, index) => ({
    taskId: `synthetic-${index}`,
    clientTaskId: `synthetic-client-${index}`,
    input: { prompt: "x".repeat(1024) },
    state: index < 12 ? "queued" : "completed",
    claimedBy: index < 12 ? { id: "perf-worker" } : null,
    leaseExpiresAt: index < 12 ? clock + 5000 : 0,
    upstreamTaskIds: index === 0 ? ["synthetic-upstream"] : [],
    cancelRequested: index === 0
  }));
  const fixture = await createFixture(t, { seedTasks, now: () => clock });
  const cookie = await controlSession(fixture.baseUrl);
  const control = endpoint => jsonRequest(`${fixture.baseUrl}/api/control/v1/worker/${endpoint}`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ workerId: "perf-worker" })
  });
  await control("register");
  const stringify = JSON.stringify;
  let fullStateClones = 0;
  t.mock.method(JSON, "stringify", (value, ...args) => {
    if (value?.tasksById && value?.taskOrder) fullStateClones += 1;
    return stringify(value, ...args);
  });
  const rename = fs.promises.rename;
  let snapshots = 0;
  t.mock.method(fs.promises, "rename", async (from, to) => {
    if (to === path.join(fixture.dataDir, "tasks", "snapshot.json")) snapshots += 1;
    return rename(from, to);
  });
  const lookupStart = performance.now();
  for (let index = 0; index < 100; index += 1) fixture.service.getTask("synthetic-499");
  const lookupMs = performance.now() - lookupStart;
  const lookupClones = fullStateClones;
  fullStateClones = 0;
  const claimStart = performance.now();
  const claimed = await control("claim");
  const claimMs = performance.now() - claimStart;
  const claimClones = fullStateClones;
  fullStateClones = 0;
  const heartbeatStart = performance.now();
  const heartbeat = await control("heartbeat");
  const heartbeatMs = performance.now() - heartbeatStart;
  t.diagnostic(`background metric: tasks=500 lookups=100 lookup_ms=${lookupMs.toFixed(2)} lookup_full_clones=${lookupClones} claim_ms=${claimMs.toFixed(2)} claim_full_clones=${claimClones} active=12 heartbeat_ms=${heartbeatMs.toFixed(2)} heartbeat_full_clones=${fullStateClones} snapshots=${snapshots}`);
  assert.equal(claimed.response.status, 200);
  assert.equal(claimed.json.task, null);
  assert.equal(heartbeat.response.status, 200);
  assert.deepEqual(heartbeat.json.cancelTaskIds, ["synthetic-0"]);
  assert.equal(fixture.service.taskStore.getEvents().length, 12);
  assert.deepEqual(claimed.json.cancelTaskIds, ["synthetic-0"]);
  assert.equal(lookupClones, 0);
  assert.equal(claimClones, 0);
  assert.equal(snapshots, 1);
});

test("renews queued leases durably and returns cancellation alongside a new claim", async t => {
  let clock = 1_800_000_000_000;
  const fixture = await createFixture(t, {
    now: () => clock,
    seedTasks: [
      { taskId: "queued-task", clientTaskId: "queued-client", state: "queued", claimedBy: { id: "lease-worker" }, leaseExpiresAt: clock + 5000 },
      { taskId: "polling-task", clientTaskId: "polling-client", state: "polling", claimedBy: { id: "lease-worker" }, leaseExpiresAt: clock + 5000, upstreamTaskIds: ["durable-upstream-id"] },
      { taskId: "next-task", clientTaskId: "next-client", state: "pending", claimedBy: null }
    ]
  });
  const cookie = await controlSession(fixture.baseUrl);
  const control = endpoint => jsonRequest(`${fixture.baseUrl}/api/control/v1/worker/${endpoint}`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ workerId: "lease-worker" })
  });
  await control("register");
  clock += 4000;
  assert.equal((await control("heartbeat")).response.status, 200);
  const renewedUntil = clock + 5000;
  clock += 1500;
  const token = fixture.service.getAgentToken();
  const getQueued = await jsonRequest(`${fixture.baseUrl}/api/agent/v1/tasks/queued-task`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(getQueued.json.task.state, "queued");
  assert.equal(getQueued.json.task.leaseExpiresAt, renewedUntil);
  await jsonRequest(`${fixture.baseUrl}/api/agent/v1/tasks/queued-task/cancel`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }
  });
  const claimed = await control("claim");
  assert.equal(claimed.json.task.taskId, "next-task");
  assert.deepEqual(claimed.json.cancelTaskIds, ["queued-task"]);
  const reopened = await createAgentService({ root: fixture.root, dataDir: fixture.dataDir, now: () => clock });
  assert.equal(reopened.getTask("queued-task").leaseExpiresAt, renewedUntil);
  assert.equal(reopened.getTask("queued-task").cancelRequested, true);
  assert.deepEqual(reopened.getTask("polling-task").upstreamTaskIds, ["durable-upstream-id"]);
  assert.equal(reopened.getTask("polling-task").claimedBy.id, "lease-worker");
  assert.equal(reopened.getTask("next-task").clientTaskId, "next-client");
  assert.equal(reopened.taskStore.getEvents().filter(event => event.type === "task-lease-renewed").length, 2);
});
