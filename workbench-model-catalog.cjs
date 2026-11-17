'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const contracts = require('./model-contracts.js');
const agentAdapter = require('./agent-task-adapter.js');
const historyOrigins = require('./history-origin-utils.js');

const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const gatewayMatch = source.match(/^const API_DEFAULT = ("[^"\r\n]+");$/m);
if (!gatewayMatch) throw new Error('Cannot read workbench API_DEFAULT from app.js');
const DEFAULT_GATEWAY = JSON.parse(gatewayMatch[1]);
const FAMILY_DECLARATIONS = {
  image: 'IMAGE_MODELS', imageVideo: 'IMAGE_VIDEO_MODELS', motion: 'MOTION_MODELS',
  multiVideo: 'MULTI_VIDEO_MODELS', avatar: 'AVATAR_MODELS'
};
const ROOT_HELPERS = [
  'validateImageVideoRowBeforeQueue', 'validateMotionRowBeforeQueue',
  'validateAvatarRowBeforeQueue', 'validateMultiRowBeforeQueue',
  'runningHubModelFromConfig', 'normalizeRunningHubMotionSettings'
];
const RUNTIME_HELPERS = new Set(['uploadRunningHubAsset']);

function objectDeclaration(name) {
  const match = source.match(new RegExp(`^const ${name} = \\{[^]*?^};`, 'm'));
  if (!match) throw new Error(`Missing shared model declaration: ${name}`);
  return match[0];
}

// The app is still an unbundled browser script. Evaluate only its actual catalog
// literals and the transitive pure helpers they call, never startup or a DOM shim.
// Missing/changed declarations fail loudly instead of silently using stale copies.
function sharedSource() {
  const functions = new Map();
  for (const match of source.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)\([^]*?^}/gm)) {
    functions.set(match[1], match[0]);
  }
  const declarations = [
    ...Object.values(FAMILY_DECLARATIONS), 'DEFAULT_RUNNINGHUB_MOTION_CONFIG',
    'RUNNINGHUB_NODE_BINDINGS', 'RUNNINGHUB_WORKFLOW_TYPES'
  ].map(objectDeclaration);
  const selected = new Map();
  const visit = body => {
    for (const name of new Set(body.match(/[A-Za-z_$][\w$]*/g))) {
      if (RUNTIME_HELPERS.has(name) || selected.has(name) || !functions.has(name)) continue;
      selected.set(name, functions.get(name));
      visit(functions.get(name));
    }
  };
  visit(declarations.join('\n') + '\n' + ROOT_HELPERS.join('\n'));
  for (const [name, body] of selected) {
    if (/\b(?:document|window|localStorage|sessionStorage)\s*[.[]/.test(body)) {
      throw new Error(`Shared catalog helper ${name} unexpectedly requires browser state`);
    }
  }
  return [...declarations, ...selected.values(), `({
    catalogs: { ${Object.entries(FAMILY_DECLARATIONS).map(([key, value]) => `${key}: ${value}`).join(', ')} },
    validators: { imageVideo: validateImageVideoRowBeforeQueue,
      motion: validateMotionRowBeforeQueue, avatar: validateAvatarRowBeforeQueue,
      multiVideo: validateMultiRowBeforeQueue },
    runningHubModelFromConfig, normalizeRunningHubMotionSettings
  })`].join('\n');
}

const sharedScript = new vm.Script(sharedSource(), { filename: 'app.js (shared model declarations)' });
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function audioModule() {
  const filename = path.join(__dirname, 'audio-models.js');
  return fs.existsSync(filename) ? require(filename) : null;
}

function sharedRuntime(runtime = {}) {
  const state = { runningHubMotionConfig: null };
  const context = vm.createContext({
    MODEL_CONTRACTS: contracts, ...contracts,
    HISTORY_ORIGIN_UTILS: historyOrigins,
    SEEDANCE_FAST_VIDEO_PIXEL_LIMIT: 2086876,
    URL, state,
    uploadRunningHubAsset: async (asset, apiKey, type) => {
      if (typeof runtime.uploadRunningHubAsset === 'function') {
        return runtime.uploadRunningHubAsset(asset, apiKey, type);
      }
      if (asset?.runningHubFileName) return asset.runningHubFileName;
      throw new Error('RunningHub requires an uploadRunningHubAsset runtime handler for reference media');
    }
  });
  const shared = sharedScript.runInContext(context, { timeout: 1000 });
  state.runningHubMotionConfig = shared.normalizeRunningHubMotionSettings(clone(runtime.runningHub || {}));
  for (const config of state.runningHubMotionConfig.configs) {
    if (!config.webappId) continue;
    const family = config.workflowType === 'avatar' ? 'avatar' : 'motion';
    shared.catalogs[family][`rh:${config.id}`] = shared.runningHubModelFromConfig(config, family);
  }
  const audio = audioModule();
  if (audio) shared.catalogs.audio = audio.AUDIO_MODELS;
  return { ...shared, audio };
}

