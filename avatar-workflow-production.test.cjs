const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, 'avatar-workflow-production.js');
const ui = fs.existsSync(file) ? require(file) : {};

test('speech sends only speech inputs despite populated other panels', () => {
  assert.equal(typeof ui.buildStageJob, 'function');
  const job = ui.buildStageJob('speech', {text:'Hello',voiceId:'v',imageId:'i',workflowId:'rh',audioUrl:'bad',mediaUrl:'bad',speech:{speed:'1.1'}}, {clientTaskId:'x'});
  assert.equal(job.input.operation,'speech');
  assert.equal(job.input.options.speech.speed,1.1);
  assert.equal(job.input.text,'Hello');
  assert.ok(!job.input.audioUrl && !job.input.imageId && !job.input.mediaUrl);
  assert.ok(!job.input.options.avatar && !job.input.options.subtitle);
});

test('avatar and subtitle never request speech and validate only their inputs', () => {
  assert.equal(typeof ui.buildStageJob, 'function');
  const avatar = ui.buildStageJob('avatar',{audioUrl:'https://example.test/a.wav',imageId:'i',prompt:'Wave',speech:{speed:'bad'}});
  assert.equal(avatar.input.operation,'avatar');
  assert.equal(avatar.input.prompt,'Wave');
  assert.ok(!avatar.input.voiceId && !avatar.input.options.speech && !avatar.input.options.subtitle);
  const sub = ui.buildStageJob('subtitle',{mediaUrl:'/api/control/v1/avatar-workflow/media/example.mp4',text:'Transcript',mode:'word',model:'base'});
  assert.equal(sub.input.operation,'subtitle');
  assert.equal(sub.input.text,'Transcript');
  assert.equal(sub.input.options.subtitle.mode,'word');
  assert.ok(!sub.input.imageId && !sub.input.voiceId);
  assert.throws(()=>ui.buildStageJob('subtitle',{mediaUrl:'javascript:bad'}));
  assert.throws(()=>ui.buildStageJob('avatar',{audioUrl:'https://example.test/a.wav'}));
  assert.throws(()=>ui.buildStageJob('unknown',{}));
});

test('adjustment is independent and rejects reversed trim bounds', () => {
  assert.equal(typeof ui.buildStageJob, 'function');
  const job=ui.buildStageJob('adjustAudio',{audioUrl:'https://example.test/a.wav',speed:'1.2',trimStart:'2',trimEnd:'8'});
  assert.deepEqual(job.input.options.adjustAudio,{enabled:true,speed:1.2,trimStart:2,duration:6});
  assert.throws(()=>ui.buildStageJob('adjustAudio',{audioUrl:'https://example.test/a.wav',trimStart:9,trimEnd:8}));
});

test('explicit transfer changes only destination media and keeps source immutable', () => {
  assert.equal(typeof ui.transferDraft, 'function');
  const draft={speech:{text:'Unrelated'},avatar:{audioUrl:'old',imageId:'i',prompt:'Keep'},subtitle:{mediaUrl:'',text:'Existing'}};
  const result={url:'https://example.test/out.wav',kind:'audio',text:'Original transcript',jobId:'j'};
  const next=ui.transferDraft(draft,'avatar',result);
  assert.equal(next.avatar.audioUrl,result.url);
  assert.equal(next.avatar.imageId,'i');
  assert.equal(next.avatar.prompt,'Keep');
  assert.deepEqual(next.speech,draft.speech);
  assert.deepEqual(next.subtitle,draft.subtitle);
  assert.equal(draft.avatar.audioUrl,'old');
  const sub=ui.transferDraft(draft,'subtitle',result);
  assert.equal(sub.subtitle.mediaUrl,result.url);
  assert.equal(sub.subtitle.text,'Existing','existing original text is not silently replaced');
  assert.equal(ui.transferDraft({subtitle:{}},'subtitle',result).subtitle.text,'Original transcript');
  assert.throws(()=>ui.transferDraft(draft,'avatar',{...result,kind:'video'}));
});

test('legacy and explicit job inputs map to scoped drafts without task identity', () => {
  assert.equal(typeof ui.draftsFromHistory, 'function');
  const legacy=ui.draftsFromHistory({inputSnapshot:{text:'Old',voiceId:'v',audioUrl:'https://example.test/a.wav',imageId:'i',options:{subtitle:{enabled:true},speech:{speed:1.2}}}});
  assert.equal(legacy.speech.text,'Old');
  assert.equal(legacy.avatar.imageId,'i');
  assert.equal(legacy.subtitle.mediaUrl,'https://example.test/a.wav');
  const sub=ui.draftsFromHistory({id:'old-job',inputSnapshot:{operation:'subtitle',mediaUrl:'https://example.test/v.mp4',text:'Sub'}});
  assert.deepEqual(Object.keys(sub),['subtitle']);
  assert.equal(sub.subtitle.text,'Sub');
  assert.equal(sub.subtitle.clientTaskId,undefined);
});
