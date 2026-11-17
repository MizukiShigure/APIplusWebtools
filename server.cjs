const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createAgentService, resolveDataDirectory, validateLoopbackHost } = require("./agent-service.cjs");
const { createHeadlessExecutor } = require("./agent-headless.cjs");
const workbenchCatalog = require("./workbench-model-catalog.cjs");
const { createPromptLibraryStore } = require("./prompt-library-store.cjs");
const { createAvatarWorkflowService } = require("./avatar-workflow-service.cjs");

const root = __dirname;
const port = Number(process.env.PORT || 4198);
const host = process.env.HOST || "127.0.0.1";
if (!validateLoopbackHost(host)) throw new Error("HOST must remain loopback-only (127.0.0.1, localhost, or ::1)");
const dataDir = resolveDataDirectory({ root, env: process.env });
const gatewayConfig = require('./gateway-config.cjs').createGatewayConfig({ dataDir });
if (process.env.API_PLUS_HEADLESS_LOGS === "1") {
  const logDir = path.join(dataDir, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  for (const [method, file] of [["log", "headless.out.log"], ["error", "headless.err.log"], ["warn", "headless.err.log"]]) {
    console[method] = (...values) => fs.appendFileSync(path.join(logDir, file), `${new Date().toISOString()} ${values.map(String).join(" ")}\n`, "utf8");
  }
}
const promptLibraryStore = createPromptLibraryStore({ dataDir });
const historyFile = path.join(dataDir, "history.json");
const appDataDir = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Internal_API_Batch");
const fallbackHistoryFile = path.join(appDataDir, "history.json");
const legacyProjectHistoryFile = path.join(root, "data", "history.json");
const historyBackupFiles = Array.from(new Set([
  historyFile, legacyProjectHistoryFile, fallbackHistoryFile
]));
const agentServicePromise = createAgentService({ root, dataDir, headless: true, gatewayStatus: () => gatewayConfig.status(), headlessCapabilities: () => workbenchCatalog.getCapabilities() });
let headlessExecutor = null;
const avatarWorkflowPromise = agentServicePromise.then(agentService => createAvatarWorkflowService({ root, dataDir, agentService, getGateway: () => gatewayConfig.read().apiBase }));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};

function safePath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split("?")[0]); } catch { return null; }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const full = path.resolve(root, relative);
  const parts = relative.replace(/\\/g, "/").split("/").map(part => part.toLowerCase().replace(/[ .]+$/g, ""));
  if (parts.some(part => part.startsWith(".") || ["data", "avatar-workflow", "local-config.json", "gateway.json"].includes(part))) return null;
  const within = path.relative(root, full);
  return within && !within.startsWith("..") && !path.isAbsolute(within) && !within.includes(":") ? full : null;
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(response.runningHubSecret ? scrubProviderResponse(payload, response.runningHubSecret) : payload));
}

function emptyHistoryBackup() {
  return {
    updatedAt: "",
    uploadHistory: [],
    generationHistory: []
  };
}

function historyRecordKey(record) {
  const explicitId = String(record?.id || record?.recordId || "").trim();
  if (explicitId) return explicitId;
  const resultUrls = Array.isArray(record?.results)
    ? record.results.map(result => typeof result === "string" ? result : result?.url || "").filter(Boolean)
    : [];
  return [
    record?.url || "",
    record?.taskId || "",
    record?.page || "",
    resultUrls.join("|")
  ].join("::");
}

