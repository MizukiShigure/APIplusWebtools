const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const uiFile = path.join(__dirname, 'audio-workbench-ui.js');
const ui = fs.existsSync(uiFile) ? require(uiFile) : {};

test('audio workbench exports mount and history recovery without a DOM', () => {
  for (const name of ['mount', 'fromHistory', 'makeTask', 'readSavedState', 'normalizeTask']) {
    assert.equal(typeof ui[name], 'function', name + ' is public');
  }
});

test('audio tasks preserve prompt, model settings and source metadata in the durable envelope', () => {
  const asset = {url:'https://media.example/reference.wav', name:'reference.wav', type:'audio', duration:31, id:'upload-1'};
  const task = ui.makeTask('seedAudio', {text:'Hello',version:'seed-audio-1.0',speechRate:10,loudnessRate:0,pitchRate:-5},
    {referenceAudio:asset}, {clientTaskId:'audio-example'});
  assert.equal(task.taskType,'audio');
  assert.equal(task.clientTaskId,'audio-example');
  assert.equal(task.input.model,'seedAudio');
  assert.equal(task.input.prompt,'Hello');
  assert.equal(task.input.options.speechRate,10);
  assert.equal(task.input.assets.refs[0].name,'reference.wav');
  assert.equal(task.input.assets.refs[0].role,'referenceAudio');
  assert.equal(task.input.assets.refs[0].id,'upload-1');
  assert.equal(task.input.assets.refs[0].duration,31);
});

test('audio validation comes from provider contract and never submits empty or unsafe media inputs', () => {
  assert.throws(()=>ui.makeTask('minimaxTts',{text:''},{}), /.+/);
  assert.throws(()=>ui.makeTask('klingVideoAudio',{}, {video:{url:'javascript:alert(1)',type:'video'}}), /.+/);
  assert.throws(()=>ui.makeTask('unknownModel',{prompt:'x'},{}), /.+/);
});

test('history restores exact settings and existing reference URLs without uploading', () => {
  const task={model:'klingVideoAudio',prompt:'',options:{},assets:{refs:[{url:'https://media.example/source.mp4',type:'video',role:'video',name:'source.mp4'}]}};
  const draft=ui.fromHistory({inputSnapshot:task});
  assert.equal(draft.model,'klingVideoAudio');
  assert.equal(draft.assets.video.url,'https://media.example/source.mp4');
  assert.equal(draft.assets.video.name,'source.mp4');
  assert.deepEqual(ui.fromHistory({task:{input:task}}),draft);
});

test('durable headless history uses the original request instead of its display label and provider payload', () => {
  const record={model:'MiniMax 语音合成',modelKey:'minimaxTts',params:{text:'Wrong fallback'},
    request:{taskType:'audio',input:{model:'minimaxTts',prompt:'Actual narration',options:{voiceId:'Custom_voice',version:'speech-2.5-turbo-preview',speed:1.3,volume:0.7},assets:{refs:[]}}}};
  const restored=ui.fromHistory(record);
  assert.equal(restored.model,'minimaxTts');
  assert.equal(restored.values.text,'Actual narration');
  assert.equal(restored.values.voiceId,'Custom_voice');
  assert.equal(restored.values.version,'speech-2.5-turbo-preview');
  assert.equal(restored.values.volume,0.7);
});

test('provider-only legacy history restores snake case settings and video URLs', () => {
  const speech=ui.fromHistory({modelKey:'minimaxTts',params:{text:'Saved text',voice_id:'Saved_voice',mode_name:'speech-2.5-turbo-preview',speed:1.4,vol:0.6}});
  assert.equal(speech.values.voiceId,'Saved_voice');
  assert.equal(speech.values.volume,0.6);
  const video=ui.fromHistory({modelKey:'klingVideoAudio',params:{video_url:'https://media.example/original.mp4'}});
  assert.equal(video.assets.video.url,'https://media.example/original.mp4');
});

test('CLI snake case options restore the accepted voice settings and option-level text', () => {
  const restored=ui.fromHistory({request:{input:{model:'minimaxTts',prompt:'',options:{text:'CLI narration',voice_id:'Wise_Woman',mode_name:'speech-2.5-turbo-preview',vol:0.5,speed:1.2}}}});
  assert.equal(restored.values.text,'CLI narration');
  assert.equal(restored.values.voiceId,'Wise_Woman');
  assert.equal(restored.values.version,'speech-2.5-turbo-preview');
  assert.equal(restored.values.volume,0.5);
  assert.equal(ui.makeTask(restored.model,restored.values,restored.assets).input.options.voiceId,'Wise_Woman');
});

test('history reroll produces the same payload as the shared worker for nested references and option precedence', async () => {
  const {prepareTask}=require('./workbench-model-catalog.cjs');
  const examples=[
    {model:'seedAudio',prompt:'Seed narration',options:{speech_rate:45,pitch_rate:-10,references:[{audio_url:'https://media.example/voice.wav'}]}},
    {model:'minimaxTts',text:'Direct text',prompt:'Unused prompt',voiceId:'Direct_voice',options:{text:'Option text',voiceId:'Options_voice',voice_id:'Ignored_alias',speed:1.2,vol:0.6}}
  ];
  for(const input of examples) {
    const original=await prepareTask({taskType:'audio',input});
    const restored=ui.fromHistory({request:{input}});
    const reroll=await prepareTask(ui.makeTask(restored.model,restored.values,restored.assets));
    assert.deepEqual(reroll.payload,original.payload);
  }
});

test('restored pending work keeps task ID, and an interrupted create becomes unknown instead of resubmitting', () => {
  const saved={selectedModel:'suno',drafts:{suno:{values:{prompt:'A song'},assets:{}}},tasks:[
    {taskId:'persisted-1',clientTaskId:'client-1',state:'polling',input:{model:'suno',prompt:'A song'}},
    {clientTaskId:'client-2',state:'submitting',input:{model:'suno',prompt:'Another song'}}
  ]};
  const storage={getItem:()=>JSON.stringify(saved)};
  const result=ui.readSavedState(storage);
  assert.equal(result.tasks[0].taskId,'persisted-1');
  assert.equal(result.tasks[0].state,'polling');
  assert.equal(result.tasks[1].state,'submission-unknown');
  assert.equal(result.drafts.suno.values.prompt,'A song');
});

test('task normalization accepts server envelopes and rejects unsafe result URLs', () => {
  const task=ui.normalizeTask({success:true,task:{taskId:'one',state:'completed',results:[
    {url:'https://media.example/sound.mp3',type:'audio'}, {url:'javascript:alert(1)',type:'audio'}],
    input:{model:'minimaxTts',prompt:'hello'},error:{message:'Example failure'}}});
  assert.equal(task.taskId,'one');
  assert.equal(task.results.length,1);
  assert.equal(task.results[0].type,'audio');
  assert.equal(task.error,'Example failure');
});
