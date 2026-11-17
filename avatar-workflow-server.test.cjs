const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('./server.cjs'), 'utf8');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createAgentService } = require('./agent-service.cjs');
const { createAvatarWorkflowService } = require('./avatar-workflow-service.cjs');
const prefix = '/api/control/v1/avatar-workflow';

async function mediaServer(t) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'avatar-stages-http-'));
  const agent = await createAgentService({ root: dir, dataDir: dir });
  const calls = [];
  const service = createAvatarWorkflowService({ root: dir, dataDir: dir, agentService: agent, autoStart: false,
    media: { subtitle: async input => { calls.push(input); return { url: prefix + '/media/result.srt' }; } } });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (await service.route(req, res, url.pathname, url)) return;
    if (await agent.route(req, res, url.pathname, url)) return;
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const session = await fetch(base + '/api/control/v1/session');
  const headers = { Cookie: session.headers.get('set-cookie').split(';')[0], Origin: base };
  t.after(async () => { await service.close(); await new Promise(resolve => server.close(resolve)); await fsp.rm(dir, { recursive: true, force: true }); });
  return { dir, service, calls, base, headers, agentHeaders: { Authorization: `Bearer ${agent.getAgentToken()}` } };
}

function uploadForm(name, type, body = 'media fixture') {
  const form = new FormData();
  form.append('file', new Blob([body], { type }), name);
  return form;
}

test('authenticated media upload supports audio/video and feeds only local subtitle processing', async t => {
  const { base, headers, agentHeaders, service, calls } = await mediaServer(t);
  for (const [name, type] of [['clip.mp4', 'video/mp4'], ['clip.mov', 'video/quicktime'], ['clip.webm', 'video/webm'], ['voice.wav', 'audio/wav']]) {
    const response = await fetch(base + prefix + '/media', { method: 'POST', headers, body: uploadForm(name, type) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.mimeType, type);
    assert.equal((await fetch(base + result.url)).status, 401);
    const content = await fetch(base + result.url, { headers });
    assert.equal(content.status, 200);
    assert.equal(content.headers.get('content-type'), type);
    assert.equal(await content.text(), 'media fixture');
    const submitted = await fetch(base + '/api/agent/v1/avatar-workflow/jobs', { method: 'POST',
      headers: { ...agentHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientTaskId: name, input: { operation: 'subtitle', mediaUrl: result.url } }) });
    assert.equal(submitted.status, 202);
    const { job } = await submitted.json();
    assert.equal(job.origin.type, 'agent');
    assert.equal((await service.run(job.id)).state, 'completed');
    assert.equal(calls.at(-1).mediaUrl, result.url);
  }
  assert.equal(calls.length, 4);
  const agentUpload = await fetch(base + '/api/agent/v1/avatar-workflow/media', { method: 'POST', headers: agentHeaders, body: uploadForm('a.mp3', 'audio/mpeg') });
  assert.equal(agentUpload.status, 200);
});

test('media upload rejects unauthenticated, cross-origin, unsupported and oversized files; audio stays strict', async t => {
  const { base, headers } = await mediaServer(t);
  assert.equal((await fetch(base + prefix + '/media', { method: 'POST', body: uploadForm('a.mp4', 'video/mp4') })).status, 401);
  assert.equal((await fetch(base + prefix + '/media', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: uploadForm('a.mp4', 'video/mp4') })).status, 403);
  for (const [name, type] of [['a.txt', 'text/plain'], ['a.mp4', 'text/html'], ['a.mp3', 'video/mp4'], ['a.png', 'image/png']]) {
    assert.equal((await fetch(base + prefix + '/media', { method: 'POST', headers, body: uploadForm(name, type) })).status, 400);
  }
  assert.equal((await fetch(base + prefix + '/audio', { method: 'POST', headers, body: uploadForm('a.mp4', 'video/mp4') })).status, 400);
  assert.equal((await fetch(base + prefix + '/audio', { method: 'POST', headers, body: uploadForm('a.mp3', 'audio/mpeg') })).status, 200);
  // Early length validation avoids allocating or transmitting a huge fixture.
  const oversized = await new Promise((resolve, reject) => {
    const req = http.request(base + prefix + '/media', { method: 'POST', headers: { ...headers,
      'Content-Type': 'multipart/form-data; boundary=fixture', 'Content-Length': 101 * 1024 * 1024 } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.flushHeaders();
  });
  assert.equal(oversized, 413);
});

test('media serving rejects encoded traversal, arbitrary files and symlink escapes', async t => {
  const { base, headers, dir } = await mediaServer(t);
  const mediaDir = path.join(dir, 'avatar-workflow', 'media');
  await fsp.mkdir(mediaDir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'secret.mp4'), 'private fixture');
  await fsp.writeFile(path.join(mediaDir, 'config.json'), 'private fixture');
  for (const name of ['%2e%2e%2fsecret.mp4', '%252e%252e%252fsecret.mp4', 'x%5c..%5csecret.mp4', 'config.json', 'x.mp4%3astream']) {
    const response = await fetch(base + prefix + '/media/' + name, { headers });
    assert.ok(response.status >= 400, name);
    assert.ok(!(await response.text()).includes('private fixture'));
  }
  const outside = path.join(dir, 'outside-media');
  await fsp.rename(mediaDir, outside);
  await fsp.writeFile(path.join(outside, 'linked.mp4'), 'private fixture');
  await fsp.symlink(outside, mediaDir, 'junction');
  const response = await fetch(base + prefix + '/media/linked.mp4', { headers });
  assert.ok(response.status >= 400);
  assert.ok(!(await response.text()).includes('private fixture'));
});

test('media serving rejects hard-linked files outside its owned media storage', async t => {
  const { base, headers, dir } = await mediaServer(t);
  const mediaDir = path.join(dir, 'avatar-workflow', 'media');
  await fsp.mkdir(mediaDir, { recursive: true });
  const outside = path.join(dir, 'private.mp4');
  await fsp.writeFile(outside, 'private hard-link fixture');
  await fsp.link(outside, path.join(mediaDir, 'linked.mp4'));
  const response = await fetch(base + prefix + '/media/linked.mp4', { headers });
  assert.ok(response.status >= 400);
  assert.ok(!(await response.text()).includes('private hard-link fixture'));
});

test('history bridge merges every legacy backup without creating array-shaped fake records', () => {
  const code = source.slice(source.indexOf('function historyRecordKey('), source.indexOf('function projectEventHistory('));
  const scope = vm.createContext({});
  vm.runInContext(code, scope);
  const records = scope.mergeHistoryRecords([{ id: 'new', createdAt: 3 }], [[{ id: 'old-a', createdAt: 2 }], [{ id: 'old-b', createdAt: 1 }]]);
  assert.deepEqual(JSON.parse(JSON.stringify(records)).map(x => x.id), ['new', 'old-a', 'old-b']);
  assert.ok(records.every(record => !Object.hasOwn(record, '0')));
});

test('RunningHub success response removes credential fields and echoed credential strings', () => {
  const start = source.indexOf('function scrubProviderResponse(');
  assert.ok(start >= 0);
  const end = source.indexOf('\nasync function handleRunningHubUpload(', start);
  const scope = vm.createContext({});
  vm.runInContext(source.slice(start, end), scope);
  const result = scope.scrubProviderResponse({ taskId: '123', nested: { apiKey: 'example-private', message: 'Bearer example-private' }, results: ['https://media.example/a.mp4'] }, 'example-private');
  assert.equal(JSON.stringify(result).includes('example-private'), false);
  assert.equal(result.taskId, '123');
  assert.equal(result.results[0], 'https://media.example/a.mp4');
});