function mergeHistoryRecords(...lists) {
  const recordsById = new Map();
  lists.flat(2).forEach(record => {
    if (!record || typeof record !== "object" || Array.isArray(record)) return;
    const key = historyRecordKey(record);
    if (!key || recordsById.has(key)) return;
    recordsById.set(key, {
      ...record,
      id: record.id || record.recordId || key
    });
  });
  return Array.from(recordsById.values())
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function projectEventHistory(records) {
  const uploadHistory = [];
  const generationHistory = [];
  (Array.isArray(records) ? records : []).forEach(record => {
    if (!record || typeof record !== "object") return;
    const normalized = { ...record, id: record.id || record.recordId };
    if (!normalized.id) return;
    if (record.kind === "upload") uploadHistory.push(normalized);
    if (record.kind === "generation") generationHistory.push(normalized);
  });
  return { uploadHistory, generationHistory };
}

async function readHistoryBackup(eventRecords = []) {
  const backups = [];
  for (const file of historyBackupFiles) {
    try {
      const text = await fs.promises.readFile(file, "utf8");
      const parsed = JSON.parse(text);
      backups.push({
        updatedAt: String(parsed.updatedAt || ""),
        uploadHistory: Array.isArray(parsed.uploadHistory) ? parsed.uploadHistory : [],
        generationHistory: Array.isArray(parsed.generationHistory) ? parsed.generationHistory : [],
        storagePath: file
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const projected = projectEventHistory(eventRecords);
  const uploadHistory = mergeHistoryRecords(projected.uploadHistory, backups.map(item => item.uploadHistory));
  const generationHistory = mergeHistoryRecords(projected.generationHistory, backups.map(item => item.generationHistory));
  if (!uploadHistory.length && !generationHistory.length && !backups.length) return emptyHistoryBackup();
  const updatedAt = backups.map(item => item.updatedAt).filter(Boolean).sort().at(-1) || "";
  return {
    updatedAt,
    uploadHistory,
    generationHistory,
    storagePath: backups[0]?.storagePath || historyFile
  };
}

async function writeJsonAtomic(file, value) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tempFile, JSON.stringify(value, null, 2), "utf8");
  await fs.promises.rename(tempFile, file);
  return file;
}

async function writeHistoryBackup(payload) {
  const current = await readHistoryBackup();
  const incomingUploads = Array.isArray(payload.uploadHistory) ? payload.uploadHistory : [];
  const incomingGenerations = Array.isArray(payload.generationHistory) ? payload.generationHistory : [];
  if (!incomingUploads.length && !incomingGenerations.length && (current.uploadHistory.length || current.generationHistory.length)) return current;
  const next = {
    updatedAt: new Date().toISOString(),
    uploadHistory: incomingUploads.length ? incomingUploads : current.uploadHistory,
    generationHistory: incomingGenerations.length ? incomingGenerations : current.generationHistory
  };
  // Keep shared history authoritative; a write failure must not write to AppData.
  next.storagePath = await writeJsonAtomic(historyFile, next);
  return next;
}

function readJsonBody(request, limit = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text };
  }
  if (!response.ok) {
    const message = json.message || json.msg || json.error || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

function extFromUrl(url, fallback) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.[a-z0-9]{1,8}$/i);
    return match ? match[0] : fallback;
  } catch {
    return fallback;
  }
}

async function downloadToTemp(url, kind) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download asset failed: HTTP ${response.status}`);
  const fallbackExt = kind === "video" ? ".mp4" : kind === "audio" ? ".mp3" : ".png";
  const ext = extFromUrl(url, fallbackExt);
  const file = path.join(os.tmpdir(), `runninghub-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(file, buffer);
  return file;
}

async function uploadRunningHubFile(apiKey, filePath) {
  const form = new FormData();
  const buffer = await fs.promises.readFile(filePath);
  const blob = new Blob([buffer]);
  form.append("file", blob, path.basename(filePath));
  const json = await fetchJson("https://www.runninghub.ai/openapi/v2/media/upload/binary", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  return json;
}

function scrubProviderResponse(value, secret) {
  if (typeof value === "string") return secret ? value.split(secret).join("[redacted]") : value;
  if (Array.isArray(value)) return value.map(item => scrubProviderResponse(item, secret));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(api[_-]?key|authorization|token|secret|password)$/i.test(key))
    .map(([key, item]) => [key, scrubProviderResponse(item, secret)]));
}

async function handleRunningHubUpload(request, response) {
  const body = await readJsonBody(request);
  const apiKey = await (await avatarWorkflowPromise).resolveCredential(body.apiKey);
  response.runningHubSecret = apiKey;
  const url = String(body.url || "").trim();
  const kind = String(body.kind || "asset");
  if (!apiKey) return sendJson(response, 400, { success: false, message: "Missing RunningHub apiKey" });
  if (!url) return sendJson(response, 400, { success: false, message: "Missing asset url" });

  let tempFile = "";
  try {
    tempFile = await downloadToTemp(url, kind);
    const raw = await uploadRunningHubFile(apiKey, tempFile);
    const data = raw.data || raw;
    sendJson(response, 200, {
      success: true,
      data,
      fileName: data.fileName || data.file_name || "",
      downloadUrl: data.download_url || data.downloadUrl || "",
      raw
    });
  } finally {
    if (tempFile) fs.promises.unlink(tempFile).catch(() => {});
  }
}

