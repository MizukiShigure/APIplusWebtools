"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");
const dns = require("node:dns/promises");
const http = require("node:http");
const https = require("node:https");
const { Readable } = require("node:stream");
const { randomUUID } = require("node:crypto");
const cp = require("node:child_process");
const { normalizeRunningHubApiKey } = require("./runninghub-auth.cjs");

const MEDIA_PREFIX = "/api/control/v1/avatar-workflow/media/";
const MAX_MEDIA = 64 * 1024 * 1024;
const MAX_JSON = 2 * 1024 * 1024;
const REQUEST_TIMEOUT = 120000;
const RH_UPLOAD = "https://www.runninghub.cn/openapi/v2/media/upload/binary";
const RH_RUN = "https://www.runninghub.ai/openapi/v2/run/ai-app/";
const RH_QUERY = "https://www.runninghub.ai/openapi/v2/query";
const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg",
  ".flac": "audio/flac", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".srt": "application/x-subrip", ".vtt": "text/vtt" };
const DEMUXERS = { ".mp3": "mp3", ".wav": "wav", ".m4a": "mov", ".aac": "aac", ".ogg": "ogg", ".flac": "flac",
  ".mp4": "mov", ".mov": "mov", ".webm": "matroska" };
const PROBE_FORMATS = {
  audio: { ".mp3": "mp3", ".wav": "wav", ".m4a": "mov", ".aac": "aac", ".ogg": "ogg", ".flac": "flac" },
  image: { ".png": "png_pipe", ".jpg": "jpeg_pipe", ".jpeg": "jpeg_pipe", ".webp": "webp_pipe" }
};
const AUDIO_METADATA = ["duration", "durationSeconds", "duration_seconds", "frameLimit"];
const IMAGE_METADATA = ["width", "height", "ratioWidth", "ratioHeight", "aspectRatio", "size"];
const blocked = new net.BlockList();
for (const [address, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3]]) blocked.addSubnet(address, bits, "ipv4");
const globalV6 = new net.BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, bits] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16]]) blocked.addSubnet(address, bits, "ipv6");

function fail(message, code = "INVALID_MEDIA_INPUT") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value, label, max = 4096, required = true) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()) || /\0/.test(value)) {
    throw fail(`Invalid ${label}`);
  }
  return value.trim();
}

function number(value, fallback, min, max, label) {
  const result = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw fail(`Invalid ${label}`);
  return result;
}

function publicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  return family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

function publicUrl(value) {
  text(value, "media URL", 8192);
  let url;
  try { url = new URL(value); } catch { throw fail("Invalid HTTP media URL"); }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash ||
    (net.isIP(host) ? !publicAddress(host) : !host.includes(".") || /(?:^|\.)(localhost|local|internal|lan|home|localdomain)\.?$/.test(host))) {
    throw fail("Only public HTTP(S) URLs are allowed");
  }
  return url;
}

function gateway(apiBase, endpoint) {
  const url = publicUrl(apiBase);
  if (url.search) throw fail("API base cannot contain a query");
  return `${url.href.replace(/\/+$/, "")}${endpoint}`;
}

function localName(value) {
  if (typeof value !== "string") return null;
  let relative = value;
  if (/^https?:\/\//i.test(value)) {
    let url;
    try { url = new URL(value); } catch { throw fail("Invalid media URL"); }
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
    if (url.username || url.password || url.search || url.hash) throw fail("Invalid local media URL");
    // Inspect the original path, before URL dot-segment normalization.
    relative = value.replace(/^https?:\/\/[^/]+/i, "");
  }
  if (!relative.startsWith(MEDIA_PREFIX)) return null;
  const name = relative.slice(MEDIA_PREFIX.length);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.[a-z0-9]{2,5}$/.test(name) || !TYPES[path.extname(name)]) {
    throw fail("Invalid local media basename");
  }
  return name;
}

function validateResource(value) {
  if (!localName(value)) publicUrl(value);
}

async function privateMediaRoot(dataDir) {
  await fsp.mkdir(dataDir, { recursive: true, mode: 0o700 });
  let dir = await fsp.realpath(dataDir);
  for (const segment of ['avatar-workflow', 'media']) {
    dir = path.join(dir, segment);
    await fsp.mkdir(dir, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await fsp.lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(dir, await fsp.realpath(dir))) throw fail('Unsafe private media directory');
  }
  return dir;
}

async function readLocalMedia(dataDir, url) {
  const name = localName(url);
  if (!name) throw fail('Invalid local media path');
  const dir = await privateMediaRoot(dataDir);
  const file = path.join(dir, name);
  const stat = await fsp.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !stat.size || stat.size > MAX_MEDIA) throw fail('Invalid local media file or size');
  if (path.relative(file, await fsp.realpath(file))) throw fail('Unsafe local media path');
  const handle = await fsp.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size > MAX_MEDIA) throw fail('Unsafe local media file');
    const buffer = await handle.readFile();
    if (!buffer.length || buffer.length > MAX_MEDIA) throw fail('Invalid local media size');
    return { buffer, mimeType: TYPES[path.extname(name)], name };
  } finally { await handle.close(); }
}

