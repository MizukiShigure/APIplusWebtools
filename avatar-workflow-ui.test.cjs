const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, 'avatar-workflow-ui.js');
const ui = fs.existsSync(file) ? require(file) : {};

test('mount lifecycle is exported without requiring a DOM', () => {
  for (const name of ['mount', 'unmount', 'fromHistory']) assert.equal(typeof ui[name], 'function');
});

test('job envelope is exact, uses registry IDs and defaults to Kling', () => {
  const result = ui.buildJob({text:'Hello',voiceId:'v1',imageId:'i1'}, {clientTaskId:'c1',origin:{type:'browser'}});
  assert.deepEqual(result, {clientTaskId:'c1',origin:{type:'browser'},input:{
    text:'Hello',voiceId:'v1',imageId:'i1',workflowId:'',audioUrl:'',prompt:'',
    options:{speech:{model:'speech-2.8-hd',language:'auto',speed:1,volume:1,pitch:0},avatar:{enabled:true,model:'kling'},subtitle:{enabled:false},adjustAudio:{enabled:false}}
  }});
});

test('TTS controls and advanced modifiers survive history reuse with numeric validation', () => {
  const speech={model:'speech-2.8-turbo',language:'zh',speed:1.15,volume:0.9,pitch:-2,
    voiceModifyPitch:12,voiceModifyIntensity:-20,voiceModifyTimbre:5,soundEffects:'spacious_echo'};
  const draft=ui.historyDraft({inputSnapshot:{text:'Hello',voiceId:'v',options:{speech,avatar:{enabled:false}}}});
  assert.deepEqual(ui.buildJob(draft).input.options.speech,speech);
  for(const invalid of [{speed:0},{volume:11},{pitch:13},{voiceModifyTimbre:101}]){
    assert.throws(()=>ui.buildJob({text:'T',voiceId:'v',avatarEnabled:false,speech:invalid}));
  }
});

test('speech-only and explicit Kling do not require an avatar image', () => {
  const speech = ui.buildJob({text:'Hello',voiceId:'v1',avatarEnabled:false},{clientTaskId:'speech'});
  assert.equal(speech.input.options.avatar.enabled,false);
  assert.equal(speech.input.imageId,'');
  assert.equal(ui.buildJob({audioUrl:'https://m.test/a',imageId:'i',workflowId:'kling'},{clientTaskId:'k'}).input.workflowId,'');
});

test('audio input bypasses text and voice; speed and trim are numeric', () => {
  const result = ui.buildJob({audioUrl:'https://media.test/a.wav',imageId:'i1',text:'ignored',
    adjustAudio:true,speed:'1.2',trimStart:'2',trimEnd:'20',subtitle:true,workflowId:'rh1'}, {clientTaskId:'c2'});
  assert.equal(result.input.text, '');
  assert.equal(result.input.voiceId, '');
  assert.deepEqual(result.input.options.adjustAudio,{enabled:true,speed:1.2,trimStart:2,duration:18});
  assert.equal(result.input.options.avatar.model,'runninghub');
  assert.equal(result.input.options.subtitle.enabled,true);
});

test('job validation blocks incomplete inputs and invalid adjustments', () => {
  assert.equal(typeof ui.buildJob,'function');
  for (const draft of [ {}, {text:'Hello',imageId:'i1'}, {audioUrl:'javascript:alert(1)',imageId:'i1'},
    {audioUrl:'https://a.test/a',imageId:'i1',adjustAudio:true,speed:0},
    {audioUrl:'https://a.test/a',imageId:'i1',adjustAudio:true,trimStart:5,trimEnd:2} ]) {
    assert.throws(() => ui.buildJob(draft,{clientTaskId:'c'}));
  }
});

test('RH parser accepts arrays, inputs, nested nodeInfoList and preserves bindings', () => {
  const node = {nodeId:4,fieldName:'image',fieldValue:'fixed.png',binding:'referenceImage',extra:{mode:'keep'}};
  for (const payload of [[node],{inputs:[node]},{nodeInfoList:[node]},{data:{inputs:[node]}}]) {
    const parsed = ui.parseWorkflow(JSON.stringify(payload),'https://www.runninghub.cn/ai-detail/1234567890123');
    assert.equal(parsed.webappId,'1234567890123');
    assert.equal(parsed.nodeInfoList[0].binding,'referenceImage');
    assert.equal(parsed.nodeInfoList[0].fieldValue,'fixed.png');
    assert.deepEqual(parsed.nodeInfoList[0].extra,{mode:'keep'});
  }
  assert.throws(() => ui.parseWorkflow('{bad',''), /JSON/);
  assert.throws(() => ui.parseWorkflow('{"webappId":"12","inputs":[]}',''));
});

