const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { createAgentService } = require("./agent-service.cjs");
const { createWorker, decideRefreshRecovery } = require("./agent-runtime.js");

async function createFixture(t) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "api-plus-worker-integration-"));
  const dataDir = path.join(root, "data");
  let clock = 1_800_000_000_000;
  const service = await createAgentService({
    root,
    dataDir,
    leaseMs: 1000,
    workerOnlineMs: 10_000,
    now: () => clock,
    env: { API_BATCH_AGENT_TOKEN: "integration-token-local-only" }
  });
  const server = http.createServer(async (request, response) => {
    const parsed = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    if (await service.route(request, response, parsed.pathname, parsed)) return;
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ success: false, error: "not_found" }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.promises.rm(root, { recursive: true, force: true });
  });
  return {
    baseUrl,
    dataDir,
    token: service.getAgentToken(),
    advance(ms) { clock += ms; }
  };
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { response, json: text ? JSON.parse(text) : {} };
}

function createCookieFetch(baseUrl) {
  let cookie = "";
  return async (url, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set("Origin", baseUrl);
    if (cookie) headers.set("Cookie", cookie);
    const response = await fetch(url, { ...options, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return response;
  };
}

function agentRequest(fixture, pathname, options = {}) {
  return jsonRequest(`${fixture.baseUrl}/api/agent/v1${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${fixture.token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
}

function makeWorker(fixture, options = {}) {
  return createWorker({
    fetchImpl: createCookieFetch(fixture.baseUrl),
    baseUrl: fixture.baseUrl,
    workerId: options.workerId,
    label: options.label || options.workerId,
    getCapabilities: () => ({
      taskFamilies: [{ id: "image", label: "Image", models: [{ id: "nano", label: "Nano Banana" }] }]
    }),
    executeTask: options.executeTask,
    acquirePageLease: () => true,
    autoSchedule: false
  });
}

test("runs an Agent task through the real browser worker protocol and appends history once", async t => {
  const fixture = await createFixture(t);
  const recordId = "agent-generation-record-1";
  const worker = makeWorker(fixture, {
    workerId: "browser-integration",
    label: "Integration Browser",
    executeTask: async (task, controls) => {
      await controls.report({ state: "validating", eventId: `${task.taskId}:validating` });
      await controls.report({
        state: "submitted",
        upstreamTaskIds: ["provider-task-1"],
        eventId: `${task.taskId}:submitted`
      });
      const historyRecord = {
        recordId,
        kind: "generation",
        mediaType: "image",
        taskId: task.taskId,
        prompt: task.input.prompt,
        model: task.input.model,
        results: [{ url: "https://cdn.example/result.png", type: "image" }],
        inputs: task.input.assets,
        createdAt: 1_800_000_000_100
      };
      await controls.report({
        state: "partial",
        upstreamTaskIds: ["provider-task-1"],
        results: historyRecord.results,
        historyRecords: [historyRecord],
        eventId: `${task.taskId}:partial`
      });
      await controls.report({
        state: "completed",
        upstreamTaskIds: ["provider-task-1"],
        results: historyRecord.results,
        historyRecords: [historyRecord],
        completedAt: "2027-01-15T08:00:00.000Z",
        eventId: `${task.taskId}:completed`
      });
    }
  });
  await worker.start();

  const envelope = {
    clientTaskId: "stable-agent-submission",
    taskType: "image",
    input: {
      prompt: "A stable integration portrait",
      model: "nano",
      version: "nano_banana_2",
      assets: { images: [{ url: "https://cdn.example/reference.png", type: "image" }] },
      options: { size: "1:1", quality: "2K" },
      count: 1
    },
    origin: { type: "agent", client: "codex", id: "codex-integration", label: "Codex integration" }
  };
  const first = await agentRequest(fixture, "/tasks", { method: "POST", body: JSON.stringify(envelope) });
  const duplicate = await agentRequest(fixture, "/tasks", { method: "POST", body: JSON.stringify({ ...envelope, input: { prompt: "must not replace" } }) });
  assert.equal(first.response.status, 202);
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.json.task.taskId, first.json.task.taskId);
  assert.equal(duplicate.json.task.input.prompt, envelope.input.prompt);

  await worker.runOnce();
  worker.stop();

  const taskId = first.json.task.taskId;
  const task = await agentRequest(fixture, `/tasks/${taskId}`);
  const events = await agentRequest(fixture, `/tasks/${taskId}/events`);
  const history = await agentRequest(fixture, `/history?taskId=${encodeURIComponent(taskId)}`);
  assert.equal(task.json.task.state, "completed");
  assert.deepEqual(task.json.task.upstreamTaskIds, ["provider-task-1"]);
  assert.equal(task.json.task.results[0].url, "https://cdn.example/result.png");
  assert.equal(events.json.events.filter(event => event.type === "task-created").length, 1);
  assert.deepEqual(
    events.json.events.filter(event => event.type === "task-reported").map(event => event.state),
    ["validating", "submitted", "partial", "completed"]
  );
  assert.equal(history.json.records.length, 1);
  assert.equal(history.json.records[0].recordId, recordId);
  assert.equal(history.json.records[0].origin.id, "codex-integration");
  assert.equal(history.json.records[0].executedBy.id, "browser-integration");
  assert.equal(history.json.records[0].inputs.images[0].url, "https://cdn.example/reference.png");

  for (const [method, pathname] of [
    ["DELETE", `/history/${recordId}`],
    ["PUT", `/history/${recordId}`],
    ["POST", "/history"]
  ]) {
    const denied = await agentRequest(fixture, pathname, { method, body: "{}" });
    assert.ok([403, 404, 405].includes(denied.response.status), `${method} ${pathname} must not mutate history`);
  }
});

test("refresh recovery resumes submitted tasks and never resubmits an unknown submission", async t => {
  const fixture = await createFixture(t);
  let providerSubmitCalls = 0;
  let providerPollCalls = 0;

  const submitTask = (clientTaskId) => agentRequest(fixture, "/tasks", {
    method: "POST",
    body: JSON.stringify({
      clientTaskId,
      taskType: "image",
      input: { prompt: clientTaskId, model: "nano" },
      origin: { type: "agent", client: "minimax-code", id: "minimax-local", label: "Minimax Code" }
    })
  });

  const original = await makeWorker(fixture, {
    workerId: "browser-before-refresh",
    executeTask: async (task, controls) => {
      providerSubmitCalls += 1;
      await controls.report({ state: "submitting", eventId: `${task.taskId}:submitting` });
      await controls.report({
        state: "submitted",
        upstreamTaskIds: ["provider-resume-1"],
        eventId: `${task.taskId}:submitted`
      });
    }
  });
  await original.start();
  const submitted = await submitTask("resume-after-refresh");
  await original.runOnce();
  original.stop();

  fixture.advance(1500);
  const released = await agentRequest(fixture, `/tasks/${submitted.json.task.taskId}`);
  assert.equal(released.json.task.state, "polling");
  assert.equal(released.json.task.claimedBy, null);

  const replacement = makeWorker(fixture, {
    workerId: "browser-after-refresh",
    executeTask: async (task, controls) => {
      assert.equal(decideRefreshRecovery(task), "resume_polling");
      providerPollCalls += 1;
      await controls.report({
        state: "completed",
        upstreamTaskIds: task.upstreamTaskIds,
        results: [{ url: "https://cdn.example/resumed.png", type: "image" }],
        completedAt: "2027-01-15T08:01:00.000Z"
      });
    }
  });
  await replacement.start();
  await replacement.runOnce();
  replacement.stop();
  assert.equal(providerSubmitCalls, 1);
  assert.equal(providerPollCalls, 1);

  const uncertainWorker = makeWorker(fixture, {
    workerId: "browser-uncertain-submit",
    executeTask: async (task, controls) => {
      providerSubmitCalls += 1;
      await controls.report({ state: "submitting", eventId: `${task.taskId}:submitting` });
    }
  });
  await uncertainWorker.start();
  const uncertain = await submitTask("unknown-after-refresh");
  await uncertainWorker.runOnce();
  uncertainWorker.stop();

  fixture.advance(1500);
  const protectedTask = await agentRequest(fixture, `/tasks/${uncertain.json.task.taskId}`);
  assert.equal(protectedTask.json.task.state, "submission-unknown");
  assert.match(protectedTask.json.task.error.message, /automatic retry is disabled/i);

  let unexpectedExecution = 0;
  const finalWorker = makeWorker(fixture, {
    workerId: "browser-must-not-resubmit",
    executeTask: async () => { unexpectedExecution += 1; }
  });
  await finalWorker.start();
  const claimed = await finalWorker.runOnce();
  finalWorker.stop();
  assert.equal(claimed, null);
  assert.equal(unexpectedExecution, 0);
  assert.equal(providerSubmitCalls, 2);
});
