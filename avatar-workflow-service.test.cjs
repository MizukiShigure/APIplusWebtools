const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createAgentService } = require('./agent-service.cjs');
const { createAvatarWorkflowStore } = require('./avatar-workflow-store.cjs');
const { createAvatarWorkflowService } = require('./avatar-workflow-service.cjs');
const MEDIA_PREFIX = '/api/control/v1/avatar-workflow/media/';

async function fixture(t, overrides = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'avatar-integration-'));
  const store = createAvatarWorkflowStore({ dataDir });
  const events = [];
  let creates = 0;
  const media = {
    dependencies: async () => ({}),
    upload: async () => ({ url: 'https://assets.example/image.png' }),
    speech: async () => ({ url: 'https://assets.example/speech.mp3', mimeType: 'audio/mpeg' }),
    avatarCreate: async () => { creates++; return { taskId: 'remote-1' }; },
    avatarQuery: async () => ({ state: 'done', url: 'https://assets.example/video.mp4' }),
    ...overrides
  };
  const service = createAvatarWorkflowService({ dataDir, store, media, getGateway: () => 'https://gateway.example/api',
    root: dataDir, agentService: { historyStore: { append: async event => events.push(event) } },
    autoStart: false, pollMs: 1 });
  t.after(async () => { await service.close(); await fs.rm(dataDir, { recursive: true, force: true }); });
  await store.put('voices', { id: 'voice-1', name: 'Voice', voiceId: 'official-voice' }, { createOnly: true });
  return { dataDir, store, service, events, creates: () => creates };
}

test('speech-only jobs are idempotent and append shared history with source', async t => {
  const { service, events } = await fixture(t);
  const request = { clientTaskId: 'one', origin: { type: 'agent', id: 'codex', client: 'codex', label: 'Codex' },
    input: { text: 'A test sentence.', voiceId: 'voice-1', options: { avatar: { enabled: false } } } };
  const first = await service.submit(request, 'agent');
  assert.equal((await service.submit(request, 'agent')).id, first.id);
  await service.run(first.id);
  const job = await service.store.get('jobs', first.id);
  assert.equal(job.state, 'completed');
  assert.equal(events.length, 1);
  assert.equal(events[0].record.origin.client, 'codex');
  assert.equal(events[0].record.prompt, request.input.text);
  assert.equal(events[0].record.results[0].url, 'https://assets.example/speech.mp3');
  await service.run(first.id);
  assert.equal(events.length, 1);
});

test('restart resumes an existing remote task and never creates a second one', async t => {
  const { store, service, events, creates } = await fixture(t);
  await store.put('jobs', { id: 'resume-1', state: 'polling', stage: 'avatar',
    origin: { type: 'browser', id: 'b', label: 'Browser' },
    input: { text: 'test', options: { avatar: { enabled: true } } },
    snapshot: { apiBase: 'https://gateway.example/api', workflow: { provider: 'kling' } },
    steps: { speech: { url: 'https://assets.example/audio.mp3' }, avatar: { taskId: 'existing-id' } }
  }, { createOnly: true });
  await service.run('resume-1');
  assert.equal(creates(), 0);
  assert.equal((await store.get('jobs', 'resume-1')).state, 'completed');
  assert.ok(events.some(event => event.record.results[0].url.endsWith('video.mp4')));
});

test('ambiguous interrupted submission is not retried automatically', async t => {
  const { store, service, creates } = await fixture(t);
  await store.put('jobs', { id: 'unknown', state: 'submitting', stage: 'avatar',
    input: { options: { avatar: { enabled: true } } }, steps: {}, snapshot: {} }, { createOnly: true });
  await service.run('unknown');
  assert.equal(creates(), 0);
  assert.equal((await store.get('jobs', 'unknown')).state, 'submission-unknown');
});

test('changed input with reused clientTaskId conflicts instead of silently reusing a task', async t => {
  const { service } = await fixture(t);
  const body = { clientTaskId: 'same', input: { text: 'first', voiceId: 'voice-1', options: { avatar: { enabled: false } } } };
  await service.submit(body, 'agent');
  await assert.rejects(service.submit({ ...body, input: { ...body.input, text: 'different' } }, 'agent'), { status: 409 });
});

test('invalid references are rejected before any paid request', async t => {
  const { service, creates } = await fixture(t);
  await assert.rejects(service.submit({ input: { text: 'test', voiceId: 'missing' } }, 'agent'), { status: 400 });
  assert.equal(creates(), 0);
});

