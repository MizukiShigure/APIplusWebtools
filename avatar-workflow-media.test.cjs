"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const cp = require("node:child_process");
const { EventEmitter } = require("node:events");

const modulePath = path.join(__dirname, "avatar-workflow-media.cjs");
const base = "https://gateway.example/api";
const imageUrl = "https://cdn.example/portrait.png";
const audioUrl = "https://cdn.example/voice.mp3";
const videoUrl = "https://cdn.example/result.mp4";
const prefix = "/api/control/v1/avatar-workflow/media/";
const key = "example-rh-key";

async function setup(t, responses = [], env = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-media-test-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), ...init });
    assert.ok(responses.length, "Unexpected provider request");
    const next = responses.shift();
    if (typeof next === "function") return next(url, init);
    if (next instanceof Response) return next;
    return Response.json(next);
  };
  const { createAvatarWorkflowMedia } = require(modulePath);
  return { media: createAvatarWorkflowMedia({ dataDir, fetch: fakeFetch, env }), calls, dataDir };
}

const jsonBody = call => JSON.parse(call.body);
const rhWorkflow = (nodes = [{ nodeId: "1", fieldName: "image", fieldValue: "{{image_url}}" },
  { nodeId: "2", fieldName: "audio", fieldValue: "{{audio_file}}" }]) => ({
  provider: "runninghub", appId: "12345", apiKey: key, nodeInfoList: JSON.stringify(nodes)
});
const rhResponses = () => [new Response("image", { headers: { "content-type": "image/png" } }),
  { code: 0, data: { fileName: "rh/portrait.png" } },
  new Response("audio", { headers: { "content-type": "audio/mpeg" } }),
  { code: 0, data: { fileName: "rh/voice.mp3" } }, { taskId: "rh-task", status: "QUEUED" }];

test("exports the T2 factory and methods", async t => {
  assert.ok(require("node:fs").existsSync(modulePath), "T2 media module must exist");
  const { media } = await setup(t);
  for (const name of ["dependencies", "upload", "speech", "speechQuery", "avatarCreate", "avatarQuery", "subtitle", "adjustAudio"]) {
    assert.equal(typeof media[name], "function", name);
  }
});

test("company upload uses fileupload multipart and safe filename", async t => {
  const { media, calls } = await setup(t, [{ success: true, data: { url: imageUrl } }]);
  assert.deepEqual(await media.upload({ apiBase: base, buffer: Buffer.from("png"), name: "../portrait.png", mimeType: "image/png" }),
    { url: imageUrl, mimeType: "image/png" });
  assert.equal(calls[0].url, `${base}/fileupload`);
  assert.equal(calls[0].body.get("file").name, "portrait.png");
  assert.equal(calls[0].headers?.Authorization, undefined);
  assert.equal(calls[0].redirect, "manual");
  assert.ok(calls[0].signal instanceof AbortSignal);
});

test("speech preserves the company MiniMax payload and synchronous URL", async t => {
  const { media, calls } = await setup(t, [{ success: true, data: { audio_url: audioUrl, duration: 3.5 } }]);
  assert.deepEqual(await media.speech({ apiBase: base, text: "Hello", voice: { voiceId: "voice-1" },
    options: { language: "zh", speed: 1.2, volume: 0.8, pitch: 2, voiceModifyTimbre: 3 } }),
  { url: audioUrl, mimeType: "audio/mpeg", duration: 3.5 });
  assert.equal(calls[0].url, `${base}/minimax_t2a`);
  const body = jsonBody(calls[0]);
  assert.deepEqual(body, {
    text: "Hello", prompt: "Hello", voice_id: "voice-1", language: "zh", model: "speech-2.8-hd", model_name: "speech-2.8-hd",
    stream: false, output_format: "url", subtitle_enable: false, speed: 1.2, speed_ratio: 1.2, language_boost: "Chinese",
    voice_setting: { voice_id: "voice-1", speed: 1.2, vol: 0.8, pitch: 2 },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
    voice_modify: { pitch: 0, intensity: 0, timbre: 3 }
  });
});

test("speech returns async IDs without polling and query resumes independently", async t => {
  const { media, calls } = await setup(t, [{ data: { task_id: "speech-1" } }, { success: true, data: null },
    { data: { audio_urls: [audioUrl], status: "SUCCESS" } }]);
  assert.deepEqual(await media.speech({ apiBase: base, text: "Hello", voice: "voice-1" }),
    { url: "", mimeType: "audio/mpeg", taskId: "speech-1" });
  assert.equal(calls.length, 1);
  assert.deepEqual(await media.speechQuery({ apiBase: base, taskId: "speech-1" }), { state: "running" });
  assert.deepEqual(await media.speechQuery({ apiBase: base, taskId: "speech-1" }), { state: "done", url: audioUrl });
  assert.equal(calls[1].url, `${base}/minimax_speech_query`);
  assert.deepEqual(jsonBody(calls[1]), { task_id: "speech-1", taskId: "speech-1", id: "speech-1" });
});

