const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createWorker,
  decideRefreshRecovery,
  reconnectDelay,
  normalizeWorkerReport
} = require("./agent-runtime.js");

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

test("chooses conservative refresh recovery from upstream submission evidence", () => {
  assert.equal(decideRefreshRecovery({ state: "submitting", upstreamTaskIds: ["provider-1"] }), "resume_polling");
  assert.equal(decideRefreshRecovery({ state: "polling", upstreamTaskIds: ["provider-1"] }), "resume_polling");
  assert.equal(decideRefreshRecovery({ state: "submitting", upstreamTaskIds: [] }), "submission_unknown");
  assert.equal(decideRefreshRecovery({ state: "uploading", upstreamTaskIds: [] }), "requeue");
  assert.equal(decideRefreshRecovery({ state: "completed", upstreamTaskIds: ["provider-1"] }), "terminal");
});

test("uses bounded exponential reconnect delays", () => {
  assert.equal(reconnectDelay(0), 1000);
  assert.equal(reconnectDelay(1), 2000);
  assert.equal(reconnectDelay(5), 30000);
  assert.equal(reconnectDelay(20), 30000);
});

test("honors heartbeatMs while polling claims and cancellation every claim tick", async t => {
  let clock = 1_800_000_000_000;
  const startedAt = clock;
  const heartbeats = [];
  let claims = 0;
  const canceled = [];
  const worker = createWorker({
    now: () => clock,
    heartbeatMs: 10000,
    claimMs: 1500,
    fetchImpl: async url => {
      if (url.endsWith("/heartbeat")) heartbeats.push(clock - startedAt);
      if (url.endsWith("/claim")) {
        claims += 1;
        return jsonResponse(200, { task: null, cancelTaskIds: claims === 2 ? ["cancel-between-heartbeats"] : [] });
      }
      return jsonResponse(200, { success: true, leaseMs: 30000 });
    },
    getCapabilities: () => ({ taskFamilies: [] }),
    executeTask: async () => assert.fail("no task should execute"),
    cancelTask: taskId => canceled.push({ taskId, at: clock - startedAt }),
    acquirePageLease: () => true,
    autoSchedule: false
  });
  t.after(() => worker.stop());
  await worker.start();
  for (let tick = 0; tick < 40; tick += 1) {
    await worker.runOnce();
    clock += 1500;
  }
  t.diagnostic(`heartbeat metric: simulated_ms=60000 claims=${claims} heartbeats=${heartbeats.length}`);
  assert.equal(claims, 40);
  assert.deepEqual(heartbeats, [0, 10500, 21000, 31500, 42000, 52500]);
  assert.deepEqual(canceled, [{ taskId: "cancel-between-heartbeats", at: 1500 }]);
});

test("normalizes reports without allowing unknown states", () => {
  assert.deepEqual(normalizeWorkerReport({ state: "partial", upstreamTaskIds: [1], results: ["x"] }), {
    state: "partial",
    upstreamTaskIds: ["1"],
    results: ["x"]
  });
  assert.throws(() => normalizeWorkerReport({ state: "mystery" }), /invalid worker task state/i);
});

test("schedules heartbeat renewal within short leases and resets on restart", async t => {
  let clock = 0;
  let scheduled;
  let heartbeats = 0;
  const worker = createWorker({
    now: () => clock,
    heartbeatMs: 10000,
    claimMs: 1500,
    fetchImpl: async url => {
      if (url.endsWith("/heartbeat")) heartbeats += 1;
      return jsonResponse(200, { success: true, leaseMs: 1000, task: null });
    },
    setTimeoutFn: (callback, delay) => { scheduled = { callback, delay }; return 1; },
    clearTimeoutFn: () => {},
    getCapabilities: () => ({ taskFamilies: [] }),
    executeTask: async () => {},
    acquirePageLease: () => true
  });
  t.after(() => worker.stop());
  await worker.start();
  await scheduled.callback();
  assert.equal(heartbeats, 1);
  assert.ok(scheduled.delay <= 1000 / 3);
  clock = 334;
  await scheduled.callback();
  assert.equal(heartbeats, 2);
  worker.stop();
  await worker.start();
  await scheduled.callback();
  assert.equal(heartbeats, 3);
});