function getCatalogs(runtime = {}) {
  return sharedRuntime(runtime).catalogs;
}

function getCapabilities(runtime = {}) {
  const catalogs = getCatalogs(runtime);
  const manifest = agentAdapter.buildCapabilityManifest({ catalogs, enabledTaskTypes: Object.keys(catalogs) });
  manifest.execution = 'headless';
  for (const family of manifest.taskFamilies) {
    for (const model of family.models) {
      const definition = catalogs[family.id][model.id];
      if (definition.defaults) model.defaults = clone(definition.defaults);
      if (definition.fields) model.fields = clone(definition.fields);
      if (definition.uploadSlots) model.uploadSlots = clone(definition.uploadSlots);
      for (const key of ['hint', 'promptKey', 'voiceList', 'modes']) {
        if (definition[key] !== undefined) model[key] = clone(definition[key]);
      }
      if (definition.resultType || definition.outputType) model.mediaType = definition.resultType || definition.outputType;
      if (model.id === 'runninghub' || model.id.startsWith('rh:')) model.requiresRuntimeConfiguration = true;
    }
  }
  return manifest;
}

function taskInput(task) {
  const input = object(task.input);
  return { ...object(task), ...input, options: { ...object(task.options), ...object(input.options) },
    assets: { ...object(task.assets), ...object(input.assets) } };
}

function normalizeFamily(task, input) {
  const type = String(task.taskType || input.taskType || '').trim();
  if (/^(audio|sound|speech|music|audio_generation|audio-generation)$/i.test(type)) return 'audio';
  if (/^(videoEdit|video_edit|video-edit)$/i.test(type)) return 'multiVideo';
  return agentAdapter.normalizeTaskType(type);
}

function normalizedAssets(input) {
  const assets = { ...input.assets };
  const keys = ['images', 'referenceImages', 'refs', 'references', 'items', 'firstFrame', 'lastFrame',
    'endFrame', 'image', 'video', 'audio', 'sourceVideo', 'subjectImage', 'referenceVideo', 'videos',
    'avatarImage', 'voice', 'audios', 'referenceAudio', 'referenceImage'];
  for (const key of keys) if (assets[key] === undefined && input[key] !== undefined) assets[key] = input[key];
  if (!assets.refs && (assets.sourceVideo || assets.video)) {
    assets.refs = [assets.sourceVideo || assets.video, ...(assets.images || assets.referenceImages || [])];
  }
  return assets;
}

function resolveModel(models, requested) {
  if (!requested) return Object.keys(models)[0];
  if (Object.hasOwn(models, requested)) return requested;
  const matches = Object.entries(models).filter(([, config]) => config.label === requested
    || config.versions?.some(version => version.value === requested));
  if (matches.length === 1) return matches[0][0];
  throw new Error(`Unsupported or ambiguous model: ${requested}`);
}

function valuesFor(config, row, field) {
  const method = config[`${field}For`];
  const list = typeof method === 'function' ? method.call(config, row) : config[field];
  return Array.isArray(list) ? list.map(value => String(value?.value ?? value)) : [];
}

function applyDefaults(row, config) {
  row.version ??= config.defaultVersion ?? config.versions?.[0]?.value ?? '';
  row.size ??= config.defaultSize ?? valuesFor(config, row, 'sizes')[0] ?? '';
  row.quality ??= config.defaultQuality ?? valuesFor(config, row, 'qualities')[0] ?? '';
  row.duration ??= String(config.defaultDuration ?? valuesFor(config, row, 'durations')[0] ?? '');
  row.generateAudio ??= true;
  for (const key of ['renderQuality', 'background', 'outputFormat', 'frameSize', 'frameCount', 'frameDurationMs']) {
    row[key] ??= config[`default${key[0].toUpperCase()}${key.slice(1)}`];
  }
  return row;
}