test("Kling uses all existing gateway aliases and does not follow workflow endpoints", async t => {
  const { media, calls } = await setup(t, [{ data: { task_id: "kling-1" } }]);
  const result = await media.avatarCreate({ apiBase: base, imageUrl, audioUrl, prompt: "Smile", workflow: { provider: "kling", endpoint: "https://bad.example/proxy", apiKey: key } });
  assert.equal(result.taskId, "kling-1");
  assert.equal(calls[0].url, `${base}/kling_avatar`);
  assert.deepEqual(jsonBody(calls[0]), { prompt: "Smile", model_name: "kling-avatar", image: imageUrl, image_url: imageUrl,
    image_path: imageUrl, reference_image: imageUrl, reference_image_url: imageUrl, audio: audioUrl, audio_url: audioUrl,
    audio_path: audioUrl, voice_url: audioUrl, resolution: "1080p", quality: "1080p", mode: "pro",
    watermark: false, remove_watermark: true, without_watermark: true });
});

test("RH standalone templates upload resources before run and never send credentials in body", async t => {
  const workflow = rhWorkflow();
  workflow.extraJson = '{"retainSeconds":60}';
  const before = JSON.stringify(workflow);
  const { media, calls } = await setup(t, rhResponses());
  assert.equal((await media.avatarCreate({ imageUrl, audioUrl, workflow })).taskId, "rh-task");
  assert.deepEqual(calls.map(x => x.url), [imageUrl, "https://www.runninghub.cn/openapi/v2/media/upload/binary", audioUrl,
    "https://www.runninghub.cn/openapi/v2/media/upload/binary", "https://www.runninghub.ai/openapi/v2/run/ai-app/12345"]);
  assert.equal(calls[1].headers.Authorization, `Bearer ${key}`);
  assert.equal(calls[4].headers.Authorization, `Bearer ${key}`);
  assert.equal(calls[0].headers?.Authorization, undefined);
  const body = jsonBody(calls[4]);
  assert.deepEqual(body.nodeInfoList.map(n => n.fieldValue), ["rh/portrait.png", "rh/voice.mp3"]);
  assert.equal(body.retainSeconds, 60);
  assert.equal(JSON.stringify(body).includes(key), false);
  assert.equal(JSON.stringify(workflow), before);
});

test("RH workbench config resolves bindings while retaining explicitly fixed values", async t => {
  const workflow = { ...rhWorkflow(), appId: undefined, webappId: "67890", instanceType: "plus", fps: "24", nodeInfoList: [
    { nodeId: "1", fieldName: "image", fieldValue: "old", binding: "referenceImage" },
    { nodeId: "2", fieldName: "audio", fieldValue: "old", dynamicBinding: "referenceAudio" },
    { nodeId: "3", fieldName: "value", fieldValue: "0", binding: "frameLimit" },
    { nodeId: "4", fieldName: "text", fieldValue: "old", binding: "prompt" },
    { nodeId: "5", fieldName: "image", fieldValue: "fixed.png", binding: "none" },
    { nodeId: "6", fieldName: "value", fieldValue: "0", binding: "aspectRatio" }
  ] };
  const { media, calls } = await setup(t, rhResponses());
  await media.avatarCreate({ imageUrl, audioUrl, prompt: "Hi", workflow, options: { duration: 2.5, width: 720, height: 1280 } });
  const body = jsonBody(calls[4]);
  assert.deepEqual(body.nodeInfoList.map(n => n.fieldValue), ["rh/portrait.png", "rh/voice.mp3", "60", "Hi", "fixed.png", "9:16"]);
  assert.equal(body.instanceType, "plus");
  assert.ok(calls[4].url.endsWith("/67890"));
});

test("query state normalization distinguishes failures, pending data, and output URLs", async t => {
  const { media, calls } = await setup(t, [{ status: "RUNNING", data: { taskId: "x", progress: 90 } },
    { status: "FAILED", errorMessage: `Unauthorized Bearer ${key}`, data: { url: videoUrl } },
    { status: "SUCCESS", results: [{ url: videoUrl }] }, { success: true, data: null }]);
  const workflow = rhWorkflow();
  assert.deepEqual(await media.avatarQuery({ taskId: "x", workflow }), { state: "running" });
  const failure = await media.avatarQuery({ taskId: "x", workflow });
  assert.equal(failure.state, "failed");
  assert.ok(!failure.error.includes(key));
  assert.deepEqual(await media.avatarQuery({ taskId: "x", workflow }), { state: "done", url: videoUrl });
  assert.deepEqual(jsonBody(calls[0]), { taskId: "x" });
  assert.deepEqual(await media.avatarQuery({ apiBase: base, taskId: "x" }), { state: "running" });
  assert.equal(calls[3].url, `${base}/kling_avatar_query`);
});

