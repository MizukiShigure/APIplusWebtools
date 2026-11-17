"use strict";

const fs = require('node:fs/promises');
const { setTimeout: delay } = require('node:timers/promises');
const TERMINAL = new Set(['completed', 'failed', 'canceled', 'submission-unknown']);
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const WORKER = { type: 'headless', id: 'local-service', label: 'Local background service' };

function publicValue(value) {
  if (Array.isArray(value)) return value.map(publicValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    /^(api[_-]?key|authorization|token|secret|password)$/i.test(key) && child && !String(child).startsWith('@shared:') ? '[runtime credential]' : publicValue(child)]));
}

function envelope(value) {
  if (!value || typeof value !== 'object') return { success: true, data: value };
  const code = value.code;
  if (value.success === false || (code !== undefined && ![0, '0', 200, '200'].includes(code))) {
    const error = new Error(String(value.message || value.msg || value.error || `Provider code ${code}`));
    error.rejected = true;
    throw error;
  }
  return { ...value, success: true, data: value.data ?? value.result ?? value };
}

function resultUrls(value) {
  if (!value) return [];
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(resultUrls);
  if (typeof value !== 'object') return [];
  const direct = ['url', 'image_url', 'video_url', 'audio_url', 'audioUrl', 'download_url'].flatMap(key => resultUrls(value[key]));
  return [...new Set(direct.concat(['urls', 'image_urls', 'video_urls', 'audio_urls', 'results', 'output', 'outputs', 'task_result', 'videos', 'images', 'audios', 'data', 'response', 'sunoData'].flatMap(key => resultUrls(value[key]))))];
}

function remoteId(data) {
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed || /^https?:\/\//i.test(trimmed)) return '';
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        // Some gateways route by the complete JSON-string envelope, including supplier.
        return parsed && (parsed.task_id || parsed.taskId || parsed.id) ? data : '';
      } catch { return ''; }
    }
    return /\s/.test(trimmed) ? '' : data;
  }
  if (!data || typeof data !== 'object') return '';
  return String(data.task_id || data.taskId || data.id || data.data?.task_id || data.data?.taskId || '');
}

