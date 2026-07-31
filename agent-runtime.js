(function attachAgentRuntime(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ApiBatchAgentRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAgentRuntimeModule() {
  "use strict";

  const CONTROL_PREFIX = "/api/control/v1";
  const REPORT_STATES = new Set([
    "claimed",
    "validating",
    "uploading",
    "queued",
    "submitting",
    "submitted",
    "polling",
    "partial",
    "completed",
    "failed",
    "cancel_requested",
    "canceled",
    "submission-unknown"
  ]);
  const TERMINAL_STATES = new Set(["completed", "failed", "canceled", "submission-unknown"]);

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function decideRefreshRecovery(task = {}) {
    if (TERMINAL_STATES.has(task.state)) return "terminal";
    if (Array.isArray(task.upstreamTaskIds) && task.upstreamTaskIds.length) return "resume_polling";
    if (task.state === "submitting") return "submission_unknown";
    return "requeue";
  }

  function reconnectDelay(attempt) {
    return Math.min(30000, 1000 * (2 ** Math.max(0, Number(attempt || 0))));
  }

  function normalizeWorkerReport(value = {}) {
    const state = String(value.state || "").trim();
    if (!REPORT_STATES.has(state)) throw new Error(`Invalid worker task state: ${state || "empty"}`);
    const report = { state };
    if (Array.isArray(value.upstreamTaskIds)) report.upstreamTaskIds = value.upstreamTaskIds.map(String);
    if (Array.isArray(value.results)) report.results = clone(value.results);
    if (value.progress !== undefined) report.progress = clone(value.progress);
    if (value.error !== undefined) report.error = clone(value.error);
    if (Array.isArray(value.historyRecords)) report.historyRecords = clone(value.historyRecords);
    if (value.completedAt !== undefined) report.completedAt = value.completedAt;
    if (value.eventId) report.eventId = String(value.eventId);
    return report;
  }

  function createStorageLease(workerId, options = {}) {
    const storage = options.storage || (typeof localStorage !== "undefined" ? localStorage : null);
    const key = options.key || "api_plus_agent_browser_worker_lease_v1";
    const ttlMs = Math.max(5000, Number(options.ttlMs || 25000));
    const now = options.now || (() => Date.now());
    function read() {
      if (!storage) return null;
      try {
        return JSON.parse(storage.getItem(key) || "null");
      } catch {
        return null;
      }
    }
    function acquire() {
      if (!storage) return true;
      const current = read();
      const timestamp = now();
      if (current?.workerId && current.workerId !== workerId && Number(current.expiresAt || 0) > timestamp) return false;
      try {
        storage.setItem(key, JSON.stringify({ workerId, expiresAt: timestamp + ttlMs }));
        return read()?.workerId === workerId;
      } catch {
        return false;
      }
    }
    function renew() {
      if (!storage) return true;
      const current = read();
      if (current?.workerId !== workerId) return false;
      try {
        storage.setItem(key, JSON.stringify({ workerId, expiresAt: now() + ttlMs }));
        return true;
      } catch {
        return false;
      }
    }
    function release() {
      if (!storage) return;
      try {
        if (read()?.workerId === workerId) storage.removeItem(key);
      } catch {}
    }
    return { acquire, renew, release };
  }

  function createWorker(options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error("fetch is required for the browser worker");
    if (typeof options.getCapabilities !== "function") throw new Error("getCapabilities is required");
    if (typeof options.executeTask !== "function") throw new Error("executeTask is required");
    const workerId = String(options.workerId || `browser-${Math.random().toString(36).slice(2, 10)}`);
    const label = String(options.label || workerId);
    const heartbeatMs = Math.max(1000, Number(options.heartbeatMs || 10000));
    const claimMs = Math.max(250, Number(options.claimMs || 1500));
    const setTimer = options.setTimeoutFn || setTimeout;
    const clearTimer = options.clearTimeoutFn || clearTimeout;
    const lease = typeof options.acquirePageLease === "function"
      ? {
          acquire: options.acquirePageLease,
          renew: options.acquirePageLease,
          release: typeof options.releasePageLease === "function" ? options.releasePageLease : () => {}
        }
      : createStorageLease(workerId, options.pageLeaseOptions);
    const state = {
      workerId,
      label,
      running: false,
      active: false,
      connection: "offline",
      reconnectAttempt: 0,
      lastHeartbeatAt: 0,
      lastError: "",
      leaseMs: 30000
    };
    let timer = 0;
    let runningCycle = false;

    function publish() {
      if (typeof options.onStatus === "function") options.onStatus(clone(state));
    }

    async function request(path, requestOptions = {}) {
      const headers = { ...(requestOptions.headers || {}) };
      if (requestOptions.body && typeof requestOptions.body !== "string" && !(requestOptions.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
        requestOptions.body = JSON.stringify(requestOptions.body);
      }
      const response = await fetchImpl(`${options.baseUrl || ""}${CONTROL_PREFIX}${path}`, {
        credentials: "same-origin",
        cache: "no-store",
        ...requestOptions,
        headers
      });
      const text = await response.text();
      let json = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { message: text };
      }
      if (!response.ok) {
        const error = new Error(json.message || json.error || `HTTP ${response.status}`);
        error.status = response.status;
        error.body = json;
        throw error;
      }
      return json;
    }

    function setConnected() {
      state.connection = "online";
      state.reconnectAttempt = 0;
      state.lastError = "";
      publish();
    }

    function setDisconnected(error) {
      state.connection = "offline";
      state.reconnectAttempt += 1;
      state.lastError = String(error?.message || error || "Connection failed");
      publish();
    }

    async function report(taskId, rawReport) {
      const reportBody = normalizeWorkerReport(rawReport);
      const json = await request("/worker/report", {
        method: "POST",
        body: { workerId, taskId, ...reportBody }
      });
      setConnected();
      return json;
    }

    async function fetchAsset(asset) {
      if (!asset?.workerUrl) throw new Error("Staged asset workerUrl is required");
      const response = await fetchImpl(`${options.baseUrl || ""}${asset.workerUrl}`, {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`Staged asset download failed: HTTP ${response.status}`);
      const blob = await response.blob();
      return typeof File === "function"
        ? new File([blob], asset.name || "asset", { type: asset.mime || blob.type })
        : blob;
    }

    async function ackAsset(asset) {
      if (!asset?.assetId) return;
      await request(`/assets/${encodeURIComponent(asset.assetId)}/ack`, { method: "POST", body: {} });
    }

    async function registerWorker() {
      await request("/session", { method: "GET" });
      const registered = await request("/worker/register", {
        method: "POST",
        body: { workerId, label, capabilities: await options.getCapabilities() }
      });
      state.leaseMs = Number(registered.leaseMs || state.leaseMs);
      return registered;
    }

    async function runOnce() {
      if (!state.running || runningCycle) return null;
      runningCycle = true;
      try {
        state.active = Boolean(await lease.renew());
        if (!state.active) {
          state.connection = "standby";
          publish();
          return null;
        }
        let heartbeat;
        try {
          heartbeat = await request("/worker/heartbeat", { method: "POST", body: { workerId } });
        } catch (error) {
          if (![401, 404].includes(Number(error?.status))) throw error;
          await registerWorker();
          heartbeat = await request("/worker/heartbeat", { method: "POST", body: { workerId } });
        }
        state.lastHeartbeatAt = Date.now();
        for (const taskId of heartbeat.cancelTaskIds || []) {
          if (typeof options.cancelTask === "function") await options.cancelTask(String(taskId));
        }
        const claimed = await request("/worker/claim", { method: "POST", body: { workerId } });
        setConnected();
        if (!claimed.task) return null;
        const task = claimed.task;
        const controls = {
          report: rawReport => report(task.taskId, rawReport),
          fetchAsset,
          ackAsset,
          decideRefreshRecovery
        };
        try {
          await options.executeTask(task, controls);
        } catch (error) {
          await controls.report({
            state: "failed",
            error: { message: String(error?.message || error || "Browser worker failed") },
            completedAt: new Date().toISOString()
          });
        }
        return task;
      } catch (error) {
        setDisconnected(error);
        throw error;
      } finally {
        runningCycle = false;
      }
    }

    function schedule(delay = claimMs) {
      if (!state.running || options.autoSchedule === false) return;
      clearTimer(timer);
      timer = setTimer(async () => {
        try {
          await runOnce();
          schedule(claimMs);
        } catch {
          schedule(reconnectDelay(state.reconnectAttempt - 1));
        }
      }, delay);
    }

    async function start() {
      if (state.running) return clone(state);
      state.running = true;
      try {
        state.active = Boolean(await lease.acquire());
        if (!state.active) {
          state.connection = "standby";
          publish();
          schedule(heartbeatMs);
          return clone(state);
        }
        await registerWorker();
        setConnected();
        schedule(0);
        return clone(state);
      } catch (error) {
        setDisconnected(error);
        if (options.autoSchedule !== false) schedule(reconnectDelay(state.reconnectAttempt - 1));
        throw error;
      }
    }

    function stop() {
      state.running = false;
      state.active = false;
      clearTimer(timer);
      lease.release();
      publish();
    }

    return {
      start,
      stop,
      runOnce,
      report,
      getState: () => clone(state)
    };
  }

  return {
    createWorker,
    createStorageLease,
    decideRefreshRecovery,
    reconnectDelay,
    normalizeWorkerReport
  };
});

