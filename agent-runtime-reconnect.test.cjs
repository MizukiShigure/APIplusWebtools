const test = require("node:test");
const assert = require("node:assert/strict");

const { createWorker } = require("./agent-runtime.js");

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("re-registers automatically after the local service loses its control session", async () => {
  const calls = [];
  let heartbeatCount = 0;
  const fetchImpl = async (url) => {
    calls.push(url.split("/").pop());
    if (url.endsWith("/session") || url.endsWith("/register")) {
      return jsonResponse(200, { success: true, leaseMs: 30000 });
    }
    if (url.endsWith("/heartbeat")) {
      heartbeatCount += 1;
      if (heartbeatCount === 1) {
        return jsonResponse(401, { success: false, error: "control_session_required" });
      }
      return jsonResponse(200, { success: true, cancelTaskIds: [] });
    }
    if (url.endsWith("/claim")) return jsonResponse(200, { success: true, task: null });
    throw new Error(`Unexpected request ${url}`);
  };
  const worker = createWorker({
    fetchImpl,
    workerId: "browser-reconnect",
    getCapabilities: () => ({ taskFamilies: [{ id: "image" }] }),
    executeTask: async () => {},
    acquirePageLease: () => true,
    autoSchedule: false
  });

  await worker.start();
  await worker.runOnce();
  worker.stop();

  assert.deepEqual(calls, ["session", "register", "heartbeat", "session", "register", "heartbeat", "claim"]);
  assert.equal(worker.getState().reconnectAttempt, 0);
});
