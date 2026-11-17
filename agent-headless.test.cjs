const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createAgentService } = require('./agent-service.cjs');

async function fixture(t, extra = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'headless-agent-'));
  const service = await createAgentService({ dataDir, headless: true, ...extra });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!await service.route(req, res, url.pathname, url)) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(dataDir, { recursive: true, force: true }); });
  const request = async (suffix, body, headers = {}) => {
    const res = await fetch(base + '/api/agent/v1' + suffix, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-API-Plus-Client': 'cli-v1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  return { dataDir, service, base, request };
}

test('native loopback CLI works without bearer while cross-origin and browser fetches remain blocked', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/capabilities')).status, 200);
  for (const headers of [{ Origin: 'https://attacker.test' }, { Referer: 'https://attacker.test/' }, { 'Sec-Fetch-Site': 'same-origin' }]) {
    assert.equal((await f.request('/capabilities', undefined, headers)).status, 403, JSON.stringify(headers));
  }
  const hostileHost = await new Promise((resolve, reject) => http.get(f.base + '/api/agent/v1/capabilities', { headers: { Host: 'attacker.test', 'X-API-Plus-Client': 'cli-v1' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject));
  assert.equal(hostileHost, 403);
  assert.equal((await fetch(f.base + '/api/agent/v1/capabilities')).status, 401);
  assert.equal((await f.request('/capabilities', undefined, { Authorization: 'Bearer wrong' })).status, 401);
});

test('headless ownership prevents browser claim and concurrent idempotent POSTs create one task', async t => {
  const f = await fixture(t);
  const body = { clientTaskId: 'same-one', taskType: 'image', input: { prompt: 'Original exact prompt' }, origin: { client: 'codex', id: 'one', label: 'One' } };
  const posted = await Promise.all(Array.from({ length: 4 }, () => f.request('/tasks', body)));
  assert.equal(new Set(posted.map(item => item.json.task.taskId)).size, 1);
  assert.equal(posted[0].json.task.executionOwner, 'headless');
  const cookie = (await fetch(f.base + '/api/control/v1/session')).headers.get('set-cookie').split(';')[0];
  const control = async (action, body) => fetch(f.base + '/api/control/v1/worker/' + action, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await control('register', { workerId: 'browser-one' });
  const claimed = await (await control('claim', { workerId: 'browser-one' })).json();
  assert.equal(claimed.task, null);
});

test('upload records origin source path and verified digest before any execution and survives restart', async t => {
  const f = await fixture(t);
  const form = new FormData();
  form.append('file', new Blob(['hello'], { type: 'audio/wav' }), 'voice.wav');
  form.append('mediaType', 'audio');
  form.append('origin', JSON.stringify({ client: 'mcode', id: 'voice-agent', label: 'Voice agent' }));
  form.append('metadata', JSON.stringify({ sourcePath: 'E:/media/voice.wav', lastModified: 123, duration: 30 }));
  const res = await fetch(f.base + '/api/agent/v1/assets', { method: 'POST', headers: { 'X-API-Plus-Client': 'cli-v1' }, body: form });
  assert.equal(res.status, 201);
  const { asset } = await res.json();
  assert.equal(asset.sourcePath, 'E:/media/voice.wav');
  assert.equal(asset.sha256, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  const restarted = await createAgentService({ dataDir: f.dataDir, headless: true });
  assert.equal((await restarted.getStagedAsset(asset.assetId)).sourcePath, asset.sourcePath);
  assert.equal(restarted.getHistory()[0].origin.id, 'voice-agent');
});

test('backend persists exact payload before submission, upstream ID before poll, and unified reconstructable history', async t => {
  const f = await fixture(t);
  assert.equal(typeof f.service.claimHeadless, 'function');
  const { createHeadlessExecutor } = require('./agent-headless.cjs');
  const events = [];
  const fetchImpl = async (url, init) => {
    const saved = f.service.taskStore.getEvents();
    const payload = JSON.parse(init.body);
    events.push({ url, payload });
    if (url.endsWith('/create')) {
      assert.ok(saved.some(e => e.type === 'task-execution-updated' && e.execution.jobs[0]?.state === 'submitting' && e.execution.jobs[0].payload.prompt === 'exact prompt'));
      return new Response(JSON.stringify({ success: true, data: { task_id: 'remote-1' } }));
    }
    assert.ok(saved.some(e => e.type === 'task-execution-updated' && e.execution.jobs[0]?.taskId === 'remote-1'));
    return new Response(JSON.stringify({ success: true, data: { video_url: 'https://cdn.example/result.mp4' } }));
  };
  const prepareTask = async task => ({ taskType: 'multiVideo', row: { ...task.input, model: 'demo', refs: [] }, config: { label: 'Demo' }, payload: { prompt: task.input.prompt, ratio: '4:3' }, endpoint: '/create', queryEndpoint: '/query', async: true, mediaType: 'video' });
  const executor = createHeadlessExecutor({ service: f.service, prepareTask, fetchImpl, gateway: 'https://gateway.example/api', pollMs: 1 });
  const created = await f.request('/tasks', { clientTaskId: 'exec-one', taskType: 'multiVideo', input: { prompt: 'exact prompt', count: 1 } });
  await executor.drain();
  const task = f.service.getTask(created.json.task.taskId);
  assert.equal(task.state, 'completed');
  assert.deepEqual(task.upstreamTaskIds, ['remote-1']);
  assert.equal(events.length, 2);
  const history = f.service.getHistory().find(record => record.kind === 'generation');
  assert.equal(history.prompt, 'exact prompt');
  assert.deepEqual(history.params, { prompt: 'exact prompt', ratio: '4:3' });
  assert.equal(history.executedBy.type, 'headless');
  assert.deepEqual(history.request.input, task.input);
});

test('restart resumes durable polling and refuses uncertain submissions without duplicating generation', async t => {
  const f = await fixture(t);
  assert.equal(typeof f.service.claimHeadless, 'function');
  const { createHeadlessExecutor } = require('./agent-headless.cjs');
  const created = await f.request('/tasks', { clientTaskId: 'resume', taskType: 'image', input: { prompt: 'x' } });
  const taskId = created.json.task.taskId;
  await f.service.updateExecution(taskId, { jobs: [{ index: 0, state: 'polling', taskId: 'existing-id', queryEndpoint: '/query', endpoint: '/create', payload: { prompt: 'x' }, submittedAt: Date.now() }], preparedRow: { model: 'demo', prompt: 'x', images: [] }, mediaType: 'image', taskType: 'image' });
  const restarted = await createAgentService({ dataDir: f.dataDir, headless: true });
  let calls = 0;
  const executor = createHeadlessExecutor({ service: restarted, prepareTask: () => { throw new Error('must use persisted payload'); }, fetchImpl: async (url) => { assert.ok(url.endsWith('/query')); calls++; return new Response(JSON.stringify({ success: true, data: { image_url: 'https://cdn.example/a.png' } })); }, gateway: 'https://gateway.example/api', pollMs: 1 });
  await executor.drain();
  assert.equal(restarted.getTask(taskId).state, 'completed');
  assert.equal(calls, 1);
  const uncertain = await f.request('/tasks', { clientTaskId: 'uncertain', taskType: 'image', input: { prompt: 'x' } });
  await f.service.updateExecution(uncertain.json.task.taskId, { jobs: [{ index: 0, state: 'submitting', endpoint: '/create', payload: { prompt: 'x' } }], preparedRow: { model: 'demo' } });
  const again = await createAgentService({ dataDir: f.dataDir, headless: true });
  await createHeadlessExecutor({ service: again, prepareTask: () => { throw new Error('must not prepare'); }, fetchImpl: () => { throw new Error('must not resubmit'); } }).drain();
  assert.equal(again.getTask(uncertain.json.task.taskId).state, 'submission-unknown');
});

test('audio uses model normalizer for raw task IDs and honors a persisted task gateway', async t => {
  const f = await fixture(t);
  const { createHeadlessExecutor } = require('./agent-headless.cjs');
  const visited = [];
  const executor = createHeadlessExecutor({ service: f.service, pollMs: 1, fetchImpl: async (url, init) => {
    visited.push(url);
    if (url.endsWith('/woosh_sound')) return new Response(JSON.stringify({ success: true, data: 'sound-opaque-id' }));
    assert.equal(JSON.parse(init.body).task_id, 'sound-opaque-id');
    return new Response(JSON.stringify({ success: true, data: { audio_url: 'https://cdn.example/sound.mp3' } }));
  } });
  const created = await f.request('/tasks', { clientTaskId: 'audio-raw-id', taskType: 'audio', input: { model: 'wooshSound', prompt: 'a soft tap', options: { apiBase: 'https://gateway.example/custom', duration: 4 } } });
  await executor.drain();
  const task = f.service.getTask(created.json.task.taskId);
  assert.equal(task.state, 'completed', task.error?.message);
  assert.ok(visited.every(url => url.startsWith('https://gateway.example/custom/')));
  assert.equal(task.execution.jobs[0].taskId, 'sound-opaque-id');
  assert.equal(task.results[0].type, 'audio');
});

test('cancel during submission preserves returned remote ID and never starts polling', async t => {
  const f = await fixture(t);
  const { createHeadlessExecutor } = require('./agent-headless.cjs');
  let taskId;
  let creates = 0;
  const executor = createHeadlessExecutor({ service: f.service, prepareTask: async task => ({ row: task.input, taskType: 'image', mediaType: 'image', payload: { prompt: task.input.prompt }, endpoint: '/create', queryEndpoint: '/query', async: true }),
    fetchImpl: async url => {
      assert.ok(url.endsWith('/create')); creates++;
      await f.request(`/tasks/${taskId}/cancel`, {});
      return new Response(JSON.stringify({ success: true, data: { task_id: 'canceled-remote', image_url: 'https://cdn.example/late.png' } }));
    } });
  taskId = (await f.request('/tasks', { clientTaskId: 'cancel-late', taskType: 'image', input: { prompt: 'x' } })).json.task.taskId;
  await executor.drain();
  assert.equal(f.service.getTask(taskId).state, 'canceled', f.service.getTask(taskId).error?.message);
  assert.deepEqual(f.service.getTask(taskId).upstreamTaskIds, ['canceled-remote']);
  assert.equal(creates, 1);
});

test('unreceived submit response is not retried and synchronous audio text is preserved in history', async t => {
  const f = await fixture(t);
  const { createHeadlessExecutor } = require('./agent-headless.cjs');
  const unknown = (await f.request('/tasks', { clientTaskId: 'lost-response', taskType: 'image', input: { model: 'nano', prompt: 'x' } })).json.task.taskId;
  let calls = 0;
  await createHeadlessExecutor({ service: f.service, fetchImpl: async () => { calls++; throw new Error('connection reset'); } }).drain();
  assert.equal(f.service.getTask(unknown).state, 'submission-unknown');
  assert.equal(calls, 1);
  const audio = (await f.request('/tasks', { clientTaskId: 'text-alias', taskType: 'audio', input: { model: 'minimaxTts', prompt: '', options: { text: 'Speech from options', voiceId: 'male-qn-qingse' } } })).json.task.taskId;
  await createHeadlessExecutor({ service: f.service, fetchImpl: async () => new Response(JSON.stringify({ success: true, data: { audio_url: 'https://cdn.example/speech.mp3' } })) }).drain();
  assert.equal(f.service.getTask(audio).state, 'completed', f.service.getTask(audio).error?.message);
  assert.equal(f.service.getHistory().find(record => record.taskId === audio).prompt, 'Speech from options');
});

test('repeated staged descriptors upload once and persisted URLs remain reusable after staging cleanup', async t => {
  const f = await fixture(t);
  const { createHeadlessExecutor } = require('./agent-headless.cjs');
  const form = new FormData(); form.append('file', new Blob(['x'], { type: 'image/png' }), 'one.png'); form.append('mediaType', 'image');
  const { asset } = await (await fetch(f.base + '/api/agent/v1/assets', { method: 'POST', headers: { 'X-API-Plus-Client': 'cli-v1' }, body: form })).json();
  let uploads = 0;
  const calls = [];
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/fileupload')) { uploads++; await new Promise(resolve => setTimeout(resolve, 15)); return new Response(JSON.stringify({ success: true, data: { url: 'https://cdn.example/shared.png' } })); }
    calls.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ success: true, data: { image_url: 'https://cdn.example/done.png' } }));
  };
  const first = (await f.request('/tasks', { clientTaskId: 'repeat-reference', taskType: 'image', input: { model: 'nano', prompt: 'x', assets: { images: [asset, asset] } } })).json.task;
  await createHeadlessExecutor({ service: f.service, fetchImpl }).drain();
  assert.equal(f.service.getTask(first.taskId).state, 'completed');
  assert.equal(uploads, 1);
  const resolved = f.service.getTask(first.taskId).execution.resolvedInput;
  await fs.rm(path.join(f.dataDir, 'staging', asset.assetId), { force: true });
  await fs.rm(path.join(f.dataDir, 'staging', asset.assetId + '.json'), { force: true });
  const restarted = await createAgentService({ dataDir: f.dataDir, headless: true });
  const next = await restarted.createTask({ clientTaskId: 'repeat-after-cleanup', taskType: 'image', input: resolved });
  await createHeadlessExecutor({ service: restarted, fetchImpl }).drain();
  assert.equal(restarted.getTask(next.task.taskId).state, 'completed', restarted.getTask(next.task.taskId).error?.message);
  assert.equal(uploads, 1);
});