test("own media URLs are looked up locally and reuploaded for Kling", async t => {
  const { media, calls, dataDir } = await setup(t, [{ data: { url: audioUrl } }, { data: { taskId: "local-task" } }]);
  const dir = path.join(dataDir, "avatar-workflow", "media");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "local.mp3"), "local audio");
  await media.avatarCreate({ apiBase: base, imageUrl, audioUrl: `http://127.0.0.1:4198${prefix}local.mp3` });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${base}/fileupload`);
  assert.equal(jsonBody(calls[1]).audio_url, audioUrl);
});

test("rejects private/non-HTTP URLs, arbitrary paths, and unsafe local names before fetch", async t => {
  const { media, calls } = await setup(t);
  for (const url of ["file:///etc/passwd", "ftp://public.example/file", "http://127.1/a", "http://10.0.0.1/a",
    "http://169.254.169.254/a", "http://192.168.0.1/a", "http://[::1]/a", "http://[::ffff:127.0.0.1]/a",
    "http://localhost/a", "http://host.local/a", "https://example-user:example-password@cdn.example/a", "C:/secret.mp3",
    `${prefix}../secret.mp3`, `${prefix}%2e%2e%2fsecret.mp3`, `${prefix}x.mp3:stream`]) {
    await assert.rejects(media.avatarCreate({ apiBase: base, imageUrl, audioUrl: url }), undefined, url);
  }
  await assert.rejects(media.speech({ apiBase: "http://127.0.0.1:4198", text: "Hi", voice: "v" }));
  assert.equal(calls.length, 0);
});

test("input size limits and invalid RH config fail before paid submission", async t => {
  const { media, calls } = await setup(t);
  await assert.rejects(media.speech({ apiBase: base, text: "a".repeat(100001), voice: "v" }));
  await assert.rejects(media.upload({ apiBase: base, buffer: Buffer.alloc(64 * 1024 * 1024 + 1), mimeType: "audio/mpeg" }));
  await assert.rejects(media.avatarCreate({ imageUrl, audioUrl, workflow: { ...rhWorkflow(), nodeInfoList: "bad json" } }));
  await assert.rejects(media.avatarCreate({ imageUrl, audioUrl, workflow: { ...rhWorkflow(), nodeInfoList: "[]" } }));
  assert.equal(calls.length, 0);
});

test("HTTP failures and network exceptions cannot echo credentials and are never retried", async t => {
  const { media, calls } = await setup(t, [Response.json({ apiKey: key, message: `token=${key}` }, { status: 401 }),
    () => { throw new Error(`Bearer ${key} https://example-user:example-password@bad.example`); }]);
  for (let i = 0; i < 2; i++) {
    await assert.rejects(media.avatarQuery({ taskId: "x", workflow: rhWorkflow() }), error =>
      !error.message.includes(key) && !error.message.includes("example-password"));
  }
  assert.equal(calls.length, 2);
});

test("redirects and oversized response streams are rejected", async t => {
  const { media } = await setup(t, [new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }),
    new Response("{}", { headers: { "content-length": "99999999" } })]);
  await assert.rejects(media.speechQuery({ apiBase: base, taskId: "x" }), /redirect/i);
  await assert.rejects(media.speechQuery({ apiBase: base, taskId: "x" }), /large|limit/i);
});

function mockProcesses(t, handler) {
  t.mock.method(cp, "execFile", (command, args, options, callback) => {
    const child = new EventEmitter();
    child.stdin = { end(input) { child.input = input; } };
    queueMicrotask(async () => {
      try { const output = await handler({ command, args, options, input: child.input }); callback(null, output || "version 1", ""); }
      catch (error) { callback(error, "", ""); }
    });
    return child;
  });
}

test('local uploaded audio/video processing never fetches or archives another video', async t => {
  const { media, dataDir, calls } = await setup(t, [], { FFMPEG: 'mock-ffmpeg', PYTHON: 'mock-python', SUBTITLE_SERVICE: __filename });
  const dir = path.join(dataDir, 'avatar-workflow', 'media');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'selected.mp4'), 'selected video');
  await fs.writeFile(path.join(dir, 'selected.wav'), 'selected audio');
  mockProcesses(t, async ({ args, input }) => {
    if (args.includes('-version') || args.includes('--version')) return 'version';
    if (args.includes('-i')) { await fs.writeFile(args.at(-1), 'processed audio'); return ''; }
    assert.equal(JSON.parse(input).transcript, 'Original');
    return '__SUBTITLE_JSON__{"srt":"Original subtitle"}';
  });
  const adjusted = await media.adjustAudio({ audioUrl: prefix + 'selected.wav' });
  const subtitle = await media.subtitle({ mediaUrl: prefix + 'selected.mp4', transcript: 'Original' });
  assert.equal(calls.length, 0);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['selected.mp4', 'selected.wav', path.basename(adjusted.url), path.basename(subtitle.url)].sort());
});