test('restart publishes saved audio-adjustment and subtitle results without rerunning processors', async t => {
  const { store, service, events } = await fixture(t);
  await store.put('jobs', { id: 'publish-recovery', state: 'running', stage: 'subtitle',
    origin: { type: 'browser', id: 'b' }, input: { text: 'Saved text', options: { avatar: { enabled: false }, adjustAudio: { enabled: true }, subtitle: { enabled: true } } },
    snapshot: { apiBase: 'https://gateway.example/api' },
    steps: { speech: { url: 'https://example.com/original.mp3', supplied: true },
      adjustAudio: { url: '/api/control/v1/avatar-workflow/media/adjusted.mp3' },
      subtitle: { url: '/api/control/v1/avatar-workflow/media/subtitles.srt' } }
  }, { createOnly: true });
  await service.run('publish-recovery');
  assert.equal((await store.get('jobs', 'publish-recovery')).state, 'completed');
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => event.record.mediaType), ['audio', 'other']);
});

test('subtitles use the existing audio and do not download the generated video', async t => {
  let source;
  const { store, service } = await fixture(t, { subtitle: async input => { source = input.mediaUrl; return { url: '/api/control/v1/avatar-workflow/media/test.srt' }; } });
  await store.put('jobs', { id: 'subtitle-audio', state: 'running', stage: 'subtitle',
    input: { text: 'Saved text', options: { avatar: { enabled: true }, subtitle: { enabled: true } } },
    snapshot: { apiBase: 'https://gateway.example/api', workflow: { provider: 'kling' } },
    steps: { speech: { url: 'https://example.com/speech.mp3', supplied: true }, avatar: { url: 'https://example.com/video.mp4', historySaved: true } }
  }, { createOnly: true });
  await service.run('subtitle-audio');
  assert.equal(source, 'https://example.com/speech.mp3');
  assert.equal((await store.get('jobs', 'subtitle-audio')).state, 'completed');
});

