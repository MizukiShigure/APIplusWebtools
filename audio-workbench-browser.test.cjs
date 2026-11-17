const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.PROMPT_LIBRARY_PLAYWRIGHT || 'playwright')); } catch {}

test('audio browser: model inputs, uploads, refresh recovery, cancellation, history reuse and layout', {skip:!chromium,timeout:90000}, async t => {
  const tasks = new Map();
  let created = 0;
  let queries = 0;
  let cancellations = 0;
  const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="/audio-workbench-ui.css"><style>body{margin:0;height:100vh}#workbench{height:100vh}</style><div id="workbench"></div><script src="/audio-models.js"></script><script src="/audio-workbench-ui.js"></script><script>
  window.uploads=[]; window.historyCalls=[];
  const call=async(url,body)=>{const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return r.json()};
  window.mountAudio=()=>AudioWorkbenchUI.mount({container:document.querySelector('#workbench'),pollMs:40,
    submitTask:input=>call('/test/tasks',input), getTask:id=>call('/test/tasks/'+id), cancelTask:id=>call('/test/cancel/'+id,{}),
    uploadFile:async(file,slot)=>{uploads.push({name:file.name,slot});await new Promise(resolve=>setTimeout(resolve,200));return {url:'https://media.example/'+file.name,name:file.name,type:file.type.split('/')[0]};},
    openAssetPicker:async slot=>({url:'https://media.example/history.'+(slot.type==='video'?'mp4':'wav'),name:'History source',type:slot.type,duration:31}),
    onHistory:task=>historyCalls.push(task.taskId)});
  window.ui=window.mountAudio();
  </script></html>`;
  const server = http.createServer(async (req,res)=>{
    const url = new URL(req.url,'http://127.0.0.1');
    const json = value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
    if (url.pathname==='/test/tasks' && req.method==='POST') {
      let body='';for await(const chunk of req)body+=chunk;
      const input=JSON.parse(body);created++;
      const task={taskId:'fixture-'+created,clientTaskId:input.clientTaskId,input:input.input,state:'polling',results:[]};
      tasks.set(task.taskId,task);if(created===1)await new Promise(resolve=>setTimeout(resolve,240));return json({success:true,task});
    }
    if(url.pathname.startsWith('/test/tasks/')){queries++;return json({success:true,task:tasks.get(url.pathname.split('/').pop())});}
    if(url.pathname.startsWith('/test/cancel/')){cancellations++;const task=tasks.get(url.pathname.split('/').pop());task.state='canceled';return json({success:true,task});}
    if(url.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fixture);return;}
    const name=url.pathname.slice(1);
    if(!['audio-models.js','audio-workbench-ui.js','audio-workbench-ui.css'].includes(name)){res.writeHead(404);res.end();return;}
    try{res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript;charset=utf-8':'text/css;charset=utf-8');res.end(await fs.readFile(path.join(__dirname,name)));}catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.env.PROMPT_LIBRARY_BROWSER_CHANNEL||'chrome',headless:true});
  t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',route=>route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'声音工作台',exact:true}).waitFor();
  assert.equal(await page.locator('[data-audio-model]').count(),5);
  await page.locator('[name="text"]').fill('Hello from the audio fixture');
  await page.locator('[data-audio-submit]').click();
  await page.waitForFunction(()=>document.querySelector('[data-state="submitting"]'));
  await page.evaluate(()=>{ui.destroy();window.ui=mountAudio();});
  await page.locator('[data-task-id="fixture-1"]').waitFor({timeout:3000});
  assert.equal(await page.locator('[data-state="submission-unknown"]').count(),0,'late create response must hydrate the remounted page');
  assert.equal(created,1);
  assert.equal(tasks.get('fixture-1').input.model,'minimaxTts');
  assert.equal(tasks.get('fixture-1').input.prompt,'Hello from the audio fixture');
  assert.equal(await page.locator('[name="text"]').isDisabled(),true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('[data-task-id="fixture-1"]'));
  await page.waitForTimeout(150);
  assert.equal(created,1,'refresh must poll persisted task instead of create');
  assert.ok(queries>0);
  tasks.get('fixture-1').state='completed';
  tasks.get('fixture-1').results=[{url:'https://media.example/result.mp3',type:'audio'}];
  await page.locator('[data-task-id="fixture-1"] audio').waitFor();
  assert.equal(await page.locator('[name="text"]').isDisabled(),false);
  await page.locator('[data-task-id="fixture-1"] [data-task-action="reuse"]').click();
  assert.equal(created,1,'reuse fills inputs and does not generate');
  assert.equal(await page.locator('[name="text"]').inputValue(),'Hello from the audio fixture');
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.locator('[data-task-id="fixture-1"] [data-task-action="copy"]').click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'https://media.example/result.mp3');

  await page.locator('[data-audio-model="suno"]').click();
  assert.equal(await page.locator('[name="lyrics"],[name="instrumental"],[name="duration"]').count(),0);
  await page.locator('[name="prompt"]').fill('Gentle acoustic instrumental with warm guitar');
  await page.locator('[data-audio-submit]').click();
  await page.locator('[data-task-id="fixture-2"]').waitFor();
  await page.locator('[data-task-id="fixture-2"] [data-task-action="cancel"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-task-id="fixture-2"] [data-state="canceled"]'));
  assert.equal(cancellations,1);

  await page.locator('[data-audio-model="seedAudio"]').click();
  await page.locator('[name="text"]').fill('Reference voice input');
  await page.locator('[data-asset-slot="referenceAudio"] input[type="file"]').setInputFiles({name:'reference.wav',mimeType:'audio/wav',buffer:Buffer.from('fixture')});
  await page.waitForFunction(()=>window.uploads.length===1);
  await page.evaluate(()=>{ui.destroy();window.ui=mountAudio();});
  await page.locator('[data-asset-slot="referenceAudio"] [data-asset-name]').waitFor({timeout:3000});
  assert.equal(await page.locator('[data-asset-slot="referenceAudio"] [data-asset-name]').textContent(),'reference.wav');
  await page.locator('[data-asset-slot="referenceAudio"] [data-asset-url]').evaluate(node=>{
    const data=new DataTransfer();data.setData('text/plain','https://media.example/pasted.wav');
    node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
  });
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(AudioWorkbenchUI.STORAGE_KEY)).drafts.seedAudio.assets.referenceAudio.url),'https://media.example/pasted.wav');
  await page.locator('[data-audio-model="klingVideoAudio"]').click();
  assert.equal(await page.locator('[name="prompt"],[name="text"]').count(),0);
  await page.locator('[data-asset-slot="video"] [data-asset-action="history"]').click();
  await page.locator('[data-asset-slot="video"] [data-asset-name]').waitFor();
  await page.locator('[data-audio-submit]').click();
  await page.locator('[data-task-id="fixture-3"]').waitFor();
  assert.equal(tasks.get('fixture-3').input.assets.refs[0].role,'video');
  assert.equal(tasks.get('fixture-3').input.assets.refs[0].url,'https://media.example/history.mp4');
  tasks.get('fixture-3').state='completed';
  tasks.get('fixture-3').results=[{url:'https://media.example/result.mp4',type:'video'}];
  await page.locator('[data-task-id="fixture-3"] video').waitFor();
  await page.locator('[data-audio-model="wooshSound"]').click();
  assert.equal(await page.locator('[name="duration"]').count(),0);
  await page.locator('[name="prompt"]').fill('森林里的雨声');
  await page.locator('[data-audio-submit]').click();
  assert.match(await page.locator('[data-audio-message]').textContent(),/英文/);
  assert.equal(created,3,'invalid provider input does not create a task');
  await page.locator('[name="prompt"]').fill('A distant rainstorm in a quiet forest');
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('[name="prompt"]').inputValue(),'A distant rainstorm in a quiet forest');

  await fs.mkdir(path.join(__dirname,'.codex-tmp'),{recursive:true});
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.locator('.abw').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'no horizontal overflow at '+width);
    await page.screenshot({path:path.join(__dirname,'.codex-tmp/audio-workbench-'+width+'.png')});
  }
  assert.deepEqual(errors,[]);
});