test('local processing rejects redirected media directories even within the shared data root', async t => {
  const { media, dataDir, calls } = await setup(t, [], { FFMPEG: 'mock-ffmpeg' });
  const outside = path.join(dataDir, 'unrelated-files');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'secret.mp3'), 'private fixture');
  await fs.mkdir(path.join(dataDir, 'avatar-workflow'));
  await fs.symlink(outside, path.join(dataDir, 'avatar-workflow', 'media'), 'junction');
  mockProcesses(t, async ({ args }) => { if (!args.includes('-version')) await fs.writeFile(args.at(-1), 'audio'); });
  await assert.rejects(media.adjustAudio({ audioUrl: prefix + 'secret.mp3' }), /Unsafe|Invalid/i);
  assert.equal(calls.length, 0);
  assert.deepEqual(await fs.readdir(outside), ['secret.mp3']);
});

test("dependency discovery degrades without affecting speech and respects env overrides", async t => {
  mockProcesses(t, ({ options }) => { assert.ok(options.timeout > 0); throw new Error("missing"); });
  const { media } = await setup(t, [{ url: audioUrl }], { PYTHON: "missing-python", FFMPEG: "missing-ffmpeg", SUBTITLE_SERVICE: "missing-service.py" });
  const deps = await media.dependencies();
  assert.equal(deps.python.available, false);
  assert.equal(deps.ffmpeg.available, false);
  assert.equal(deps.subtitle.available, false);
  assert.equal(deps.adjustAudio.available, false);
  assert.equal((await media.speech({ apiBase: base, text: "Hi", voice: "v" })).url, audioUrl);
  await assert.rejects(media.adjustAudio({ audioUrl }), /FFmpeg|dependency/i);
  await assert.rejects(media.subtitle({ mediaUrl: videoUrl }), /subtitle|dependency/i);
});

test("audio processing uses private staged files, finite filters, and cleans intermediate files", async t => {
  const { media, dataDir } = await setup(t, [new Response("audio")], { FFMPEG: "mock-ffmpeg" });
  mockProcesses(t, async ({ args, options }) => {
    if (args.includes("-version")) return "ffmpeg version test";
    assert.equal(options.windowsHide, true);
    assert.equal(options.shell, false);
    assert.ok(args.includes("file,pipe"));
    assert.equal(args[args.indexOf("-af") + 1], "atempo=1.25,volume=0.8");
    assert.ok(args[args.indexOf("-i") + 1].startsWith(path.join(dataDir, "avatar-workflow", "media")));
    await fs.writeFile(args.at(-1), "processed");
  });
  const result = await media.adjustAudio({ audioUrl, options: { speed: 1.25, volume: 0.8, trimStart: 0.5, duration: 2 } });
  assert.match(result.url, /^\/api\/control\/v1\/avatar-workflow\/media\/[\w-]+\.mp3$/);
  assert.equal(result.mimeType, "audio/mpeg");
  const files = await fs.readdir(path.join(dataDir, "avatar-workflow", "media"));
  assert.deepEqual(files, [path.basename(result.url)]);
  await assert.rejects(media.adjustAudio({ audioUrl, options: { speed: "1;evil" } }));
  await assert.rejects(media.adjustAudio({ audioUrl, options: { outputPath: "C:/secret" } }));
});

test("subtitles call the existing Python service offline and persist only private SRT output", async t => {
  const { media, dataDir } = await setup(t, [new Response("video")], { PYTHON: "mock-python", FFMPEG: "mock-ffmpeg", SUBTITLE_SERVICE: __filename });
  mockProcesses(t, async ({ args, input, options }) => {
    if (args.includes("--version") || args.includes("-version")) return "version test";
    if (args.includes("-i")) { await fs.writeFile(args.at(-1), "normalized audio"); return ""; }
    assert.equal(options.env.PYTHONDONTWRITEBYTECODE, "1");
    assert.ok(args[1].includes("generate_srt_from_media"));
    assert.ok(args[1].includes("Model is not cached"));
    assert.ok(args[1].includes("socket.socket.connect = offline"));
    assert.ok(args[1].includes('engine["ensure_ffmpeg_path"] = lambda: None'));
    const payload = JSON.parse(input);
    assert.equal(payload.transcript, "Hello");
    assert.ok(payload.media_path.startsWith(path.join(dataDir, "avatar-workflow", "media")));
    return '__SUBTITLE_JSON__{"srt":"1\\n00:00:00,000 --> 00:00:01,000\\nHello\\n"}';
  });
  const result = await media.subtitle({ mediaUrl: videoUrl, transcript: "Hello", options: { mode: "sentence", model: "base" } });
  assert.equal(result.mimeType, "application/x-subrip");
  assert.match(await fs.readFile(path.join(dataDir, "avatar-workflow", "media", path.basename(result.url)), "utf8"), /Hello/);
  assert.equal((await fs.readdir(path.join(dataDir, "avatar-workflow", "media"))).length, 1);
});