test('RunningHub file identifiers and ephemeral credentials reach submit and query without entering journals', async t => {
  const f = await fixture(t);
  const { createHeadlessExecutor } = require('./agent-headless.cjs');
  const credential = 'private-test-secret';
  const task = (await f.request('/tasks', { clientTaskId: 'rh-live-shape', taskType: 'motion', input: { model: 'runninghub', prompt: 'Move', assets: {
    image: { type: 'image', url: 'https://cdn.example/a.png', width: 800, height: 600 }, video: { type: 'video', url: 'https://cdn.example/a.mp4', duration: 5, width: 800, height: 600 }
  }, runningHub: { apiKey: credential, activeId: 'test', configs: [{ id: 'test', title: 'Test', workflowType: 'motion', webappId: '123', nodeInfoList: [{ nodeId: '1', fieldName: 'image', fieldValue: '', binding: 'referenceImage' }, { nodeId: '2', fieldName: 'video', fieldValue: '', binding: 'referenceVideo' }] }] } } })).json.task;
  const seen = [];
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/session')) return new Response('{}', { headers: { 'Set-Cookie': 'api_plus_control=test' } });
    const body = JSON.parse(init.body); seen.push(body);
    assert.equal(body.apiKey, credential);
    if (url.endsWith('/upload-url')) return new Response(JSON.stringify({ success: true, data: { fileName: `uploaded-${body.kind}` } }));
    if (url.endsWith('/run')) {
      assert.deepEqual(body.nodeInfoList.map(item => item.fieldValue), ['uploaded-image', 'uploaded-video']);
      return new Response(JSON.stringify({ success: true, data: { taskId: 'rh-remote' } }));
    }
    assert.ok(url.endsWith('/query'));
    return new Response(JSON.stringify({ success: true, data: { video_url: 'https://cdn.example/rh.mp4' } }));
  };
  await createHeadlessExecutor({ service: f.service, fetchImpl, localBase: 'http://127.0.0.1:4198' }).drain();
  assert.equal(f.service.getTask(task.taskId).state, 'completed', f.service.getTask(task.taskId).error?.message);
  assert.equal(seen.length, 4);
  assert.equal((await fs.readFile(path.join(f.dataDir, 'tasks/events.ndjson'), 'utf8')).includes(credential), false);
  assert.equal((await fs.readFile(path.join(f.dataDir, 'history/events.ndjson'), 'utf8')).includes(credential), false);
});