async function saveLocalMedia(dataDir, name, buffer) {
  localName(MEDIA_PREFIX + name);
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_MEDIA) throw fail('Invalid local media size');
  const dir = await privateMediaRoot(dataDir);
  await fsp.writeFile(path.join(dir, name), buffer, { flag: 'wx', mode: 0o600 }).catch(error => {
    if (error.code !== 'EEXIST') throw error;
  });
  // A hash collision or pre-existing link must not bypass the read-side checks.
  const stored = await readLocalMedia(dataDir, MEDIA_PREFIX + name);
  if (!stored.buffer.equals(buffer)) throw fail('Conflicting local media content');
  return { url: MEDIA_PREFIX + name, mimeType: stored.mimeType };
}

async function boundedBody(response, limit) {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw fail("Provider response exceeds size limit", "MEDIA_TOO_LARGE");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw fail("Provider response exceeds size limit", "MEDIA_TOO_LARGE");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Native transport pins a validated DNS answer to the socket. An injected fetch is a
// trusted transport override (used by mock tests); literal private URLs still fail.
async function pinnedFetch(url, init) {
  const target = publicUrl(url);
  const hostname = target.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw fail("Private DNS destination rejected");
  init.signal.throwIfAborted();
  const headers = { ...init.headers };
  let body = init.body;
  if (body instanceof FormData) {
    const encoded = new Response(body);
    headers["Content-Type"] = encoded.headers.get("content-type");
    body = Buffer.from(await encoded.arrayBuffer());
  }
  if (body !== undefined) headers["Content-Length"] = Buffer.byteLength(body);
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    const request = (target.protocol === "https:" ? https : http).request(target, {
      method: init.method, headers, signal: init.signal, agent: false,
      lookup(_host, options, callback) {
        callback(null, options?.all ? [chosen] : chosen.address, chosen.family);
      }
    }, response => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      resolve(new Response([204, 205, 304].includes(response.statusCode) ? null : Readable.toWeb(response),
        { status: response.statusCode, headers: responseHeaders }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

function envelopeFailure(json) {
  for (const item of [json, json?.data]) {
    if (!item || typeof item !== "object") continue;
    if (item.success === false || item.ok === false || (item.code !== undefined && ![0, 200, "0", "200"].includes(item.code)) ||
      (item.errorCode && item.errorCode !== "0") || item.errorMessage || item.base_resp?.status_code) return true;
  }
  return false;
}

function statusOf(json) {
  return String(json?.status ?? json?.state ?? json?.taskStatus ?? json?.data?.status ?? json?.data?.state ?? json?.data?.taskStatus ?? json?.data?.task_status ?? json?.task_status ?? "").trim().toLowerCase();
}

function resultUrl(json, depth = 0) {
  if (depth > 8 || json == null) return "";
  if (typeof json === "string") return /^https?:\/\//i.test(json) ? json : "";
  if (Array.isArray(json)) {
    for (const item of json) { const url = resultUrl(item, depth + 1); if (url) return url; }
    return "";
  }
  for (const key of ["video_url", "audio_url", "download_url", "fileUrl", "url", "video_urls", "audio_urls", "urls",
    "data", "result", "results", "output", "outputs", "task_result", "videos", "audios"]) {
    const url = resultUrl(json[key], depth + 1);
    if (url) return url;
  }
  return "";
}

function taskIdOf(json) {
  const data = json?.data;
  const value = json?.task_id ?? json?.taskId ?? data?.task_id ?? data?.taskId ?? data?.id ?? json?.id ?? (typeof data === "string" ? data : "");
  return typeof value === "string" && !/^https?:\/\//i.test(value) ? text(value, "task ID", 256, false) : "";
}

function createResult(json, mimeType) {
  if (envelopeFailure(json) || /^(failed|failure|error|canceled|cancelled)$/.test(statusOf(json))) {
    throw fail("Provider reported failure", "PROVIDER_FAILED");
  }
  const url = resultUrl(json);
  const taskId = taskIdOf(json);
  if (url) publicUrl(url);
  if (!url && !taskId) throw fail("Provider response has no result URL or task ID", "INVALID_PROVIDER_RESPONSE");
  const result = { url, mimeType };
  if (taskId) result.taskId = taskId;
  const duration = [json?.duration, json?.data?.duration, json?.raw?.duration, json?.data?.raw?.duration]
    .find(value => Number.isFinite(value) && value >= 0);
  if (duration !== undefined) result.duration = duration;
  // Deliberately omit raw: providers may echo request credentials and input metadata.
  return result;
}

function queryResult(json) {
  const status = statusOf(json);
  if (envelopeFailure(json) || /^(failed|failure|error|canceled|cancelled)$/.test(status)) return { state: "failed", error: "Provider task failed" };
  if (/^(queued|pending|running|processing|submitted|created|waiting)$/.test(status)) return { state: "running" };
  const url = resultUrl(json);
  if (url) { publicUrl(url); return { state: "done", url }; }
  if (/^(success|succeeded|done|completed|complete)$/.test(status)) return { state: "failed", error: "Provider completed without a media URL" };
  return { state: "running" };
}

function parseConfig(value, fallback) {
  let result = value ?? fallback;
  if (typeof result === "string") {
    if (result.length > 256000) throw fail("Workflow configuration exceeds size limit");
    try { result = JSON.parse(result || JSON.stringify(fallback)); } catch { throw fail("Invalid workflow JSON"); }
  }
  let size;
  try { size = JSON.stringify(result).length; } catch { throw fail("Invalid workflow configuration"); }
  if (size > 256000) throw fail("Workflow configuration exceeds size limit");
  return result;
}

function runningHub(workflow = {}) {
  return workflow.provider === "runninghub" || workflow.type === "runninghub" || Boolean(workflow.appId || workflow.webappId || workflow.nodeInfoList);
}

function rhKey(workflow) {
  const key = normalizeRunningHubApiKey(workflow?.apiKey);
  if (!key || key.length > 4096) throw fail("Missing or invalid RunningHub API key");
  return key;
}

function gcd(a, b) { return b ? gcd(b, a % b) : a || 1; }

function rhContext(options, workflow, prompt, image, audio) {
  const duration = number(options.duration ?? options.durationSeconds, 0, 0, 3600, "duration");
  const fps = number(options.fps ?? workflow.fps, 30, 1, 120, "fps");
  const width = Math.round(number(options.width, 0, 0, 16384, "width"));
  const height = Math.round(number(options.height, 0, 0, 16384, "height"));
  const size = text(options.size || options.aspectRatio || "", "size", 32, false);
  const ratio = width && height ? [width / gcd(width, height), height / gcd(width, height)] : /^(\d+):([1-9]\d*)$/.exec(size)?.slice(1) || [];
  return { prompt, referenceImage: image, referenceAudio: audio, durationSeconds: duration ? String(duration) : "",
    frameLimit: duration ? String(Math.ceil(duration * fps)) : "", fps: String(fps), width: width ? String(width) : "", height: height ? String(height) : "",
    ratioWidth: String(ratio[0] || ""), ratioHeight: String(ratio[1] || ""), aspectRatio: ratio.join(":"), size: size || ratio.join(":"),
    image_url: image, image_file: image, audio_url: audio, audio_file: audio, original_image_url: image, original_audio_url: audio,
    duration: duration ? String(duration) : "", duration_seconds: duration ? String(duration) : "", workflow_id: workflow.appId || workflow.webappId || workflow.workflowId || "" };
}

function template(value, context, depth = 0) {
  if (depth > 16) throw fail("RunningHub template nesting exceeds limit");
  if (Array.isArray(value)) return value.map(item => template(item, context, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (/^(?:__proto__|constructor|prototype|api_?key|authorization|access_?token|password|secret)$/i.test(key)) throw fail("Unsupported credential or reserved workflow field");
      return [key, template(item, context, depth + 1)];
    }));
  }
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
    if (!Object.hasOwn(context, key) || (context[key] === "" && key !== "prompt")) throw fail("Unresolved RunningHub template value; provide required metadata in options");
    return context[key];
  });
}

function boundNodes(nodes, context) {
  return nodes.map(node => {
    let fieldValue;
    if (node.binding && node.binding !== "none") {
      if (!Object.hasOwn(context, node.binding)) throw fail("Unsupported RunningHub binding");
      fieldValue = context[node.binding];
      if (fieldValue === "" && node.binding !== "prompt") throw fail(`Missing RunningHub metadata for ${node.binding}; provide options.duration, width, height or size`);
    } else fieldValue = template(node.fieldValue, context);
    return { nodeId: node.nodeId, fieldName: node.fieldName, fieldValue };
  });
}

function requiredMetadata(nodes, extra, webhook) {
  const required = new Set();
  function visit(value, depth = 0) {
    if (depth > 16) throw fail("RunningHub template nesting exceeds limit");
    if (typeof value === "string") {
      for (const match of value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) required.add(match[1]);
    } else if (value && typeof value === "object") {
      for (const item of Object.values(value)) visit(item, depth + 1);
    }
  }
  for (const node of nodes) {
    if (node.binding && node.binding !== "none") required.add(node.binding);
    else visit(node.fieldValue);
  }
  visit(extra);
  visit(webhook);
  return required;
}

function parseProbe(output, kind, json) {
  let duration, width, height;
  if (json) {
    let data;
    try { data = JSON.parse(output); } catch { throw fail("Invalid media probe output", "MEDIA_METADATA_UNAVAILABLE"); }
    const stream = data.streams?.find(item => item.codec_type === (kind === "audio" ? "audio" : "video"));
    duration = Number(data.format?.duration ?? stream?.duration);
    width = Number(stream?.width);
    height = Number(stream?.height);
  } else if (kind === "audio") {
    const match = /Duration:\s*(\d{1,3}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(output);
    if (match && Number(match[2]) < 60 && Number(match[3]) < 60) duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  } else {
    const stream = output.split(/\r?\n/).find(line => /Stream #.*Video:/.test(line)) || "";
    const match = /(?:^|[,\s])(\d{1,5})x(\d{1,5})(?=[,\s]|$)/.exec(stream);
    if (match) { width = Number(match[1]); height = Number(match[2]); }
  }
  if (kind === "audio" && Number.isFinite(duration) && duration > 0 && duration <= 3600) return { duration };
  if (kind === "image" && [width, height].every(value => Number.isInteger(value) && value > 0 && value <= 16384)) return { width, height };
  throw fail("Required media metadata is unavailable or outside supported bounds", "MEDIA_METADATA_UNAVAILABLE");
}

function nodesFor(workflow) {
  const nodes = parseConfig(workflow.nodeInfoList, []);
  if (!Array.isArray(nodes) || !nodes.length || nodes.length > 256) throw fail("RunningHub nodeInfoList must be a nonempty array (max 256)");
  return nodes.map(item => {
    const nodeId = text(String(item.nodeId ?? item.node_id ?? ""), "nodeId", 128);
    const fieldName = text(item.fieldName ?? item.field_name, "fieldName", 128);
    if (!/^[\w.-]+$/.test(nodeId)) throw fail("Invalid RunningHub node ID");
    const fieldValue = item.fieldValue ?? item.field_value ?? "";
    if (!["string", "number", "boolean"].includes(typeof fieldValue)) throw fail("Invalid node value");
    return { nodeId, fieldName, fieldValue, binding: item.binding || item.dynamicBinding || "" };
  });
}

function executable(envValue, candidates, fallback) {
  return envValue || candidates.find(item => fs.existsSync(item)) || fallback;
}

function runProcess(command, args, env, timeout = 300000, input, cwd) {
  return new Promise((resolve, reject) => {
    const child = cp.execFile(command, args, { windowsHide: true, shell: false, timeout, killSignal: "SIGKILL", maxBuffer: MAX_JSON,
      encoding: "utf8", env, cwd }, (error, stdout) => {
      if (error) reject(fail(error.killed ? "Media process timeout" : "Media process failed; check optional dependency and cached model", "MEDIA_PROCESS_FAILED"));
      else resolve(stdout);
    });
    child.stdin?.on?.("error", () => {});
    child.stdin?.end(input);
  });
}

/** dataDir is the shared API_BATCH_DATA_DIR, not the avatar-workflow subdirectory.
 * Methods are async; creation is never retried or polled. The parent persists IDs.
 * speech/avatarCreate: {url: string, mimeType: string, taskId?: string, duration?: number}.
 * speechQuery/avatarQuery: {state: 'running'|'done'|'failed', url?: string, error?: string}.
 * Raw provider data is intentionally not returned. Transport failures reject.
 * HTTP failures carry numeric status; network/timeouts have no fabricated status.
 * RH fills missing required duration/dimensions using local audio/image probes;
 * supplied options avoid probing. avatarCreate accepts the same saved tools.
 * probeMedia({url,kind:'audio'|'image',tools}) returns {duration} or {width,height}.
 * Probes prefer a sibling ffprobe, fall back to FFmpeg, and never inspect videos.
 * dependencies(settings) and processing tools accept saved server-side paths:
 * python, ffmpeg, subtitleService. Other record metadata is ignored. Executables
 * are trusted operator settings, never job-supplied options or command lines.
 * Precedence: nonempty saved setting, environment, root-relative discovery, PATH.
 * adjustAudio options: enabled, speed (0.5-2), volume (0-10), trimStart, duration.
 * subtitle options: enabled, mode, model, language, refine, ignoreLines.
 * Local outputs are basenames under dataDir/avatar-workflow/media. The parent owns
 * authenticated serving and retention. env is trusted operator configuration.
 */
function createAvatarWorkflowMedia({ dataDir, fetch = global.fetch, env = process.env } = {}) {
  if (typeof dataDir !== "string" || !path.isAbsolute(dataDir)) throw fail("An absolute dataDir is required");
  const root = path.resolve(dataDir, "avatar-workflow", "media");
  const transport = fetch === global.fetch ? pinnedFetch : fetch;
  const roots = [path.resolve(__dirname, ".."), path.resolve(__dirname, "../..")];
  const python = executable(env.PYTHON, roots.flatMap(base => [path.join(base, ".venv-subtitle", "Scripts", "python.exe"),
    path.join(base, ".venv-subtitle", "bin", "python")]), "python");
  const service = executable(env.SUBTITLE_SERVICE, roots.map(base => path.join(base, "subtitle-web", "backend", "subtitle_service.py")), "");
  const ffmpegCandidates = roots.flatMap(base => {
    const dir = path.join(base, ".venv-subtitle", "Lib", "site-packages", "imageio_ffmpeg", "binaries");
    const binaries = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => /^ffmpeg.*\.exe$/i.test(name)).map(name => path.join(dir, name)) : [];
    return [path.join(base, "ffmpeg", "bin", "ffmpeg.exe"), path.join(base, "ffmpeg", "bin", "ffmpeg"), ...binaries];
  });
  const ffmpeg = executable(env.FFMPEG, ffmpegCandidates, "ffmpeg");
  function toolsFor(settings = {}) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw fail("Invalid dependency settings");
    const result = { python, ffmpeg, subtitleService: service };
    for (const key of Object.keys(result)) {
      if (settings[key] === undefined || settings[key] === "") continue;
      const value = text(settings[key], `dependency ${key}`, 4096);
      if (/[\r\n"<>|\x00-\x1f]/.test(value) || (!path.isAbsolute(value) && !/^[\w.-]+$/.test(value))) throw fail("Invalid dependency executable or path");
      result[key] = value;
    }
    result.env = { ...env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1", HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1",
      PATH: `${path.isAbsolute(result.ffmpeg) ? path.dirname(result.ffmpeg) + path.delimiter : ""}${env.PATH || env.Path || ""}` };
    return result;
  }

  async function request(url, init, limit = MAX_JSON, mediaKind) {
    publicUrl(url);
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(fail("Provider request timeout", "MEDIA_TIMEOUT")); }, REQUEST_TIMEOUT);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await transport(url, { ...init, redirect: "manual", signal: controller.signal });
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel();
          throw Object.assign(fail("Provider redirect rejected", "MEDIA_REDIRECT"), { status: response.status });
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw Object.assign(fail(`Provider HTTP ${response.status}`, "PROVIDER_HTTP_ERROR"), { status: response.status });
        }
        const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "application/octet-stream";
        if (mediaKind && mimeType !== "application/octet-stream" && !mimeType.startsWith(`${mediaKind}/`)) {
          await response.body?.cancel();
          throw fail("Unexpected media type for probe");
        }
        const buffer = await boundedBody(response, limit);
        return { buffer, mimeType };
      })()]);
    } catch (error) {
      if (["MEDIA_TIMEOUT", "MEDIA_REDIRECT", "MEDIA_TOO_LARGE", "PROVIDER_HTTP_ERROR", "INVALID_MEDIA_INPUT"].includes(error.code)) throw error;
      throw fail("Provider request failed", "PROVIDER_NETWORK_ERROR");
    } finally { clearTimeout(timer); controller.abort(); }
  }

  async function post(url, body, key) {
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized) > MAX_JSON) throw fail("Request exceeds size limit");
    const { buffer } = await request(url, { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: serialized });
    try { return JSON.parse(buffer.toString("utf8")); } catch { throw fail("Invalid provider JSON", "INVALID_PROVIDER_RESPONSE"); }
  }

  async function privateRoot() {
    return privateMediaRoot(dataDir);
  }

  async function resource(url, kind) {
    const name = localName(url);
    if (name) {
      const result = await readLocalMedia(dataDir, url);
      if (kind && !result.mimeType.startsWith(`${kind}/`)) throw fail('Unexpected local media type for probe');
      return result;
    }
    const target = publicUrl(url);
    const result = await request(target.href, { method: "GET" }, MAX_MEDIA, kind);
    return { ...result, name: path.basename(target.pathname) || "media.bin" };
  }

  async function multipart(url, buffer, name, mimeType, key) {
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_MEDIA) throw fail("Invalid media buffer or size limit exceeded");
    if (!/^(?:image|audio|video)\/[a-z0-9.+-]+$/.test(mimeType) && mimeType !== "application/octet-stream") throw fail("Unsupported media MIME type");
    const filename = path.posix.basename(String(name || "media.bin").replace(/\\/g, "/")).replace(/[^A-Za-z0-9._-]/g, "_").slice(-128) || "media.bin";
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType }), filename);
    const response = await request(url, { method: "POST", body: form, headers: key ? { Authorization: `Bearer ${key}` } : {} });
    let json;
    try { json = JSON.parse(response.buffer.toString("utf8")); } catch { throw fail("Invalid upload response"); }
    if (envelopeFailure(json)) throw fail("Provider upload failed", "PROVIDER_FAILED");
    return json;
  }

  async function upload({ apiBase, buffer, name, mimeType = "application/octet-stream" }) {
    const json = await multipart(gateway(apiBase, "/fileupload"), buffer, name, mimeType);
    const result = createResult(json, mimeType);
    if (!result.url) throw fail("Upload returned no URL");
    return result;
  }

  async function remoteResource(apiBase, url) {
    validateResource(url);
    return localName(url) ? (await upload({ apiBase, ...await resource(url) })).url : url;
  }

  async function rhUpload(url, key, prepared) {
    const input = prepared || await resource(url);
    const json = await multipart(RH_UPLOAD, input.buffer, input.name, input.mimeType, key);
    const data = json.data || json;
    const value = data.fileName || data.filename || data.file_name || data.download_url || data.url;
    const reference = text(value, "RunningHub file reference", 8192);
    if (/^https?:\/\//i.test(reference)) publicUrl(reference);
    else if (/[:\\\r\n]/.test(reference) || reference.startsWith("/") || reference.split("/").includes("..")) throw fail("Invalid RunningHub file reference");
    return reference;
  }

  async function speech({ apiBase, text: input, voice, options = {} }) {
    const script = text(input, "speech text", 100000);
    const voiceId = text(typeof voice === "string" ? voice : voice?.voiceId || voice?.voice_id, "voice ID", 256);
    const speed = number(options.speed, 1, 0.5, 2, "speech speed");
    const language = text(options.language || "auto", "language", 64);
    const languages = { zh: "Chinese", en: "English", ja: "Japanese", ko: "Korean", tr: "Turkish", es: "Spanish", pt: "Portuguese", ar: "Arabic", hi: "Hindi", it: "Italian", id: "Indonesian", fr: "French", de: "German" };
    const model = text(options.model || "speech-2.8-hd", "speech model", 64);
    const voiceModify = { pitch: number(options.voiceModifyPitch, 0, -100, 100, "voice modify pitch"),
      intensity: number(options.voiceModifyIntensity, 0, -100, 100, "voice modify intensity"), timbre: number(options.voiceModifyTimbre, 0, -100, 100, "voice modify timbre") };
    if (options.soundEffects) voiceModify.sound_effects = text(options.soundEffects, "sound effects", 128);
    return createResult(await post(gateway(apiBase, "/minimax_t2a"), { text: script, prompt: script, voice_id: voiceId,
      language, model, model_name: model, stream: false, output_format: "url", subtitle_enable: false, speed, speed_ratio: speed,
      language_boost: languages[language.toLowerCase()] || language, voice_setting: { voice_id: voiceId, speed,
        vol: number(options.volume, 1, 0, 10, "volume"), pitch: number(options.pitch, 0, -12, 12, "pitch") },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 }, voice_modify: voiceModify }), "audio/mpeg");
  }

  async function speechQuery({ apiBase, taskId }) {
    const id = text(taskId, "task ID", 256);
    return queryResult(await post(gateway(apiBase, "/minimax_speech_query"), { task_id: id, taskId: id, id }));
  }

  async function avatarCreate({ apiBase, imageUrl, audioUrl, prompt = "", workflow = {}, options = {}, tools }) {
    const description = text(prompt, "prompt", 20000, false);
    validateResource(imageUrl);
    validateResource(audioUrl);
    if (runningHub(workflow)) {
      const key = rhKey(workflow);
      const appId = text(workflow.appId || workflow.webappId || workflow.workflowId, "RunningHub app ID", 128);
      const nodes = nodesFor(workflow);
      const extra = parseConfig(workflow.extraJson, {});
      if (!extra || Array.isArray(extra) || typeof extra !== "object") throw fail("Invalid RunningHub extra JSON");
      const runtimeOptions = { ...options };
      let context = rhContext(runtimeOptions, workflow, description, "uploaded-image", "uploaded-audio");
      const buildBody = (values = context) => {
        // Preserve the standalone schema's precedence: extraJson overrides the
        // defaults, explicit retention/webhook and node mappings are applied last.
        const body = { instanceType: workflow.instanceType || "default", usePersonalQueue: Boolean(workflow.usePersonalQueue),
          ...template(extra, values), nodeInfoList: boundNodes(nodes, values) };
        body.instanceType = text(body.instanceType, "instance type", 64);
        if (typeof body.usePersonalQueue !== "boolean") throw fail("Invalid personal queue setting");
        if (workflow.retainSeconds) body.retainSeconds = workflow.retainSeconds;
        if (body.retainSeconds !== undefined) body.retainSeconds = number(body.retainSeconds, 0, 0, 604800, "retention");
        if (workflow.webhookUrl) body.webhookUrl = template(workflow.webhookUrl, values);
        if (body.webhookUrl) body.webhookUrl = publicUrl(body.webhookUrl).href;
        return body;
      };
      const required = requiredMetadata(nodes, extra, workflow.webhookUrl);
      const needsAudio = AUDIO_METADATA.some(key => required.has(key) && context[key] === "");
      const needsImage = IMAGE_METADATA.some(key => required.has(key) && context[key] === "");
      // Validate static configuration before downloading. Only known missing media
      // metadata gets a temporary placeholder; final values always come from a probe.
      const preflight = { ...context };
      for (const key of [...AUDIO_METADATA, ...IMAGE_METADATA]) if (preflight[key] === "") preflight[key] = "1";
      buildBody(preflight);
      const prepared = {};
      if (needsAudio) {
        const result = await inspectMedia({ url: audioUrl, kind: "audio", tools });
        prepared.audio = result.media;
        runtimeOptions.duration = result.metadata.duration;
      }
      if (needsImage) {
        const result = await inspectMedia({ url: imageUrl, kind: "image", tools });
        prepared.image = result.media;
        if (!Number(runtimeOptions.width)) runtimeOptions.width = result.metadata.width;
        if (!Number(runtimeOptions.height)) runtimeOptions.height = result.metadata.height;
      }
      context = rhContext(runtimeOptions, workflow, description, "uploaded-image", "uploaded-audio");
      buildBody();
      const image = await rhUpload(imageUrl, key, prepared.image);
      const audio = await rhUpload(audioUrl, key, prepared.audio);
      context = rhContext(runtimeOptions, workflow, description, image, audio);
      return createResult(await post(`${RH_RUN}${encodeURIComponent(appId)}`, buildBody(), key), "video/mp4");
    }
    const endpoint = gateway(apiBase, "/kling_avatar");
    const image = await remoteResource(apiBase, imageUrl);
    const audio = await remoteResource(apiBase, audioUrl);
    return createResult(await post(endpoint, { prompt: description, model_name: "kling-avatar", image, image_url: image, image_path: image,
      reference_image: image, reference_image_url: image, audio, audio_url: audio, audio_path: audio, voice_url: audio,
      resolution: "1080p", quality: "1080p", mode: "pro", watermark: false, remove_watermark: true, without_watermark: true }), "video/mp4");
  }

  async function avatarQuery({ apiBase, taskId, workflow = {} }) {
    const id = text(taskId, "task ID", 256);
    return queryResult(runningHub(workflow) ? await post(RH_QUERY, { taskId: id }, rhKey(workflow))
      : await post(gateway(apiBase, "/kling_avatar_query"), { task_id: id, taskId: id, id }));
  }

  async function available(command, flag, processEnv) {
    try { await runProcess(command, [flag], processEnv, 5000); return true; } catch { return false; }
  }

  async function inspectMedia({ url, kind, tools }) {
    if (!Object.hasOwn(PROBE_FORMATS, kind)) throw fail("Only audio and image metadata probing is supported");
    validateResource(url);
    const name = localName(url) || new URL(url).pathname;
    const suffix = path.extname(name).toLowerCase();
    if (TYPES[suffix] && !Object.hasOwn(PROBE_FORMATS[kind], suffix)) throw fail("Unexpected media container for probe");
    const selected = toolsFor(tools);
    const sibling = path.isAbsolute(selected.ffmpeg)
      ? path.join(path.dirname(selected.ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe") : "";
    const useFfprobe = Boolean(sibling && fs.existsSync(sibling) && await available(sibling, "-version", selected.env));
    const command = useFfprobe ? sibling : selected.ffmpeg;
    if (!useFfprobe && !await available(command, "-version", selected.env)) throw fail("FFmpeg metadata dependency is unavailable", "DEPENDENCY_UNAVAILABLE");
    const media = await resource(url, kind);
    const formats = PROBE_FORMATS[kind];
    const ext = formats[suffix] ? suffix : Object.keys(formats).find(key => TYPES[key] === media.mimeType);
    if (!ext) throw fail("Unsupported metadata probe container");
    const dir = await privateRoot();
    const input = path.join(dir, `probe-${randomUUID()}${ext}`);
    try {
      await fsp.writeFile(input, media.buffer, { flag: "wx", mode: 0o600 });
      const format = formats[ext];
      const args = ["-hide_banner", "-loglevel", useFfprobe ? "error" : "info", "-probesize", "1048576", "-analyzeduration", "5000000",
        "-protocol_whitelist", "file,pipe", "-f", format, ...(format === "mov" ? ["-enable_drefs", "0"] : []), "-i", input];
      if (useFfprobe) args.push("-select_streams", kind === "audio" ? "a:0" : "v:0", "-show_entries", "format=duration:stream=codec_type,duration,width,height", "-of", "json");
      else args.unshift("-nostdin");
      const output = await new Promise((resolve, reject) => {
        const child = cp.execFile(command, args, { windowsHide: true, shell: false, timeout: 30000, killSignal: "SIGKILL", maxBuffer: 65536,
          encoding: "utf8", env: selected.env, cwd: dir }, (error, stdout, stderr) => {
          // FFmpeg's metadata-only invocation exits 1 because no output was requested.
          if (error && (useFfprobe || error.code !== 1 || error.killed)) return reject(fail("Media metadata probe failed or timed out", "MEDIA_METADATA_UNAVAILABLE"));
          resolve(useFfprobe ? stdout : stderr);
        });
        child.stdin?.on?.("error", () => {});
        child.stdin?.end();
      });
      return { media, metadata: parseProbe(output, kind, useFfprobe) };
    } finally { await fsp.rm(input, { force: true }); }
  }

  async function probeMedia(input) {
    return (await inspectMedia(input)).metadata;
  }

  async function dependencies(settings) {
    const selected = toolsFor(settings);
    const pythonAvailable = await available(selected.python, "--version", selected.env);
    const ffmpegAvailable = await available(selected.ffmpeg, "-version", selected.env);
    const serviceAvailable = Boolean(selected.subtitleService && fs.existsSync(selected.subtitleService) && fs.statSync(selected.subtitleService).isFile());
    return { python: { available: pythonAvailable, command: selected.python }, ffmpeg: { available: ffmpegAvailable, command: selected.ffmpeg },
      subtitleService: { available: serviceAvailable, path: selected.subtitleService }, subtitle: { available: pythonAvailable && ffmpegAvailable && serviceAvailable },
      adjustAudio: { available: ffmpegAvailable } };
  }

  async function stage(url) {
    const dir = await privateRoot();
    const media = await resource(url);
    const suffix = path.extname(media.name).toLowerCase();
    const ext = Object.hasOwn(DEMUXERS, suffix) ? suffix : Object.keys(DEMUXERS).find(key => TYPES[key] === media.mimeType);
    if (!ext) throw fail("Unsupported audio/video container; provide a known extension or MIME type");
    const input = path.join(dir, `input-${randomUUID()}${ext}`);
    await fsp.writeFile(input, media.buffer, { flag: "wx", mode: 0o600 });
    return input;
  }

  function allowedOptions(options, keys) {
    if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => !keys.includes(key))) throw fail("Unsupported processing option");
  }

  function ffmpegInput(input) {
    const format = DEMUXERS[path.extname(input)];
    if (!format) throw fail("Unsupported media container");
    return ["-protocol_whitelist", "file,pipe", "-f", format, ...(format === "mov" ? ["-enable_drefs", "0"] : []), "-i", input];
  }

  async function adjustAudio({ audioUrl, options = {}, tools }) {
    const selected = toolsFor(tools);
    allowedOptions(options, ["enabled", "speed", "volume", "trimStart", "duration"]);
    const speed = number(options.speed, 1, 0.5, 2, "audio speed");
    const volume = number(options.volume, 1, 0, 10, "audio volume");
    const start = number(options.trimStart, 0, 0, 3600, "trim start");
    const duration = number(options.duration, 3600, 0.05, 3600, "audio duration");
    validateResource(audioUrl);
    if (!await available(selected.ffmpeg, "-version", selected.env)) throw fail("FFmpeg dependency is unavailable", "DEPENDENCY_UNAVAILABLE");
    const input = await stage(audioUrl);
    const output = path.join(root, `audio-${randomUUID()}.mp3`);
    try {
      await runProcess(selected.ffmpeg, ["-nostdin", "-y", "-hide_banner", "-loglevel", "error",
        "-ss", String(start), ...ffmpegInput(input), "-t", String(duration), "-vn", "-af", `atempo=${speed},volume=${volume}`,
        "-c:a", "libmp3lame", "-ar", "32000", "-ac", "1", "-fs", String(MAX_MEDIA), output], selected.env, 300000);
      const stat = await fsp.stat(output);
      if (!stat.size || stat.size > MAX_MEDIA) throw fail("Invalid processed audio size");
      await fsp.chmod(output, 0o600);
      return { url: MEDIA_PREFIX + path.basename(output), mimeType: "audio/mpeg" };
    } catch (error) {
      await fsp.rm(output, { force: true });
      throw error;
    } finally { await fsp.rm(input, { force: true }); }
  }

  async function subtitle({ mediaUrl, transcript = "", options = {}, tools }) {
    const selected = toolsFor(tools);
    allowedOptions(options, ["enabled", "mode", "model", "language", "refine", "ignoreLines"]);
    const scriptText = text(transcript, "transcript", 100000, false);
    const mode = options.mode || "sentence";
    const model = options.model || "base";
    const language = text(options.language || "auto", "subtitle language", 32);
    if (!["word", "sentence"].includes(mode) || !["tiny", "base", "small", "medium"].includes(model)) throw fail("Invalid subtitle mode or model");
    validateResource(mediaUrl);
    const deps = await dependencies(tools);
    if (!deps.subtitle.available) throw fail("Subtitle dependency is unavailable", "DEPENDENCY_UNAVAILABLE");
    const input = await stage(mediaUrl);
    const output = path.join(root, `subtitle-${randomUUID()}.srt`);
    const normalized = path.join(root, `input-${randomUUID()}.wav`);
    // Disable model downloading, including retries on a corrupt cache. The existing
    // service retains its model/cache contract; operators provision models separately.
    const script = `import json, sys, pathlib, urllib.request, importlib.util, socket
payload = json.loads(sys.stdin.read())
sys.path.insert(0, str(pathlib.Path(payload["service"]).parent))
spec = importlib.util.spec_from_file_location("subtitle_service", payload["service"])
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)
import whisper
def offline(*args, **kwargs):
    raise RuntimeError("Model is not cached; automatic downloads are disabled")
urllib.request.urlopen = offline
whisper._download = offline
socket.socket.connect = offline
socket.socket.connect_ex = offline
socket.create_connection = offline
engine = service.transcribe_or_align.__globals__
if "ensure_ffmpeg_path" in engine:
    engine["ensure_ffmpeg_path"] = lambda: None
cache = pathlib.Path(payload.get("cache") or service.DEFAULT_MODEL_CACHE)
model_file = cache / (payload["model"] + ".pt")
if not model_file.is_file():
    offline()
stdout = sys.stdout
sys.stdout = sys.stderr
result = service.generate_srt_from_media(media_path=payload["media_path"], transcript=payload["transcript"] or None,
    mode=payload["mode"], model=str(model_file), language=payload["language"], refine=payload["refine"],
    ignore_transcript_lines=payload["ignore_lines"], model_cache=str(cache), output_filename=payload["filename"])
sys.stdout = stdout
print("__SUBTITLE_JSON__" + json.dumps(result, ensure_ascii=False))`;
    try {
      await runProcess(selected.ffmpeg, ["-nostdin", "-y", "-hide_banner", "-loglevel", "error", ...ffmpegInput(input),
        "-vn", "-t", "3600", "-c:a", "pcm_s16le", "-ar", "16000", "-ac", "1", "-fs", String(MAX_MEDIA), normalized], selected.env);
      const stdout = await runProcess(selected.python, ["-c", script], selected.env, 600000, JSON.stringify({ service: path.resolve(selected.subtitleService),
        cache: env.SUBTITLE_MODEL_CACHE || "", media_path: normalized, transcript: scriptText, mode, model, language,
        refine: Boolean(options.refine), ignore_lines: Boolean(options.ignoreLines), filename: path.basename(output) }), root);
      const marker = "__SUBTITLE_JSON__";
      const index = stdout.lastIndexOf(marker);
      let result;
      try { result = JSON.parse(index >= 0 ? stdout.slice(index + marker.length) : ""); } catch { throw fail("Invalid subtitle service response"); }
      if (typeof result.srt !== "string" || !result.srt.trim() || Buffer.byteLength(result.srt) > MAX_JSON) throw fail("Invalid subtitle content");
      await fsp.writeFile(output, result.srt, { flag: "wx", mode: 0o600 });
      return { url: MEDIA_PREFIX + path.basename(output), mimeType: "application/x-subrip" };
    } catch (error) {
      await fsp.rm(output, { force: true });
      throw error;
    } finally {
      await fsp.rm(input, { force: true });
      await fsp.rm(normalized, { force: true });
    }
  }

  return { dependencies, upload, speech, speechQuery, avatarCreate, avatarQuery, subtitle, adjustAudio, probeMedia };
}

module.exports = { createAvatarWorkflowMedia, localMediaName: localName, validateMediaResource: validateResource,
  readLocalMedia, saveLocalMedia, MEDIA_TYPES: TYPES, MAX_MEDIA };