test("saved dependency settings override environment without mutating later calls", async t => {
  const { media } = await setup(t, [], { PYTHON: "env-python", FFMPEG: "env-ffmpeg", SUBTITLE_SERVICE: "missing.py" });
  const seen = [];
  mockProcesses(t, ({ command }) => { seen.push(command); return "version"; });
  const deps = await media.dependencies({ id: "dependencies", version: 2, python: "saved-python", ffmpeg: "saved-ffmpeg", subtitleService: __filename });
  assert.equal(deps.python.command, "saved-python");
  assert.equal(deps.ffmpeg.command, "saved-ffmpeg");
  assert.equal(deps.subtitleService.path, __filename);
  assert.equal(deps.subtitle.available, true);
  assert.deepEqual(seen, ["saved-python", "saved-ffmpeg"]);
  assert.equal((await media.dependencies()).python.command, "env-python");
  await assert.rejects(media.dependencies({ ffmpeg: "ffmpeg -i secret" }), /Invalid/);
  await assert.rejects(media.dependencies({ python: "python\n--evil" }), /Invalid/);
});

test("per-call tools select audio executable while options cannot inject tool paths", async t => {
  const { media } = await setup(t, [new Response("audio")], { FFMPEG: "env-ffmpeg" });
  mockProcesses(t, async ({ command, args }) => {
    assert.equal(command, "saved-ffmpeg");
    if (!args.includes("-version")) await fs.writeFile(args.at(-1), "audio output");
  });
  assert.equal((await media.adjustAudio({ audioUrl, tools: { ffmpeg: "saved-ffmpeg" } })).mimeType, "audio/mpeg");
  await assert.rejects(media.adjustAudio({ audioUrl, options: { ffmpeg: "evil" } }), /option/);
});

test("per-call subtitle tools select Python, service and FFmpeg", async t => {
  const { media } = await setup(t, [new Response("video")], { PYTHON: "env-python", FFMPEG: "env-ffmpeg", SUBTITLE_SERVICE: "missing.py" });
  mockProcesses(t, async ({ command, args, input }) => {
    assert.ok(["saved-python", "saved-ffmpeg"].includes(command));
    if (args.includes("--version") || args.includes("-version")) return "version";
    if (command === "saved-ffmpeg") { await fs.writeFile(args.at(-1), "normalized audio"); return ""; }
    assert.equal(JSON.parse(input).service, __filename);
    return '__SUBTITLE_JSON__{"srt":"test subtitle"}';
  });
  const result = await media.subtitle({ mediaUrl: videoUrl, tools: { python: "saved-python", ffmpeg: "saved-ffmpeg", subtitleService: __filename } });
  assert.equal(result.mimeType, "application/x-subrip");
});

test("processing accepts parent enabled flags and forces a media demuxer before reading untrusted bytes", async t => {
  const { media } = await setup(t, [new Response("#EXTM3U\nfile:///private")], { FFMPEG: "mock-ffmpeg" });
  mockProcesses(t, async ({ args }) => {
    if (args.includes("-version")) return "version";
    assert.equal(args[args.indexOf("-f") + 1], "mp3");
    assert.ok(args.indexOf("-f") < args.indexOf("-i"));
    await fs.writeFile(args.at(-1), "output");
  });
  assert.equal((await media.adjustAudio({ audioUrl, options: { enabled: true } })).mimeType, "audio/mpeg");
});

test("subtitle normalizes media in FFmpeg before Python can inspect container references", async t => {
  const { media } = await setup(t, [new Response("video")], { PYTHON: "mock-python", FFMPEG: "mock-ffmpeg", SUBTITLE_SERVICE: __filename });
  let normalized = false;
  mockProcesses(t, async ({ command, args, input }) => {
    if (args.includes("--version") || args.includes("-version")) return "version";
    if (command === "mock-ffmpeg") {
      assert.equal(args[args.indexOf("-f") + 1], "mov");
      assert.equal(args[args.indexOf("-protocol_whitelist") + 1], "file,pipe");
      await fs.writeFile(args.at(-1), "wav");
      normalized = true;
      return "";
    }
    assert.ok(normalized, "Python must only receive normalized WAV");
    assert.ok(JSON.parse(input).media_path.endsWith(".wav"));
    return '__SUBTITLE_JSON__{"srt":"subtitle"}';
  });
  assert.equal((await media.subtitle({ mediaUrl: videoUrl, options: { enabled: true } })).mimeType, "application/x-subrip");
});

test("SSRF protection rejects private DNS answers without making a network request", async t => {
  const { dataDir } = await setup(t);
  const dns = require("node:dns/promises");
  const https = require("node:https");
  t.mock.method(dns, "lookup", async () => [{ address: "10.2.3.4", family: 4 }]);
  const network = t.mock.method(https, "request", () => { throw new Error("Network must not be called"); });
  const media = require(modulePath).createAvatarWorkflowMedia({ dataDir, env: {} });
  await assert.rejects(media.speechQuery({ apiBase: base, taskId: "x" }), /Private DNS/);
  assert.equal(network.mock.callCount(), 0);
});