test("re-registers on claim authentication loss between heartbeats", async t => {
  for (const status of [401, 404]) {
    await t.test(`HTTP ${status}`, async () => {
      let clock = 0;
      const calls = [];
      let claims = 0;
      const worker = createWorker({
        now: () => clock,
        fetchImpl: async url => {
          calls.push(url.split("/").pop());
          if (url.endsWith("/claim") && ++claims === 2) return jsonResponse(status, { error: "test-restart" });
          return jsonResponse(200, { success: true, leaseMs: 30000, task: null });
        },
        getCapabilities: () => ({ taskFamilies: [] }),
        executeTask: async () => {},
        acquirePageLease: () => true,
        autoSchedule: false
      });
      await worker.start();
      await worker.runOnce();
      clock += 1500;
      await worker.runOnce();
      assert.deepEqual(calls, ["session", "register", "heartbeat", "claim", "claim", "session", "register", "claim"]);
      assert.equal(worker.getState().connection, "online");
      clock += 1500;
      await worker.runOnce();
      assert.deepEqual(calls.slice(-2), ["heartbeat", "claim"]);
      worker.stop();
    });
  }
});

test("registers, heartbeats, claims, and hands a task to the existing browser executor", async () => {
  const calls = [];
  const executed = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith("/session")) return jsonResponse(200, { success: true });
    if (url.endsWith("/register")) return jsonResponse(200, { success: true, worker: { id: "browser-a" }, leaseMs: 30000 });
    if (url.endsWith("/heartbeat")) return jsonResponse(200, { success: true, cancelTaskIds: [] });
    if (url.endsWith("/claim")) return jsonResponse(200, {
      success: true,
      task: { taskId: "task-1", taskType: "image", input: { prompt: "hello" }, state: "claimed" }
    });
    throw new Error(`Unexpected request ${url}`);
  };
  const worker = createWorker({
    fetchImpl,
    workerId: "browser-a",
    label: "Main Edge",
    getCapabilities: () => ({ taskFamilies: [{ id: "image" }] }),
    executeTask: async (task, controls) => executed.push({ task, controls }),
    acquirePageLease: () => true,
    autoSchedule: false
  });

  await worker.start();
  await worker.runOnce();

  assert.deepEqual(calls.map(call => call.url.split("/").pop()), ["session", "register", "heartbeat", "claim"]);
  assert.equal(executed.length, 1);
  assert.equal(executed[0].task.taskId, "task-1");
  assert.equal(typeof executed[0].controls.report, "function");
  worker.stop();
});

test("reports lifecycle updates and forwards cancellation requests", async () => {
  const reports = [];
  const canceled = [];
  let claimCount = 0;
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (url.endsWith("/session") || url.endsWith("/register")) return jsonResponse(200, { success: true });
    if (url.endsWith("/heartbeat")) return jsonResponse(200, { success: true, cancelTaskIds: ["task-cancel"] });
    if (url.endsWith("/claim")) {
      claimCount += 1;
      return jsonResponse(200, { success: true, task: claimCount === 1 ? { taskId: "task-2", taskType: "motion", input: {} } : null });
    }
    if (url.endsWith("/report")) {
      reports.push(body);
      return jsonResponse(200, { success: true, task: {} });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const worker = createWorker({
    fetchImpl,
    workerId: "browser-b",
    getCapabilities: () => ({ taskFamilies: [] }),
    acquirePageLease: () => true,
    autoSchedule: false,
    cancelTask: taskId => canceled.push(taskId),
    executeTask: async (task, controls) => {
      await controls.report({ state: "validating" });
      await controls.report({ state: "submitted", upstreamTaskIds: ["provider-2"] });
    }
  });
  await worker.start();
  await worker.runOnce();

  assert.deepEqual(canceled, ["task-cancel"]);
  assert.deepEqual(reports.map(report => report.state), ["validating", "submitted"]);
  assert.deepEqual(reports[1].upstreamTaskIds, ["provider-2"]);
  worker.stop();
});

test("backs off after connection failure without losing the worker identity", async () => {
  const statuses = [];
  let attempts = 0;
  const worker = createWorker({
    fetchImpl: async () => {
      attempts += 1;
      throw new Error("offline");
    },
    workerId: "stable-browser",
    getCapabilities: () => ({ taskFamilies: [] }),
    executeTask: async () => {},
    acquirePageLease: () => true,
    autoSchedule: false,
    onStatus: status => statuses.push(status)
  });

  await assert.rejects(worker.start(), /offline/);
  assert.equal(attempts, 1);
  assert.equal(worker.getState().workerId, "stable-browser");
  assert.equal(worker.getState().reconnectAttempt, 1);
  assert.equal(statuses.at(-1).connection, "offline");
});