async function handleRunningHubRun(request, response) {
  const body = await readJsonBody(request);
  const apiKey = await (await avatarWorkflowPromise).resolveCredential(body.apiKey);
  response.runningHubSecret = apiKey;
  const appId = String(body.appId || body.webappId || "").trim();
  if (!apiKey) return sendJson(response, 400, { success: false, message: "Missing RunningHub apiKey" });
  if (!appId) return sendJson(response, 400, { success: false, message: "Missing RunningHub appId" });

  const requestBody = body.requestBody && typeof body.requestBody === "object"
    ? body.requestBody
    : {
        nodeInfoList: body.nodeInfoList || body.inputs || [],
        instanceType: body.instanceType || "plus",
        usePersonalQueue: Boolean(body.usePersonalQueue)
      };

  const raw = await fetchJson(`https://www.runninghub.ai/openapi/v2/run/ai-app/${encodeURIComponent(appId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
  const data = raw.data || raw;
  sendJson(response, 200, {
    success: true,
    data,
    taskId: data.taskId || data.task_id || raw.taskId || raw.task_id || "",
    raw
  });
}

async function handleRunningHubQuery(request, response) {
  const body = await readJsonBody(request);
  const apiKey = await (await avatarWorkflowPromise).resolveCredential(body.apiKey);
  response.runningHubSecret = apiKey;
  const taskId = String(body.taskId || body.task_id || "").trim();
  if (!apiKey) return sendJson(response, 400, { success: false, message: "Missing RunningHub apiKey" });
  if (!taskId) return sendJson(response, 400, { success: false, message: "Missing RunningHub taskId" });

  const raw = await fetchJson("https://www.runninghub.ai/openapi/v2/query", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ taskId })
  });
  const data = raw.data || raw;
  const state = String(data.status || data.state || data.taskStatus || "").toLowerCase();
  if (state && !/success|succeed|completed|finished|done/.test(state)) {
    return sendJson(response, 200, { success: true, data: null, raw });
  }
  sendJson(response, 200, { success: true, data, raw });
}

function readPromptLibraryBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        if (!failed) reject(Object.assign(new Error("Prompt event body too large"), { status: 413 }));
        failed = true;
        chunks.length = 0;
      } else if (!failed) chunks.push(chunk);
    });
    request.on("end", () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("Invalid prompt event JSON"), { status: 400 })); }
    });
    request.on("error", reject);
    request.on("aborted", () => reject(new Error("Prompt request aborted")));
  });
}

async function routePromptLibrary(request, response, pathname, parsedUrl, agentService) {
  if (pathname !== "/api/prompt-library" && pathname !== "/api/prompt-library/events") return false;
  response.setHeader("Cache-Control", "no-store");
  const address = request.socket.remoteAddress;
  const origin = String(request.headers.origin || "");
  const site = String(request.headers["sec-fetch-site"] || "");
  const expectedOrigin = `http://${request.headers.host}`;
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address) ||
    !validateLoopbackHost(request.headers.host) || (origin && origin !== expectedOrigin) ||
    (site && !["same-origin", "none"].includes(site))) {
    sendJson(response, 403, { success: false, error: "untrusted_origin" });
    return true;
  }
  // An unhandled control route still runs the existing HttpOnly session guard.
  // Reuse that boundary without exporting its secret or accepting Agent tokens.
  if (await agentService.route(request, response, "/api/control/v1/prompt-library", parsedUrl)) return true;
  try {
    if (request.method === "GET" && pathname === "/api/prompt-library") {
      const params = parsedUrl.searchParams;
      const favoriteOnly = params.get("favoriteOnly");
      if (favoriteOnly !== null && !["true", "false", "1", "0"].includes(favoriteOnly)) {
        throw Object.assign(new Error("Invalid favorite filter"), { status: 400 });
      }
      sendJson(response, 200, await promptLibraryStore.list(params.get("taskType"), {
        query: params.get("search") || params.get("query") || params.get("q") || "",
        favoriteOnly: favoriteOnly === "true" || favoriteOnly === "1",
        offset: params.has("offset") ? Number(params.get("offset")) : 0,
        limit: params.has("limit") ? Number(params.get("limit")) : 100,
        sinceRevision: params.has("sinceRevision") ? Number(params.get("sinceRevision")) : undefined
      }));
      return true;
    }
    if (request.method === "POST" && pathname === "/api/prompt-library/events") {
      if (!/^application\/json(?:\s*;|$)/i.test(String(request.headers["content-type"] || ""))) {
        sendJson(response, 415, { success: false, error: "json_required" });
        return true;
      }
      const body = await readPromptLibraryBody(request);
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "events")) {
        throw Object.assign(new Error("Expected prompt events, not a snapshot"), { status: 400 });
      }
      sendJson(response, 200, await promptLibraryStore.append(body.events));
      return true;
    }
    response.setHeader("Allow", pathname.endsWith("/events") ? "POST" : "GET");
    sendJson(response, 405, { success: false, error: "method_not_allowed" });
  } catch (error) {
    sendJson(response, error.status || 500, { success: false,
      message: error.status ? error.message : "Prompt library storage is unavailable; queued events can be retried" });
  }
  return true;
}

