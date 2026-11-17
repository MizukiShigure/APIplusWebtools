const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { probeLocalMedia } = require("./local-media-metadata.cjs");
const {
  createEventStore,
  createHistoryState,
  applyHistoryEvent,
  listHistoryRecords,
  writeJsonAtomic
} = require("./local-event-store.cjs");

const AGENT_PREFIX = "/api/agent/v1";
const CONTROL_PREFIX = "/api/control/v1";
const TASK_STATES = new Set([
  "waiting_for_worker",
  "pending",
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
const TERMINAL_TASK_STATES = new Set(["completed", "failed", "canceled", "submission-unknown"]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function resolveDataDirectory({ root = __dirname, env = process.env } = {}) {
  const configured = String(env.API_BATCH_DATA_DIR || env.API_BATCH_LAUNCHER_DATA_DIR || "").trim();
  return path.resolve(configured || path.join(root, "data"));
}

function cleanText(value, fallback = "", maxLength = 128) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, maxLength);
}

function normalizeOrigin(value = {}, defaults = {}) {
  const type = value.type === "browser" ? "browser" : "agent";
  const client = cleanText(value.client, defaults.client || (type === "browser" ? "web" : "agent"), 64);
  const id = cleanText(value.id, defaults.id || `${client}-local`, 128);
  const label = cleanText(value.label, defaults.label || id, 128);
  return { type, client, id, label };
}

function validateLoopbackHost(hostHeader) {
  try {
    const hostname = new URL(`http://${String(hostHeader || "")}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(payload));
}

function readBodyBuffer(request, limit = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error("Request body too large");
        error.status = 413;
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function readJsonBody(request, limit = 10 * 1024 * 1024) {
  const buffer = await readBodyBuffer(request, limit);
  if (!buffer.length || !buffer.toString("utf8").trim()) return {};
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    throw error;
  }
}

function parseCookies(header) {
  return String(header || "").split(";").reduce((result, part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return result;
    result[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
    return result;
  }, {});
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    const error = new Error("Missing multipart boundary");
    error.status = 400;
    throw error;
  }
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const parts = [];
  let cursor = 0;
  while (cursor < buffer.length) {
    const start = buffer.indexOf(boundary, cursor);
    if (start < 0) break;
    const headerStart = start + boundary.length + 2;
    if (buffer.slice(start + boundary.length, start + boundary.length + 2).toString() === "--") break;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd < 0) break;
    const next = buffer.indexOf(boundary, headerEnd + 4);
    if (next < 0) break;
    const headers = buffer.slice(headerStart, headerEnd).toString("utf8");
    const content = buffer.slice(headerEnd + 4, Math.max(headerEnd + 4, next - 2));
    const name = headers.match(/name="([^"]+)"/i)?.[1] || "";
    const fileName = headers.match(/filename="([^"]*)"/i)?.[1] || "";
    const mime = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";
    parts.push({ name, fileName, mime, content });
    cursor = next;
  }
  return parts;
}

function createTaskState() {
  return { tasksById: {}, taskOrder: [], taskIdByClientId: {} };
}

function applyTaskEvent(currentState, event) {
  const state = currentState && typeof currentState === "object" ? clone(currentState) : createTaskState();
  state.tasksById ||= {};
  state.taskOrder ||= [];
  state.taskIdByClientId ||= {};
  if (event?.type === "task-created") {
    const task = clone(event.task);
    if (!task?.taskId || state.tasksById[task.taskId] || state.taskIdByClientId[task.clientTaskId]) return state;
    state.tasksById[task.taskId] = task;
    state.taskOrder.push(task.taskId);
    state.taskIdByClientId[task.clientTaskId] = task.taskId;
    return state;
  }
  const task = state.tasksById[event?.taskId];
  if (!task) return state;
  const now = event.createdAt || new Date().toISOString();
  if (event.type === "task-claimed") {
    task.state = "claimed";
    task.claimedBy = clone(event.worker);
    task.leaseExpiresAt = Number(event.leaseExpiresAt || 0);
  } else if (event.type === "task-lease-renewed") {
    if (task.claimedBy?.id === event.workerId) task.leaseExpiresAt = Number(event.leaseExpiresAt || 0);
  } else if (event.type === "task-cancel-requested") {
    task.cancelRequested = true;
    if (!TERMINAL_TASK_STATES.has(task.state)) task.state = "cancel_requested";
  } else if (event.type === "task-released") {
    task.state = event.state || "pending";
    task.claimedBy = null;
    task.leaseExpiresAt = 0;
    if (event.error) task.error = clone(event.error);
  } else if (event.type === "task-reported") {
    if (event.state && TASK_STATES.has(event.state)) task.state = event.state;
    if (Array.isArray(event.upstreamTaskIds)) task.upstreamTaskIds = clone(event.upstreamTaskIds);
    if (Array.isArray(event.results)) task.results = clone(event.results);
    if (event.progress !== undefined) task.progress = clone(event.progress);
    if (event.error !== undefined) task.error = clone(event.error);
    if (event.state === "completed" || event.state === "failed" || event.state === "canceled") {
      task.completedAt = event.completedAt || now;
      task.leaseExpiresAt = 0;
    }
  } else if (event.type === "task-execution-updated") {
    task.execution = clone(event.execution);
  }
  task.updatedAt = now;
  return state;
}

function normalizeTaskInput(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {};
}

function safeTaskMetadata(value) {
  if (Array.isArray(value)) return value.map(safeTaskMetadata);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    /^(api[_-]?key|authorization|token|secret|password)$/i.test(key) && child && !String(child).startsWith("@shared:")
      ? "[runtime credential]" : safeTaskMetadata(child)]));
}

function normalizeHistoryRecord(record, task, worker) {
  const result = clone(record || {});
  result.recordId = cleanText(result.recordId, crypto.randomUUID(), 180);
  result.kind = result.kind === "upload" ? "upload" : "generation";
  result.mediaType = ["image", "video", "audio", "other"].includes(result.mediaType) ? result.mediaType : "other";
  result.createdAt = Number(result.createdAt || Date.now());
  if (task) {
    result.taskId ||= task.taskId;
    result.origin = normalizeOrigin(task.origin);
  } else {
    result.origin = normalizeOrigin(result.origin, { client: "web", id: "legacy-browser", label: "Legacy browser" });
  }
  if (worker) result.executedBy = { type: worker.type || "browser", id: worker.id, label: worker.label || worker.id };
  return result;
}

async function loadOrCreateAgentAuth(dataDir, env) {
  const fromEnv = cleanText(env.API_BATCH_AGENT_TOKEN, "", 1024);
  if (fromEnv) return { token: fromEnv, source: "environment", rotatable: false };
  const file = path.join(dataDir, "config", "agent-auth.json");
  try {
    const parsed = JSON.parse(await fs.promises.readFile(file, "utf8"));
    if (cleanText(parsed.token)) return { token: cleanText(parsed.token, "", 1024), source: "file", rotatable: true, file };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const auth = { token: crypto.randomBytes(32).toString("base64url"), createdAt: new Date().toISOString() };
  await writeJsonAtomic(file, auth);
  return { token: auth.token, source: "file", rotatable: true, file };
}

async function createAgentService(options = {}) {
  const root = path.resolve(options.root || __dirname);
  const env = options.env || process.env;
  const dataDir = path.resolve(options.dataDir || resolveDataDirectory({ root, env }));
  const leaseMs = Math.max(1000, Number(options.leaseMs || 30000));
  const workerOnlineMs = Math.max(leaseMs * 2, Number(options.workerOnlineMs || 30000));
  const auth = await loadOrCreateAgentAuth(dataDir, env);
  const controlSecret = crypto.randomBytes(24).toString("base64url");
  const workers = new Map();
  const staging = new Map();
  const runtimeInputs = new Map();
  let mutationQueue = Promise.resolve();
  function serializeMutation(operation) {
    const result = mutationQueue.then(operation);
    mutationQueue = result.catch(() => {});
    return result;
  }

  const taskStore = createEventStore({
    journalFile: path.join(dataDir, "tasks", "events.ndjson"),
    snapshotFile: path.join(dataDir, "tasks", "snapshot.json"),
    initialState: createTaskState,
    applyEvent: applyTaskEvent
  });
  const historyStore = createEventStore({
    journalFile: path.join(dataDir, "history", "events.ndjson"),
    snapshotFile: path.join(dataDir, "history", "snapshot.json"),
    initialState: createHistoryState,
    applyEvent: applyHistoryEvent
  });
  await Promise.all([taskStore.init(), historyStore.init(), fs.promises.mkdir(path.join(dataDir, "staging"), { recursive: true })]);

  function nowMs() {
    return typeof options.now === "function" ? Number(options.now()) : Date.now();
  }

  function onlineWorkers() {
    const cutoff = nowMs() - workerOnlineMs;
    return Array.from(workers.values()).filter(worker => worker.lastSeenAt >= cutoff);
  }

  function publicWorkerStatus() {
    const active = onlineWorkers().sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0];
    return active
      ? { online: true, id: active.id, label: active.label, lastSeenAt: active.lastSeenAt }
      : { online: false, id: "", label: "", lastSeenAt: 0 };
  }

  function currentCapabilities() {
    const active = onlineWorkers().sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0];
    const headless = typeof options.headlessCapabilities === "function" ? options.headlessCapabilities() : options.headlessCapabilities;
    return {
      apiVersion: "v1",
      localOnly: true,
      instance: { pid: process.pid, root, dataDir },
      execution: options.headless ? "headless" : "browser-worker",
      ...(options.gatewayStatus ? { gateway: options.gatewayStatus() } : {}),
      auth: { localCli: options.headless ? "header-loopback" : "bearer", browser: "bearer-same-origin" },
      remoteAccess: { enabled: false },
      worker: options.headless ? { online: true, type: "headless", id: "local-service", label: "Local background service" } : publicWorkerStatus(),
      taskFamilies: clone(headless?.taskFamilies || active?.capabilities?.taskFamilies || [])
    };
  }

  function getTask(taskId) {
    return taskStore.getState(state => state.tasksById[String(taskId || "")] || null);
  }

  function cancelTaskIdsFor(workerId) {
    return taskStore.getState(state => Object.values(state.tasksById)
      .filter(task => task.claimedBy?.id === workerId && task.cancelRequested && !TERMINAL_TASK_STATES.has(task.state))
      .map(task => task.taskId));
  }

  function requireAgent(request, response) {
    const header = String(request.headers.authorization || "");
    if (!validOriginHeader(request)) {
      sendJson(response, 403, { success: false, error: "untrusted_origin" });
      return false;
    }
    if (header === `Bearer ${auth.token}`) return true;
    const cli = options.headless && request.headers["x-api-plus-client"] === "cli-v1";
    if (cli && !header) {
      const remote = request.socket?.remoteAddress || "";
      if (request.headers.origin || request.headers.referer || request.headers["sec-fetch-site"] || request.headers["sec-fetch-dest"] ||
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) {
        sendJson(response, 403, { success: false, error: "native_loopback_client_required" });
        return false;
      }
      return true;
    }
    if (header !== `Bearer ${auth.token}`) {
      sendJson(response, 401, { success: false, error: "unauthorized" }, { "WWW-Authenticate": "Bearer" });
      return false;
    }
    return true;
  }

  function validOriginHeader(request) {
    if (!validateLoopbackHost(request.headers.host)) return false;
    const origin = String(request.headers.origin || "").trim();
    if (!origin) return true;
    try {
      const originUrl = new URL(origin);
      return validateLoopbackHost(originUrl.host) && originUrl.host.toLowerCase() === String(request.headers.host || "").toLowerCase();
    } catch {
      return false;
    }
  }

  function requireControl(request, response) {
    if (!validOriginHeader(request)) {
      sendJson(response, 403, { success: false, error: "untrusted_origin" });
      return false;
    }
    if (parseCookies(request.headers.cookie).api_plus_control !== controlSecret) {
      sendJson(response, 401, { success: false, error: "control_session_required" });
      return false;
    }
    return true;
  }

  async function appendTaskCreated(raw) {
    return serializeMutation(() => appendTaskCreatedUnlocked(raw));
  }

  async function appendTaskCreatedUnlocked(raw) {
    const clientTaskId = cleanText(raw.clientTaskId, "", 180);
    const taskType = cleanText(raw.taskType, "", 64);
    if (!clientTaskId || !taskType) {
      const error = new Error("clientTaskId and taskType are required");
      error.status = 400;
      throw error;
    }
    const existing = taskStore.getState(state => state.tasksById[state.taskIdByClientId[clientTaskId]] || null);
    if (existing) return { task: existing, created: false };
    const taskId = crypto.randomUUID();
    const createdAt = new Date(nowMs()).toISOString();
    const task = {
      taskId,
      clientTaskId,
      taskType,
      input: safeTaskMetadata(normalizeTaskInput(raw.input)),
      origin: normalizeOrigin(raw.origin),
      state: options.headless || onlineWorkers().length ? "pending" : "waiting_for_worker",
      executionOwner: options.headless ? "headless" : "browser",
      createdAt,
      updatedAt: createdAt,
      upstreamTaskIds: [],
      results: [],
      progress: null,
      error: null,
      claimedBy: null,
      leaseExpiresAt: 0,
      cancelRequested: false
    };
    runtimeInputs.set(taskId, normalizeTaskInput(raw.input));
    await taskStore.append({ eventId: `task-created:${taskId}`, type: "task-created", task });
    return { task: getTask(taskId), created: true };
  }

  async function recoverExpiredLeases() {
    const now = nowMs();
    const tasks = taskStore.getState(state => Object.values(state.tasksById).filter(task =>
      task.executionOwner !== "headless" && task.claimedBy && task.leaseExpiresAt && task.leaseExpiresAt <= now && !TERMINAL_TASK_STATES.has(task.state)));
    for (const task of tasks) {
      const nextState = task.upstreamTaskIds?.length
        ? "polling"
        : task.state === "submitting"
          ? "submission-unknown"
          : "pending";
      await taskStore.append({
        eventId: `lease-expired:${task.taskId}:${task.leaseExpiresAt}`,
        type: "task-released",
        taskId: task.taskId,
        state: nextState,
        error: nextState === "submission-unknown" ? { message: "Worker lease expired during submission; automatic retry is disabled." } : null
      });
    }
  }

  async function appendHistoryRecords(records, task, worker) {
    const appended = [];
    for (const raw of records || []) {
      const record = normalizeHistoryRecord(raw, task, worker);
      await historyStore.append({ eventId: `history-created:${record.recordId}`, type: "record-created", record });
      appended.push(record);
    }
    return appended;
  }

  async function handleAgent(request, response, pathname, parsedUrl) {
    if (!requireAgent(request, response)) return true;
    if (request.method === "GET" && pathname === `${AGENT_PREFIX}/capabilities`) {
      sendJson(response, 200, currentCapabilities());
      return true;
    }
    if (request.method === "POST" && pathname === `${AGENT_PREFIX}/assets`) {
      const contentType = String(request.headers["content-type"] || "");
      if (!/^multipart\/form-data/i.test(contentType)) {
        sendJson(response, 415, { success: false, error: "multipart_form_data_required" });
        return true;
      }
      const parts = parseMultipart(await readBodyBuffer(request), contentType);
      const filePart = parts.find(part => part.name === "file" && part.fileName);
      if (!filePart) {
        sendJson(response, 400, { success: false, error: "file_required" });
        return true;
      }
      const mediaType = cleanText(parts.find(part => part.name === "mediaType")?.content.toString("utf8"), "other", 16);
      function jsonPart(name) {
        const value = parts.find(part => part.name === name)?.content.toString("utf8");
        if (!value) return {};
        try { return JSON.parse(value); } catch { throw Object.assign(new Error(`Invalid ${name} JSON`), { status: 400 }); }
      }
      const metadata = jsonPart("metadata");
      const origin = normalizeOrigin(jsonPart("origin"));
      const assetId = crypto.randomUUID();
      const file = path.join(dataDir, "staging", assetId);
      await fs.promises.writeFile(file, filePart.content);
      const measured = await probeLocalMedia(file, { name: filePart.fileName, mime: filePart.mime });
      const asset = {
        assetId,
        name: path.basename(filePart.fileName),
        mime: filePart.mime,
        mediaType: ["image", "video", "audio", "other"].includes(mediaType) ? mediaType : "other",
        size: filePart.content.length,
        sha256: crypto.createHash("sha256").update(filePart.content).digest("hex"),
        sourcePath: cleanText(metadata.sourcePath, "", 4096),
        lastModified: Number(metadata.lastModified || 0),
        ...(Number(metadata.duration) > 0 ? { duration: Number(metadata.duration) } : {}),
        ...(Number(metadata.width) > 0 ? { width: Number(metadata.width) } : {}),
        ...(Number(metadata.height) > 0 ? { height: Number(metadata.height) } : {}),
        ...measured,
        origin,
        createdAt: nowMs(),
        expiresAt: nowMs() + 24 * 60 * 60 * 1000,
        workerUrl: `${CONTROL_PREFIX}/assets/${assetId}`
      };
      staging.set(assetId, { ...asset, file });
      await writeJsonAtomic(`${file}.json`, asset);
      await appendHistoryRecords([{ ...asset, id: assetId, recordId: `staged:${assetId}`, kind: "upload", type: asset.mediaType, source: "agent", staging: true }], { taskId: "", origin }, { type: "headless", id: "local-service" });
      sendJson(response, 201, { success: true, asset });
      return true;
    }
    if (request.method === "POST" && pathname === `${AGENT_PREFIX}/tasks`) {
      const body = await readJsonBody(request);
      const list = Array.isArray(body.tasks) ? body.tasks : [body];
      if (!list.length) {
        sendJson(response, 400, { success: false, error: "tasks_required" });
        return true;
      }
      const results = [];
      let createdAny = false;
      for (const item of list) {
        const result = await appendTaskCreated(item);
        results.push(result.task);
        createdAny ||= result.created;
      }
      const payload = Array.isArray(body.tasks) ? { success: true, tasks: results } : { success: true, task: results[0] };
      sendJson(response, createdAny ? 202 : 200, payload);
      return true;
    }
    const taskMatch = pathname.match(/^\/api\/agent\/v1\/tasks\/([^/]+)$/);
    if (request.method === "GET" && taskMatch) {
      await recoverExpiredLeases();
      const task = getTask(decodeURIComponent(taskMatch[1]));
      sendJson(response, task ? 200 : 404, task ? { success: true, task } : { success: false, error: "task_not_found" });
      return true;
    }
    const eventsMatch = pathname.match(/^\/api\/agent\/v1\/tasks\/([^/]+)\/events$/);
    if (request.method === "GET" && eventsMatch) {
      const taskId = decodeURIComponent(eventsMatch[1]);
      if (!getTask(taskId)) {
        sendJson(response, 404, { success: false, error: "task_not_found" });
        return true;
      }
      const afterSequence = Number(parsedUrl.searchParams.get("after") || 0);
      const events = taskStore.getEvents({ afterSequence }).filter(event => event.taskId === taskId || event.task?.taskId === taskId);
      sendJson(response, 200, { success: true, events });
      return true;
    }
    const cancelMatch = pathname.match(/^\/api\/agent\/v1\/tasks\/([^/]+)\/cancel$/);
    if (request.method === "POST" && cancelMatch) {
      const taskId = decodeURIComponent(cancelMatch[1]);
      const task = getTask(taskId);
      if (!task) {
        sendJson(response, 404, { success: false, error: "task_not_found" });
        return true;
      }
      if (!TERMINAL_TASK_STATES.has(task.state)) {
        await taskStore.append({ eventId: `cancel-requested:${taskId}`, type: "task-cancel-requested", taskId });
        if (!task.claimedBy) {
          await taskStore.append({ eventId: `canceled-local:${taskId}`, type: "task-reported", taskId, state: "canceled", completedAt: new Date(nowMs()).toISOString() });
        }
      }
      sendJson(response, task.claimedBy ? 202 : 200, { success: true, task: getTask(taskId) });
      return true;
    }
    if (request.method === "GET" && pathname === `${AGENT_PREFIX}/history`) {
      const taskId = cleanText(parsedUrl.searchParams.get("taskId"), "", 180);
      const records = listHistoryRecords(historyStore.getState()).filter(record => !taskId || record.taskId === taskId);
      sendJson(response, 200, { success: true, records });
      return true;
    }
    return false;
  }

  async function handleControl(request, response, pathname) {
    if (request.method === "GET" && pathname === `${CONTROL_PREFIX}/session`) {
      if (!validOriginHeader(request)) {
        sendJson(response, 403, { success: false, error: "untrusted_origin" });
        return true;
      }
      sendJson(response, 200, { success: true }, {
        "Set-Cookie": `api_plus_control=${encodeURIComponent(controlSecret)}; HttpOnly; SameSite=Strict; Path=/`
      });
      return true;
    }
    if (!requireControl(request, response)) return true;
    if (request.method === "POST" && pathname === `${CONTROL_PREFIX}/worker/register`) {
      const body = await readJsonBody(request);
      const id = cleanText(body.workerId, "", 180);
      if (!id) {
        sendJson(response, 400, { success: false, error: "worker_id_required" });
        return true;
      }
      const worker = {
        id,
        label: cleanText(body.label, id, 128),
        capabilities: body.capabilities && typeof body.capabilities === "object" ? clone(body.capabilities) : { taskFamilies: [] },
        lastSeenAt: nowMs()
      };
      workers.set(id, worker);
      sendJson(response, 200, { success: true, worker: { id: worker.id, label: worker.label, lastSeenAt: worker.lastSeenAt }, leaseMs });
      return true;
    }
    if (request.method === "POST" && pathname === `${CONTROL_PREFIX}/worker/heartbeat`) {
      const body = await readJsonBody(request);
      const worker = workers.get(cleanText(body.workerId));
      if (!worker) {
        sendJson(response, 404, { success: false, error: "worker_not_registered" });
        return true;
      }
      worker.lastSeenAt = nowMs();
      const claimedIds = taskStore.getState(state => Object.values(state.tasksById)
        .filter(task => task.claimedBy?.id === worker.id && !TERMINAL_TASK_STATES.has(task.state))
        .map(task => task.taskId));
      await taskStore.appendMany(claimedIds.map(taskId => ({
        eventId: `lease-renewed:${taskId}:${worker.lastSeenAt}`,
        type: "task-lease-renewed",
        taskId,
        workerId: worker.id,
        leaseExpiresAt: worker.lastSeenAt + leaseMs
      })));
      const cancelTaskIds = cancelTaskIdsFor(worker.id);
      sendJson(response, 200, { success: true, leaseMs, cancelTaskIds });
      return true;
    }
    if (request.method === "POST" && pathname === `${CONTROL_PREFIX}/worker/claim`) {
      const body = await readJsonBody(request);
      const worker = workers.get(cleanText(body.workerId));
      if (!worker) {
        sendJson(response, 404, { success: false, error: "worker_not_registered" });
        return true;
      }
      worker.lastSeenAt = nowMs();
      await recoverExpiredLeases();
      const task = taskStore.getState(state => {
        const taskId = state.taskOrder.find(id => {
          const item = state.tasksById[id];
          return item && item.executionOwner !== "headless" && ["pending", "waiting_for_worker", "polling"].includes(item.state) && !item.claimedBy && !item.cancelRequested;
        });
        return state.tasksById[taskId] || null;
      });
      if (!task) {
        sendJson(response, 200, { success: true, task: null, cancelTaskIds: cancelTaskIdsFor(worker.id) });
        return true;
      }
      await taskStore.append({
        eventId: `task-claimed:${task.taskId}:${worker.id}:${nowMs()}`,
        type: "task-claimed",
        taskId: task.taskId,
        worker: { type: "browser", id: worker.id, label: worker.label },
        leaseExpiresAt: nowMs() + leaseMs
      });
      sendJson(response, 200, { success: true, task: getTask(task.taskId), leaseMs, cancelTaskIds: cancelTaskIdsFor(worker.id) });
      return true;
    }
    if (request.method === "POST" && pathname === `${CONTROL_PREFIX}/worker/report`) {
      const body = await readJsonBody(request, 50 * 1024 * 1024);
      const worker = workers.get(cleanText(body.workerId));
      const task = getTask(body.taskId);
      if (!worker || !task || task.claimedBy?.id !== worker.id) {
        sendJson(response, 409, { success: false, error: "task_lease_mismatch" });
        return true;
      }
      const state = cleanText(body.state, task.state, 40);
      if (!TASK_STATES.has(state)) {
        sendJson(response, 400, { success: false, error: "invalid_task_state" });
        return true;
      }
      await taskStore.append({
        eventId: cleanText(body.eventId, `task-report:${task.taskId}:${crypto.randomUUID()}`, 220),
        type: "task-reported",
        taskId: task.taskId,
        state,
        upstreamTaskIds: Array.isArray(body.upstreamTaskIds) ? body.upstreamTaskIds.map(String) : task.upstreamTaskIds,
        results: Array.isArray(body.results) ? clone(body.results) : task.results,
        progress: body.progress,
        error: body.error,
        completedAt: body.completedAt
      });
      const historyRecords = await appendHistoryRecords(body.historyRecords, task, worker);
      sendJson(response, 200, { success: true, task: getTask(task.taskId), historyRecords });
      return true;
    }
    const assetMatch = pathname.match(/^\/api\/control\/v1\/assets\/([^/]+)$/);
    if (request.method === "GET" && assetMatch) {
      const assetId = decodeURIComponent(assetMatch[1]);
      let asset = staging.get(assetId);
      if (!asset) {
        try {
          const metadata = JSON.parse(await fs.promises.readFile(path.join(dataDir, "staging", `${assetId}.json`), "utf8"));
          asset = { ...metadata, file: path.join(dataDir, "staging", assetId) };
        } catch {
          asset = null;
        }
      }
      if (!asset) {
        sendJson(response, 404, { success: false, error: "asset_not_found" });
        return true;
      }
      const data = await fs.promises.readFile(asset.file);
      response.writeHead(200, { "Content-Type": asset.mime, "Content-Length": data.length, "Cache-Control": "no-store" });
      response.end(data);
      return true;
    }
    const ackMatch = pathname.match(/^\/api\/control\/v1\/assets\/([^/]+)\/ack$/);
    if (request.method === "POST" && ackMatch) {
      const assetId = decodeURIComponent(ackMatch[1]);
      staging.delete(assetId);
      await Promise.all([
        fs.promises.rm(path.join(dataDir, "staging", assetId), { force: true }),
        fs.promises.rm(path.join(dataDir, "staging", `${assetId}.json`), { force: true })
      ]);
      sendJson(response, 200, { success: true });
      return true;
    }
    if (request.method === "GET" && pathname === `${CONTROL_PREFIX}/history`) {
      sendJson(response, 200, { success: true, records: listHistoryRecords(historyStore.getState()) });
      return true;
    }
    if (request.method === "POST" && pathname === `${CONTROL_PREFIX}/history/records`) {
      const body = await readJsonBody(request, 100 * 1024 * 1024);
      const records = Array.isArray(body.records) ? body.records : body.record ? [body.record] : [];
      if (!records.length) {
        sendJson(response, 400, { success: false, error: "records_required" });
        return true;
      }
      const appended = await appendHistoryRecords(records, null, null);
      sendJson(response, 200, { success: true, records: appended });
      return true;
    }
    const resultDeleteMatch = pathname.match(/^\/api\/control\/v1\/history\/([^/]+)\/results\/delete$/);
    if (request.method === "POST" && resultDeleteMatch) {
      const body = await readJsonBody(request);
      const recordId = decodeURIComponent(resultDeleteMatch[1]);
      const results = Array.isArray(body.results) ? body.results.filter(Boolean) : [];
      if (!results.length) {
        sendJson(response, 400, { success: false, error: "results_required" });
        return true;
      }
      await historyStore.append({
        eventId: `delete-results:${recordId}:${crypto.randomUUID()}`,
        type: "record-results-deleted",
        recordId,
        results
      });
      sendJson(response, 200, { success: true });
      return true;
    }
    const favoriteMatch = pathname.match(/^\/api\/control\/v1\/history\/([^/]+)\/favorite$/);
    if (request.method === "POST" && favoriteMatch) {
      const body = await readJsonBody(request);
      const recordId = decodeURIComponent(favoriteMatch[1]);
      await historyStore.append({ eventId: `favorite:${recordId}:${crypto.randomUUID()}`, type: "favorite-set", recordId, favorite: Boolean(body.favorite) });
      sendJson(response, 200, { success: true });
      return true;
    }
    const deleteMatch = pathname.match(/^\/api\/control\/v1\/history\/([^/]+)$/);
    if (request.method === "DELETE" && deleteMatch) {
      const recordId = decodeURIComponent(deleteMatch[1]);
      await historyStore.append({ eventId: `delete:${recordId}`, type: "record-deleted", recordId });
      sendJson(response, 200, { success: true });
      return true;
    }
    if (request.method === "GET" && pathname === `${CONTROL_PREFIX}/agent-auth`) {
      sendJson(response, 200, {
        success: true,
        token: auth.token,
        rotatable: auth.rotatable,
        worker: options.headless ? currentCapabilities().worker : publicWorkerStatus(),
        headless: { enabled: Boolean(options.headless) },
        queue: Object.values(taskStore.getState().tasksById).reduce((counts, task) => {
          counts[task.state] = (counts[task.state] || 0) + 1;
          return counts;
        }, {})
      });
      return true;
    }
    if (request.method === "POST" && pathname === `${CONTROL_PREFIX}/agent-auth/rotate`) {
      if (!auth.rotatable || !auth.file) {
        sendJson(response, 409, { success: false, error: "environment_token_cannot_rotate" });
        return true;
      }
      auth.token = crypto.randomBytes(32).toString("base64url");
      await writeJsonAtomic(auth.file, { token: auth.token, rotatedAt: new Date().toISOString() });
      sendJson(response, 200, { success: true, token: auth.token });
      return true;
    }
    return false;
  }

  async function route(request, response, pathname, parsedUrl = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`)) {
    try {
      if (pathname.startsWith(AGENT_PREFIX)) return await handleAgent(request, response, pathname, parsedUrl);
      if (pathname.startsWith(CONTROL_PREFIX)) return await handleControl(request, response, pathname, parsedUrl);
      return false;
    } catch (error) {
      sendJson(response, error.status || 500, { success: false, error: error.code || "request_failed", message: error.message });
      return true;
    }
  }

  async function getStagedAsset(assetId) {
    if (!/^[a-zA-Z0-9-]{1,180}$/.test(String(assetId || ""))) throw Object.assign(new Error("Invalid asset ID"), { status: 400 });
    const file = path.join(dataDir, "staging", assetId);
    const asset = staging.get(assetId) || { ...JSON.parse(await fs.promises.readFile(`${file}.json`, "utf8")), file };
    staging.set(assetId, asset);
    return clone(asset);
  }

  async function updateStagedAsset(assetId, patch) {
    const asset = { ...await getStagedAsset(assetId), ...clone(patch) };
    staging.set(assetId, asset);
    const { file, ...metadata } = asset;
    await writeJsonAtomic(`${file}.json`, metadata);
    return asset;
  }

  async function claimHeadless(excludedIds = []) {
    return serializeMutation(async () => {
      const excluded = new Set(excludedIds);
      const task = taskStore.getState(state => state.taskOrder.map(id => state.tasksById[id]).find(item =>
        item.executionOwner === "headless" && !excluded.has(item.taskId) && !TERMINAL_TASK_STATES.has(item.state)) || null);
      if (!task) return null;
      await taskStore.append({ eventId: `headless-claim:${task.taskId}:${crypto.randomUUID()}`, type: "task-claimed", taskId: task.taskId,
        worker: { type: "headless", id: "local-service", label: "Local background service" }, leaseExpiresAt: 0 });
      return getTask(task.taskId);
    });
  }

  async function updateExecution(taskId, execution) {
    await taskStore.append({ eventId: `execution:${taskId}:${crypto.randomUUID()}`, type: "task-execution-updated", taskId, execution });
    return getTask(taskId);
  }

  async function reportHeadless(taskId, report) {
    await taskStore.append({ eventId: `headless-report:${taskId}:${crypto.randomUUID()}`, type: "task-reported", taskId, ...clone(report) });
    return getTask(taskId);
  }

  return {
    route,
    dataDir,
    getAgentToken: () => auth.token,
    getTask,
    getRuntimeInput: taskId => clone(runtimeInputs.get(taskId) || getTask(taskId)?.input || {}),
    createTask: appendTaskCreated,
    claimHeadless,
    updateExecution,
    reportHeadless,
    getStagedAsset,
    updateStagedAsset,
    appendHistoryRecords,
    getCapabilities: currentCapabilities,
    getHistory: () => listHistoryRecords(historyStore.getState()),
    taskStore,
    historyStore
  };
}

module.exports = {
  createAgentService,
  resolveDataDirectory,
  normalizeOrigin,
  validateLoopbackHost,
  createTaskState,
  applyTaskEvent,
  TASK_STATES
};