function createHeadlessExecutor(options) {
  const service = options.service;
  if (!service) throw new Error('service is required');
  const catalog = () => require('./workbench-model-catalog.cjs');
  const prepareTask = options.prepareTask || ((task, runtime) => catalog().prepareTask(task, runtime));
  const fetchImpl = options.fetchImpl || fetch;
  const { requireGateway } = require('./gateway-config.cjs');
  const gateway = () => options.getGateway ? options.getGateway() : options.gateway || process.env.API_PLUS_GATEWAY_BASE || '';
  const pollMs = Math.max(1, Number(options.pollMs || 60000));
  const timeoutMs = Math.max(100, Number(options.timeoutMs || 30 * 60 * 1000));
  const concurrency = Math.max(1, Math.min(16, Number(options.concurrency || 3)));
  const running = new Map();
  const assetUploads = new Map();
  let stopped = false;
  let timer = null;
  let ticking = null;
  let controlCookie = '';

  function taskGateway(task) {
    return requireGateway(task.input?.options?.apiBase || task.input?.apiBase || gateway());
  }

  function normalizeResult(execution, job, response) {
    if (execution.taskType === 'audio') return require('./audio-models.js').normalizeAudioResult(job.resultModel, response);
    const results = resultUrls(response.data);
    const status = String(response.data?.task_status || response.data?.status || '').toLowerCase();
    return { results: ['processing', 'running', 'queued', 'pending'].includes(status) ? [] : results,
      status: ['failed', 'fail', 'error', 'canceled', 'cancelled'].includes(status) ? 'failed' : results.length ? 'done' : 'pending',
      taskId: remoteId(response.data), taskPath: response.data?.task_path || response.data?.taskPath || '',
      error: response.data?.task_status_msg || response.data?.message,
      outputs: results.map(url => ({ url, type: execution.mediaType || 'other' })) };
  }

  async function request(endpoint, payload, { form = null, base } = {}) {
    const local = endpoint.startsWith('/api/runninghub/');
    const target = local ? `${options.localBase}${endpoint}` : `${requireGateway(base || gateway())}${endpoint}`;
    if (local && !options.localBase) throw new Error('RunningHub local proxy address is unavailable');
    if (local && !controlCookie) {
      const session = await fetchImpl(`${options.localBase}/api/control/v1/session`);
      controlCookie = String(session.headers.get('set-cookie') || '').split(';')[0];
    }
    let response;
    try {
      response = await fetchImpl(target, { method: 'POST', headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), ...(local ? { Cookie: controlCookie } : {}) },
        body: form || JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw Object.assign(new Error(`Provider connection interrupted: ${error.message}`), { ambiguous: true });
    }
    let body;
    try { body = await response.text(); }
    catch (error) { throw Object.assign(new Error(`Provider response interrupted: ${error.message}`), { ambiguous: true }); }
    let parsed;
    try { parsed = body ? JSON.parse(body) : {}; }
    catch { throw Object.assign(new Error(`Provider returned non-JSON (HTTP ${response.status})`), { ambiguous: response.status >= 500 || response.ok }); }
    if (!response.ok) throw Object.assign(new Error(String(parsed.message || parsed.detail || parsed.error || `HTTP ${response.status}`)), { rejected: response.status < 500, ambiguous: response.status >= 500 });
    return envelope(parsed);
  }

  async function resolveAssets(value, task) {
    if (Array.isArray(value)) return Promise.all(value.map(item => resolveAssets(item, task)));
    if (!value || typeof value !== 'object') return value;
    if (value.assetId) {
      if (/^https?:\/\//i.test(String(value.url || ''))) {
        const { workerUrl, file, ...resolved } = value;
        return resolved;
      }
      let pending = assetUploads.get(value.assetId);
      if (!pending) {
        pending = (async () => {
          const staged = await service.getStagedAsset(value.assetId);
          if (staged.url) return staged;
        const bytes = await fs.readFile(staged.file);
        const form = new FormData();
        form.append('file', new Blob([bytes], { type: staged.mime }), staged.name);
        const uploaded = await request('/fileupload', null, { form, base: taskGateway(task) });
        const data = uploaded.data;
        const url = typeof data === 'string' ? data : data?.url || data?.file_url || data?.file_path || data?.path;
        if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('Upload response did not include a public asset URL');
        const asset = await service.updateStagedAsset(staged.assetId, { url, uploadedAt: Date.now() });
        await service.appendHistoryRecords([{ ...publicValue(asset), recordId: `uploaded:${staged.assetId}`, id: staged.assetId, kind: 'upload', type: staged.mediaType, source: 'agent', staging: false }], task, WORKER);
          return asset;
        })().finally(() => assetUploads.delete(value.assetId));
        assetUploads.set(value.assetId, pending);
      }
      const asset = await pending;
      const { file, workerUrl, ...safe } = asset;
      return { ...value, ...safe, id: asset.assetId, type: asset.mediaType, preview: asset.url };
    }
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, child]) => [key, await resolveAssets(child, task)])));
  }

  async function persist(taskId, execution, state, extra = {}) {
    await service.updateExecution(taskId, publicValue(execution));
    const jobs = execution.jobs || [];
    return service.reportHeadless(taskId, { state,
      upstreamTaskIds: jobs.map(job => job.taskId).filter(Boolean),
      results: jobs.flatMap(job => job.outputs || (job.results || []).map(url => ({ url, type: execution.mediaType || 'other' }))),
      progress: { total: jobs.length, finished: jobs.filter(job => job.state === 'completed').length, running: jobs.filter(job => ['submitting', 'polling'].includes(job.state)).length }, ...extra });
  }

  async function appendResult(task, execution, job) {
    if (!job.results?.length) return;
    const row = execution.preparedRow || {};
    const sourceVideo = row.refs?.find(asset => asset.type === 'video');
    const klingEdit = row.model === 'kling3Omni' && row.klingMode === 'video_edit';
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const ratioDivisor = sourceVideo?.width && sourceVideo?.height ? gcd(sourceVideo.width, sourceVideo.height) : 0;
    await service.appendHistoryRecords([{
      ...publicValue(row), id: `agent:${task.taskId}:${job.index}`, recordId: `agent:${task.taskId}:${job.index}`, kind: 'generation',
      mediaType: job.outputs?.[0]?.type || execution.mediaType, page: execution.taskType || task.taskType, createdAt: job.completedAt || Date.now(),
      completedAt: job.completedAt, taskId: task.taskId, agentTaskId: task.taskId, upstreamTaskId: job.taskId || '',
      prompt: execution.taskType === 'audio' ? row.prompt || task.input.prompt || '' : task.input.prompt ?? row.prompt ?? '', model: execution.modelLabel || row.model,
      modelKey: row.model, params: publicValue(job.payload), results: job.results,
      outputs: job.outputs,
      ...(klingEdit ? { model: 'Kling Omni 视频编辑', version: '', sourceFollow: true, duration: sourceVideo?.duration,
        size: ratioDivisor ? `${sourceVideo.width / ratioDivisor}:${sourceVideo.height / ratioDivisor}` : '' } : {}),
      request: { taskType: task.taskType, input: publicValue(execution.resolvedInput || task.input), origin: task.origin },
      originalInput: publicValue(task.input), rowSnapshot: publicValue(row)
    }], task, WORKER);
  }

  async function processTask(task) {
    const taskId = task.taskId;
    let execution = clone(task.execution);
    const privateInput = service.getRuntimeInput?.(taskId) || task.input;
    const runningHub = privateInput.runningHub || privateInput.options?.runningHub || options.runtime?.runningHub;
    const runtimeApiKey = runningHub?.apiKey || process.env.API_PLUS_RUNNINGHUB_API_KEY || '';
    const safeError = error => {
      let text = String(error?.message || error || 'Execution failed');
      if (runtimeApiKey && runtimeApiKey !== '[runtime credential]' && !String(runtimeApiKey).startsWith('@shared:')) text = text.split(runtimeApiKey).join('[redacted]');
      return text;
    };
    try {
      if (task.cancelRequested) { await service.reportHeadless(taskId, { state: 'canceled' }); return; }
      if (execution?.jobs?.some(job => job.state === 'submitting' && !job.taskId)) {
        await service.reportHeadless(taskId, { state: 'submission-unknown', error: { message: 'Submission was interrupted before a remote ID was recorded. It will not be submitted again automatically.' } });
        return;
      }
      if (!execution?.jobs) {
        await service.reportHeadless(taskId, { state: 'uploading' });
        const resolvedInput = await resolveAssets(task.input, task);
        const runtime = { ...(options.runtime || {}), runningHub,
          uploadRunningHubAsset: async (asset, apiKey, kind) => {
            const response = await request('/api/runninghub/upload-url', { url: asset.url, apiKey, kind });
            const name = response.fileName || response.data?.fileName || response.data?.file_name;
            if (!name) throw new Error('RunningHub upload returned no fileName');
            return name;
          } };
        const prepared = await prepareTask({ ...task, input: resolvedInput }, runtime);
        const count = Number(resolvedInput.count ?? resolvedInput.options?.count ?? 1);
        if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('count must be an integer from 1 to 100');
        execution = { taskType: prepared.taskType || task.taskType, gateway: prepared.endpoint.startsWith('/api/runninghub/') ? '' : taskGateway(task), preparedRow: publicValue(prepared.row), resolvedInput: publicValue(resolvedInput),
          mediaType: prepared.mediaType, modelLabel: prepared.config?.label, jobs: Array.from({ length: count }, (_, index) => ({ index, state: 'queued',
            endpoint: prepared.endpoint, queryEndpoint: prepared.queryEndpoint, async: prepared.async, payload: clone(prepared.payload),
            resultModel: prepared.row?.model, results: [] })) };
        await persist(taskId, execution, 'queued');
      }
      for (const job of execution.jobs) {
        if (job.state === 'completed') { await appendResult(task, execution, job); continue; }
        if (stopped) return;
        if (service.getTask(taskId)?.cancelRequested) { await persist(taskId, execution, 'canceled'); return; }
        if (!job.taskId) {
          job.state = 'submitting'; job.submittedAt = Date.now();
          await persist(taskId, execution, 'submitting');
          const submitPayload = clone(job.payload);
          if (job.endpoint.startsWith('/api/runninghub/') && submitPayload.apiKey === '[runtime credential]') {
            if (!runtimeApiKey || runtimeApiKey === '[runtime credential]') throw Object.assign(new Error('RunningHub runtime credential is unavailable; use a shared credential reference or API_PLUS_RUNNINGHUB_API_KEY'), { rejected: true });
            submitPayload.apiKey = runtimeApiKey;
          }
          const response = await request(job.endpoint, submitPayload, { base: execution.gateway });
          const result = normalizeResult(execution, job, response);
          if (result.status === 'failed') throw Object.assign(new Error(result.error || 'Provider rejected generation'), { rejected: true });
          const id = result.taskId;
          const urls = result.results || [];
          if (id) { job.taskId = id; job.taskPath = result.taskPath || ''; }
          if (service.getTask(taskId)?.cancelRequested) { job.state = 'canceled'; await persist(taskId, execution, 'canceled'); return; }
          if (urls.length) {
            job.results = urls; job.outputs = result.outputs; job.state = 'completed'; job.completedAt = Date.now();
            await persist(taskId, execution, 'partial'); await appendResult(task, execution, job); continue;
          }
          if (!id || !job.queryEndpoint) throw Object.assign(new Error('Generation response has no output URL or resumable remote task ID/query endpoint'), { ambiguous: true });
          job.taskId = id; job.taskPath = result.taskPath || ''; job.state = 'polling';
          await persist(taskId, execution, 'polling');
        }
        while (!stopped) {
          if (service.getTask(taskId)?.cancelRequested) { await persist(taskId, execution, 'canceled'); return; }
          if (Date.now() - Number(job.submittedAt || Date.now()) > timeoutMs) throw new Error('Task polling deadline exceeded; remote task ID is preserved');
          const query = { task_id: job.taskId, ...(job.taskPath ? { task_path: job.taskPath } : {}) };
          if (job.queryEndpoint.startsWith('/api/runninghub/')) {
            query.taskId = job.taskId;
            query.apiKey = String(job.payload?.apiKey || '').startsWith('@shared:') ? job.payload.apiKey : runtimeApiKey;
            if (!query.apiKey || query.apiKey === '[runtime credential]') throw new Error('RunningHub runtime credential unavailable for polling; remote task ID is preserved');
          }
          job.lastQueryAt = Date.now(); job.lastQueryPayload = publicValue(query);
          await persist(taskId, execution, 'polling');
          let response;
          try { response = await request(job.queryEndpoint, query, { base: execution.gateway }); }
          catch (error) {
            if (error.ambiguous) { job.lastQueryError = safeError(error); await persist(taskId, execution, 'polling'); await delay(pollMs); continue; }
            throw error;
          }
          const result = normalizeResult(execution, job, response);
          if (service.getTask(taskId)?.cancelRequested) { job.state = 'canceled'; await persist(taskId, execution, 'canceled'); return; }
          if (result.status === 'failed') throw new Error(String(result.error || 'Remote task failed'));
          const urls = result.results || [];
          if (urls.length) {
            job.results = urls; job.outputs = result.outputs; job.state = 'completed'; job.completedAt = Date.now();
            await persist(taskId, execution, 'partial'); await appendResult(task, execution, job); break;
          }
          await delay(pollMs);
        }
      }
      if (!stopped) await persist(taskId, execution, 'completed');
    } catch (error) {
      const state = !error.rejected && execution?.jobs?.some(job => job.state === 'submitting' && !job.taskId) ? 'submission-unknown' : 'failed';
      await service.reportHeadless(taskId, { state, error: { message: safeError(error), code: error.code || 'execution_failed' } });
    }
  }

  async function tick() {
    if (stopped || ticking) return ticking;
    ticking = (async () => {
      while (!stopped && running.size < concurrency) {
        const task = await service.claimHeadless([...running.keys()]);
        if (!task) break;
        const promise = processTask(task).finally(() => running.delete(task.taskId));
        running.set(task.taskId, promise);
      }
    })();
    try { await ticking; } finally { ticking = null; }
  }
  async function drain() {
    do { await tick(); await Promise.all([...running.values()]); } while (!stopped && (await service.taskStore.getState(state => Object.values(state.tasksById).some(task => task.executionOwner === 'headless' && !TERMINAL.has(task.state)))));
  }
  function start() {
    stopped = false;
    if (!timer) { timer = setInterval(() => tick().catch(error => options.onError?.(error)), 250); timer.unref?.(); }
    tick().catch(error => options.onError?.(error));
  }
  function stop() { stopped = true; if (timer) clearInterval(timer); timer = null; }
  return { start, stop, drain, tick, running };
}

module.exports = { createHeadlessExecutor, resultUrls, envelope, publicValue };
