#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

export const DEFAULT_BASE_URL = "http://127.0.0.1:4198/api/agent/v1";
const TERMINAL_STATES = new Set(["completed", "failed", "canceled", "submission-unknown"]);

class ClientError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ClientError";
    this.details = details;
  }
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : canonicalize(item));
  return Object.fromEntries(
    Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

export function stableClientTaskId(task) {
  const canonical = JSON.stringify(canonicalize({
    taskType: task?.taskType || "",
    input: task?.input || {},
    origin: task?.origin || {}
  }));
  return `agent-${crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 24)}`;
}

export function originFromEnvironment(env = process.env) {
  const client = cleanText(env.API_PLUS_AGENT_SOURCE_CLIENT, "codex").slice(0, 64);
  const host = cleanText(os.hostname(), "local").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const id = cleanText(env.API_PLUS_AGENT_SOURCE_ID, `${client}-${host}`).slice(0, 128);
  const label = cleanText(env.API_PLUS_AGENT_SOURCE_LABEL, `${client} on ${host}`).slice(0, 128);
  return { type: "agent", client, id, label };
}

function parseArgs(args) {
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const equalAt = token.indexOf("=");
    if (equalAt > 2) {
      options[token.slice(2, equalAt)] = token.slice(equalAt + 1);
      continue;
    }
    const key = token.slice(2);
    const next = args[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return { options, positional };
}

function helpText() {
  return `API Plus Agent client (no browser or local token setup required)

Usage:
  api-plus-agent-client.mjs start
  api-plus-agent-client.mjs capabilities
  api-plus-agent-client.mjs upload <file> [--media-type image|video|audio|other] [--duration seconds --width pixels --height pixels]
  api-plus-agent-client.mjs submit --task-type <type> --input <json|@file|-> [--client-task-id <id>]
  api-plus-agent-client.mjs status <task-id>
  api-plus-agent-client.mjs wait <task-id> [--interval ms --timeout ms]
  api-plus-agent-client.mjs cancel <task-id>
  api-plus-agent-client.mjs history [--task-id <id>]
  api-plus-agent-client.mjs events <task-id> [--after sequence]
  api-plus-agent-client.mjs recreate <task-id> [--client-task-id <new-id>]

Environment (optional):
  API_PLUS_AGENT_TOKEN          Existing bearer token for compatibility
  API_PLUS_AGENT_BASE_URL       Default: ${DEFAULT_BASE_URL}
  API_PLUS_WORKBENCH_ROOT       Installed workbench root; normally auto-discovered
  API_PLUS_AGENT_AUTOSTART      Set 0 to disable automatic hidden service startup
  API_PLUS_AGENT_SOURCE_CLIENT  Agent family, for example codex or minimax-code
  API_PLUS_AGENT_SOURCE_ID      Stable caller identifier
  API_PLUS_AGENT_SOURCE_LABEL   Human-readable source shown in history
`;
}

export function resolveWorkbench(env = process.env) {
  const root = path.resolve(cleanText(env.API_PLUS_WORKBENCH_ROOT, path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..')));
  const server = path.join(root, 'server.cjs');
  if (!fs.existsSync(server)) throw new ClientError('Workbench server.cjs was not found; install the full workbench or set API_PLUS_WORKBENCH_ROOT', { code: 'workbench_not_found', root });
  const dataDir = path.resolve(env.API_BATCH_DATA_DIR || env.API_BATCH_LAUNCHER_DATA_DIR || (fs.existsSync(path.join(root, '.git')) ? path.join(path.dirname(root), 'APIplusWebtools-data') : path.join(root, 'data')));
  return { root, server, dataDir, node: fs.existsSync(path.join(root, 'runtime/node.exe')) ? path.join(root, 'runtime/node.exe') : process.execPath };
}

export async function ensureLocalService(env = process.env) {
  const base = normalizeBaseUrl(env.API_PLUS_AGENT_BASE_URL);
  const expected = env.API_PLUS_WORKBENCH_ROOT || env.API_BATCH_DATA_DIR || env.API_BATCH_LAUNCHER_DATA_DIR ? resolveWorkbench(env) : null;
  const samePath = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();
  const check = async () => {
    const headers = { 'X-API-Plus-Client': 'cli-v1', ...(env.API_PLUS_AGENT_TOKEN ? { Authorization: `Bearer ${env.API_PLUS_AGENT_TOKEN}` } : {}) };
    const response = await fetch(`${base}/capabilities`, { headers, signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new ClientError(`Existing local service returned HTTP ${response.status}; restart the updated workbench service`, { code: 'existing_service_rejected', status: response.status });
    const capabilities = await response.json();
    if (expected && (!capabilities.instance || !samePath(capabilities.instance.root, expected.root) || !samePath(capabilities.instance.dataDir, expected.dataDir))) {
      throw new ClientError('Local port belongs to a different installation or data directory; stop that service or choose another local port', { code: 'installation_mismatch', expected: { root: expected.root, dataDir: expected.dataDir }, actual: capabilities.instance || null });
    }
    return capabilities;
  };
  try { return await check(); } catch (error) { if (error instanceof ClientError) throw error; }
  if (String(env.API_PLUS_AGENT_AUTOSTART) === '0') throw new ClientError('Local workbench is not running and auto-start is disabled', { code: 'connection_failed' });
  const install = resolveWorkbench(env);
  const logDir = path.join(install.dataDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const url = new URL(base);
  const launchEnv = { ...env, PORT: url.port || '80', HOST: '127.0.0.1', API_BATCH_DATA_DIR: install.dataDir };
  let child;
  if (process.platform === 'win32') {
    // PowerShell's native-command pipeline can otherwise leave inherited output
    // pipe handles in a detached grandchild even when Node redirects its stdio.
    // Start-Process creates the hidden server with independently owned handles.
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$ErrorActionPreference = "Stop"; Start-Process -FilePath $env:API_PLUS_LAUNCH_NODE -ArgumentList (\'"\' + $env:API_PLUS_LAUNCH_SERVER + \'"\') -WorkingDirectory $env:API_PLUS_LAUNCH_ROOT -WindowStyle Hidden'], {
      windowsHide: true, stdio: 'ignore', env: { ...launchEnv, API_PLUS_LAUNCH_NODE: install.node, API_PLUS_LAUNCH_SERVER: install.server,
        API_PLUS_LAUNCH_ROOT: install.root, API_PLUS_HEADLESS_LOGS: '1' }
    });
  } else {
    const stdout = fs.openSync(path.join(logDir, 'headless.out.log'), 'a');
    const stderr = fs.openSync(path.join(logDir, 'headless.err.log'), 'a');
    child = spawn(install.node, [install.server], { cwd: install.root, detached: true, env: launchEnv, stdio: ['ignore', stdout, stderr] });
    fs.closeSync(stdout); fs.closeSync(stderr);
  }
  let launchError;
  child.on('error', error => { launchError = error; });
  child.unref();
  for (let attempt = 0; attempt < 80; attempt++) {
    if (launchError) throw new ClientError(`Could not start workbench: ${launchError.message}`, { code: 'startup_failed' });
    await new Promise(resolve => setTimeout(resolve, 100));
    try { return await check(); } catch (error) { if (error instanceof ClientError) throw error; }
  }
  throw new ClientError('Workbench startup timed out; inspect the headless logs', { code: 'startup_timeout', logDir });
}

async function mediaMetadata(file, env) {
  const stat = fs.statSync(file);
  const base = { sourcePath: file, lastModified: stat.mtimeMs };
  if (!['image', 'audio', 'video'].includes(inferMediaType(file))) return base;
  const candidates = [env.API_PLUS_FFPROBE, path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../runtime/ffprobe.exe'), 'ffprobe'].filter(Boolean);
  for (const command of candidates) {
    try {
      const { stdout } = await promisify(execFile)(command, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,duration', '-of', 'json', file], { windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
      const value = JSON.parse(stdout); const video = value.streams?.find(stream => stream.codec_type === 'video');
      return { ...base, ...(Number(value.format?.duration) > 0 ? { duration: Number(value.format.duration) } : {}), ...(video?.width ? { width: video.width, height: video.height } : {}), metadataSource: 'ffprobe' };
    } catch {}
  }
  return { ...base, metadataSource: 'unavailable' };
}

function normalizeBaseUrl(value) {
  const url = new URL(cleanText(value, DEFAULT_BASE_URL));
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(host)) {
    throw new ClientError("API_PLUS_AGENT_BASE_URL must use a loopback host in local-only mode", {
      code: "non_loopback_base_url"
    });
  }
  return url.toString().replace(/\/$/, "");
}

function readJsonInput(value) {
  if (value === undefined || value === true || value === "") {
    throw new ClientError("--input is required", { code: "input_required" });
  }
  let source = String(value);
  if (source === "-") source = fs.readFileSync(0, "utf8");
  else if (source.startsWith("@")) source = fs.readFileSync(path.resolve(source.slice(1)), "utf8");
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("input must be a JSON object");
    return parsed;
  } catch (error) {
    throw new ClientError(`Invalid --input JSON: ${error.message}`, { code: "invalid_input_json" });
  }
}

function inferMediaType(file) {
  const extension = path.extname(file).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"].includes(extension)) return "image";
  if ([".mp4", ".mov", ".mkv", ".webm", ".avi"].includes(extension)) return "video";
  if ([".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg"].includes(extension)) return "audio";
  return "other";
}

function inferMime(file, mediaType) {
  const extension = path.extname(file).toLowerCase();
  const known = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
    ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
    ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".ogg": "audio/ogg"
  };
  return known[extension] || `${mediaType === "other" ? "application" : mediaType}/octet-stream`;
}

function safeMessage(value, token) {
  const text = String(value || "Request failed");
  return token ? text.split(token).join("[redacted]") : text;
}

function safeResponse(value, token) {
  if (typeof value === 'string') return token ? value.split(token).join('[redacted]') : value;
  if (Array.isArray(value)) return value.map(item => safeResponse(item, token));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, safeResponse(child, token)]));
}

async function requestJson(endpoint, { env = process.env, method = "GET", body, form } = {}) {
  const token = cleanText(env.API_PLUS_AGENT_TOKEN);
  const baseUrl = normalizeBaseUrl(env.API_PLUS_AGENT_BASE_URL);
  const headers = { Accept: "application/json", "X-API-Plus-Client": "cli-v1", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const init = { method, headers };
  if (form) init.body = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${baseUrl}${endpoint}`, init);
  } catch (error) {
    throw new ClientError(safeMessage(error.message, token), { code: "connection_failed" });
  }
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { success: false, error: "invalid_json_response", message: text.slice(0, 1000) };
  }
  if (!response.ok) {
    throw new ClientError(safeMessage(payload.message || payload.error || `HTTP ${response.status}`, token), {
      code: payload.error || "http_error",
      status: response.status,
      response: safeResponse(payload, token)
    });
  }
  return payload;
}

function requirePositional(positional, index, label) {
  const value = cleanText(positional[index]);
  if (!value) throw new ClientError(`${label} is required`, { code: `${label.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_required` });
  return value;
}

async function runCommand(command, args, env) {
  const { options, positional } = parseArgs(args);
  if (command === 'start') return ensureLocalService(env);
  if (command === 'history') return requestJson(`/history${options['task-id'] ? `?taskId=${encodeURIComponent(options['task-id'])}` : ''}`, { env });
  if (command === 'events') return requestJson(`/tasks/${encodeURIComponent(requirePositional(positional, 0, 'task-id'))}/events${options.after ? `?after=${encodeURIComponent(options.after)}` : ''}`, { env });
  if (command === 'recreate') {
    const id = requirePositional(positional, 0, 'task-id');
    const { task } = await requestJson(`/tasks/${encodeURIComponent(id)}`, { env });
    const input = task.execution?.resolvedInput || task.input;
    const origin = originFromEnvironment(env);
    return requestJson('/tasks', { env, method: 'POST', body: { clientTaskId: cleanText(options['client-task-id'], `reroll-${id}-${crypto.randomUUID()}`), taskType: task.taskType, input: { ...input, parentTaskId: id }, origin } });
  }
  if (command === "avatar-library") return requestJson("/avatar-workflow/library", { env });
  if (command === "avatar-submit") {
    const input = readJsonInput(options.input);
    const origin = originFromEnvironment(env);
    const clientTaskId = cleanText(options["client-task-id"], stableClientTaskId({ taskType: "avatar-workflow", input, origin }));
    return requestJson("/avatar-workflow/jobs", { env, method: "POST", body: { clientTaskId, input, origin } });
  }
  if (command === "avatar-status" || command === "avatar-wait") {
    const id = requirePositional(positional, 0, "job-id");
    const interval = Math.max(500, Number(options.interval || 3000));
    const timeout = Math.max(interval, Number(options.timeout || 60 * 60 * 1000));
    if (!Number.isFinite(interval) || !Number.isFinite(timeout)) throw new ClientError("Invalid wait interval or timeout");
    const started = Date.now();
    do {
      const result = await requestJson(`/avatar-workflow/jobs/${encodeURIComponent(id)}`, { env });
      if (command === "avatar-status" || TERMINAL_STATES.has(result.job?.state) || result.job?.state === "partial") return result;
      await new Promise(resolve => setTimeout(resolve, interval));
    } while (Date.now() - started < timeout);
    throw new ClientError("Timed out; keep the existing job ID and query it again");
  }
  if (command === "avatar-add-voice" || command === "avatar-add-workflow") {
    const collection = command === "avatar-add-voice" ? "voices" : "workflows";
    return requestJson(`/avatar-workflow/library/${collection}`, { env, method: "POST", body: { item: readJsonInput(options.input) } });
  }
  if (command === "avatar-upload") {
    const file = path.resolve(requirePositional(positional, 0, "file"));
    const mediaType = inferMediaType(file);
    if (!["image", "audio", "video"].includes(mediaType)) throw new ClientError("Avatar upload accepts an image, audio or subtitle-source video file");
    const form = new FormData();
    form.append("origin", JSON.stringify(originFromEnvironment(env)));
    form.append("file", new Blob([fs.readFileSync(file)], { type: inferMime(file, mediaType) }), path.basename(file));
    return requestJson(`/avatar-workflow/${mediaType === "image" ? "images" : mediaType === "video" ? "media" : "audio"}`, { env, method: "POST", form });
  }
  if (command === "capabilities") return requestJson("/capabilities", { env });

  if (command === "upload") {
    const file = path.resolve(cleanText(options.file, positional[0]));
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new ClientError("Upload file does not exist", { code: "file_not_found", file });
    }
    const mediaType = cleanText(options["media-type"], inferMediaType(file));
    if (!["image", "video", "audio", "other"].includes(mediaType)) {
      throw new ClientError("--media-type must be image, video, audio, or other", { code: "invalid_media_type" });
    }
    const buffer = fs.readFileSync(file);
    const form = new FormData();
    form.append("mediaType", mediaType);
    form.append("origin", JSON.stringify(originFromEnvironment(env)));
    const metadata = await mediaMetadata(file, env);
    for (const key of ['duration', 'width', 'height']) if (options[key] !== undefined) metadata[key] = Number(options[key]);
    form.append("metadata", JSON.stringify(metadata));
    form.append("file", new Blob([buffer], { type: inferMime(file, mediaType) }), path.basename(file));
    return requestJson("/assets", { env, method: "POST", form });
  }

  if (command === "submit") {
    const taskType = cleanText(options["task-type"]);
    if (!taskType) throw new ClientError("--task-type is required", { code: "task_type_required" });
    const input = readJsonInput(options.input);
    const defaults = originFromEnvironment(env);
    const origin = {
      type: "agent",
      client: cleanText(options["source-client"], defaults.client),
      id: cleanText(options["source-id"], defaults.id),
      label: cleanText(options["source-label"], defaults.label)
    };
    const envelope = { taskType, input, origin };
    const clientTaskId = cleanText(options["client-task-id"], stableClientTaskId(envelope));
    return requestJson("/tasks", { env, method: "POST", body: { clientTaskId, ...envelope } });
  }

  if (command === "status") {
    const taskId = requirePositional(positional, 0, "task-id");
    return requestJson(`/tasks/${encodeURIComponent(taskId)}`, { env });
  }

  if (command === "wait") {
    const taskId = requirePositional(positional, 0, "task-id");
    const interval = Math.max(250, Number(options.interval || 2000));
    const timeout = Math.max(interval, Number(options.timeout || 30 * 60 * 1000));
    if (!Number.isFinite(interval) || !Number.isFinite(timeout)) {
      throw new ClientError("--interval and --timeout must be finite milliseconds", { code: "invalid_wait_options" });
    }
    const startedAt = Date.now();
    let latest;
    while (Date.now() - startedAt <= timeout) {
      latest = await requestJson(`/tasks/${encodeURIComponent(taskId)}`, { env });
      if (TERMINAL_STATES.has(latest?.task?.state)) {
        const history = await requestJson(`/history?taskId=${encodeURIComponent(taskId)}`, { env });
        return { ...latest, history: history.records || [] };
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new ClientError(`Timed out waiting for task ${taskId}`, {
      code: "wait_timeout",
      task: latest?.task || null
    });
  }

  if (command === "cancel") {
    const taskId = requirePositional(positional, 0, "task-id");
    return requestJson(`/tasks/${encodeURIComponent(taskId)}/cancel`, { env, method: "POST", body: {} });
  }

  throw new ClientError(`Unknown command: ${command || "(empty)"}`, { code: "unknown_command" });
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const command = argv[0];
  if (!command || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(helpText());
    process.stdout.write("\nShared digital-human workflow (server-executed):\n  avatar-library\n  avatar-upload <image-audio-or-video-file>\n  avatar-add-voice --input <json|@file>\n  avatar-add-workflow --input <json|@file>\n  avatar-submit --input <json|@file> [--client-task-id <id>]\n  avatar-status <job-id>\n  avatar-wait <job-id> [--interval <ms>] [--timeout <ms>]\n");
    return 0;
  }
  try {
    if (String(env.API_PLUS_AGENT_AUTOSTART) !== '0' || env.API_PLUS_WORKBENCH_ROOT || env.API_BATCH_DATA_DIR || env.API_BATCH_LAUNCHER_DATA_DIR) await ensureLocalService(env);
    const result = await runCommand(command, argv.slice(1), env);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const payload = {
      success: false,
      error: error?.details?.code || "client_error",
      message: String(error?.message || error),
      ...error?.details
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