async function routeApi(request, response, pathname, parsedUrl) {
  try {
    if (!["/api/prompt-library", "/api/prompt-library/events"].includes(pathname) &&
      decodeURIComponent(pathname).replace(/\\/g, "/").split("/").some(part => part.toLowerCase().replace(/[ .]+$/g, "") === "prompt-library")) {
      sendJson(response, 403, { success: false, error: "private_prompt_storage" });
      return true;
    }
    const agentService = await agentServicePromise;
    if (await (await avatarWorkflowPromise).route(request, response, pathname, parsedUrl)) return true;
    if (await routePromptLibrary(request, response, pathname, parsedUrl, agentService)) return true;
    if (await agentService.route(request, response, pathname, parsedUrl)) return true;
    // Unhandled control routes have already passed the loopback/session guard.
    if (pathname === '/api/control/v1/gateway') {
      response.setHeader('Cache-Control', 'no-store');
      if (request.method === 'GET') sendJson(response, 200, gatewayConfig.read());
      else if (request.method === 'PUT') {
        if (!/^application\/json(?:\s*;|$)/i.test(String(request.headers['content-type'] || ''))) {
          sendJson(response, 415, { success: false, error: 'json_required' }); return true;
        }
        const body = await readJsonBody(request, 8192);
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'apiBase')) {
          sendJson(response, 400, { success: false, error: 'Expected apiBase only' }); return true;
        }
        sendJson(response, 200, gatewayConfig.save(body.apiBase));
      } else { response.setHeader('Allow', 'GET, PUT'); sendJson(response, 405, { success: false, error: 'method_not_allowed' }); }
      return true;
    }
    if (pathname.startsWith("/api/runninghub/") || pathname === "/api/local/history") {
      if (await agentService.route(request, response, "/api/control/v1/runninghub-auth", parsedUrl)) return true;
    }
    if (request.method === "GET" && pathname === "/api/local/history") {
      sendJson(response, 200, await readHistoryBackup(agentService.getHistory()));
      return true;
    }
    if (request.method === "POST" && pathname === "/api/local/history") {
      const body = await readJsonBody(request, 200 * 1024 * 1024);
      sendJson(response, 200, await writeHistoryBackup(body));
      return true;
    }
    if (request.method === "POST" && pathname === "/api/runninghub/upload-url") {
      await handleRunningHubUpload(request, response);
      return true;
    }
    if (request.method === "POST" && pathname === "/api/runninghub/run") {
      await handleRunningHubRun(request, response);
      return true;
    }
    if (request.method === "POST" && pathname === "/api/runninghub/query") {
      await handleRunningHubQuery(request, response);
      return true;
    }
    return false;
  } catch (error) {
    if (pathname.startsWith("/api/runninghub/")) {
      sendJson(response, error.status || 502, { success: false,
        message: error.code === "INVALID_RUNNINGHUB_API_KEY" ? error.message : `RunningHub request failed (HTTP ${error.status || 502})`,
        detail: null });
      return true;
    }
    sendJson(response, error.status || 500, {
      success: false,
      message: error.message || "RunningHub proxy failed",
      detail: error.body || null
    });
    return true;
  }
}

http.createServer(async (request, response) => {
  let parsed;
  try { parsed = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`); }
  catch { sendJson(response, 400, { success: false, error: "invalid_url" }); return; }
  const handled = await routeApi(request, response, parsed.pathname, parsed);
  if (handled) return;

  const file = safePath(request.url || "/");
  if (!file) { sendJson(response, 403, { success: false, error: "private_path" }); return; }
  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream" });
    response.end(data);
  });
}).listen(port, host, () => {
  console.log(`Internal API Batch running at http://${host}:${port}/`);
  console.log(`History backup file: ${historyFile}`);
  console.log(`History backup fallback: ${fallbackHistoryFile}`);
  agentServicePromise.then(service => {
    headlessExecutor = createHeadlessExecutor({ service, localBase: `http://${host}:${port}`, getGateway: () => gatewayConfig.read().apiBase,
      onError: error => console.error(`Headless worker error: ${error.message}`) });
    headlessExecutor.start();
  }).catch(error => console.error(`Headless startup failed: ${error.message}`));
});
