const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const modulePath = path.join(__dirname, 'workbench-model-catalog.cjs');
const load = () => require(modulePath);
const image = { type: 'image', url: 'https://cdn.example/subject.png', width: 1280, height: 720 };
const video = { type: 'video', url: 'https://cdn.example/source.mp4', width: 1280, height: 720, duration: 8 };
const audio = { type: 'audio', url: 'https://cdn.example/voice.wav', duration: 8 };
const plain = value => JSON.parse(JSON.stringify(value));

test('new image models share browser/headless contracts and advertise GIF controls', async () => {
  const {getCapabilities,prepareTask}=load();
  const models=getCapabilities().taskFamilies.find(x=>x.id==='image').models;
  const gpt=models.find(x=>x.id==='gpt26');assert.ok(gpt);
  assert.deepEqual(plain(gpt.outputFormats),['png','svg','gif']);assert.equal(gpt.defaults.frameCount,9);
  assert.equal(models.find(x=>x.id==='minimaxH3Image')?.media.maxImages,8);
  const result=await prepareTask({taskType:'image',input:{model:'gpt26',prompt:'Ball',version:'gpt-image-2.6-sunburst',options:{outputFormat:'gif',frameSize:'512x288',frameCount:12,frameDurationMs:150}}});
  assert.equal(result.endpoint,'/gen_img_4o');assert.equal(result.queryEndpoint,'/gen_img_4o_query');
  assert.equal(result.payload.model_name,'gpt-image-2.6-sunburst');assert.equal(result.payload.frame_count,12);
  const h3=await prepareTask({taskType:'image',model:'minimaxH3Image',prompt:'Scene',assets:{images:[image]}});
  assert.equal(h3.endpoint,'/minimax_image');assert.equal(h3.queryEndpoint,'/minimax_image_query');
  assert.equal(h3.payload.resolution,'2K');assert.equal(h3.payload.model_name,'MiniMax-H3-Image');
});

test('a browser-free production model catalog is available', () => {
  assert.ok(fs.existsSync(modulePath), 'headless catalog adapter must exist');
  const catalog = load();
  assert.equal(catalog.DEFAULT_GATEWAY, '', 'public catalog must not embed a company gateway');
  assert.deepEqual(Object.keys(catalog.getCatalogs()).filter(key => key !== 'audio').sort(),
    ['avatar', 'image', 'imageVideo', 'motion', 'multiVideo']);
  assert.equal(catalog.getCapabilities().execution, 'headless');
});

test('every ordinary model and version builds a real gateway request from shared source', async () => {
  const { getCatalogs, prepareTask } = load();
  const built = [];
  for (const [taskType, models] of Object.entries(getCatalogs())) {
    if (taskType === 'audio') continue;
    for (const [model, definition] of Object.entries(models)) {
      if (model === 'runninghub') continue;
      for (const version of definition.versions || [{ value: '' }]) {
        const assets = taskType === 'image' ? { images: [image] }
          : taskType === 'imageVideo' ? { firstFrame: image }
          : taskType === 'motion' ? { image, video }
          : taskType === 'avatar' ? { image, audio } : { refs: [image] };
        const result = await prepareTask({ taskType, model, version: version.value,
          prompt: 'A calm cinematic scene.', assets });
        assert.equal(result.row.model, model);
        assert.equal(result.row.version, version.value);
        assert.ok(result.endpoint.startsWith('/'), `${taskType}/${model} endpoint`);
        assert.equal(typeof result.payload, 'object');
        assert.ok(Object.keys(result.payload).length > 1, `${taskType}/${model} payload`);
        assert.equal(result.mediaType, taskType === 'image' ? 'image' : 'video');
        assert.equal(result.async, Boolean(definition.async));
        assert.ok(JSON.stringify(result.payload).includes('https://cdn.example/'), `${taskType}/${model} refs`);
        built.push(`${taskType}/${model}/${version.value}`);
      }
    }
  }
  assert.ok(built.length >= 35, `Built ${built.length} model/version combinations`);
});

test('adapter merges all input options and preserves edit parameters and original provenance', async () => {
  const result = await load().prepareTask({ taskType: 'multiVideo', id: 'task-demo',
    origin: { type: 'agent', client: 'codex', label: 'Codex', id: 'test' },
    input: { model: 'seedance25', prompt: 'Keep the motion.', assets: { refs: [video] },
      options: { ratio: 'adaptive', duration: -1, generateAudio: false, customSetting: { retain: true } } } });
  assert.equal(result.row.size, 'adaptive');
  assert.equal(result.row.duration, '-1');
  assert.equal(result.payload.ratio, 'adaptive');
  assert.equal(result.payload.duration, -1);
  assert.equal(result.payload.generate_audio, false);
  assert.deepEqual(plain(result.row.customSetting), { retain: true });
  assert.equal(result.row.origin.client, 'codex');
  assert.equal(result.row.executedBy.type, 'headless');
});