test('RH parser accepts legacy JSON-string node lists without losing bindings', () => {
  const nodes=[{nodeId:'7',fieldName:'audio',fieldValue:'fixed.wav',dynamicBinding:'referenceAudio',extra:{keep:true}}];
  for(const payload of [{nodeInfoList:JSON.stringify(nodes)},{nodes:JSON.stringify(nodes)},{data:{inputs:JSON.stringify(nodes)}}]){
    const parsed=ui.parseWorkflow(JSON.stringify(payload),'','example-webapp');
    assert.equal(parsed.nodeInfoList[0].binding,'referenceAudio');
    assert.equal(parsed.nodeInfoList[0].fieldValue,'fixed.wav');
    assert.deepEqual(parsed.nodeInfoList[0].extra,{keep:true});
  }
  assert.throws(()=>ui.parseWorkflow({nodeInfoList:'invalid JSON'},'','example-webapp'),/JSON/);
});

test('workflow reads and parse results never rehydrate a plaintext key', () => {
  const secret = 'example-only-secret';
  const result = ui.parseWorkflow(JSON.stringify({webappId:'12',apiKey:secret,nodeInfoList:[
    {nodeId:'1',fieldName:'audio',fieldValue:'a',dynamicBinding:'referenceAudio'}
  ]}),'');
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(result.nodeInfoList[0].binding,'referenceAudio');
  const clean = ui.publicRecord({apiKey:secret,nested:{token:secret},name:'safe'});
  assert.ok(!JSON.stringify(clean).includes(secret));
  assert.equal(clean.apiKeyConfigured,true);
});

test('conditional edits preserve unknown fields and omit unchanged credentials', () => {
  const base = {id:'rh1',version:7,apiKey:'example-secret',name:'Old',nodes:[{binding:'image'}],custom:true};
  const update = ui.mutation(base,{name:'New'},'');
  assert.equal(update.expectedVersion,7);
  assert.equal(update.item.custom,true);
  assert.equal(update.item.name,'New');
  assert.ok(!('apiKey' in update.item));
  assert.equal(ui.mutation(base,{name:'New'},' example-new-key ').item.apiKey,'example-new-key');
  assert.deepEqual(ui.mutation(null,{id:'new',name:'N'}),{item:{id:'new',name:'N'}});
});

test('album pagination bounds media, reverse lookup and favorites', () => {
  const images = Array.from({length:101},(_,i)=>({id:String(i),name:`Image ${i}`,voiceIds:i%2?['v']:[],favorite:i%3===0,tags:['portrait']}));
  assert.equal(ui.pageImages(images,{page:1}).items.length,12);
  assert.equal(ui.pageImages(images,{page:100}).page,9);
  const page = ui.pageImages(images,{voiceId:'v',favorite:true,query:'portrait'});
  assert.ok(page.items.every(i=>i.voiceIds.includes('v') && i.favorite));
  assert.equal(page.total,17);
});

test('legacy import reads only requested known keys and never writes storage', () => {
  const values = new Map([
    ['api_console_runninghub_motion_config_v1',JSON.stringify({apiKey:'example-migration-secret',configs:[{id:'rh',webappId:'1'}]})],
    ['tts_avatar_voice_library_v1',JSON.stringify([{id:'voice',voiceId:'vendor-v'}])],
    ['tts_avatar_runninghub_workflows_v1',JSON.stringify([{id:'legacy-rh',webappId:'2'}])]
  ]);
  const storage = {getItem:key=>values.get(key)||null,setItem(){throw Error('write');},removeItem(){throw Error('remove');},clear(){throw Error('clear');}};
  const result = ui.readLegacy(storage);
  assert.equal(result.source,'browser');
  assert.equal(result.voices.length,1);
  assert.equal(result.runningHubWorkflows[0].apiKey,'example-migration-secret');
  assert.equal(result.runningHubWorkflows.length,2);
  assert.equal(values.size,3);
});

test('history reuse copies only input, never task IDs or secrets', () => {
  const result = ui.historyDraft({id:'job1',inputSnapshot:{text:'Hi',voiceId:'v',imageId:'i',apiKey:'example-history-secret',
    options:{adjustAudio:{enabled:true,speed:1.1,trimStart:1,duration:8},avatar:{model:'kling'},subtitle:{enabled:true}}}});
  assert.equal(result.text,'Hi');
  assert.equal(result.speed,1.1);
  assert.equal(result.subtitle,true);
  assert.equal(result.trimEnd,9);
  assert.ok(!JSON.stringify(result).includes('example-history-secret'));
  assert.ok(!('clientTaskId' in result));
});

