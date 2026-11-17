const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}
const model = { label:'Kling 3 Omni', versions:[{value:'kling-v3-omni'}], sizes:['16:9','9:16','1:1'], qualities:['720p','1080p'], durations:['5','10'], defaultQuality:'1080p', defaultDuration:'10', supportsGenerateAudio:true };
const contracts = require('./model-contracts.js');
const history = [];
const context = vm.createContext({
  MULTI_VIDEO_MODELS:{kling3Omni:model,seedance:model}, uid:()=> 'test-row', completionTimeFromSeed:()=>0,
  renderStackedControlCell:controls=>controls.map(x=>x.label+x.control).join('\n'),
  renderOptions:(values,selected)=>values.map(x=>`<option ${x===selected?'selected':''}>${x}</option>`).join(''),
  getMultiQualityOptions:()=>model.qualities, escapeHtml:String, escapeAttr:String,
  generationAssetsFromRecord:r=>r.refs || [],
  getMultiModel:()=>model, normalizeResults:value=>value,
  appendUniqueResults:(target,urls)=>target.results.push(...urls), markRemoteTaskComplete:()=>{},
  addGenerationHistory:record=>history.push(record), cloneAssets:items=>items.map(item=>({...item})),
});
vm.runInContext(['createMultiRow','renderMultiModelCell','renderMultiParamsCell','createPendingRowFromGeneration','appendMultiRowResult','multiModelKeyFromGeneration','modelKeyFromMap','gcdNumber'].map(fn).join('\n'), context);
const row = context.createMultiRow({model:'kling3Omni',klingMode:'video_edit',klingKeepVideoSound:false});
assert.equal(row.klingMode, 'video_edit', 'mode survives row copy/persistence');
assert.equal(row.klingKeepVideoSound, false, 'explicit sound removal survives row copy');
const html = context.renderMultiParamsCell(row,model,'');
assert.match(html,/跟随原视频/);
assert.doesNotMatch(html,/data-multi-field="(?:size|duration|generateAudio)"/, 'edit cannot impose generation duration/ratio/audio');
assert.match(html,/data-multi-field="klingKeepVideoSound"/);
assert.match(context.renderMultiModelCell(row,model,''),/data-multi-field="klingMode"/);
assert.doesNotMatch(context.renderMultiModelCell(row,model,''),/data-multi-field="version"/);
const restored = context.createPendingRowFromGeneration({model:'Kling',prompt:'change the background',refs:[],params:{generate_mode:'video_edit',keep_video_sound:false}},'multiVideo');
assert.equal(restored.klingMode,'video_edit', 'history reroll preserves edit intent');
assert.equal(restored.klingKeepVideoSound,false);
const regular = context.createMultiRow({model:'kling3Omni'});
assert.equal(regular.klingMode,'multi_reference');
assert.match(context.renderMultiParamsCell(regular,model,''),/data-multi-field="duration"/);

const image = {type:'image',url:'https://cdn.example/reference.png',width:900,height:1200,size:1024};
const video = {type:'video',url:'https://cdn.example/source.mp4',width:1440,height:1080,duration:8.375,size:4096};
const completed = context.createMultiRow({
  model:'kling3Omni',klingMode:'video_edit',klingKeepVideoSound:false,
  prompt:'Edit @2 using @1.',refs:[image,video],size:'9:16',duration:'5',
});
const payload = contracts.buildKling3OmniPayload(completed);
context.appendMultiRowResult(completed,['https://cdn.example/result.mp4'],payload,'opaque-task-id');
const saved = history[0];
assert.equal(saved.modelKey,'kling3Omni', 'history keeps stable model routing independent of display labels');
assert.equal(saved.model,'Kling Omni 视频编辑', 'history does not claim an upstream edit model version the wrapper omitted');
assert.equal(saved.version,'');
assert.equal(saved.sourceFollow,true);
assert.equal(saved.size,'4:3', 'history shows the source frame ratio, not a stale generation control');
assert.equal(saved.duration,8.375, 'history keeps source duration, not a stale requested output duration');
assert.equal(saved.params.duration,0);
assert.equal(saved.params.aspect_ratio,'');
assert.equal(saved.params.keep_video_sound,false);
assert.equal(Object.hasOwn(saved.params,'model_name'),false);
assert.equal(saved.refs[1].width,1440);
assert.equal(saved.refs[1].duration,8.375);
const reroll = context.createPendingRowFromGeneration(JSON.parse(JSON.stringify(saved)),'multiVideo');
assert.equal(reroll.model,'kling3Omni');
assert.equal(reroll.klingMode,'video_edit');
assert.equal(reroll.klingKeepVideoSound,false);
assert.deepEqual(contracts.buildKling3OmniPayload(reroll),payload, 'history re-roll reconstructs the exact request and reference order');
assert.equal(context.multiModelKeyFromGeneration({model:'Older edit label',params:{generate_mode:'video_edit'}}),'kling3Omni');
const unknownMeta = {...completed,refs:[{type:'video',url:video.url}]};
assert.match(contracts.validateKling3OmniRow(unknownMeta),/元数据/, 'no source metadata means no submission');
assert.throws(()=>contracts.buildKling3OmniPayload(unknownMeta),/元数据/);
console.log('Kling edit UI lifecycle checks passed');