test('submit response stream loss retains submission-unknown and does not retry create', async t => {
  const f = await fixture(t);
  const { createHeadlessExecutor } = require('./agent-headless.cjs');
  const taskId = (await f.request('/tasks', { clientTaskId: 'body-disconnect', taskType: 'image', input: { model: 'nano', prompt: 'x' } })).json.task.taskId;
  let calls = 0;
  await createHeadlessExecutor({ service: f.service, fetchImpl: async () => { calls++; return { ok: true, status: 200, text: async () => { throw new Error('stream interrupted'); } }; } }).drain();
  assert.equal(f.service.getTask(taskId).state, 'submission-unknown');
  assert.equal(calls, 1);
});

test('upload derives source dimensions from bytes without requiring ffprobe or trusting caller dimensions', async t => {
  const f = await fixture(t);
  const bytes = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(640,16); bytes.writeUInt32BE(480,20);
  const form = new FormData(); form.append('file', new Blob([bytes], { type: 'image/png' }), 'source.png'); form.append('mediaType','image');
  form.append('metadata', JSON.stringify({ width: 1, height: 1 }));
  const response = await fetch(f.base + '/api/agent/v1/assets', { method:'POST', headers:{ 'X-API-Plus-Client':'cli-v1' }, body:form });
  const { asset } = await response.json();
  assert.equal(asset.width,640); assert.equal(asset.height,480); assert.equal(asset.metadataSource,'native-png');
});