test("production transport pins the public DNS answer and preserves TLS hostname", async t => {
  const { dataDir } = await setup(t);
  const dns = require("node:dns/promises");
  const https = require("node:https");
  const { Readable } = require("node:stream");
  t.mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }]);
  t.mock.method(https, "request", (url, options, callback) => {
    assert.equal(url.hostname, "gateway.example");
    options.lookup(url.hostname, { all: true }, (_error, addresses) => assert.deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]));
    const req = new EventEmitter();
    req.end = () => {
      const response = Readable.from([Buffer.from(JSON.stringify({ data: { audio_url: audioUrl } }))]);
      response.statusCode = 200;
      response.headers = { "content-type": "application/json" };
      callback(response);
    };
    return req;
  });
  const media = require(modulePath).createAvatarWorkflowMedia({ dataDir, env: {} });
  assert.deepEqual(await media.speechQuery({ apiBase: base, taskId: "x" }), { state: "done", url: audioUrl });
});

test("requests time out even when an injected transport ignores abort", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { media } = await setup(t, [() => new Promise(() => {})]);
  const pending = assert.rejects(media.speechQuery({ apiBase: base, taskId: "x" }), /timeout/);
  t.mock.timers.tick(120001);
  await pending;
});

test("size caps count streamed bytes even without Content-Length", async t => {
  const { media } = await setup(t, [new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); controller.close();
  } }))]);
  await assert.rejects(media.speechQuery({ apiBase: base, taskId: "x" }), /size limit/);
});

test("processing failures remove partial output and all staged media", async t => {
  const { media, dataDir } = await setup(t, [new Response("audio")], { FFMPEG: "mock-ffmpeg" });
  mockProcesses(t, async ({ args }) => {
    if (args.includes("-version")) return "version";
    await fs.writeFile(args.at(-1), "partial");
    throw new Error("sensitive process output");
  });
  await assert.rejects(media.adjustAudio({ audioUrl }), error => !error.message.includes("sensitive"));
  assert.deepEqual(await fs.readdir(path.join(dataDir, "avatar-workflow", "media")), []);
});

test("RH reads own media locally and substitutes uploaded references even in original-url templates", async t => {
  const workflow = rhWorkflow([{ nodeId: "1", fieldName: "image", fieldValue: "{{original_image_url}}" },
    { nodeId: "2", fieldName: "audio", fieldValue: "{{original_audio_url}}" }]);
  const { media, calls, dataDir } = await setup(t, [{ data: { fileName: "rh/i.png" } }, { data: { fileName: "rh/a.mp3" } }, { taskId: "x" }]);
  const dir = path.join(dataDir, "avatar-workflow", "media");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "i.png"), "image");
  await fs.writeFile(path.join(dir, "a.mp3"), "audio");
  await media.avatarCreate({ imageUrl: `${prefix}i.png`, audioUrl: `${prefix}a.mp3`, workflow });
  assert.equal(calls.length, 3);
  assert.deepEqual(jsonBody(calls[2]).nodeInfoList.map(node => node.fieldValue), ["rh/i.png", "rh/a.mp3"]);
});

test("successful responses omit raw echoed credentials and reference metadata", async t => {
  const { media } = await setup(t, [{ success: true, data: { video_url: videoUrl, apiKey: key }, request: { Authorization: `Bearer ${key}` } }]);
  const result = await media.avatarCreate({ apiBase: base, imageUrl, audioUrl });
  assert.deepEqual(result, { url: videoUrl, mimeType: "video/mp4" });
  assert.ok(!JSON.stringify(result).includes(key));
});

test("HTTP rejections expose numeric status without returning sensitive bodies", async t => {
  const { media } = await setup(t, [Response.json({ message: key }, { status: 422 }), Response.json({ token: key }, { status: 503 })]);
  await assert.rejects(media.speech({ apiBase: base, text: "Hi", voice: { voiceId: "saved-voice" } }), error =>
    error.status === 422 && error.code === "PROVIDER_HTTP_ERROR" && !error.message.includes(key));
  await assert.rejects(media.avatarQuery({ taskId: "x", workflow: rhWorkflow() }), error =>
    error.status === 503 && !error.message.includes(key));
});

test("RH missing dynamic metadata rejects before uploads instead of retaining stale field values", async t => {
  mockProcesses(t, () => { throw new Error("missing executable"); });
  for (const binding of ["durationSeconds", "frameLimit", "width", "height", "ratioWidth", "ratioHeight", "aspectRatio", "size"]) {
    const { media, calls } = await setup(t, rhResponses());
    const workflow = rhWorkflow([{ nodeId: "1", fieldName: "value", fieldValue: "stale-999", binding }]);
    await assert.rejects(media.avatarCreate({ imageUrl, audioUrl, workflow }), /metadata|binding|dependency/i, binding);
    assert.equal(calls.length, 0, binding);
  }
});

test("RH uses snapshot metadata and deliberately empty prompt bindings, never stale values", async t => {
  const { media, calls } = await setup(t, rhResponses());
  const workflow = rhWorkflow(["durationSeconds", "frameLimit", "width", "height", "prompt"].map((binding, i) =>
    ({ nodeId: String(i), fieldName: "value", fieldValue: "stale", binding })));
  await media.avatarCreate({ imageUrl, audioUrl, workflow, options: { duration: 3.25, width: 800, height: 600, fps: 24 }, prompt: "" });
  assert.deepEqual(jsonBody(calls[4]).nodeInfoList.map(n => n.fieldValue), ["3.25", "78", "800", "600", ""]);
});