function validateRow(taskType, row, config, shared) {
  if (config.versions?.length && !config.versions.some(version => version.value === row.version)) {
    throw new Error(`${config.label}: unsupported model version ${row.version}`);
  }
  if (taskType === 'image') {
    if (config.requiresPrompt !== false && !row.prompt.trim()) throw new Error('Prompt is required');
    if (config.maxImages && row.images.length > config.maxImages) throw new Error(`Too many image references (maximum ${config.maxImages})`);
  }
  const error = shared.validators[taskType]?.(row) || config.validate?.(row);
  if (error) throw new Error(String(error));
}

async function prepareTask(task = {}, runtime = {}) {
  const input = taskInput(task);
  const taskType = normalizeFamily(task, input);
  const shared = sharedRuntime({ ...runtime, runningHub: runtime.runningHub || input.runningHub || input.options.runningHub });
  const models = shared.catalogs[taskType];
  if (!models) throw new Error(`Unsupported Agent task type: ${task.taskType || 'empty'}`);
  const videoEdit = /^(videoEdit|video_edit|video-edit)$/i.test(String(task.taskType || ''));
  const model = taskType === 'audio'
    ? shared.audio.getAudioModel(input.model || Object.keys(models)[0]).id
    : resolveModel(models, input.model || (videoEdit ? 'kling3Omni' : ''));
  const config = models[model];
  const assets = normalizedAssets(input);
  const settings = { ...input, ...input.options, model };
  // The shared adapter owns asset/provenance normalization. Preserve all model
  // options around it: its deliberately small browser schema omits edit fields.
  const seed = taskType === 'audio'
    ? { prompt: String(settings.prompt || ''), origin: clone(task.origin || { type: 'agent', client: 'agent', label: 'Agent' }) }
    : agentAdapter.createRowSeed({ ...task, ...input, taskType, model, assets }, { assets }).row;
  const row = { ...settings, ...Object.fromEntries(Object.entries(seed).filter(([, value]) => value !== undefined)), model };
  row.executedBy = { type: 'headless', id: runtime.workerId || 'headless-worker', label: runtime.workerLabel || 'Headless worker' };
  row.agentTaskId = String(task.taskId || task.id || '');
  if (videoEdit) row.klingMode = 'video_edit';
  let payload;
  if (taskType === 'audio') {
    row.prompt = String(settings.prompt ?? settings.text ?? '');
    for (const [key, value] of Object.entries(assets)) if (row[key] === undefined) row[key] = value;
    for (const asset of Array.isArray(assets.refs) ? assets.refs : []) {
      const slot = (config.uploadSlots || []).find(item => item.key === asset.role);
      if (slot && row[slot.key] === undefined) row[slot.key] = asset;
    }
    const error = shared.audio.validateAudioInput(model, row);
    if (error) throw new Error(String(error));
    payload = await shared.audio.buildAudioPayload(model, row);
    if (!row.prompt.trim()) row.prompt = String(payload.text ?? payload.prompt ?? row.prompt);
    // Validate/build before adding canonical defaults: otherwise a default text,
    // voiceId or version would shadow an explicitly supplied supported alias.
    const payloadFields = { text: 'text', prompt: 'prompt', voiceId: 'voice_id',
      version: model === 'minimaxTts' ? 'mode_name' : 'model_name',
      speed: 'speed', volume: 'vol', speechRate: 'speech_rate',
      loudnessRate: 'loudness_rate', pitchRate: 'pitch_rate' };
    for (const key of Object.keys(config.defaults || {})) {
      row[key] ??= payload[payloadFields[key]] ?? clone(config.defaults[key]);
    }
  } else {
    applyDefaults(row, config);
    validateRow(taskType, row, config, shared);
    payload = await config.build(row);
  }
  return {
    taskType, row, config, payload, endpoint: config.endpoint,
    queryEndpoint: config.queryEndpoint || '', async: Boolean(config.async),
    mediaType: config.resultType || config.outputType || (taskType === 'image' ? 'image' : taskType === 'audio' ? 'audio' : 'video'),
    ...(taskType === 'audio' ? {
      resultNormalizer: response => shared.audio.normalizeAudioResult(model, response),
      queryBuilder: taskInfo => shared.audio.buildAudioQuery(model, taskInfo)
    } : {})
  };
}

module.exports = { DEFAULT_GATEWAY, getCatalogs, getCapabilities,
  buildCapabilityManifest: getCapabilities, prepareTask };