test('provider error text cannot echo a runtime credential into the task journal', async t => {
  const f = await fixture(t);
  const { createHeadlessExecutor } = require('./agent-headless.cjs');
  const secret = 'example-ephemeral-echo-fixture';
  const taskId = (await f.request('/tasks', { clientTaskId:'secret-error', taskType:'image', input:{ prompt:'x', runningHub:{apiKey:secret} } })).json.task.taskId;
  await createHeadlessExecutor({ service:f.service, prepareTask:async task => ({taskType:'image',row:task.input,payload:{prompt:'x'},endpoint:'/create',mediaType:'image'}), fetchImpl:async () => new Response(JSON.stringify({success:false,message:`Rejected credential ${secret}`})) }).drain();
  assert.equal(f.service.getTask(taskId).state,'failed');
  assert.equal(f.service.getTask(taskId).error.message.includes(secret),false);
  assert.equal((await fs.readFile(path.join(f.dataDir,'tasks/events.ndjson'),'utf8')).includes(secret),false);
});

test('headless startup leaves legacy pending tasks without an explicit execution owner untouched', async t => {
  const f = await fixture(t);
  const legacy = { taskId:'legacy-job',clientTaskId:'legacy-client',taskType:'image',input:{prompt:'Old unsubmitted request'},state:'pending',results:[],upstreamTaskIds:[],createdAt:new Date().toISOString() };
  await f.service.taskStore.append({eventId:'legacy-created',type:'task-created',task:legacy});
  assert.equal(await f.service.claimHeadless(),null);
  assert.deepEqual(f.service.getTask(legacy.taskId),legacy);
});