test('explicit invalid model, duration, references and unsupported family fail before submission', async () => {
  const { prepareTask } = load();
  await assert.rejects(prepareTask({ taskType: 'image', model: 'unknown', prompt: 'x' }), /model/i);
  await assert.rejects(prepareTask({ taskType: 'unknown', prompt: 'x' }), /task type/i);
  await assert.rejects(prepareTask({ taskType: 'motion', model: 'kling', prompt: 'x' }), /图片|人物图|image/i);
  await assert.rejects(prepareTask({ taskType: 'imageVideo', model: 'seedance2', prompt: 'x', duration: 999 }), /duration|时长/i);
});

test('motion and avatar preserve asset aliases and metadata', async () => {
  const { prepareTask } = load();
  const motion = await prepareTask({ taskType: 'motion-imitation', model: 'kling',
    input: { prompt: 'Follow the motion', image, video, options: { quality: 'pro' } } });
  assert.equal(motion.payload.image_url, image.url);
  assert.equal(motion.payload.video_url, video.url);
  assert.equal(motion.row.video.duration, 8);
  const avatar = await prepareTask({ taskType: 'avatar', model: 'kling', prompt: 'hello',
    assets: { avatarImage: image, voice: audio }, options: { mode: 'std', quality: '720p' } });
  assert.equal(avatar.payload.audio_url, audio.url);
  assert.equal(avatar.payload.resolution, '720p');
  assert.equal(avatar.payload.mode, 'std');
});

test('RunningHub requires explicit config and resolves actual shared node bindings', async () => {
  const { prepareTask, getCatalogs } = load();
  const task = { taskType: 'motion', model: 'runninghub', prompt: 'Follow my movement.', assets: { image, video } };
  await assert.rejects(prepareTask(task), /RunningHub|webappId/i);
  const uploads = [];
  const runtime = { runningHub: { apiKey: 'example-test-key', activeId: 'test-workflow', configs: [{
    id: 'test-workflow', title: 'Test', workflowType: 'motion', webappId: '123456',
    endpoint: '/api/runninghub/run', queryEndpoint: '/api/runninghub/query',
    nodeInfoList: [
      { nodeId: '1', fieldName: 'text', fieldValue: 'old', binding: 'prompt' },
      { nodeId: '2', fieldName: 'image', fieldValue: '', binding: 'referenceImage' },
      { nodeId: '3', fieldName: 'video', fieldValue: '', binding: 'referenceVideo' },
      { nodeId: '4', fieldName: 'fps', fieldValue: '12', binding: 'none' }
    ]
  }] }, uploadRunningHubAsset: async (asset, key, type) => {
    uploads.push({ url: asset.url, key, type }); return `uploaded-${type}`;
  } };
  const result = await prepareTask({ ...task, model: 'rh:test-workflow' }, runtime);
  assert.equal(result.payload.appId, '123456');
  assert.equal(result.payload.apiKey, 'example-test-key');
  assert.deepEqual(plain(result.payload.nodeInfoList).map(node => node.fieldValue),
    ['Follow my movement.', 'uploaded-image', 'uploaded-video', '12']);
  assert.equal(uploads.length, 2);
  assert.ok(getCatalogs(runtime).motion['rh:test-workflow']);
});

test('all audio models build shared payloads and expose usable history and query metadata', async () => {
  const { getCatalogs, prepareTask } = load();
  const expected = {
    minimaxTts: '/minimax_tts', suno: '/suno', seedAudio: '/seed_audio',
    wooshSound: '/woosh_sound', klingVideoAudio: '/kling_video_to_audio'
  };
  assert.deepEqual(Object.keys(getCatalogs().audio), Object.keys(expected));
  for (const [model, endpoint] of Object.entries(expected)) {
    const result = await prepareTask({ taskType: 'audio', model, prompt: 'Quiet rain on a wooden roof.',
      assets: model === 'klingVideoAudio' ? { video } : model === 'seedAudio' ? { referenceAudio: audio } : {} });
    assert.equal(result.endpoint, endpoint);
    assert.equal(result.payload.prompt || result.payload.text || result.payload.video_url,
      model === 'klingVideoAudio' ? video.url : 'Quiet rain on a wooden roof.');
    assert.equal(result.row.prompt, 'Quiet rain on a wooden roof.');
    assert.equal(result.mediaType, model === 'klingVideoAudio' ? 'video' : 'audio');
    if (model === 'seedAudio') assert.equal(result.payload.references[0].audio_url, audio.url);
    if (result.async) assert.deepEqual(result.queryBuilder({ taskId: '{"opaque":"id"}', taskPath: '/provider/task' }),
      { task_id: '{"opaque":"id"}', task_path: '/provider/task' });
    assert.equal(result.resultNormalizer({ data: { audio_url: 'https://cdn.example/result.mp3' } }).status, 'done');
  }
});

