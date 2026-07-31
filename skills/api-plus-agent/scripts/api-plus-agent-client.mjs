#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
  return `API Plus Agent client\n\nUsage:\n  api-plus-agent-client.mjs capabilities\n  api-plus-agent-client.mjs upload <file> [--media-type image|video|audio|other]\n  api-plus-agent-client.mjs submit --task-type <type> --input <json|@file|-> [--client-task-id <id>]\n  api-plus-agent-client.mjs status <task-id>\n  api-plus-agent-client.mjs wait <task-id> [--interval <ms>] [--timeout <ms>]\n  api-plus-agent-client.mjs cancel <task-id>\n\nEnvironment:\n  API_PLUS_AGENT_TOKEN          Required bearer token\n  API_PLUS_AGENT_BASE_URL       Default: ${DEFAULT_BASE_URL}\n  API_PLUS_AGENT_SOURCE_CLIENT  Agent family, for example codex or minimax-code\n  API_PLUS_AGENT_SOURCE_ID      Stable caller identifier\n  API_PLUS_AGENT_SOURCE_LABEL   Human-readable source shown in history\n`;
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

async function requestJson(endpoint, { env = process.env, method = "GET", body, form } = {}) {
  const token = cleanText(env.API_PLUS_AGENT_TOKEN);
  if (!token) throw new ClientError("API_PLUS_AGENT_TOKEN is required", { code: "token_required" });
  const baseUrl = normalizeBaseUrl(env.API_PLUS_AGENT_BASE_URL);
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
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
      response: payload
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
    return 0;
  }
  try {
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
