(function exposeAudioModels(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ApiBatchAudioModels = api;
})(typeof globalThis === 'undefined' ? null : globalThis, function createAudioModels() {
  'use strict';

  // Company frontend + /openapi.json verified 2026-10-23. Vendor APIs are not
  // interchangeable with these wrappers (notably MiniMax mode_name and Suno).
  const COMMON_MINIMAX_VOICES = [
    'Wise_Woman', 'Friendly_Person', 'Inspirational_girl', 'Deep_Voice_Man',
    'Calm_Woman', 'Casual_Guy', 'Lively_Girl', 'Patient_Man', 'Young_Knight',
    'Determined_Man', 'Lovely_Girl', 'Decent_Boy', 'Imposing_Manner',
    'Elegant_Man', 'Abbess', 'Sweet_Girl_2', 'Exuberant_Girl'
  ];
  const MINIMAX_TTS_VERSIONS = ['speech-2.5-hd-preview', 'speech-2.5-turbo-preview'];
  const UPLOAD = { endpoint: '/fileupload', method: 'POST', field: 'file' };
  const AUDIO_MODELS = {
    minimaxTts: {
      id: 'minimaxTts', label: 'MiniMax 语音合成', endpoint: '/minimax_tts', queryEndpoint: '', async: false,
      outputType: 'audio', resultType: 'audio', promptKey: 'text', uploadSlots: [],
      defaults: { text: '', voiceId: 'Friendly_Person', version: 'speech-2.5-hd-preview', speed: 1, volume: 1 },
      versions: MINIMAX_TTS_VERSIONS.map(value => ({ value, label: value })),
      voiceList: { mode: 'suggestions', endpoint: '', allowCustom: true, values: COMMON_MINIMAX_VOICES },
      hint: '输入朗读文本，选择或填写音色 ID。公司网关无需个人 MiniMax Key；自定义音色需已在上游存在。',
      fields: [
        { key: 'text', label: '朗读文本', type: 'textarea', required: true },
        { key: 'voiceId', label: '音色 ID', type: 'text', required: true, suggestions: COMMON_MINIMAX_VOICES },
        { key: 'version', label: '模型版本', type: 'select', options: MINIMAX_TTS_VERSIONS },
        { key: 'speed', label: '语速', type: 'number', min: 0.5, max: 2, step: 0.1 },
        { key: 'volume', label: '音量', type: 'number', min: 0.1, max: 2, step: 0.1 }
      ]
    },
    suno: {
      id: 'suno', label: 'Suno 音乐', endpoint: '/suno', queryEndpoint: '', async: false,
      outputType: 'audio', resultType: 'audio', promptKey: 'prompt', uploadSlots: [],
      defaults: { prompt: '' }, modes: [{ value: 'prompt', label: '提示词生成' }],
      hint: '描述风格、情绪、乐器、人声或纯音乐要求。当前公司网关只验证了提示词生成，未暴露自定义歌词、续写或分轨接口。',
      fields: [{ key: 'prompt', label: '音乐提示词', type: 'textarea', required: true }]
    },
    seedAudio: {
      id: 'seedAudio', label: 'Seed Audio 语音', endpoint: '/seed_audio', queryEndpoint: '', async: false,
      outputType: 'audio', resultType: 'audio', promptKey: 'text',
      defaults: { text: '', version: 'seed-audio-1.0', speechRate: 0, loudnessRate: 0, pitchRate: 0 },
      versions: [{ value: 'seed-audio-1.0', label: 'seed-audio-1.0' }],
      uploadSlots: [
        { key: 'referenceAudio', label: '参考音频', type: 'audio', accept: 'audio/*', required: false, exclusiveWith: 'referenceImage' },
        { key: 'referenceImage', label: '参考图片', type: 'image', accept: 'image/*', required: false, exclusiveWith: 'referenceAudio' }
      ],
      hint: '可直接输入文本；参考音频与参考图片二选一用于音色参考。调整值为 -50 到 100 的整数，0 表示默认。',
      fields: [
        { key: 'text', label: '朗读文本', type: 'textarea', required: true },
        { key: 'version', label: '模型版本', type: 'select', options: ['seed-audio-1.0'] },
        { key: 'speechRate', label: '语速调整', type: 'number', min: -50, max: 100, step: 1 },
        { key: 'loudnessRate', label: '音量调整', type: 'number', min: -50, max: 100, step: 1 },
        { key: 'pitchRate', label: '音调调整', type: 'number', min: -50, max: 100, step: 1 }
      ]
    },
    wooshSound: {
      id: 'wooshSound', label: 'Woosh 音效', endpoint: '/woosh_sound', queryEndpoint: '/woosh_sound_query', async: true,
      outputType: 'audio', resultType: 'audio', promptKey: 'prompt', uploadSlots: [], defaults: { prompt: '' },
      hint: '仅支持英文提示词。描述声音、材质和环境；当前接口没有时长参数。',
      fields: [{ key: 'prompt', label: '英文音效提示词', type: 'textarea', required: true }]
    },
    klingVideoAudio: {
      id: 'klingVideoAudio', label: '可灵视频配音效', endpoint: '/kling_video_to_audio', queryEndpoint: '/kling_video_to_audio_query', async: true,
      outputType: 'video', resultType: 'video', promptKey: '', defaults: {}, fields: [],
      uploadSlots: [{ key: 'video', label: '源视频', type: 'video', accept: 'video/*', required: true }],
      hint: '上传源视频，生成与画面匹配的声音。当前公司界面只提交 video_url；结果通常是带声音的视频，也兼容音频结果。'
    }
  };
  const ALIASES = {
    minimax_tts: 'minimaxTts', 'minimax-tts': 'minimaxTts', tts: 'minimaxTts',
    seed_audio: 'seedAudio', 'seed-audio': 'seedAudio',
    woosh_sound: 'wooshSound', 'woosh-sound': 'wooshSound', woosh: 'wooshSound',
    kling_video_to_audio: 'klingVideoAudio', 'kling-video-to-audio': 'klingVideoAudio', klingVideoToAudio: 'klingVideoAudio'
  };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const string = value => typeof value === 'string' ? value.trim() : '';
  const present = value => value !== undefined && value !== null && value !== '';
  function first(input, names, fallback) {
    for (const key of names) if (own(input, key) && input[key] !== undefined && input[key] !== null) return input[key];
    return fallback;
  }
  function number(value) {
    return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
  }
  function getAudioModel(id) {
    const key = ALIASES[id] || id;
    if (!own(AUDIO_MODELS, key)) throw new Error(`未知音频模型：${String(id || '')}`);
    return AUDIO_MODELS[key];
  }
  function getAudioDefaults(id) { return { ...getAudioModel(id).defaults }; }
  function assetUrl(value) {
    if (typeof value === 'string') return value.trim();
    if (!value || typeof value !== 'object') return '';
    return string(value.url || value.remoteUrl || value.ossPath || value.audio_url || value.image_url || value.video_url);
  }
  function isUrl(value) { return typeof value === 'string' && /^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(value); }
  function referenceEntries(input) {
    if (own(input, 'references') && !Array.isArray(input.references)) return [{ invalid: true }];
    const entries = Array.isArray(input.references) ? input.references.map(item => ({
      audio: first(item || {}, ['audio_url', 'audioUrl', 'referenceAudio'], ''),
      image: first(item || {}, ['image_url', 'imageUrl', 'referenceImage'], '')
    })) : [];
    const audio = first(input, ['referenceAudio', 'audioUrl', 'audio_url'], '');
    const image = first(input, ['referenceImage', 'imageUrl', 'image_url'], '');
    if (present(audio) || present(image)) entries.push({ audio, image });
    return entries;
  }
  function normalizedInput(id, input = {}) {
    const model = getAudioModel(id);
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const defaults = model.defaults;
    return {
      model, source: value,
      text: string(first(value, ['text', 'prompt'], '')),
      prompt: string(first(value, ['prompt', 'text'], '')),
      voiceId: string(first(value, ['voiceId', 'voice_id'], defaults.voiceId)),
      version: string(first(value, ['version', 'modelName', 'model_name', 'modeName', 'mode_name'], defaults.version)),
      speed: number(first(value, ['speed'], defaults.speed)),
      volume: number(first(value, ['volume', 'vol'], defaults.volume)),
      speechRate: number(first(value, ['speechRate', 'speech_rate'], defaults.speechRate)),
      loudnessRate: number(first(value, ['loudnessRate', 'loudness_rate'], defaults.loudnessRate)),
      pitchRate: number(first(value, ['pitchRate', 'pitch_rate'], defaults.pitchRate)),
      references: referenceEntries(value),
      video: first(value, ['video', 'sourceVideo', 'videoUrl', 'video_url'], '')
    };
  }
  function validNumber(value, min, max, integer = false) {
    return Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
  }
  function validateAsset(asset, type, label) {
    if (asset && typeof asset === 'object' && asset.type && asset.type !== type && !String(asset.type).startsWith(`${type}/`)) return `${label}必须是${type === 'video' ? '视频' : type === 'audio' ? '音频' : '图片'}素材`;
    return isUrl(assetUrl(asset)) ? '' : `${label}需要先上传，或填写可访问的 HTTP(S) URL`;
  }
  function validateAudioInput(id, input = {}) {
    let n;
    try { n = normalizedInput(id, input); } catch (error) { return error.message; }
    const key = n.model.id;
    if ((key === 'minimaxTts' || key === 'seedAudio') && !n.text) return '请输入要合成的文本';
    if ((key === 'suno' || key === 'wooshSound') && !n.prompt) return '请输入生成提示词';
    if (key === 'minimaxTts') {
      if (!n.voiceId) return '请填写音色 ID';
      if (!MINIMAX_TTS_VERSIONS.includes(n.version)) return '请选择公司网关已验证的 MiniMax 语音模型版本';
      if (!validNumber(n.speed, 0.5, 2)) return '语速需要在 0.5 到 2 之间';
      if (!validNumber(n.volume, 0.1, 2)) return '音量需要在 0.1 到 2 之间';
    }
    if (key === 'seedAudio') {
      if (n.version !== 'seed-audio-1.0') return 'Seed Audio 当前已验证的模型版本为 seed-audio-1.0';
      for (const [field, label] of [['speechRate', '语速'], ['loudnessRate', '音量'], ['pitchRate', '音调']]) {
        if (!validNumber(n[field], -50, 100, true)) return `${label}调整需要是 -50 到 100 的整数`;
      }
      if (n.references.length > 1) return '当前接入每次只支持一份参考；参考音频和参考图片二选一';
      for (const ref of n.references) {
        if (ref.invalid || (!present(ref.audio) && !present(ref.image))) return '参考资源格式错误，请选择一份音频或图片';
        if (present(ref.audio) && present(ref.image)) return '参考音频和参考图片二选一';
        const error = present(ref.audio) ? validateAsset(ref.audio, 'audio', '参考音频') : validateAsset(ref.image, 'image', '参考图片');
        if (error) return error;
      }
    }
    if (key === 'suno') {
      const source = n.source;
      if (source.customMode || source.custom_mode || source.lyrics || source.tags || source.title) return '公司 Suno 网关尚未验证自定义歌词模式；请使用音乐提示词';
      if (present(source.operation) && !['generate', 'prompt'].includes(source.operation)) return '公司 Suno 网关尚未暴露续写、分轨等操作';
      if (present(source.mode) && source.mode !== 'prompt') return '公司 Suno 网关当前只支持提示词模式';
      if (source.instrumental === true || source.make_instrumental === true) return '请在音乐提示词中描述纯音乐要求；网关未验证 instrumental 参数';
    }
    if (key === 'wooshSound' && (!/[A-Za-z]/.test(n.prompt) || /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(n.prompt))) return 'Woosh 音效仅支持英文提示词，请先翻译后提交';
    if (key === 'klingVideoAudio') {
      if (!present(n.video)) return '请上传需要配音效的源视频';
      return validateAsset(n.video, 'video', '源视频');
    }
    return '';
  }
  function buildAudioPayload(id, input = {}) {
    const error = validateAudioInput(id, input);
    if (error) throw new Error(error);
    const n = normalizedInput(id, input);
    switch (n.model.id) {
      case 'minimaxTts': return { text: n.text, voice_id: n.voiceId, mode_name: n.version, speed: n.speed, vol: n.volume };
      case 'seedAudio': return {
        text: n.text, model_name: n.version,
        references: n.references.map(ref => present(ref.audio) ? { audio_url: assetUrl(ref.audio) } : { image_url: assetUrl(ref.image) }),
        speech_rate: n.speechRate, loudness_rate: n.loudnessRate, pitch_rate: n.pitchRate
      };
      case 'klingVideoAudio': return { video_url: assetUrl(n.video) };
      default: return { prompt: n.prompt };
    }
  }
  function buildAudioQuery(id, task = {}) {
    if (!getAudioModel(id).async) throw new Error('该音频接口同步返回结果，没有查询接口');
    const taskId = first(task, ['taskId', 'task_id'], '');
    if (!string(taskId)) throw new Error('查询需要 task_id');
    const payload = { task_id: taskId };
    const taskPath = first(task, ['taskPath', 'task_path'], '');
    if (taskPath) payload.task_path = taskPath;
    return payload;
  }
  function responseError(value) {
    if (!value || typeof value !== 'object') return '';
    const direct = value.message || value.msg || value.error_message || value.task_status_msg || value.status_msg;
    if (typeof direct === 'string') return direct;
    if (typeof value.error === 'string') return value.error;
    if (value.error && typeof value.error === 'object') return responseError(value.error);
    if (Array.isArray(value.detail)) return value.detail.map(item => item.msg || '').filter(Boolean).join('; ');
    if (typeof value.detail === 'string') return value.detail;
    return '';
  }
  function normalizeAudioResult(id, response) {
    const model = getAudioModel(id);
    const answer = { status: 'pending', results: [], outputs: [], taskId: '', taskPath: '', error: '' };
    const fail = message => ({ ...answer, status: 'failed', error: message || '音频接口返回失败' });
    if (response && typeof response === 'object' && (response.success === false || (present(response.code) && ![0, 200, '0', '200'].includes(response.code)))) return fail(responseError(response) || responseError(response.data));
    const data = response && typeof response === 'object' && own(response, 'data') ? response.data : response;
    const statuses = [];
    let explicitError = '';
    function inspect(value, depth = 0) {
      if (!value || typeof value !== 'object' || depth > 8) return;
      if (Array.isArray(value)) { value.forEach(item => inspect(item, depth + 1)); return; }
      if (value.success === false) explicitError = responseError(value) || '音频接口返回失败';
      for (const key of ['status', 'task_status', 'taskStatus', 'state']) if (present(value[key])) {
        const status = String(value[key]).toLowerCase();
        statuses.push(status);
        if (/^(failed|fail|failure|error|canceled|cancelled|rejected|expired)$/.test(status)) explicitError = responseError(value) || explicitError;
      }
      if (!answer.taskId) answer.taskId = string(value.task_id || value.taskId || (model.async ? value.id : ''));
      if (!answer.taskPath) answer.taskPath = string(value.task_path || value.taskPath);
      for (const key of ['data', 'result', 'results', 'task_result', 'output', 'outputs', 'response', 'audios', 'videos', 'audio_urls', 'audioUrls', 'video_urls', 'videoUrls', 'sunoData']) inspect(value[key], depth + 1);
    }
    inspect(response);
    const failed = statuses.some(status => /^(failed|fail|failure|error|canceled|cancelled|rejected|expired)$/.test(status));
    if (explicitError || failed) return fail(explicitError || responseError(data) || responseError(response));
    if (statuses.some(status => /^(pending|queued|queueing|submitted|created|running|processing|in_progress|generating|waiting)$/.test(status))) return answer;
    const seen = new Set();
    function add(url, type) {
      if (!isUrl(url) || seen.has(url)) return;
      // Never publish a cover or input URL as an audio generation result.
      if (/\.(png|jpe?g|gif|webp|svg)(?:[?#]|$)/i.test(url)) return;
      seen.add(url);
      const mediaType = /\.(mp3|wav|m4a|aac|flac|ogg|opus)(?:[?#]|$)/i.test(url) ? 'audio' : /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(url) ? 'video' : type;
      answer.results.push(url);
      answer.outputs.push({ url, type: mediaType || model.outputType });
    }
    function visit(value, type = model.outputType, depth = 0) {
      if (depth > 10 || value == null) return;
      if (typeof value === 'string') { add(value.trim(), type); return; }
      if (Array.isArray(value)) { value.forEach(item => visit(item, type, depth + 1)); return; }
      if (typeof value !== 'object') return;
      const explicitType = string(value.type || value.mediaType || value.mime_type).split('/')[0].toLowerCase();
      if (explicitType === 'image') return;
      if (explicitType === 'audio' || explicitType === 'video') type = explicitType;
      for (const key of ['audio_url', 'audioUrl', 'audio_urls', 'audioUrls', 'audios']) visit(value[key], 'audio', depth + 1);
      for (const key of ['video_url', 'videoUrl', 'video_urls', 'videoUrls', 'videos']) visit(value[key], 'video', depth + 1);
      for (const key of ['url', 'urls', 'data', 'result', 'results', 'output', 'outputs', 'task_result', 'response', 'sunoData', 'file_url', 'download_url']) visit(value[key], type, depth + 1);
    }
    visit(data);
    if (answer.results.length) {
      answer.outputs.sort((a, b) => Number(b.type === model.outputType) - Number(a.type === model.outputType));
      answer.results = answer.outputs.map(output => output.url);
      return { ...answer, status: 'done' };
    }
    if (model.async && typeof data === 'string' && string(data)) {
      // Keep JSON-encoded routing metadata intact. The gateway queries it verbatim.
      answer.taskId = data;
    }
    if (statuses.some(status => /^(done|completed|complete|succeeded|succeed|success)$/.test(status))) return fail('任务显示完成，但没有返回可用的音频或视频 URL');
    if (!model.async) return fail(responseError(data) || responseError(response) || '同步音频接口没有返回可用的音频 URL');
    return answer;
  }
  return { AUDIO_MODELS, COMMON_MINIMAX_VOICES, MINIMAX_TTS_VERSIONS, UPLOAD, getAudioModel, getAudioDefaults, validateAudioInput, buildAudioPayload, buildAudioQuery, normalizeAudioResult };
});