test("legacy extraJson recursively substitutes context and preserves fixed provider request fields", async t => {
  const { media, calls } = await setup(t, rhResponses());
  const workflow = { ...rhWorkflow(), instanceType: "default", usePersonalQueue: false, retainSeconds: "", webhookUrl: "",
    extraJson: JSON.stringify({ instanceType: "plus", usePersonalQueue: true, retainSeconds: 90,
      clientId: "example-legacy-client", prompt: "{{prompt}}", metadata: { duration: "{{duration}}", refs: ["{{image_file}}", "{{audio_url}}"] } }) };
  await media.avatarCreate({ imageUrl, audioUrl, prompt: "Hello", workflow, options: { duration: 5 } });
  const body = jsonBody(calls[4]);
  assert.equal(body.instanceType, "plus");
  assert.equal(body.usePersonalQueue, true);
  assert.equal(body.retainSeconds, 90);
  assert.equal(body.clientId, "example-legacy-client");
  assert.equal(body.prompt, "Hello");
  assert.deepEqual(body.metadata, { duration: "5", refs: ["rh/portrait.png", "rh/voice.mp3"] });
});

test("legacy extraJson unresolved metadata and unsafe webhook URLs fail before uploading", async t => {
  mockProcesses(t, () => { throw new Error("missing executable"); });
  for (const extraJson of ['{"metadata":{"duration":"{{duration}}"}}', '{"webhookUrl":"http://127.0.0.1/notify"}']) {
    const { media, calls } = await setup(t, rhResponses());
    await assert.rejects(media.avatarCreate({ imageUrl, audioUrl, workflow: { ...rhWorkflow(), extraJson } }));
    assert.equal(calls.length, 0);
  }
});

test("legacy RH taskStatus is normalized without treating stale output as completion", async t => {
  const { media } = await setup(t, [{ data: { taskStatus: "RUNNING", url: videoUrl } }, { taskStatus: "FAILED" }]);
  assert.deepEqual(await media.avatarQuery({ taskId: "x", workflow: rhWorkflow() }), { state: "running" });
  assert.equal((await media.avatarQuery({ taskId: "x", workflow: rhWorkflow() })).state, "failed");
});