test('audio aliases and options cannot be shadowed by canonical defaults', async () => {
  const result = await load().prepareTask({ taskType: 'speech', model: 'minimax_tts',
    input: { text: 'Read the supplied text.', options: { voice_id: 'Wise_Woman',
      mode_name: 'speech-2.5-turbo-preview', vol: 0.5, speed: 1.2 } } });
  assert.equal(result.row.model, 'minimaxTts');
  assert.equal(result.row.prompt, 'Read the supplied text.');
  assert.equal(result.payload.voice_id, 'Wise_Woman');
  assert.equal(result.payload.mode_name, 'speech-2.5-turbo-preview');
  assert.equal(result.payload.vol, 0.5);
  assert.equal(result.payload.speed, 1.2);
});

test('Kling video-edit alias keeps source metadata, reference ordering and explicit sound choice', async () => {
  const result = await load().prepareTask({ taskType: 'video-edit',
    input: { prompt: 'Replace the subject in @1 using @2.', sourceVideo: video, images: [image],
      options: { klingKeepVideoSound: false, size: '4:3', duration: 99 } } });
  assert.equal(result.taskType, 'multiVideo');
  assert.equal(result.row.model, 'kling3Omni');
  assert.equal(result.row.klingMode, 'video_edit');
  assert.equal(result.row.refs[0].duration, 8);
  assert.equal(result.payload.generate_mode, 'video_edit');
  assert.equal(result.payload.reference_video, video.url);
  assert.equal(result.payload.keep_video_sound, false);
  assert.equal(result.payload.reference_images[0], image.url);
  assert.equal(result.payload.aspect_ratio, '');
  assert.equal(result.payload.duration, 0);
});

test('audio history fills an empty display prompt from the actual submitted text', async () => {
  const result = await load().prepareTask({ taskType: 'audio', input: { model: 'minimaxTts', prompt: '',
    options: { text: 'Speech from options', voiceId: 'male-qn-qingse' } } });
  assert.equal(result.row.prompt, 'Speech from options');
  assert.equal(result.payload.text, 'Speech from options');
});

test('real audio UI envelopes preserve every upload slot through shared payload construction', async () => {
  const ui = require('./audio-workbench-ui.js');
  const { prepareTask } = load();
  const cases = [
    ['minimaxTts', { text: 'A narration' }, {}, result => assert.equal(result.payload.text, 'A narration')],
    ['suno', { prompt: 'A piano melody' }, {}, result => assert.equal(result.payload.prompt, 'A piano melody')],
    ['seedAudio', { text: 'Use this voice' }, { referenceAudio: audio }, result => {
      assert.equal(result.payload.references[0].audio_url, audio.url);
      assert.equal(result.row.referenceAudio.duration, audio.duration);
    }],
    ['seedAudio', { text: 'Use this picture' }, { referenceImage: image }, result => {
      assert.equal(result.payload.references[0].image_url, image.url);
      assert.equal(result.row.referenceImage.width, image.width);
    }],
    ['wooshSound', { prompt: 'A soft rain sound' }, {}, result => assert.equal(result.payload.prompt, 'A soft rain sound')],
    ['klingVideoAudio', {}, { video }, result => {
      assert.equal(result.payload.video_url, video.url);
      assert.equal(result.row.video.duration, video.duration);
    }]
  ];
  for (const [model, values, assets, verify] of cases) {
    verify(await prepareTask(ui.makeTask(model, values, assets)));
  }
});

test('audio capabilities describe slot rules and editable voice suggestions', () => {
  const family = load().getCapabilities().taskFamilies.find(item => item.id === 'audio');
  const speech = family.models.find(item => item.id === 'minimaxTts');
  assert.equal(speech.promptKey, 'text');
  assert.equal(speech.voiceList.allowCustom, true);
  assert.ok(speech.hint);
  assert.deepEqual(family.models.find(item => item.id === 'suno').modes,
    [{ value: 'prompt', label: '提示词生成' }]);
});