test('styles remain scoped, fixed media proportions, and bounded cards', () => {
  const css = fs.readFileSync(path.join(__dirname,'avatar-workflow-ui.css'),'utf8');
  assert.match(css,/\.awf/);
  assert.match(css,/aspect-ratio/);
  assert.doesNotMatch(css,/border-radius:\s*(?:9|\d{2,})px/);
  assert.doesNotMatch(css,/(?:^|\})\s*(?:body|:root|html)\s*\{/);
});

let playwright;
try { playwright = require(process.env.AWF_PLAYWRIGHT || 'playwright'); } catch {}
test('fresh browser: mocked REST, conflicts, focus, results, layout and cleanup', {skip:!playwright}, async () => {
  const browser = await playwright.chromium.launch({headless:true,channel:process.env.AWF_BROWSER_CHANNEL || 'chrome'});
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  const page = await context.newPage();
  const errors = [], requests = [], jobs = [];
  let dependenciesAvailable=true, failLibraryOnce=false, holdJobs=false, heldJobs=null;
  page.on('pageerror', error=>errors.push(error.message));
  const library = {success:true,voices:[{id:'v1',version:1,voiceId:'provider-v1',name:'Voice One'}],
    images:Array.from({length:31},(_,i)=>({id:'i'+i,version:1,name:'Portrait '+i,url:'http://awf.test/preview/'+i+'.png',voiceIds:['v1'],defaultVoiceId:'v1'})),
    workflows:[{id:'rh1',version:1,name:'RH One',webappId:'123',apiKey:'example-should-never-render',apiKeyConfigured:true,
      nodeInfoList:JSON.stringify([{nodeId:'1',fieldName:'image',fieldValue:'fixed',binding:'referenceImage'}])},
      {id:'rh-avatar',version:1,name:'Avatar Workflow',webappId:'456',workflowType:'avatar',provider:'runninghub',nodeInfoList:[{nodeId:'1',fieldName:'audio',binding:'referenceAudio'}]},
      {id:'rh-motion',version:1,name:'Motion Workflow',webappId:'789',workflowType:'motion',provider:'runninghub',nodeInfoList:[{nodeId:'1',fieldName:'video',binding:'referenceVideo'}]}],settings:[]};
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aen8AAAAASUVORK5CYII=','base64');
  await page.route('**/*',async route=>{
    const req=route.request(), url=new URL(req.url()), method=req.method();
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname==='/') return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="host" class="workspace"></main>'});
    if(url.pathname.startsWith('/preview/')) return route.fulfill({contentType:'image/png',body:png});
    requests.push({method,path:url.pathname,body:req.postData()});
    if(url.pathname.endsWith('/session')) return reply({success:true});
    if(url.pathname.endsWith('/library')){
      if(failLibraryOnce){failLibraryOnce=false; return reply({success:false},503);}
      return reply(library);
    }
    if(url.pathname.endsWith('/dependencies')) return reply({success:true,python:{available:dependenciesAvailable},ffmpeg:{available:dependenciesAvailable},subtitleService:{available:dependenciesAvailable},subtitle:{available:dependenciesAvailable},adjustAudio:{available:dependenciesAvailable}});
    if(url.pathname.endsWith('/audio')&&method==='POST') return reply({success:true,url:'/api/control/v1/avatar-workflow/media/audio.wav',mimeType:'audio/wav',name:'audio.wav'});
    if(url.pathname.endsWith('/migrate')) return reply({success:true});
    if(url.pathname==='/api/control/v1/avatar-workflow/images'&&method==='POST'){
      library.images.unshift({id:'uploaded',version:1,name:'upload.png',url:'http://awf.test/preview/upload.png',voiceIds:[]});
      return reply({success:true,item:library.images[0]});
    }
    if(url.pathname.includes('/library/')){
      const [collection,id]=url.pathname.split('/library/')[1].split('/');
      const body=req.postDataJSON(), itemId=id||body.item.id;
      const previous=library[collection].find(item=>item.id===itemId);
      if(previous && body.expectedVersion!==previous.version) return reply({success:false,error:'Version conflict'},409);
      library[collection]=library[collection].filter(item=>item.id!==itemId);
      if(method!=='DELETE') library[collection].push({...body.item,version:(previous?.version||0)+1});
      return reply({success:true});
    }
    if(url.pathname.endsWith('/jobs')){
      if(method==='POST'){jobs.unshift({id:'job1',status:'running',input:req.postDataJSON().input,stages:[{name:'speech',status:'running',progress:35}]}); return reply({success:true,job:jobs[0]});}
      if(holdJobs){holdJobs=false;const snapshot=JSON.parse(JSON.stringify(jobs));heldJobs=()=>reply({success:true,jobs:snapshot});return;}
      return reply({success:true,jobs});
    }
    if(url.pathname.includes('/jobs/')) return reply({success:true,job:jobs[0]});
    return reply({success:false,error:'Unexpected mock route'},404);
  });
  try {
    await page.goto('http://awf.test/');
    await page.addStyleTag({path:path.join(__dirname,'styles.css')});
    await page.addStyleTag({path:path.join(__dirname,'avatar-workflow-ui.css')});
    await page.addScriptTag({path:path.join(__dirname,'avatar-workflow-production.js')});
    await page.addScriptTag({path:file});
    await page.evaluate(async()=>{
      window.historyChanges=0;
      window.awf=AvatarWorkflowUI.mount(document.querySelector('#host'),{apiBase:'https://gateway.test/api',origin:{type:'browser',id:'test'},onHistoryChanged(){window.historyChanges++;}});
      await window.awf.ready;
    });
    assert.equal(await page.locator('[data-tab]').count(),4);
    assert.equal(await page.locator('[data-stage-tab]').count(),3);
    await page.evaluate(()=>window.originalWorkflowOption=document.querySelector('[name="workflowId"] option'));
    await page.evaluate(()=>window.awf.refresh());
    assert.equal(await page.evaluate(()=>window.originalWorkflowOption===document.querySelector('[name="workflowId"] option')),true,'unchanged polling must not rebuild open selectors');
    assert.deepEqual(await page.locator('[name="workflowId"] option').evaluateAll(nodes=>nodes.map(node=>node.value)),['','rh1','rh-avatar']);
    await page.locator('[data-operation="speech"] [name="text"]').fill('A carefully typed script');
    await page.locator('[data-stage-tab="avatar"]').click();
    await page.locator('[name="imageId"]').selectOption('i0');
    await page.locator('[data-stage-tab="speech"]').click();
    await page.locator('[name="voiceId"]').selectOption('v1');
    await page.locator('[name="speechModel"]').selectOption('speech-2.8-turbo');
    await page.locator('[name="speechLanguage"]').selectOption('zh');
    await page.locator('[name="speechSpeed"]').fill('1.15');
    await page.locator('[data-operation="speech"] [name="text"]').focus();
    await page.locator('[data-operation="speech"] [name="text"]').evaluate(el=>el.setSelectionRange(2,7));
    library.voices.push({id:'v2',version:1,voiceId:'v2',name:'Voice Two'});
    await page.evaluate(()=>window.awf.refresh());
    assert.deepEqual(await page.locator('[data-operation="speech"] [name="text"]').evaluate(el=>[el.value,el.selectionStart,el.selectionEnd,document.activeElement===el]),['A carefully typed script',2,7,true]);
    await page.locator('[data-stage-tab="avatar"]').click();
    await page.locator('[name="workflowId"]').selectOption('rh-avatar');
    library.workflows.find(item=>item.id==='rh-avatar').workflowType='motion';
    await page.evaluate(()=>window.awf.refresh());
    await page.locator('[data-submit="avatar"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-notice]')?.textContent.includes('不适用于数字人'));
    assert.equal(requests.filter(r=>r.path.endsWith('/jobs')&&r.method==='POST').length,0,'a stale workflow reclassified as motion must not be submitted');
    library.workflows.find(item=>item.id==='rh-avatar').workflowType='avatar';
    await page.evaluate(()=>window.awf.refresh());
    await page.locator('[name="workflowId"]').selectOption('');
    await page.locator('[data-stage-tab="speech"]').click();
    holdJobs=true;
    await page.evaluate(()=>{window.staleRefresh=window.awf.refresh();});
    while(!heldJobs) await new Promise(resolve=>setTimeout(resolve,5));
    await page.locator('[data-submit="speech"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-job-id="job1"]'));
    await heldJobs();
    await page.evaluate(()=>window.staleRefresh);
    assert.equal(await page.locator('[data-job-id="job1"]').count(),1,'stale list cannot erase accepted task');
    assert.equal(await page.locator('[data-submit="speech"]').isDisabled(),true,'accepted active task stays locked');
    const submitted=JSON.parse(requests.find(r=>r.path.endsWith('/jobs')&&r.method==='POST').body);
    assert.equal(submitted.input.operation,'speech');
    assert.equal(submitted.input.options.avatar,undefined);
    assert.equal(submitted.input.apiBase,'https://gateway.test/api');
    assert.equal(submitted.input.options.speech.speed,1.15);
    assert.equal(submitted.input.options.speech.language,'zh');
    assert.equal(submitted.input.options.speech.model,'speech-2.8-turbo');
    assert.deepEqual(Object.keys(submitted).sort(),['clientTaskId','input','origin']);
    jobs[0]={id:'job1',state:'completed',stage:'completed',input:submitted.input,
      steps:{speech:{url:'https://media.test/audio.wav'},avatar:{url:'https://media.test/video.mp4'},subtitle:{url:'https://media.test/sub.srt'}}};
    await page.evaluate(()=>window.awf.refresh());
    assert.ok(await page.locator('[data-job-id="job1"] a').count()>=3);
    assert.equal(await page.locator('[data-job-id="job1"]').getAttribute('data-state'),'completed');
    assert.equal(await page.locator('[data-job-id="job1"] .awf-status').textContent(),'完成');
    assert.ok((await page.locator('[data-job-id="job1"] .awf-stages').textContent()).includes('语音合成'));
    assert.ok(await page.evaluate(()=>window.historyChanges)>0);
    jobs.push({id:'older',state:'completed',input:{operation:'speech'},steps:{speech:{url:'https://media.test/older.wav'}}});
    await page.evaluate(()=>window.awf.refresh());
    await page.locator('[name="output-speech"]').selectOption('older:speech');
    await page.locator('[data-stage-tab="avatar"]').click();
    await page.locator('[name="prompt"]').fill('Unrelated avatar draft');
    await page.evaluate(async()=>{
      AvatarWorkflowUI.unmount();
      AvatarWorkflowUI.fromHistory({inputSnapshot:{operation:'subtitle',mediaUrl:'https://media.test/input.mp4',text:'Subtitle reuse'}});
      window.awf=AvatarWorkflowUI.mount(document.querySelector('#host'),{apiBase:'https://gateway.test/api',origin:{type:'browser',id:'test'},onHistoryChanged(){window.historyChanges++;}});await window.awf.ready;
    });
    assert.equal(await page.locator('[data-operation="speech"] [name="text"]').inputValue(),'A carefully typed script','unmounted subtitle reuse preserves speech draft');
    assert.equal(await page.locator('[name="prompt"]').inputValue(),'Unrelated avatar draft');
    assert.equal(await page.locator('[data-operation="subtitle"] [name="text"]').inputValue(),'Subtitle reuse');
    assert.equal(await page.locator('[name="output-speech"]').inputValue(),'older:speech','older result selection survives remount');
    assert.equal(await page.locator('[data-stage-tab="subtitle"]').getAttribute('aria-selected'),'true');
    await page.evaluate(()=>AvatarWorkflowUI.fromHistory({inputSnapshot:{text:'Motion history',voiceId:'v1',imageId:'i0',workflowId:'rh-motion'}}));
    assert.equal(await page.locator('[name="workflowId"] option[value="rh-motion"]').count(),0);
    assert.equal(await page.locator('[name="workflowId"]').inputValue(),'__unavailable_workflow__','motion history must not silently switch to Kling');
    await page.locator('[data-stage-tab="avatar"]').click();
    await page.locator('[data-submit="avatar"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-notice]')?.textContent.includes('不适用于数字人'));
    assert.equal(requests.filter(r=>r.path.endsWith('/jobs')&&r.method==='POST').length,1);
    await page.locator('[name="workflowId"]').selectOption('');
    await page.locator('[data-tab="album"]').click();
    assert.equal(await page.locator('.awf-album-grid img[loading="lazy"]').count(),12);
    await page.locator('[data-action="next-images"]').click();
    assert.equal(await page.locator('.awf-album-grid img').count(),12);
    await page.locator('[data-edit="images"]').first().click();
    await page.locator('[data-editor="images"] [name="name"]').fill('Edited portrait');
    await page.locator('[data-editor="images"] [name="favorite"]').check();
    await page.locator('[data-editor="images"] [name="boundVoice"][value="v2"]').check();
    await page.locator('[data-editor="images"] [name="defaultVoiceId"]').selectOption('v2');
    await page.locator('[data-editor="images"] [type="submit"]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-editor="images"]'));
    assert.ok(library.images.some(item=>item.name==='Edited portrait'&&item.favorite),
      JSON.stringify(requests.filter(r=>r.path.includes('/library/images'))));
    assert.deepEqual(library.images.find(item=>item.name==='Edited portrait').voiceIds,['v1','v2']);
    assert.equal(library.images.find(item=>item.name==='Edited portrait').defaultVoiceId,'v2');
    await page.locator('[data-panel="album"] [name="imageFile"]').setInputFiles({name:'upload.png',mimeType:'image/png',buffer:png});
    await page.waitForFunction(()=>document.querySelector('.awf-album-grid')?.textContent.includes('upload.png'));
    assert.ok(requests.find(r=>r.path==='/api/control/v1/avatar-workflow/images'&&r.method==='POST').body.includes('name="image"'));
    assert.ok(requests.find(r=>r.path==='/api/control/v1/avatar-workflow/images'&&r.method==='POST').body.includes('name="origin"'));
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});
      const layout=await page.evaluate(()=>{
        const root=document.querySelector('.awf');
        const cards=[...document.querySelectorAll('.awf-image-card')].map(el=>el.getBoundingClientRect());
        return {overflow:root.scrollWidth>root.clientWidth+1,overlaps:cards.some((a,i)=>cards.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1))};
      });
      assert.deepEqual(layout,{overflow:false,overlaps:false});
      const shot=await page.screenshot();
      assert.ok(shot.length>5000);
      if(process.env.AWF_SCREENSHOT) console.log('AWF_SCREENSHOT:'+shot.toString('base64'));
    }
    await page.locator('[data-tab="voices"]').click();
    await page.locator('[data-edit="voices"][data-id="v1"]').click();
    await page.locator('[data-editor="voices"] [name="name"]').fill('Unsaved voice');
    await page.locator('[data-editor="voices"] [name="preferredLanguages"]').fill('Portuguese');
    await page.locator('[data-editor="voices"] [name="selectionRequirements"]').fill('Warm ad delivery');
    library.voices.find(v=>v.id==='v1').version=2;
    await page.evaluate(()=>window.awf.refresh());
    await page.locator('[data-editor="voices"] [type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-notice]')?.textContent.includes('409'));
    assert.equal(await page.locator('[data-editor="voices"] [name="name"]').inputValue(),'Unsaved voice');
    assert.equal(await page.locator('[data-editor="voices"] [name="preferredLanguages"]').inputValue(),'Portuguese');
    assert.equal(await page.locator('[data-editor="voices"] [name="selectionRequirements"]').inputValue(),'Warm ad delivery');
    await page.locator('[data-action="cancel-editor"]').click();
    await page.locator('[data-tab="workflows"]').click();
    await page.locator('[data-edit="workflows"][data-id="rh1"]').click();
    const editorNodes=JSON.parse(await page.locator('[data-editor="workflows"] [name="payload"]').inputValue());
    assert.ok(Array.isArray(editorNodes),'legacy string nodeInfoList must display as editable array JSON, not a quoted string');
    assert.equal(editorNodes[0].binding,'referenceImage');
    assert.equal(await page.locator('[name="apiKey"]').inputValue(),'');
    assert.ok(!(await page.content()).includes('example-should-never-render'));
    await page.locator('[data-editor="workflows"] [name="name"]').fill('Renamed RH');
    await page.locator('[data-editor="workflows"] [type="submit"]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-editor="workflows"]'));
    const saved=JSON.parse(requests.findLast(r=>r.path.endsWith('/library/workflows')&&r.method==='POST').body);
    assert.ok(!('apiKey' in saved.item));
    assert.equal(saved.item.nodeInfoList[0].binding,'referenceImage');
    await page.locator('[data-tab="voices"]').click();
    await page.locator('[data-edit="voices"][data-id="v1"]').click();
    await page.locator('[data-editor="voices"] [name="notes"]').fill('Unsaved notes');
    await page.locator('[data-tab="workflows"]').click();
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('[data-new="workflows"]').click();
    assert.equal(await page.locator('[data-editor]').count(),1,'switching editors must remove the discarded hidden form');
    await page.locator('[data-editor="workflows"] [name="name"]').fill('Native Avatar Workflow');
    await page.locator('[data-editor="workflows"] [name="sourceUrl"]').fill('https://www.runninghub.cn/ai-detail/1234567890123');
    await page.locator('[data-editor="workflows"] [name="payload"]').fill(JSON.stringify({inputs:[{nodeId:'1',fieldName:'image',fieldValue:'fixed.png',binding:'referenceImage'}]}));
    await page.locator('[data-action="parse-workflow"]').click();
    await page.locator('[data-editor="workflows"] [type="submit"]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-editor="workflows"]'));
    const createdWorkflow=library.workflows.find(item=>item.name==='Native Avatar Workflow');
    assert.equal(createdWorkflow.provider,'runninghub');
    assert.equal(createdWorkflow.workflowType,'avatar');
    assert.equal(createdWorkflow.nodeInfoList[0].binding,'referenceImage');
    await page.locator('[data-edit="workflows"][data-id="rh-motion"]').click();
    await page.locator('[data-editor="workflows"] [name="name"]').fill('Renamed Motion Workflow');
    await page.locator('[data-editor="workflows"] [type="submit"]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-editor="workflows"]'));
    assert.equal(library.workflows.find(item=>item.id==='rh-motion').workflowType,'motion','editing shared motion records must not relabel them as avatar');
    await page.locator('[data-tab="voices"]').click();
    await page.locator('[data-new="voices"]').click();
    await page.locator('[data-editor="voices"] [name="name"]').fill('New Voice');
    await page.locator('[data-editor="voices"] [name="voiceId"]').fill('new-provider-id');
    await page.locator('[data-editor="voices"] [name="tags"]').fill('bright, natural');
    await page.locator('[data-editor="voices"] [name="notes"]').fill('Synthetic fixture');
    await page.locator('[data-editor="voices"] [name="favorite"]').check();
    await page.locator('[data-editor="voices"] [type="submit"]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-editor="voices"]'));
    const newVoice=library.voices.find(v=>v.name==='New Voice');
    assert.deepEqual(newVoice.tags,['bright','natural']);
    assert.equal(newVoice.favorite,true);
    await page.locator('[data-edit="voices"][data-id="'+newVoice.id+'"]').click();
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('[data-action="delete-item"]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-editor="voices"]'));
    assert.ok(!library.voices.some(v=>v.id===newVoice.id));
    assert.equal(JSON.parse(requests.find(r=>r.method==='DELETE').body).expectedVersion,1);
    await page.locator('[data-tab="settings"]').click();
    await page.locator('[data-settings] [name="ffmpeg"]').fill('C:/Tools/ffmpeg.exe');
    await page.locator('[data-settings] [name="python"]').fill('C:/Tools/python.exe');
    await page.locator('[data-settings] [name="subtitleService"]').fill('C:/Tools/subtitle.py');
    await page.locator('[data-settings] [type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-notice]')?.textContent.includes('依赖路径已保存'));
    assert.equal(library.settings[0].id,'dependencies');
    assert.equal(library.settings[0].ffmpeg,'C:/Tools/ffmpeg.exe');
    await page.evaluate(()=>localStorage.setItem('voices',JSON.stringify([{id:'legacy',voiceId:'lv'}])));
    await page.locator('[data-action="inspect-import"]').click();
    await page.locator('[data-action="import-legacy"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-notice]')?.textContent.includes('导入完成'));
    assert.ok(await page.evaluate(()=>localStorage.getItem('voices')));
    assert.equal(JSON.parse(requests.find(r=>r.path.endsWith('/migrate')).body).source,'browser');
    page.once('dialog',dialog=>dialog.accept());
    const migrated = page.waitForResponse(response=>response.url().endsWith('/migrate'));
    await page.locator('[data-action="import-standalone"]').click();
    await migrated;
    assert.equal(JSON.parse(requests.findLast(r=>r.path.endsWith('/migrate')).body).source,'standalone');
    await page.locator('[data-stage-tab="speech"]').click();
    await page.locator('.awf-audio-adjust summary').click();
    await page.locator('[data-operation="adjustAudio"] [name="audioFile"]').setInputFiles({name:'audio.wav',mimeType:'audio/wav',buffer:Buffer.from('mock audio')});
    await page.waitForFunction(()=>document.querySelector('[data-operation="adjustAudio"] [name="audioUrl"]').value.includes('/media/audio.wav'));
    assert.ok(requests.find(r=>r.path.endsWith('/audio')).body.includes('name="origin"'));
    const submittedAudio = page.waitForResponse(response=>response.url().endsWith('/jobs')&&response.request().method()==='POST');
    await page.locator('[data-submit="adjustAudio"]').click();
    await submittedAudio;
    const audioJob=JSON.parse(requests.findLast(r=>r.path.endsWith('/jobs')&&r.method==='POST').body);
    assert.equal(audioJob.input.operation,'adjustAudio');
    assert.equal(audioJob.input.options.avatar,undefined);
    assert.equal(audioJob.input.audioUrl,'/api/control/v1/avatar-workflow/media/audio.wav');
    assert.equal(audioJob.input.text,'');
    dependenciesAvailable=false;
    await page.locator('[data-tab="settings"]').click();
    await page.locator('[data-action="check-deps"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-submit="subtitle"]').disabled);
    await page.locator('[data-stage-tab="speech"]').click();
    assert.equal(await page.locator('[data-submit="adjustAudio"]').isDisabled(),true);
    assert.equal(await page.locator('[data-submit="speech"]').isDisabled(),false);
    await page.evaluate(async()=>{
      AvatarWorkflowUI.unmount();
      window.awf=AvatarWorkflowUI.mount(document.querySelector('#host'),{});
      AvatarWorkflowUI.fromHistory({inputSnapshot:{text:'Early history draft',voiceId:'v1',options:{avatar:{enabled:false}}}});
      await window.awf.ready;
    });
    assert.equal(await page.locator('[data-operation="speech"] [name="text"]').inputValue(),'Early history draft','history reuse before async mount must persist');
    await page.locator('[data-operation="speech"] [name="text"]').fill('Draft survives shell renders');
    await page.locator('[name="speechSpeed"]').fill('1.35');
    await page.locator('[name="speechVolume"]').fill('0.7');
    await page.locator('[data-tab="voices"]').click();
    await page.locator('[data-edit="voices"][data-id="v1"]').click();
    await page.locator('[data-editor="voices"] [name="notes"]').fill('Pending registry edit');
    await page.locator('[data-editor="voices"] [name="notes"]').evaluate(el=>el.setSelectionRange(3,8));
    await page.evaluate(async()=>{
      document.body.innerHTML='<main id="host" class="workspace"></main>';
      window.awf=AvatarWorkflowUI.mount(document.querySelector('#host'),{});
      await window.awf.ready;
    });
    assert.equal(await page.locator('[data-tab="voices"]').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('[data-editor="voices"] [name="notes"]').inputValue(),'Pending registry edit');
    assert.deepEqual(await page.locator('[data-editor="voices"] [name="notes"]').evaluate(el=>[document.activeElement===el,el.selectionStart,el.selectionEnd]),[true,3,8]);
    await page.locator('[data-stage-tab="speech"]').click();
    assert.equal(await page.locator('[data-operation="speech"] [name="text"]').inputValue(),'Draft survives shell renders');
    assert.equal(await page.locator('[name="speechSpeed"]').inputValue(),'1.35');
    assert.equal(await page.locator('[name="speechVolume"]').inputValue(),'0.7');
    await page.evaluate(async()=>{
      AvatarWorkflowUI.unmount();
      AvatarWorkflowUI.fromHistory({inputSnapshot:{text:'History before mount',voiceId:'v1',options:{speech:{speed:1.4},avatar:{enabled:false}}}});
      window.awf=AvatarWorkflowUI.mount(document.querySelector('#host'),{});
      await window.awf.ready;
    });
    assert.equal(await page.locator('[data-operation="speech"] [name="text"]').inputValue(),'History before mount');
    assert.equal(await page.locator('[name="speechSpeed"]').inputValue(),'1.4');
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});
      await page.evaluate(()=>{document.querySelector('.awf-scroll').scrollTop=0;});
      assert.equal(await page.evaluate(()=>document.querySelector('.awf').scrollWidth>document.querySelector('.awf').clientWidth+1),false);
      if(process.env.AWF_SCREENSHOT) console.log('AWF_SCREENSHOT:'+(await page.screenshot()).toString('base64'));
    }
    failLibraryOnce=true;
    await page.evaluate(async()=>{
      AvatarWorkflowUI.unmount();
      window.awf=AvatarWorkflowUI.mount(document.querySelector('#host'),{});
      await window.awf.ready;
    });
    await page.locator('.awf-header [data-action="refresh"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-production]'));
    assert.equal(await page.locator('[data-operation="speech"] [name="text"]').inputValue(),'History before mount');
    await page.evaluate(()=>AvatarWorkflowUI.unmount());
    assert.equal(await page.locator('.awf').count(),0);
    assert.deepEqual(errors,[]);
    assert.equal(requests.filter(r=>r.path.endsWith('/jobs')&&r.method==='POST').length,2);
  } finally {await context.close(); await browser.close();}
});