test("RH probes only required audio/image metadata with sibling ffprobe and reuses uploads", async t => {
  const { media, calls, dataDir } = await setup(t, [
    new Response("audio", { headers: { "content-type": "audio/mpeg" } }),
    new Response("image", { headers: { "content-type": "image/png" } }),
    { data: { fileName: "rh/i.png" } }, { data: { fileName: "rh/a.mp3" } }, { taskId: "probed" }
  ]);
  const executableDir = path.join(dataDir, "tools");
  await fs.mkdir(executableDir);
  const ffmpeg = path.join(executableDir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  const ffprobe = path.join(executableDir, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  await fs.writeFile(ffprobe, "mock executable marker");
  const probed = [];
  mockProcesses(t, ({ command, args, options }) => {
    if (args.includes("-version")) return "version";
    assert.equal(command, ffprobe);
    assert.ok(options.timeout <= 30000 && options.maxBuffer <= 65536);
    assert.equal(options.shell, false);
    assert.ok(args.includes("file,pipe"));
    const input = args[args.indexOf("-i") + 1];
    assert.ok(input.startsWith(path.join(dataDir, "avatar-workflow", "media")));
    probed.push(path.extname(input));
    return input.endsWith(".mp3") ? '{"format":{"duration":"2.75"},"streams":[{"codec_type":"audio"}]}'
      : '{"streams":[{"codec_type":"video","width":720,"height":1280}]}';
  });
  const workflow = rhWorkflow(["durationSeconds", "frameLimit", "width", "height"].map((binding, index) =>
    ({ nodeId: String(index), fieldName: "value", fieldValue: "stale", binding })));
  workflow.extraJson = '{"metadata":{"ratio":"{{aspectRatio}}","seconds":"{{duration}}"}}';
  await media.avatarCreate({ imageUrl, audioUrl, workflow, tools: { ffmpeg }, options: { fps: 24 } });
  assert.deepEqual(probed, [".mp3", ".png"]);
  assert.deepEqual(calls.filter(call => call.method === "GET").map(call => call.url), [audioUrl, imageUrl]);
  assert.deepEqual(jsonBody(calls[4]).nodeInfoList.map(node => node.fieldValue), ["2.75", "66", "720", "1280"]);
  assert.deepEqual(jsonBody(calls[4]).metadata, { ratio: "9:16", seconds: "2.75" });
  assert.deepEqual(await fs.readdir(path.join(dataDir, "avatar-workflow", "media")), []);
});

test("FFmpeg fallback parses bounded metadata and skips probes for supplied or unneeded fields", async t => {
  const { media, calls, dataDir } = await setup(t, [
    new Response("audio", { headers: { "content-type": "audio/mpeg" } }),
    new Response("image", { headers: { "content-type": "image/png" } }),
    { data: { fileName: "rh/i.png" } }, { data: { fileName: "rh/a.mp3" } }, { taskId: "fallback" }, ...rhResponses()
  ]);
  let probeCount = 0;
  t.mock.method(cp, "execFile", (_command, args, options, callback) => {
    const child = new EventEmitter();
    child.stdin = { end() {} };
    queueMicrotask(() => {
      if (args.includes("-version")) return callback(null, "version", "");
      probeCount++;
      assert.ok(options.timeout <= 30000 && options.maxBuffer <= 65536);
      assert.ok(args.includes("mp3"));
      callback(Object.assign(new Error("expected no output"), { code: 1 }), "", "Duration: 00:00:04.25, start: 0.0\nStream #0:0: Audio: mp3, 32000 Hz\nAt least one output file must be specified");
    });
    return child;
  });
  const workflow = rhWorkflow();
  workflow.extraJson = '{"duration":"{{duration}}"}';
  await media.avatarCreate({ imageUrl, audioUrl, workflow, tools: { ffmpeg: "mock-ffmpeg" } });
  assert.equal(probeCount, 1);
  assert.equal(jsonBody(calls[4]).duration, "4.25");
  await media.avatarCreate({ imageUrl, audioUrl, workflow, options: { duration: 6 }, tools: { ffmpeg: "missing-unused-ffmpeg" } });
  assert.equal(probeCount, 1);
  assert.deepEqual(await fs.readdir(path.join(dataDir, "avatar-workflow", "media")), []);
});

test("probe failures redact output, remove staged inputs and never submit or download videos", async t => {
  const { media, calls, dataDir } = await setup(t, [new Response("audio", { headers: { "content-type": "audio/mpeg" } })]);
  let missing = true;
  t.mock.method(cp, "execFile", (_command, args, _options, callback) => {
    const child = new EventEmitter(); child.stdin = { end() {} };
    queueMicrotask(() => {
      if (missing) return callback(Object.assign(new Error(key), { code: "ENOENT" }), "", "");
      if (args.includes("-version")) return callback(null, "version", "");
      callback(Object.assign(new Error(key), { code: 1 }), "", `Duration: N/A, ${key}`);
    });
    return child;
  });
  const workflow = rhWorkflow([{ nodeId: "1", fieldName: "duration", fieldValue: "stale", binding: "durationSeconds" }]);
  await assert.rejects(media.avatarCreate({ imageUrl, audioUrl, workflow, tools: { ffmpeg: "missing-ffmpeg" } }), error => error.code === "DEPENDENCY_UNAVAILABLE");
  assert.equal(calls.length, 0);
  missing = false;
  await assert.rejects(media.avatarCreate({ imageUrl, audioUrl, workflow, tools: { ffmpeg: "mock-ffmpeg" } }), error =>
    error.code === "MEDIA_METADATA_UNAVAILABLE" && !error.message.includes(key));
  assert.deepEqual(await fs.readdir(path.join(dataDir, "avatar-workflow", "media")), []);
  await assert.rejects(media.probeMedia({ url: videoUrl, kind: "video" }));
  await assert.rejects(media.probeMedia({ url: videoUrl, kind: "audio" }));
  assert.equal(calls.length, 1);
});

test("speech preserves valid raw.duration without exposing raw response data", async t => {
  const { media } = await setup(t, [{ data: { audio_url: audioUrl }, raw: { duration: 2.75, apiKey: key } },
    { url: audioUrl, raw: { duration: "not-a-number" } }]);
  assert.deepEqual(await media.speech({ apiBase: base, text: "Hi", voice: "voice" }), { url: audioUrl, mimeType: "audio/mpeg", duration: 2.75 });
  assert.equal((await media.speech({ apiBase: base, text: "Hi", voice: "voice" })).duration, undefined);
});

test("tiny local WAV and PNG fixtures probe without network or leftover staging", { skip: !process.env.AVATAR_WORKFLOW_FFMPEG_TEST }, async t => {
  const { media, calls, dataDir } = await setup(t);
  const dir = path.join(dataDir, "avatar-workflow", "media");
  await fs.mkdir(dir, { recursive: true });
  const wav = Buffer.alloc(4044);
  wav.write("RIFF"); wav.writeUInt32LE(4036, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(4000, 40);
  await fs.writeFile(path.join(dir, "tiny.wav"), wav);
  await fs.writeFile(path.join(dir, "tiny.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBFAAAAAASUVORK5CYII=", "base64"));
  const tools = { ffmpeg: process.env.AVATAR_WORKFLOW_FFMPEG_TEST };
  assert.deepEqual(await media.probeMedia({ url: `${prefix}tiny.wav`, kind: "audio", tools }), { duration: 0.25 });
  assert.deepEqual(await media.probeMedia({ url: `${prefix}tiny.png`, kind: "image", tools }), { width: 1, height: 1 });
  assert.equal(calls.length, 0);
  assert.deepEqual((await fs.readdir(dir)).sort(), ["tiny.png", "tiny.wav"]);
});
