const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createAvatarWorkflowStore } = require('./avatar-workflow-store.cjs');
const { createAvatarWorkflowMedia, localMediaName, validateMediaResource, readLocalMedia, saveLocalMedia,
  MEDIA_TYPES: MIME, MAX_MEDIA } = require('./avatar-workflow-media.cjs');
const { validateLoopbackHost, normalizeOrigin } = require('./agent-service.cjs');
const { normalizeRunningHubApiKey } = require('./runninghub-auth.cjs');

const PREFIX = '/api/control/v1/avatar-workflow';
const AGENT_PREFIX = '/api/agent/v1/avatar-workflow';
const TERMINAL = new Set(['completed', 'failed', 'partial', 'submission-unknown']);
const LIBRARIES = new Set(['voices', 'workflows', 'images', 'settings']);
const OPERATIONS = new Set(['speech', 'adjustAudio', 'avatar', 'subtitle']);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const clone = value => JSON.parse(JSON.stringify(value));

function publicValue(value) {
  if (Array.isArray(value)) return value.map(publicValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(api[_-]?key|authorization|token|secret|password|raw)$/i.test(key))
    .map(([key, child]) => [key, publicValue(child)]));
}
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req, limit = 4 * 1024 * 1024) {
  if (Number(req.headers['content-length']) > limit) throw fail('Request body too large', 413);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw fail('Request body too large', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readJson(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fail('JSON required', 415);
  try { return JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
  catch (error) { if (error.status) throw error; throw fail('Invalid JSON'); }
}
async function readFileUpload(req, limit) {
  const type = req.headers['content-type'] || '';
  if (!/^multipart\/form-data;/i.test(type)) throw fail('Multipart file required', 415);
  const buffer = await readBody(req, limit + 64 * 1024);
  let form;
  try { form = await new Request('http://localhost/upload', { method: 'POST', headers: { 'Content-Type': type }, body: buffer }).formData(); }
  catch { throw fail('Invalid multipart body'); }
  const file = form.get('file') || form.get('image');
  if (file?.size > limit) throw fail('File too large', 413);
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) throw fail('Invalid file size');
  let origin;
  try { origin = JSON.parse(form.get('origin') || '{}'); } catch { throw fail('Invalid upload origin'); }
  return { buffer: Buffer.from(await file.arrayBuffer()), name: path.basename(file.name || 'upload'), mimeType: file.type, origin };
}

function operationInput(input) {
  const operation = input.operation;
  if (!OPERATIONS.has(operation)) throw fail('Unknown operation');
  const string = (value, label, max, required = true) => {
    if (value === undefined && !required) return '';
    if (typeof value !== 'string' || value.length > max || /\0/.test(value) || (required && !value.trim())) throw fail(`Invalid ${label}`);
    return value.trim();
  };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (input.options !== undefined && !object(input.options)) throw fail('Invalid options');
  const selected = input.options?.[operation];
  if ((selected !== undefined || operation === 'adjustAudio') && !object(selected)) throw fail(`Invalid options.${operation}`);
  const result = { operation, options: { [operation]: { ...selected, ...(operation === 'speech' ? {} : { enabled: true }) } } };
  if (input.sourceJobId !== undefined) result.sourceJobId = string(input.sourceJobId, 'sourceJobId', 256, false);
  result.text = operation === 'speech' || operation === 'subtitle' ? string(input.text, 'text', 50000, operation === 'speech')
    : typeof input.text === 'string' && input.text.length <= 50000 ? input.text.trim() : '';
  result.prompt = operation === 'avatar' ? string(input.prompt, 'prompt', 20000, false) : '';
  if (operation === 'speech') result.voiceId = string(input.voiceId, 'saved voice', 256);
  if (operation === 'avatar') {
    result.imageId = string(input.imageId, 'album image', 256);
    result.workflowId = string(input.workflowId, 'workflow', 256, false);
  }
  if (operation !== 'speech') {
    const field = operation === 'subtitle' ? 'mediaUrl' : 'audioUrl';
    result[field] = string(operation === 'subtitle' ? input.mediaUrl || input.audioUrl : input.audioUrl, field, 8192);
    try { validateMediaResource(result[field]); } catch { throw fail(`Invalid ${field}`); }
    const mimeType = MIME[path.extname(new URL(result[field], 'http://localhost').pathname).toLowerCase()];
    if (mimeType && !(operation === 'subtitle' ? /^(audio|video)\// : /^audio\//).test(mimeType)) throw fail(`Invalid ${field} media type`);
    if (operation === 'subtitle' && ['audio', 'video'].includes(input.mediaType)) result.mediaType = input.mediaType;
  }
  if (operation === 'speech' || operation === 'avatar') {
    if (input.apiBase !== undefined) result.apiBase = input.apiBase;
  }
  return result;
}

function createAvatarWorkflowService({ root = __dirname, dataDir, agentService, store, media, getGateway, env = process.env,
  autoStart = true, pollMs = 5000, pollTimeoutMs = 60 * 60 * 1000 } = {}) {
  store ||= createAvatarWorkflowStore({ dataDir });
  media ||= createAvatarWorkflowMedia({ dataDir, env });
  const active = new Map();
  let submissionQueue = Promise.resolve();
  let closed = false;
  let wakeTimer;

  async function saveJob(job, patch) {
    return store.put('jobs', { ...job, ...patch }, { expectedVersion: job.version });
  }
  async function library() {
    const result = { success: true };
    for (const collection of LIBRARIES) result[collection] = await store.list(collection);
    return result;
  }
  async function workflowSecret(id) {
    if (!id || id === 'kling') return { provider: 'kling', name: 'Kling' };
    const workflow = await store.get('workflows', id, { secrets: true });
    if (!workflow) throw fail('Workflow no longer exists');
    if (!workflow.apiKey) {
      const settings = await store.get('settings', 'runninghub', { secrets: true });
      workflow.apiKey = settings?.apiKey || '';
    }
    return workflow;
  }
  async function resolveCredential(reference) {
    const text = String(reference || '').trim();
    if (!text.startsWith('@shared:')) return normalizeRunningHubApiKey(text);
    const id = text.slice('@shared:'.length);
    const workflow = id === 'global' ? await store.get('settings', 'runninghub', { secrets: true }) : await workflowSecret(id);
    const key = normalizeRunningHubApiKey(workflow?.apiKey);
    if (!key) throw fail('RunningHub API Key is not configured');
    return key;
  }
  function enqueueSubmit(body, caller) {
    const promise = submissionQueue.then(() => submitOnce(body, caller));
    submissionQueue = promise.catch(() => {});
    return promise;
  }
  async function submitOnce(body, caller = 'browser') {
    let input = publicValue(body?.input || {});
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Input required');
    if (input.operation !== undefined) input = operationInput(input);
    else {
      input.text = String(input.text || '').trim();
      input.prompt = String(input.prompt || '').trim();
      if (input.text.length > 50000 || input.prompt.length > 20000) throw fail('Text is too long');
      input.options ||= {};
      if (!input.text && !input.audioUrl) throw fail('Text or audio is required');
    }
    const operation = input.operation;
    const clientTaskId = String(body.clientTaskId || crypto.randomUUID()).slice(0, 160);
    const origin = normalizeOrigin({ ...body.origin, type: caller === 'agent' ? 'agent' : 'browser' });
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = (await store.list('jobs')).find(job => job.clientTaskId === clientTaskId && job.origin?.id === origin.id);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw fail('clientTaskId already belongs to different input', 409);
      return existing;
    }
    const voice = input.voiceId ? await store.get('voices', input.voiceId, { secrets: true }) : null;
    if ((!operation || operation === 'speech') && !input.audioUrl && !voice?.voiceId) throw fail('Select a saved voice');
    const wantsAvatar = operation ? operation === 'avatar' : input.options.avatar?.enabled !== false && Boolean(input.imageId || input.workflowId);
    const image = input.imageId ? await store.get('images', input.imageId) : null;
    if (wantsAvatar && !image) throw fail('Select an album image');
    const workflow = wantsAvatar ? await workflowSecret(input.workflowId) : null;
    if (workflow?.workflowType && workflow.workflowType !== 'avatar') throw fail('This workflow is not configured for digital-human generation');
    const localOnly = operation === 'adjustAudio' || operation === 'subtitle';
    const apiBase = localOnly ? '' : require('./gateway-config.cjs').requireGateway(body.apiBase || input.apiBase || getGateway?.() || env.API_PLUS_GATEWAY_BASE || env.API_GATEWAY_BASE);
    if (!localOnly && !/^https?:\/\//i.test(apiBase)) throw fail('Invalid API base');
    if (input.audioUrl && !/^https?:\/\//i.test(input.audioUrl) && !input.audioUrl.startsWith(`${PREFIX}/media/`)) throw fail('Invalid audio URL');
    if (!operation) input.options.avatar = { ...input.options.avatar, enabled: wantsAvatar };
    const job = await store.put('jobs', { id: `avatar-${crypto.randomUUID()}`, clientTaskId, fingerprint, origin,
      state: 'pending', stage: 'pending', input, steps: {},
      snapshot: { apiBase, voice: publicValue(voice), image, workflow: publicValue(workflow) }
    }, { createOnly: true });
    if (autoStart) schedule();
    return job;
  }
  async function publish(job, stage, result, mediaType) {
    if (!result?.url || job.steps?.[stage]?.historySaved) return job;
    const recordId = `${job.id}:${stage}`;
    const image = job.snapshot?.image;
    const voice = job.snapshot?.voice;
    const workflow = job.snapshot?.workflow;
    const localStage = stage === 'adjustAudio' || stage === 'subtitle';
    const model = stage === 'speech' ? (job.input.options?.speech?.model || 'speech-2.8-hd')
      : stage === 'adjustAudio' ? 'Local FFmpeg' : stage === 'subtitle' ? 'Local subtitles' : (workflow?.name || workflow?.title || 'Kling');
    const modelVersion = stage === 'speech' ? model : stage === 'adjustAudio' ? 'ffmpeg'
      : stage === 'subtitle' ? `whisper-${job.input.options?.subtitle?.model || 'base'}` : (workflow?.webappId || 'kling');
    const sourceUrl = job.input.operation ? (stage === 'subtitle' ? job.input.mediaUrl || job.input.audioUrl : stage === 'speech' ? '' : job.input.audioUrl)
      : (stage !== 'adjustAudio' && job.steps.adjustAudio?.url) || job.steps.speech?.url;
    const sourceMime = sourceUrl ? MIME[path.extname(new URL(sourceUrl, 'http://localhost').pathname).toLowerCase()] : '';
    const sourceType = sourceMime ? sourceMime.startsWith('video/') ? 'video' : 'audio'
      : stage === 'subtitle' && job.input.mediaType === 'video' ? 'video' : 'audio';
    const refs = [...(image ? [{ ...image, type: 'image' }] : []), ...(sourceUrl ? [{ url: sourceUrl, type: sourceType,
      mimeType: sourceMime || `${sourceType}/*`, name: sourceType === 'video' ? 'Video' : voice?.name || 'Audio', text: job.input.text || '' }] : [])];
    const record = { id: recordId, recordId, kind: 'generation', mediaType, page: 'avatarWorkflow',
      createdAt: Date.now(), origin: job.origin, executedBy: { type: 'server', client: 'api-workbench', id: 'local-service' },
      taskId: result.taskId || job.steps.avatar?.taskId || job.id,
      prompt: job.input.text || job.input.prompt, text: job.input.text, avatarPrompt: job.input.prompt,
      operation: job.input.operation, voiceId: voice?.voiceId || '', voiceName: voice?.name || '',
      workflowId: localStage ? '' : job.input.workflowId || (stage === 'avatar' ? 'kling' : ''),
      model, modelVersion, version: modelVersion,
      images: image ? [{ ...image, type: 'image' }] : [], referenceAssets: refs, refs,
      params: publicValue(job.input.options || {}), inputSnapshot: publicValue(job.input),
      workflowJobId: job.id, results: [{ url: result.url, mimeType: result.mimeType || `${mediaType}/*`, kind: mediaType }] };
    await agentService.historyStore.append({ eventId: `history-created:${recordId}`, type: 'record-created', record });
    return saveJob(job, { steps: { ...job.steps, [stage]: { ...result, historySaved: true } } });
  }
  async function externalAsset(url, apiBase) {
    if (!localMediaName(url)) return url;
    const result = await media.upload({ apiBase, ...await readLocalMedia(dataDir, url) });
    if (!result.url) throw fail('Asset upload returned no URL', 502);
    return result.url;
  }
  async function poll(job, stage, query) {
    const started = job.steps[stage].submittedAt || Date.now();
    while (!closed) {
      let result;
      try { result = await query(); }
      catch (error) {
        if ((error.status && error.status < 500 && error.status !== 429) || Date.now() - started > pollTimeoutMs) throw error;
        await new Promise(resolve => setTimeout(resolve, pollMs));
        continue;
      }
      if (result.state === 'failed') throw fail(result.error || 'Remote task failed', 502);
      if (result.state === 'done' && result.url) {
        return saveJob(job, { state: 'running', steps: { ...job.steps, [stage]: { ...job.steps[stage], ...publicValue(result) } } });
      }
      if (Date.now() - started > pollTimeoutMs) throw fail('Remote task polling timed out; task ID is retained', 504);
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    return job;
  }
  async function runJob(id) {
    let job = await store.get('jobs', id, { secrets: true });
    if (!job || TERMINAL.has(job.state)) return job;
    if (job.state === 'submitting' && !job.steps?.[job.stage]?.taskId && !job.steps?.[job.stage]?.url) {
      return saveJob(job, { state: 'submission-unknown', error: 'Interrupted during submission. No repeat request was sent; verify with the provider.' });
    }
    const options = job.input.options || {};
    const operation = job.input.operation;
    const enabled = stage => operation ? operation === stage : Boolean(options[stage]?.enabled);
    const apiBase = job.snapshot.apiBase;
    let privateKey = '';
    try {
      if (!operation || operation === 'speech') {
        if (!job.steps.speech?.url && !job.steps.speech?.taskId) {
          if (!operation && job.input.audioUrl) {
            job = await saveJob(job, { state: 'running', stage: 'speech', steps: { ...job.steps, speech: { url: job.input.audioUrl, mimeType: 'audio/mpeg', supplied: true } } });
          } else {
            job = await saveJob(job, { state: 'submitting', stage: 'speech' });
            const result = await media.speech({ apiBase, text: job.input.text, voice: job.snapshot.voice, options: options.speech || {} });
            if (!result.url && !result.taskId) throw new Error('Speech submission returned neither URL nor task ID');
            job = await saveJob(job, { state: result.url ? 'running' : 'polling', steps: { ...job.steps, speech: { ...publicValue(result), submittedAt: Date.now() } } });
          }
        }
        if (!job.steps.speech.url && job.steps.speech.taskId) {
          if (!media.speechQuery) throw fail('Speech query is unavailable; task ID was retained', 502);
          job = await poll(job, 'speech', () => media.speechQuery({ apiBase, taskId: job.steps.speech.taskId, options: options.speech }));
        }
        if (closed) return job;
        if (!job.steps.speech.supplied) job = await publish(job, 'speech', job.steps.speech, 'audio');
      }
      const tools = operation === 'speech' ? {} : await store.get('settings', 'dependencies', { secrets: true }) || {};
      if (enabled('adjustAudio') && !job.steps.adjustAudio?.url) {
        job = await saveJob(job, { state: 'running', stage: 'adjustAudio' });
        const result = await media.adjustAudio({ audioUrl: operation ? job.input.audioUrl : job.steps.speech.url, options: options.adjustAudio, tools });
        job = await saveJob(job, { steps: { ...job.steps, adjustAudio: publicValue(result) } });
      }
      if ((!operation || enabled('adjustAudio')) && job.steps.adjustAudio?.url) job = await publish(job, 'adjustAudio', job.steps.adjustAudio, 'audio');
      if (enabled('avatar')) {
        const workflow = { ...job.snapshot.workflow };
        if (job.input.workflowId && job.input.workflowId !== 'kling') {
          workflow.apiKey = (await workflowSecret(job.input.workflowId)).apiKey;
          privateKey = workflow.apiKey || '';
        }
        if (!job.steps.avatar?.taskId && !job.steps.avatar?.url) {
          job = await saveJob(job, { state: 'running', stage: 'uploading' });
          let imageUrl = job.steps.image?.url;
          if (!imageUrl) {
            const image = await store.readImage(job.input.imageId);
            const uploaded = await media.upload({ apiBase, ...image });
            imageUrl = uploaded.url;
            if (!imageUrl) throw fail('Image upload returned no URL', 502);
            job = await saveJob(job, { steps: { ...job.steps, image: { url: imageUrl } } });
          }
          const audioUrl = await externalAsset(operation ? job.input.audioUrl : job.steps.adjustAudio?.url || job.steps.speech.url, apiBase);
          job = await saveJob(job, { state: 'submitting', stage: 'avatar' });
          const result = await media.avatarCreate({ apiBase, imageUrl, audioUrl, prompt: job.input.prompt, workflow, tools,
            options: { width: job.snapshot.image?.width, height: job.snapshot.image?.height, ...options.avatar } });
          if (!result.url && !result.taskId) throw new Error('Avatar submission returned neither URL nor task ID');
          job = await saveJob(job, { state: result.url ? 'running' : 'polling', steps: { ...job.steps, avatar: { ...publicValue(result), submittedAt: Date.now() } } });
        }
        if (!job.steps.avatar.url) job = await poll(job, 'avatar', () => media.avatarQuery({ apiBase, taskId: job.steps.avatar.taskId, workflow }));
        if (closed) return job;
        job = await publish(job, 'avatar', job.steps.avatar, 'video');
      }
      if (enabled('subtitle') && !job.steps.subtitle?.url) {
        job = await saveJob(job, { state: 'running', stage: 'subtitle' });
        const result = await media.subtitle({ mediaUrl: operation ? job.input.mediaUrl || job.input.audioUrl : job.steps.adjustAudio?.url || job.steps.speech.url,
          transcript: job.input.text, options: options.subtitle, tools });
        job = await saveJob(job, { steps: { ...job.steps, subtitle: publicValue(result) } });
      }
      if ((!operation || enabled('subtitle')) && job.steps.subtitle?.url) job = await publish(job, 'subtitle', job.steps.subtitle, 'other');
      return saveJob(job, { state: 'completed', stage: 'completed', completedAt: new Date().toISOString(), error: '' });
    } catch (error) {
      let message = String(error.message || 'Workflow failed');
      if (privateKey) message = message.split(privateKey).join('[redacted]');
      const ambiguous = job.state === 'submitting' && (!error.status || error.status >= 500);
      return saveJob(job, { state: ambiguous ? 'submission-unknown' : (job.steps.avatar?.url ? 'partial' : 'failed'), error: message.slice(0, 1200) });
    }
  }
  function run(id) {
    if (active.has(id)) return active.get(id);
    const promise = runJob(id).finally(() => { active.delete(id); if (autoStart) schedule(); });
    active.set(id, promise);
    return promise;
  }
  function schedule() {
    if (closed || wakeTimer) return;
    wakeTimer = setTimeout(async () => {
      wakeTimer = null;
      try {
        for (const job of await store.list('jobs')) {
          if (closed || active.size >= 2) break;
          if (!active.has(job.id) && !TERMINAL.has(job.state)) run(job.id).catch(error => console.error('Avatar workflow persistence failed:', error.code || error.name));
        }
      } catch (error) { console.error('Avatar workflow queue unavailable:', error.code || error.name); }
    }, 50);
    wakeTimer.unref?.();
  }
  async function authorize(req, res, caller, parsedUrl) {
    const remote = req.socket.remoteAddress;
    const origin = String(req.headers.origin || '');
    const site = String(req.headers['sec-fetch-site'] || '');
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) || !validateLoopbackHost(req.headers.host) ||
      (origin && origin !== `http://${req.headers.host}`) || (site && !['same-origin', 'none'].includes(site))) {
      send(res, 403, { success: false, error: 'untrusted_origin' });
      return false;
    }
    const prefix = caller === 'agent' ? '/api/agent/v1' : '/api/control/v1';
    return !await agentService.route(req, res, `${prefix}/avatar-workflow-auth`, parsedUrl);
  }
  async function route(req, res, pathname, parsedUrl) {
    const caller = pathname.startsWith(`${AGENT_PREFIX}/`) ? 'agent' : 'browser';
    const prefix = caller === 'agent' ? AGENT_PREFIX : PREFIX;
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return false;
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!await authorize(req, res, caller, parsedUrl)) return true;
      const suffix = pathname.slice(prefix.length);
      if (req.method === 'GET' && suffix === '/library') { send(res, 200, await library()); return true; }
      if (req.method === 'GET' && suffix === '/dependencies') {
        send(res, 200, { success: true, ...(await media.dependencies(await store.get('settings', 'dependencies', { secrets: true }) || {})) }); return true;
      }
      const itemMatch = suffix.match(/^\/library\/(voices|workflows|images|settings)(?:\/([^/]+))?$/);
      if (itemMatch) {
        const collection = itemMatch[1];
        if (req.method === 'POST' && !itemMatch[2]) {
          const body = await readJson(req);
          if (caller === 'agent' && collection === 'settings') throw fail('Agent cannot modify shared settings', 403);
          const item = await store.put(collection, body.item, { expectedVersion: body.expectedVersion, createOnly: caller === 'agent' });
          send(res, 200, { success: true, item }); return true;
        }
        if (req.method === 'DELETE' && itemMatch[2]) {
          if (caller === 'agent') throw fail('Only manual deletion is allowed', 403);
          const body = await readJson(req);
          if (!Number.isInteger(body.expectedVersion)) throw fail('expectedVersion is required', 409);
          if (collection === 'workflows' && (await store.list('jobs')).some(job =>
            job.input?.workflowId === decodeURIComponent(itemMatch[2]) && !TERMINAL.has(job.state))) {
            throw fail('Workflow is in use by an unfinished job', 423);
          }
          await store.remove(collection, decodeURIComponent(itemMatch[2]), { expectedVersion: body.expectedVersion });
          send(res, 200, { success: true }); return true;
        }
      }
      if (req.method === 'POST' && suffix === '/images') {
        const upload = await readFileUpload(req, 20 * 1024 * 1024);
        const item = await store.saveImage(upload);
        await agentService.historyStore.append({ eventId: `history-created:album-${item.id}`, type: 'record-created',
          record: { ...item, id: `album-${item.id}`, recordId: `album-${item.id}`, kind: 'upload', type: 'image', mediaType: 'image',
            createdAt: Date.now(), origin: normalizeOrigin({ ...upload.origin, type: caller === 'agent' ? 'agent' : 'browser' }) } });
        send(res, 200, { success: true, item, image: item }); return true;
      }
      const imageMatch = suffix.match(/^\/images\/([^/]+)\/content$/);
      if (req.method === 'GET' && imageMatch) {
        const image = await store.readImage(decodeURIComponent(imageMatch[1]));
        res.writeHead(200, { 'Content-Type': image.mimeType, 'Content-Length': image.buffer.length, 'X-Content-Type-Options': 'nosniff' });
        res.end(image.buffer); return true;
      }
      if (req.method === 'POST' && (suffix === '/audio' || suffix === '/media')) {
        const file = await readFileUpload(req, suffix === '/audio' ? 40 * 1024 * 1024 : MAX_MEDIA);
        const ext = path.extname(file.name).toLowerCase();
        if (suffix === '/audio' ? !['.mp3', '.wav', '.m4a', '.ogg', '.flac'].includes(ext) : !/^(audio|video)\//.test(MIME[ext] || '')) throw fail('Unsupported media format');
        if (file.mimeType && file.mimeType !== 'application/octet-stream' && file.mimeType.split('/')[0] !== MIME[ext].split('/')[0]) throw fail('Unsupported media MIME type');
        const name = `${crypto.createHash('sha256').update(file.buffer).digest('hex')}${ext}`;
        const saved = await saveLocalMedia(dataDir, name, file.buffer);
        send(res, 200, { success: true, ...saved, name: file.name }); return true;
      }
      const mediaMatch = suffix.match(/^\/media\/([^/]+)$/);
      if (req.method === 'GET' && mediaMatch) {
        const { buffer, mimeType } = await readLocalMedia(dataDir, `${PREFIX}/media/${mediaMatch[1]}`);
        res.writeHead(200, { 'Content-Type': mimeType, 'Content-Length': buffer.length, 'X-Content-Type-Options': 'nosniff' });
        res.end(buffer); return true;
      }
      if (req.method === 'GET' && suffix === '/jobs') { send(res, 200, { success: true, jobs: (await store.list('jobs')).slice(0, 200) }); return true; }
      if (req.method === 'POST' && suffix === '/jobs') { send(res, 202, { success: true, job: await enqueueSubmit(await readJson(req), caller) }); return true; }
      const jobMatch = suffix.match(/^\/jobs\/([^/]+)$/);
      if (req.method === 'GET' && jobMatch) {
        const job = await store.get('jobs', decodeURIComponent(jobMatch[1]));
        if (!job) throw fail('Job not found', 404);
        send(res, 200, { success: true, job }); return true;
      }
      if (req.method === 'POST' && suffix === '/migrate') {
        if (caller === 'agent') throw fail('Migration requires manual control', 403);
        const body = await readJson(req);
        let config = body;
        if (body.source === 'standalone') {
          const file = path.join(root, '..', 'speech-avatar-subtitle-tool', 'local-config.json');
          config = JSON.parse(await fs.readFile(file, 'utf8'));
        } else if (body.source !== 'browser') throw fail('Unknown migration source');
        const voices = (config.voices || []).map(voice => ({ ...voice, voiceId: voice.voiceId || voice.voice_id || voice.id,
          name: voice.name || voice.remark || voice.id, notes: voice.notes || voice.remark || '' }));
        const runningHubWorkflows = (config.runningHubWorkflows || []).map(workflow => ({ ...workflow, provider: 'runninghub',
          name: workflow.name || workflow.title || workflow.appId || workflow.webappId,
          webappId: String(workflow.webappId || workflow.appId || ''), workflowType: workflow.workflowType || 'avatar' }));
        const result = await store.importLegacy({ voices, runningHubWorkflows });
        send(res, 200, { success: true, result, ...(await library()) }); return true;
      }
      send(res, 404, { success: false, error: 'unknown_avatar_workflow_route' });
    } catch (error) {
      if (error.code === 'INVALID_MEDIA_INPUT') error.status = 400;
      send(res, error.status || (error.code === 'ENOENT' ? 404 : 500), { success: false,
        error: error.code || 'avatar_workflow_failed', message: error.status ? error.message : 'Workflow storage or dependency is unavailable' });
    }
    return true;
  }
  if (autoStart) schedule();
  return { store, route, library, submit: enqueueSubmit, run, resolveCredential,
    close: async () => { closed = true; clearTimeout(wakeTimer); await Promise.allSettled([...active.values()]); } };
}

module.exports = { createAvatarWorkflowService, publicValue };