test('authenticated routes share data, redact keys, reject Agent edits and cross-origin writes', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'avatar-route-'));
  const agent = await createAgentService({ root: dir, dataDir: dir });
  const service = createAvatarWorkflowService({ root: dir, dataDir: dir, agentService: agent, autoStart: false,
    media: { dependencies: async () => ({}) } });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (await service.route(req, res, url.pathname, url)) return;
    if (await agent.route(req, res, url.pathname, url)) return;
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await service.close(); await new Promise(resolve => server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
  const unauth = await fetch(base + '/api/control/v1/avatar-workflow/library');
  assert.equal(unauth.status, 401);
  const session = await fetch(base + '/api/control/v1/session');
  const cookie = session.headers.get('set-cookie').split(';')[0];
  const browserHeaders = { Cookie: cookie, 'Content-Type': 'application/json', Origin: base };
  const agentHeaders = { Authorization: `Bearer ${agent.getAgentToken()}`, 'Content-Type': 'application/json' };
  const url = '/api/control/v1/avatar-workflow/library/workflows';
  const created = await fetch(base + url, { method: 'POST', headers: browserHeaders,
    body: JSON.stringify({ item: { id: 'shared-rh', name: 'Shared workflow', webappId: '12345', apiKey: 'example-private-key', nodeInfoList: [] } }) });
  assert.equal(created.status, 200);
  const saved = await created.json();
  assert.equal(saved.item.hasApiKey, true);
  const library = await fetch(base + '/api/agent/v1/avatar-workflow/library', { headers: agentHeaders });
  const text = await library.text();
  assert.equal(text.includes('example-private-key'), false);
  assert.equal(JSON.parse(text).workflows[0].id, 'shared-rh');
  const overwrite = await fetch(base + '/api/agent/v1/avatar-workflow/library/workflows', { method: 'POST', headers: agentHeaders,
    body: JSON.stringify({ item: { id: 'shared-rh', name: 'Overwritten' }, expectedVersion: saved.item.version }) });
  assert.equal(overwrite.status, 409);
  const deletion = await fetch(base + '/api/agent/v1/avatar-workflow/library/workflows/shared-rh', { method: 'DELETE', headers: agentHeaders,
    body: JSON.stringify({ expectedVersion: saved.item.version }) });
  assert.equal(deletion.status, 403);
  const foreign = await fetch(base + url, { method: 'POST', headers: { ...browserHeaders, Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(foreign.status, 403);
  const changed = await fetch(base + url, { method: 'POST', headers: browserHeaders,
    body: JSON.stringify({ item: { ...saved.item, name: 'Manual edit' }, expectedVersion: saved.item.version }) });
  assert.equal(changed.status, 200);
  const stale = await fetch(base + url, { method: 'POST', headers: browserHeaders,
    body: JSON.stringify({ item: { ...saved.item, name: 'Stale browser' }, expectedVersion: saved.item.version }) });
  assert.equal(stale.status, 409);
  assert.equal(await service.resolveCredential('@shared:shared-rh'), 'example-private-key');
});

async function independentFixture(t) {
  const calls = [];
  const overrides = Object.fromEntries(['speech', 'speechQuery', 'upload', 'avatarCreate', 'avatarQuery', 'adjustAudio', 'subtitle'].map(stage => [stage, async input => {
    calls.push({ stage, input });
    if (stage === 'avatarCreate') return { taskId: 'independent-remote' };
    if (stage.endsWith('Query')) return { state: 'done', url: `https://assets.example/result.${stage === 'speechQuery' ? 'mp3' : 'mp4'}` };
    return { url: `https://assets.example/${stage}.${stage === 'subtitle' ? 'srt' : stage === 'upload' ? 'png' : 'mp3'}` };
  }]));
  const result = await fixture(t, overrides);
  const image = await result.store.saveImage({ buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA2kAAAAASUVORK5CYII=', 'base64'), name: 'portrait.png', mimeType: 'image/png' });
  const get = result.store.get;
  const readImage = result.store.readImage;
  result.store.get = (collection, id, options) => get(collection, collection === 'images' && id === 'image-1' ? image.id : id, options);
  result.store.readImage = id => readImage(id === 'image-1' ? image.id : id);
  return { ...result, calls };
}

for (const operation of ['speech', 'adjustAudio', 'avatar', 'subtitle']) {
  test(`independent ${operation} executes and publishes only its selected stage`, async t => {
    const { service, calls, events } = await independentFixture(t);
    const input = { operation, text: 'Original transcript', voiceId: 'voice-1', imageId: 'image-1',
      audioUrl: 'https://assets.example/selected.wav', mediaUrl: 'https://assets.example/selected.mp4',
      options: { speech: {}, adjustAudio: { enabled: true }, avatar: { enabled: true }, subtitle: { enabled: true } } };
    const request = { clientTaskId: `stage-${operation}`, origin: { id: 'codex', client: 'codex' }, input };
    const [job, duplicate] = await Promise.all([service.submit(request, 'agent'), service.submit(request, 'agent')]);
    assert.equal(job.id, duplicate.id);
    const [done] = await Promise.all([service.run(job.id), service.run(job.id)]);
    assert.equal(done.state, 'completed', done.error);
    assert.deepEqual(calls.map(call => call.stage), operation === 'avatar' ? ['upload', 'avatarCreate', 'avatarQuery'] : [operation]);
    assert.deepEqual(Object.keys(done.steps).filter(stage => stage !== 'image'), [operation]);
    assert.equal(events.length, 1);
    const record = events[0].record;
    assert.equal(record.operation, operation);
    assert.equal(record.inputSnapshot.operation, operation);
    assert.equal(record.origin.type, 'agent');
    if (operation !== 'speech') {
      const source = operation === 'subtitle' ? input.mediaUrl : input.audioUrl;
      assert.ok(record.refs.some(ref => ref.url === source && ref.type === (operation === 'subtitle' ? 'video' : 'audio')));
    }
    if (operation === 'subtitle' || operation === 'adjustAudio') assert.doesNotMatch(record.model, /kling/i);
    if (operation === 'subtitle') {
      assert.equal(calls[0].input.mediaUrl, input.mediaUrl);
      assert.equal(calls[0].input.transcript, input.text);
      assert.equal(record.text, input.text);
    }
    await service.run(job.id);
    assert.equal(events.length, 1);
  });

  test(`independent ${operation} ignores malformed unrelated fields`, async t => {
    const { service, calls } = await independentFixture(t);
    const relevant = {
      speech: { text: 'Speak', voiceId: 'voice-1' },
      adjustAudio: { audioUrl: 'https://assets.example/a.wav' },
      avatar: { audioUrl: 'https://assets.example/a.wav', imageId: 'image-1', workflowId: '', prompt: 'Smile' },
      subtitle: { mediaUrl: 'https://assets.example/a.webm', text: '' }
    }[operation];
    const input = { operation, text: 'x'.repeat(50001), prompt: 'x'.repeat(20001), voiceId: { invalid: true },
      imageId: ['bad'], workflowId: { invalid: true }, audioUrl: { invalid: true }, mediaUrl: ['bad'],
      options: { speech: 'bad', adjustAudio: ['bad'], avatar: 'bad', subtitle: 'bad', [operation]: {} }, ...relevant };
    const job = await service.submit({ input, ...(operation === 'subtitle' || operation === 'adjustAudio' ? { apiBase: 'not-a-url' } : {}) });
    const done = await service.run(job.id);
    assert.equal(done.state, 'completed', done.error);
    assert.equal(calls.filter(call => call.stage === operation || call.stage === 'avatarCreate').length, 1);
  });
}

test('independent validation rejects unknown operations and missing selected inputs without creating jobs', async t => {
  const { service, calls, store } = await independentFixture(t);
  for (const input of [
    { operation: 'unknown', text: 'test', voiceId: 'voice-1' }, { operation: '', text: 'test', voiceId: 'voice-1' },
    { operation: 'speech', voiceId: 'voice-1' }, { operation: 'speech', text: 'test', audioUrl: 'https://assets.example/a.mp3' },
    { operation: 'adjustAudio', options: { adjustAudio: {} } }, { operation: 'adjustAudio', audioUrl: 'https://assets.example/a.mp3' },
    { operation: 'avatar', audioUrl: 'https://assets.example/a.mp3' }, { operation: 'avatar', imageId: 'image-1' },
    { operation: 'subtitle' }, { operation: 'subtitle', mediaUrl: 'file:///secret.mp4' },
    { operation: 'subtitle', mediaUrl: MEDIA_PREFIX + '%2e%2e%2fsecret.mp4' },
    { operation: 'subtitle', mediaUrl: 'https://assets.example/a.mp4', options: { subtitle: [] } }
  ]) await assert.rejects(service.submit({ input }), { status: 400 }, JSON.stringify(input));
  assert.equal((await store.list('jobs')).length, 0);
  assert.equal(calls.length, 0);
});

test('independent local operations retain local inputs and subtitle accepts audioUrl alias', async t => {
  const { service, calls, events } = await independentFixture(t);
  const audioUrl = MEDIA_PREFIX + 'selected.wav';
  for (const operation of ['adjustAudio', 'subtitle']) {
    const job = await service.submit({ input: { operation, audioUrl, text: 'Original', options: { [operation]: {} } } });
    assert.equal((await service.run(job.id)).state, 'completed');
  }
  assert.deepEqual(calls.map(call => call.stage), ['adjustAudio', 'subtitle']);
  assert.equal(calls[0].input.audioUrl, audioUrl);
  assert.equal(calls[1].input.mediaUrl, audioUrl);
  assert.ok(events.every(event => event.record.refs.some(ref => ref.url === audioUrl && ref.type === 'audio')));
});

test('independent asynchronous recovery polls saved IDs and preserves submission uncertainty', async t => {
  const { service, store, calls, events } = await independentFixture(t);
  for (const operation of ['speech', 'avatar']) {
    const job = await store.put('jobs', { id: `resume-${operation}`, state: 'polling', stage: operation,
      input: { operation, audioUrl: 'https://assets.example/a.mp3', options: { avatar: { enabled: true }, subtitle: { enabled: true } } },
      snapshot: { apiBase: 'https://gateway.example/api', workflow: { provider: 'kling' } },
      steps: { [operation]: { taskId: `saved-${operation}` } } }, { createOnly: true });
    assert.equal((await service.run(job.id)).state, 'completed');
  }
  assert.deepEqual(calls.map(call => call.stage), ['speechQuery', 'avatarQuery']);
  assert.equal(events.length, 2);
  await store.put('jobs', { id: 'independent-unknown', state: 'submitting', stage: 'speech',
    input: { operation: 'speech' }, steps: {}, snapshot: {} }, { createOnly: true });
  assert.equal((await service.run('independent-unknown')).state, 'submission-unknown');
  assert.equal(calls.length, 2);
});

test('independent subtitle history keeps extensionless video type and trusts known audio containers', async t => {
  const { service, events } = await independentFixture(t);
  for (const [mediaUrl, expected] of [['https://assets.example/stream?id=1', 'video'], ['https://assets.example/voice.wav', 'audio']]) {
    const job = await service.submit({ input: { operation: 'subtitle', mediaUrl, mediaType: 'video', text: 'Transcript' } });
    assert.equal((await service.run(job.id)).state, 'completed');
    assert.equal(events.at(-1).record.refs[0].type, expected);
    assert.equal(events.at(-1).record.refs[0].text, 'Transcript');
  }
});

test('independent saved local results publish once without rerunning or publishing unrelated saved stages', async t => {
  const { service, store, events, calls } = await independentFixture(t);
  for (const operation of ['adjustAudio', 'subtitle']) {
    const job = await store.put('jobs', { id: `saved-${operation}`, state: 'running', stage: operation,
      input: { operation, audioUrl: 'https://assets.example/selected.wav', options: {} }, snapshot: {},
      steps: { speech: { url: 'https://assets.example/unrelated.mp3' },
        [operation]: { url: MEDIA_PREFIX + (operation === 'subtitle' ? 'saved.srt' : 'saved.mp3') } } }, { createOnly: true });
    assert.equal((await service.run(job.id)).state, 'completed');
    await service.run(job.id);
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(events.map(event => event.record.operation), ['adjustAudio', 'subtitle']);
});

test('independent changed operation conflicts and ambiguous paid submissions are never repeated', async t => {
  let attempts = 0;
  const { service, events } = await fixture(t, { speech: async () => { attempts++; throw new Error('Connection interrupted'); } });
  const request = { clientTaskId: 'uncertain-speech', input: { operation: 'speech', text: 'Hello', voiceId: 'voice-1' } };
  const job = await service.submit(request);
  await assert.rejects(service.submit({ ...request, input: { operation: 'subtitle', mediaUrl: 'https://assets.example/a.mp4' } }), { status: 409 });
  assert.equal((await service.run(job.id)).state, 'submission-unknown');
  assert.equal((await service.submit(request)).id, job.id);
  await service.run(job.id);
  assert.equal(attempts, 1);
  assert.equal(events.length, 0);
});

test('independent manual handoff preserves sourceJobId in history without looking up the source', async t => {
  const { service, store, events, calls } = await independentFixture(t);
  const sourceJobId = 'source-job-not-in-this-registry';
  const get = store.get;
  t.mock.method(store, 'get', (collection, id, options) => {
    assert.notEqual(id, sourceJobId, 'Provenance must not trigger a source lookup');
    return get(collection, id, options);
  });
  const request = { clientTaskId: 'manual-handoff', input: { operation: 'subtitle',
    mediaUrl: 'https://assets.example/selected.mp4', text: 'Original transcript',
    sourceJobId: `  ${sourceJobId}  `, apiKey: 'example-input-key' } };
  const job = await service.submit(request);
  assert.equal(job.input.sourceJobId, sourceJobId);
  assert.equal((await service.submit(request)).id, job.id);
  assert.equal((await service.run(job.id)).state, 'completed');
  assert.equal((await store.get('jobs', job.id)).input.sourceJobId, sourceJobId);
  assert.equal(events[0].record.inputSnapshot.sourceJobId, sourceJobId);
  assert.equal(events[0].record.inputSnapshot.text, 'Original transcript');
  assert.equal(JSON.stringify(events).includes('example-input-key'), false);
  assert.ok(calls.every(call => !Object.hasOwn(call.input, 'sourceJobId')));
});

test('independent sourceJobId is an optional bounded string, not a credential-bearing object', async t => {
  const { service, store, calls } = await independentFixture(t);
  const input = { operation: 'subtitle', mediaUrl: 'https://assets.example/selected.mp4' };
  for (const sourceJobId of ['x'.repeat(257), null, 42, [], { id: 'source', apiKey: 'example-source-key' }, 'source\0job']) {
    await assert.rejects(service.submit({ input: { ...input, sourceJobId } }), { status: 400 });
  }
  assert.equal((await store.list('jobs')).length, 0);
  const boundary = await service.submit({ input: { ...input, sourceJobId: 'x'.repeat(256) } });
  assert.equal(boundary.input.sourceJobId.length, 256);
  const missing = await service.submit({ input });
  assert.equal(Object.hasOwn(missing.input, 'sourceJobId'), false);
  const empty = await service.submit({ input: { ...input, sourceJobId: '' } });
  assert.equal(empty.input.sourceJobId, '');
  assert.equal(calls.length, 0);
});
