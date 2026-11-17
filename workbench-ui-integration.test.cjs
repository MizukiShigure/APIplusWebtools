const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
let chromium;
try {({chromium}=require(process.env.PROMPT_LIBRARY_PLAYWRIGHT || 'playwright'));}catch{}

test('new image models submit, poll, replay and preserve batch GIF controls in the real shell',{skip:!chromium,timeout:60000},async t=>{
  const browser=await chromium.launch({headless:true,channel:process.env.AWF_BROWSER_CHANNEL || 'chrome'});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1520,height:1050}});
  const errors=[],creates=[],queries=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='gateway.example') {
      if(['/api/gen_img_4o','/api/minimax_image'].includes(url.pathname)) {
        const payload=route.request().postDataJSON(); creates.push({path:url.pathname,payload});
        return route.fulfill({json:{success:true,data:{task_id:'mock-'+creates.length}}});
      }
      if(['/api/gen_img_4o_query','/api/minimax_image_query'].includes(url.pathname)) {
        queries.push(url.pathname);
        return route.fulfill({json:{success:true,data:['http://workbench.test/fixture-result.gif']}});
      }
      return route.abort();
    }
    if(url.hostname!=='workbench.test')return route.abort();
    if(url.pathname==='/fixture-result.gif')return route.fulfill({contentType:'image/gif',body:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:{records:[],success:true}});
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!/^[-\w.]+$/.test(file))return route.fulfill({status:404,body:''});
    let body;try{body=await fs.readFile(path.join(__dirname,file));}catch{return route.fulfill({status:404,body:''});}
    if(file==='app.js')body=body.toString().replace('bootstrapApp().catch(error => showFatalError(error));',
      'window.WBQA={state,render,createRow,addGenerationResultToPending,openBatchPromptDialog}; state.activePage="image"; bindBatchDefaultControls(); render();');
    return route.fulfill({body,contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(file)] || 'text/plain'});
  });
  await page.goto('http://workbench.test/');await page.waitForFunction(()=>window.WBQA);
  for(const [model,format] of [['gpt26','png'],['gpt26','svg'],['gpt26','gif'],['minimaxH3Image','png']]) {
    await page.evaluate(({model})=>{WBQA.state.rows=[WBQA.createRow({model,prompt:'A simple logo'})];WBQA.render();},{model});
    if(model==='gpt26') {
      await page.locator('[data-field="version"]').selectOption('gpt-image-2.6-sunburst');
      await page.locator('[data-field="outputFormat"]').selectOption(format);
      if(format==='svg')assert.equal(await page.locator('.row-upload').isDisabled(),true);
      if(format==='gif') {
        await page.locator('[data-field="frameSize"]').selectOption('512x288');
        await page.locator('[data-field="frameCount"]').fill('12');await page.locator('[data-field="frameCount"]').press('Tab');
        await page.locator('[data-field="frameDurationMs"]').fill('150');await page.locator('[data-field="frameDurationMs"]').press('Tab');
      }
    }
    await page.locator('.submit-row').click();await page.waitForFunction(()=>WBQA.state.rows[0].status==='done');
    const sent=creates.at(-1);
    assert.equal(sent.path,model==='gpt26'?'/api/gen_img_4o':'/api/minimax_image');
    if(model==='gpt26') {
      assert.equal(sent.payload.model_name,'gpt-image-2.6-sunburst');assert.equal(sent.payload.output_format,format);
      assert.equal(Object.hasOwn(sent.payload,'image_size'),format==='png');
      if(format==='gif')assert.equal(sent.payload.frame_count,12);
    } else {assert.equal(sent.payload.model_name,'MiniMax-H3-Image');assert.equal(sent.payload.resolution,'2K');}
    await page.evaluate(()=>WBQA.addGenerationResultToPending({record:WBQA.state.generationHistory[0]}));
    assert.equal(await page.locator('[data-field="model"]').last().inputValue(),model);
    if(format==='gif')assert.equal(await page.locator('[data-field="frameCount"]').last().inputValue(),'12');
  }
  assert.deepEqual(queries,['/api/gen_img_4o_query','/api/gen_img_4o_query','/api/gen_img_4o_query','/api/minimax_image_query']);
  await page.evaluate(()=>{WBQA.state.rows=[WBQA.createRow({model:'gpt26',prompt:'A ball',outputFormat:'gif',frameSize:'512x288',frameCount:12,frameDurationMs:150})];WBQA.state.batchDefaults=null;WBQA.render();WBQA.openBatchPromptDialog();});
  assert.equal(await page.locator('#batchOutputFormat').inputValue(),'gif');
  assert.equal(await page.locator('#batchFrameCount').inputValue(),'12');
  await page.locator('#batchOutputFormat').selectOption('png');
  assert.equal(await page.locator('#batchFrameCount').isVisible(),false);
  await page.locator('#pasteDialog button[value="cancel"]').click();
  await fs.mkdir(path.join(__dirname,'.codex-tmp'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'.codex-tmp/new-image-models-desktop.png'),fullPage:true});
  await page.locator('.duplicate-row').click();
  await page.reload();await page.waitForFunction(()=>window.WBQA);
  assert.equal(await page.locator('[data-field="frameCount"]').count(),2);
  assert.equal(await page.locator('[data-field="frameCount"]').last().inputValue(),'12');
  assert.equal(creates.length,4,'Refresh must not create any new provider job');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(__dirname,'.codex-tmp/new-image-models-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
});
test('full workbench shell exposes editing and audio with faithful history reuse',{skip:!chromium,timeout:60000},async t=>{
  const browser=await chromium.launch({headless:true,channel:process.env.AWF_BROWSER_CHANNEL || 'chrome'});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1520,height:1050}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='workbench.test')return route.abort();
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:{records:[],success:true}});
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!/^[-\w.]+$/.test(file))return route.fulfill({status:404,body:''});
    let body;
    try {body=await fs.readFile(path.join(__dirname,file));}catch{return route.fulfill({status:404,body:''});}
    if(file==='app.js')body=body.toString().replace('bootstrapApp().catch(error => showFatalError(error));',
      'window.WBQA={state,render,createMultiRow,addGenerationResultToPending,generationPageFromRecord}; render();');
    return route.fulfill({body,contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(file)] || 'text/plain'});
  });
  await page.goto('http://workbench.test/');
  await page.waitForFunction(()=>window.WBQA);
  await page.locator('[data-page="multiVideo"]').click();
  await page.locator('[data-multi-field="model"]').first().selectOption('kling3Omni');
  await page.locator('[data-multi-field="klingMode"]').first().selectOption('video_edit');
  assert.equal(await page.locator('[data-multi-field="size"],[data-multi-field="duration"]').count(),0);
  assert.equal(await page.locator('[data-multi-field="klingKeepVideoSound"]').isChecked(),true);
  await page.locator('[data-multi-field="klingKeepVideoSound"]').uncheck();
  await page.locator('.duplicate-multi-row').first().click();
  assert.equal(await page.locator('[data-multi-field="klingMode"]').count(),2);
  assert.equal(await page.locator('[data-multi-field="klingKeepVideoSound"]').nth(1).isChecked(),false);
  await page.locator('[data-page="audio"]').click();
  await page.getByRole('heading',{name:'声音工作台',exact:true}).waitFor();
  assert.equal(await page.locator('[data-audio-model]').count(),5);
  await page.locator('[name="text"]').fill('Keep this local draft');
  await page.locator('[data-page="image"]').click();
  await page.locator('[data-page="audio"]').click();
  assert.equal(await page.locator('[name="text"]').inputValue(),'Keep this local draft');
  await page.evaluate(()=>WBQA.addGenerationResultToPending({record:{page:'audio',model:'Seed Audio 语音',modelKey:'seedAudio',prompt:'History voice',params:{text:'History voice',speech_rate:24},request:{input:{model:'seedAudio',prompt:'History voice',options:{speechRate:24},assets:{refs:[{role:'referenceAudio',type:'audio',url:'https://cdn.example/reference.wav',name:'reference.wav'}]}}},results:['https://cdn.example/result.wav']}}));
  assert.equal(await page.locator('[name="text"]').inputValue(),'History voice');
  assert.equal(await page.locator('[name="speechRate"]').inputValue(),'24');
  assert.match(await page.locator('[data-asset-slot="referenceAudio"]').textContent(),/reference.wav/);
  await fs.mkdir(path.join(__dirname,'.codex-tmp'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'.codex-tmp/workbench-audio-shell.png'),fullPage:true});
  assert.deepEqual(errors,[]);
});
