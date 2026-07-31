const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createAgentService, resolveDataDirectory, validateLoopbackHost } = require("./agent-service.cjs");

const root = __dirname;
const port = Number(process.env.PORT || 4198);
const host = process.env.HOST || "127.0.0.1";
if (!validateLoopbackHost(host)) throw new Error("HOST must remain loopback-only (127.0.0.1, localhost, or ::1)");
const dataDir = resolveDataDirectory({ root, env: process.env });
const historyFile = path.join(dataDir, "history.json");
const appDataDir = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Internal_API_Batch");
const fallbackHistoryFile = path.join(appDataDir, "history.json");
const agentServicePromise = createAgentService({ root, dataDir });
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
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const full = path.resolve(root, relative);
  return full.startsWith(root) ? full : path.join(root, "index.html");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function emptyHistoryBackup() {
  return {
    updatedAt: "",
    uploadHistory: [],
    generationHistory: []
  };
}

async function readHistoryBackup() {
  for (const file of [historyFile, fallbackHistoryFile]) {
    try {
      const text = await fs.promises.readFile(file, "utf8");
      const parsed = JSON.parse(text);
      return {
        updatedAt: String(parsed.updatedAt || ""),
        uploadHistory: Array.isArray(parsed.uploadHistory) ? parsed.uploadHistory : [],
        generationHistory: Array.isArray(parsed.generationHistory) ? parsed.generationHistory : [],
        storagePath: file
      };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return emptyHistoryBackup();
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
  try {
    next.storagePath = await writeJsonAtomic(historyFile, next);
  } catch (error) {
    if (!["EACCES", "EPERM", "ENOENT"].includes(error.code)) throw error;
    next.storagePath = await writeJsonAtomic(fallbackHistoryFile, next);
  }
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

async function handleRunningHubUpload(request, response) {
  const body = await readJsonBody(request);
  const apiKey = String(body.apiKey || "").trim();
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
  const apiKey = String(body.apiKey || "").trim();
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
  const apiKey = String(body.apiKey || "").trim();
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

async function routeApi(request, response, pathname, parsedUrl) {
  try {
    const agentService = await agentServicePromise;
    if (await agentService.route(request, response, pathname, parsedUrl)) return true;
    if (request.method === "GET" && pathname === "/api/local/history") {
      sendJson(response, 200, await readHistoryBackup());
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
    sendJson(response, error.status || 500, {
      success: false,
      message: error.message || "RunningHub proxy failed",
      detail: error.body || null
    });
    return true;
  }
}

http.createServer(async (request, response) => {
  const parsed = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  const handled = await routeApi(request, response, parsed.pathname, parsed);
  if (handled) return;

  const file = safePath(request.url || "/");
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
});
