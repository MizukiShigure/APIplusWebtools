(function (scope, factory) {
  'use strict';
  const api = factory(scope);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (scope) scope.AudioWorkbenchUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (scope) {
  'use strict';
  const STORAGE_KEY = 'api_console_audio_workbench_v1';
  const TERMINAL = new Set(['completed','done','failed','canceled','cancelled','submission-unknown']);
  const STATUS = {waiting_for_worker:'等待执行',pending:'待处理',claimed:'已领取',validating:'校验中',uploading:'上传中',queued:'排队中',submitting:'提交中',submitted:'已提交',polling:'生成中',running:'生成中',partial:'部分完成',completed:'已完成',done:'已完成',failed:'失败',cancel_requested:'正在取消跟踪',canceled:'已取消跟踪',cancelled:'已取消跟踪','submission-unknown':'提交结果待核查'};
  const MODEL_SHORT = {minimaxTts:'语音合成',suno:'音乐创作',seedAudio:'参考音色',wooshSound:'场景音效',klingVideoAudio:'视频配音效'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const trim = value => String(value ?? '').trim();
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const uid = () => 'audio-' + (scope.crypto?.randomUUID?.() || Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  const active = task => !TERMINAL.has(task.state);
  const contracts = () => scope.ApiBatchAudioModels || (typeof require === 'function' ? require('./audio-models.js') : null);
  const modelFor = id => contracts().getAudioModel(id);
  const defaultValues = id => contracts().getAudioDefaults(id);
  function safeUrl(value) {
    const text=trim(value);
    if (!/^https?:\/\/[^\s]+$/i.test(text)) return '';
    try { const parsed=new URL(text); return parsed.username || parsed.password ? '' : text; } catch { return ''; }
  }
  function publicValue(value) {
    if (Array.isArray(value)) return value.map(publicValue);
    if (!value || typeof value !== 'object') return value;
    const clean={};
    for(const [key,item] of Object.entries(value)) {
      if (!/^(api[_-]?key|token|accessToken|authorization|password|secret|__proto__|constructor|prototype)$/i.test(key)) clean[key]=publicValue(item);
    }
    return clean;
  }
  function assetValue(value, slot) {
    const source = typeof value==='string' ? {url:value} : value || {};
    const url=safeUrl(source.url || source.remoteUrl || source.ossPath || source.audio_url || source.image_url || source.video_url);
    if(!url) throw new Error('素材需要可访问的 HTTP(S) 地址，请先上传文件');
    if(source.type && source.type!==slot.type && !String(source.type).startsWith(slot.type+'/')) throw new Error('请选择'+slot.label+'类型的素材');
    return {...publicValue(source),url,type:slot.type,role:slot.key,name:trim(source.name || source.filename) || slot.label};
  }
  function makeTask(modelId, values={}, assets={}, context={}) {
    const model=modelFor(modelId);
    const input={...defaultValues(model.id),...publicValue(values)};
    const refs=[];
    for(const slot of model.uploadSlots || []) {
      if(assets[slot.key]) { const asset=assetValue(assets[slot.key],slot);input[slot.key]=asset;refs.push(asset); }
    }
    const error=contracts().validateAudioInput(model.id,input);
    if(error) throw new Error(error);
    const options={};
    for(const field of model.fields || []) if(field.key!==model.promptKey && input[field.key]!==undefined) options[field.key]=input[field.key];
    return {clientTaskId:context.clientTaskId || uid(),taskType:'audio',input:{model:model.id,
      prompt:model.promptKey ? trim(input[model.promptKey]) : '',options,assets:{refs}}};
  }
  function fromHistory(record={}) {
    const outer=record.task || record;
    const input=outer.request?.input || outer.originalInput || outer.rowSnapshot || outer.inputSnapshot || outer.input || outer.params?.input || outer.snapshot?.input || outer.params || outer;
    const model=modelFor(input.modelKey || input.model || outer.modelKey || outer.model).id;
    const metadata=modelFor(model);
    const savedOptions=publicValue(input.options || input.settings || {});
    const combined={...input,...savedOptions};
    const values={...defaultValues(model)};
    const aliases={voiceId:['voice_id'],version:['mode_name','model_name'],volume:['vol'],speechRate:['speech_rate'],loudnessRate:['loudness_rate'],pitchRate:['pitch_rate']};
    for(const [key,names] of Object.entries(aliases))for(const name of names)if(combined[name]!=null)values[key]=combined[name];
    for(const field of metadata.fields || [])if(combined[field.key]!=null)values[field.key]=combined[field.key];
    if(metadata.promptKey && combined.prompt!==undefined && combined[metadata.promptKey]==null) values[metadata.promptKey]=combined.prompt;
    const assets={};
    const refs=input.assets?.refs || input.refs || [];
    for(const slot of metadata.uploadSlots || []) {
      const source=combined[slot.key] || combined[slot.type+'Url'] || combined[slot.type+'_url'] || combined.references?.find(ref=>ref[slot.type+'_url'])?.[slot.type+'_url'] || input.assets?.[slot.key] || refs.find(a=>a.role===slot.key) || refs.find(a=>!a.role && a.type===slot.type);
      if(source) { try { assets[slot.key]=assetValue(source,slot); } catch {} }
    }
    return {model,values,assets};
  }
  function normalizeTask(response={}, previous={}) {
    const item=response.task || response.data?.task || response.data || response;
    const state=trim(item.state || item.status || previous.state) || 'pending';
    let outputType='audio';
    try {outputType=modelFor(item.input?.model || previous.input?.model).outputType;} catch {}
    const results=(Array.isArray(item.results) ? item.results : previous.results || []).map(result=>{
      const data=typeof result==='string' ? {url:result} : result || {};
      return {...publicValue(data),url:safeUrl(data.url || data.remoteUrl),type:data.type || outputType};
    }).filter(result=>result.url);
    const input=publicValue(item.input || previous.input || {});
    const failure=item.error ?? previous.error;
    return {taskId:trim(item.taskId || item.id || previous.taskId),clientTaskId:trim(item.clientTaskId || previous.clientTaskId),
      state,input,results,progress:publicValue(item.progress ?? previous.progress),
      error:typeof failure==='string' ? failure : trim(failure?.message || failure?.detail),
      createdAt:item.createdAt || previous.createdAt || new Date().toISOString(),updatedAt:item.updatedAt || new Date().toISOString(),
      upstreamTaskIds:publicValue(item.upstreamTaskIds || previous.upstreamTaskIds || [])};
  }
  function readSavedState(storage) {
    const empty={version:1,selectedModel:'minimaxTts',drafts:{},tasks:[]};
    try {
      const saved=JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
      if(!saved || typeof saved!=='object') return empty;
      const selectedModel=modelFor(saved.selectedModel || 'minimaxTts').id;
      const drafts={};
      for(const [id,draft] of Object.entries(saved.drafts || {})) {
        try {modelFor(id);drafts[id]={values:publicValue(draft.values || {}),assets:publicValue(draft.assets || {})};} catch {}
      }
      const tasks=(Array.isArray(saved.tasks)?saved.tasks:[]).map(task=>normalizeTask(task)).map(task=>
        !task.taskId && active(task) ? {...task,state:'submission-unknown',error:'上次提交尚未取得任务编号，请先在历史缓存中核查，避免重复生成。'} : task);
      return {...empty,selectedModel,drafts,tasks};
    } catch {return empty;}
  }
  const icon = '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M7 19v10m8-18v26m9-32v38m9-31v24m8-18v12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
  function mount(options={}) {
    const container=options.container;
    if(!container?.ownerDocument) throw new Error('AudioWorkbenchUI.mount 需要 container');
    if(!contracts()) throw new Error('请先加载 audio-models.js');
    container.__audioWorkbench?.destroy();
    const doc=container.ownerDocument;
    let storage=options.storage;
    if(!storage) {try {storage=scope.localStorage;} catch {}}
    const state=readSavedState(storage);
    let destroyed=false, timer=null, polling=false, savingError=false, lockBefore=false;
    const uploads=new Set();
    const notified=new Set();
    const root=doc.createElement('section');root.className='abw';
    container.classList.add('abw-host');container.replaceChildren(root);
    const models=Object.values(contracts().AUDIO_MODELS);
    root.innerHTML='<header class="abw-header"><div class="abw-heading"><div class="abw-heading-icon">'+icon+'</div><div><p class="abw-eyebrow">AUDIO STUDIO</p><h2>声音工作台</h2><p class="abw-subtitle">把文字、音色与画面，变成声音。</p></div></div><span class="abw-decoration" aria-hidden="true">AUDIO</span></header>'+
      '<nav class="abw-models" aria-label="声音模型">'+models.map(model=>'<button type="button" data-audio-model="'+escape(model.id)+'"><span>'+escape(model.label)+'</span><small>'+escape(MODEL_SHORT[model.id] || '')+'</small></button>').join('')+'</nav>'+
      '<div class="abw-scroll"><div class="abw-columns"><section class="abw-composer"><div data-audio-form></div><p class="abw-message" role="status" aria-live="polite" data-audio-message hidden></p></section>'+
      '<section class="abw-output" aria-label="生成任务与结果"><div class="abw-section-title"><div><p class="abw-eyebrow">YOUR CREATIONS</p><h3>任务与结果</h3></div><button type="button" data-refresh>刷新状态</button></div><div data-audio-tasks></div></section></div></div>';
    const q=selector=>root.querySelector(selector);
    function announce(text,isError=false) {
      const node=q('[data-audio-message]');node.textContent=text || '';node.hidden=!text;node.classList.toggle('is-error',isError);
      if(isError) options.onToast?.(text,'error');
    }
    function draft(id=state.selectedModel) {
      if(!state.drafts[id]) state.drafts[id]={values:defaultValues(id),assets:{}};
      return state.drafts[id];
    }
    function persist() {
      try {
        let output=state;
        if(destroyed) {
          const latest=readSavedState(storage);const ids=new Set(state.tasks.map(t=>t.clientTaskId || t.taskId));
          output={...latest,tasks:[...state.tasks,...latest.tasks.filter(t=>!ids.has(t.clientTaskId || t.taskId))]};
        }
        storage?.setItem(STORAGE_KEY,JSON.stringify(output));
      } catch {if(!savingError&&!destroyed){savingError=true;announce('浏览器保存失败；任务仍在后台记录，请通过历史缓存查找任务。',true);}}
    }
    function isLocked() {return uploads.size>0 || state.tasks.some(task=>active(task)&&task.input.model===state.selectedModel);}
    function readForm() {
      const model=modelFor(state.selectedModel);const current=draft();
      for(const field of model.fields) { const node=q('[name="'+field.key+'"]');if(node) current.values[field.key]=field.type==='number' && node.value!=='' ? Number(node.value) : node.value; }
      return current;
    }
    function fieldMarkup(field,values) {
      const value=values[field.key] ?? '';const attrs='name="'+escape(field.key)+'"'+(field.required?' required':'');
      let control='';
      if(field.type==='textarea') control='<textarea '+attrs+' rows="7" placeholder="'+escape(field.label)+'">'+escape(value)+'</textarea>';
      else if(field.type==='select') control='<select '+attrs+'>'+field.options.map(option=>{const v=typeof option==='object'?option.value:option;return '<option value="'+escape(v)+'"'+(String(value)===String(v)?' selected':'')+'>'+escape(option.label || v)+'</option>';}).join('')+'</select>';
      else {
        const numeric=field.type==='number';const bounds=numeric ? ['min','max','step'].filter(k=>field[k]!=null).map(k=>' '+k+'="'+field[k]+'"').join('') : '';
        const listId='abw-choices-'+field.key;
        control='<input '+attrs+' type="'+(numeric?'number':'text')+'" value="'+escape(value)+'"'+bounds+(field.suggestions?' list="'+listId+'"':'')+'>';
        if(field.suggestions) control+='<datalist id="'+listId+'">'+field.suggestions.map(v=>'<option value="'+escape(v)+'"></option>').join('')+'</datalist><small>可选择常用音色，也可填写已有的自定义音色 ID。</small>';
      }
      return '<label class="abw-field'+(field.type==='textarea'?' abw-wide':'')+'"><span>'+escape(field.label)+(field.required?'<i>必填</i>':'')+'</span>'+control+'</label>';
    }
    function assetMarkup(slot,assets) {
      const asset=assets[slot.key];
      return '<div class="abw-asset" data-asset-slot="'+escape(slot.key)+'" tabindex="0" aria-label="'+escape(slot.label)+'，支持粘贴或拖入文件"><div class="abw-asset-label"><strong>'+escape(slot.label)+'</strong><span>'+(slot.required?'必填':slot.exclusiveWith?'选填 · 二选一':'选填')+'</span></div>'+
        (asset?'<div class="abw-asset-selected"><span data-asset-name>'+escape(asset.name || slot.label)+'</span><button type="button" data-asset-action="remove" aria-label="移除'+escape(slot.label)+'">移除</button></div>':'<p>上传文件、粘贴链接，或从历史缓存选择</p>')+
        '<div class="abw-asset-buttons"><label class="abw-file-button">上传文件<input type="file" accept="'+escape(slot.accept)+'" data-file-slot="'+escape(slot.key)+'"></label><button type="button" data-asset-action="history"'+(options.openAssetPicker?'':' disabled')+'>历史缓存</button></div>'+
        '<div class="abw-url-row"><input type="url" data-asset-url placeholder="https://…" aria-label="'+escape(slot.label)+'链接"><button type="button" data-asset-action="url">使用链接</button></div></div>';
    }
    function renderForm() {
      if(destroyed)return;
      const model=modelFor(state.selectedModel);const current=draft();
      for(const node of root.querySelectorAll('[data-audio-model]')) node.setAttribute('aria-pressed',String(node.dataset.audioModel===model.id));
      q('[data-audio-form]').innerHTML='<div class="abw-section-title"><div><p class="abw-eyebrow">CREATE AUDIO</p><h3>'+escape(model.label)+'</h3></div><span class="abw-badge">'+(model.outputType==='video'?'输出视频':'输出音频')+'</span></div><p class="abw-hint">'+escape(model.hint)+'</p>'+
        '<form data-audio-compose><fieldset class="abw-fields">'+model.fields.map(field=>fieldMarkup(field,current.values)).join('')+(model.uploadSlots.length?'<div class="abw-assets abw-wide">'+model.uploadSlots.map(slot=>assetMarkup(slot,current.assets)).join('')+'</div>':'')+'</fieldset>'+
        '<div class="abw-submit-row"><button class="abw-primary" type="submit" data-audio-submit>开始生成</button><span data-audio-lock-note>任务和素材会记录到本地历史缓存</span></div></form>';
      lockBefore=!isLocked();updateLock();
    }
    function updateLock() {
      const locked=isLocked();const fieldset=q('fieldset');if(fieldset)fieldset.disabled=locked;
      const submit=q('[data-audio-submit]');if(submit){submit.disabled=locked;submit.textContent=uploads.size?'素材上传中…':locked?'生成进行中…':'开始生成';}
      const note=q('[data-audio-lock-note]');if(note)note.textContent=locked?'后台任务持续运行，可切换其他模型':'任务和素材会记录到本地历史缓存';
      lockBefore=locked;
    }
    function taskKey(task) {return task.taskId || task.clientTaskId;}
    function renderTasks() {
      if(destroyed)return;
      const holder=q('[data-audio-tasks]');const previousScroll=root.querySelector('.abw-scroll').scrollTop;
      // Leave media players intact when a poll only changes progress on another task.
      for(const task of state.tasks) {
        const key=taskKey(task);let card=[...holder.children].find(node=>node.dataset.taskKey===key);
        const signature=JSON.stringify([task.state,task.results,task.error,task.progress]);
        if(card?.dataset.signature===signature)continue;
        if(!card){card=doc.createElement('article');card.className='abw-task';card.dataset.taskKey=key;holder.append(card);}
        card.dataset.taskId=task.taskId;card.dataset.signature=signature;
        let label=task.input.model;try{label=modelFor(label).label;}catch{}
        const resultMarkup=task.results.map((result,index)=>'<div class="abw-result">'+(result.type==='video'?'<video controls playsinline preload="metadata" src="'+escape(result.url)+'"></video>':'<audio controls preload="none" src="'+escape(result.url)+'"></audio>')+'<div class="abw-result-actions"><a href="'+escape(result.url)+'" target="_blank" rel="noopener noreferrer">打开结果 '+(index+1)+'</a><button type="button" data-task-action="copy" data-result-index="'+index+'">复制链接</button></div></div>').join('');
        const progress=typeof task.progress==='number' ? Math.min(100,Math.max(0,task.progress)) : null;
        card.innerHTML='<div class="abw-task-top"><strong>'+escape(label)+'</strong><span class="abw-status" data-state="'+escape(task.state)+'">'+escape(STATUS[task.state] || task.state)+'</span></div>'+
          (task.input.prompt?'<p class="abw-task-prompt">'+escape(task.input.prompt)+'</p>':'')+
          (progress!=null&&active(task)?'<progress value="'+progress+'" max="100" aria-label="任务进度"></progress>':'')+
          (task.error?'<p class="abw-task-error">'+escape(task.error)+'</p>':'')+resultMarkup+
          '<div class="abw-task-footer"><small title="'+escape(task.taskId)+'">'+escape(task.taskId || '正在取得任务编号')+'</small><div><button type="button" data-task-action="reuse">复用输入</button>'+
          (active(task)&&task.taskId?'<button type="button" data-task-action="cancel"'+(task.state==='cancel_requested'?' disabled':'')+'>取消跟踪</button>':'')+'</div></div>';
      }
      for(const node of [...holder.children]) if(!state.tasks.some(task=>taskKey(task)===node.dataset.taskKey))node.remove();
      if(!state.tasks.length)holder.innerHTML='<div class="abw-empty">'+icon+'<h4>等待第一段声音</h4><p>选择模型并填写输入，生成结果会显示在这里。</p></div>';
      else for(const task of state.tasks) { const card=[...holder.children].find(n=>n.dataset.taskKey===taskKey(task));if(card)holder.append(card); }
      root.querySelector('.abw-scroll').scrollTop=previousScroll;
      if(lockBefore!==isLocked())updateLock();
    }
    function notify(task) {
      if(!task.taskId || notified.has(task.taskId) || !TERMINAL.has(task.state))return;
      notified.add(task.taskId);
      Promise.resolve(options.onHistory?.(clone(task))).catch(()=>{});
    }
    function replaceTask(previous,response) {
      const next=normalizeTask(response,previous);
      const index=state.tasks.findIndex(item=>item===previous || (next.taskId&&item.taskId===next.taskId) || (next.clientTaskId&&item.clientTaskId===next.clientTaskId));
      if(index>=0)state.tasks[index]=next;else state.tasks.unshift(next);
      const running=state.tasks.filter(active);const finished=state.tasks.filter(t=>!active(t)).slice(0,40);
      state.tasks=[...running,...finished].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
      persist();renderTasks();
      if(destroyed && container.__audioWorkbench && container.__audioWorkbench!==controller) container.__audioWorkbench.restoreTask(next);
      else notify(next);
      return next;
    }
    async function submit() {
      if(isLocked())return;
      let envelope;
      try {const current=readForm();envelope=makeTask(state.selectedModel,current.values,current.assets);}catch(error){announce(error.message,true);return;}
      if(typeof options.submitTask!=='function'){announce('后台任务服务尚未连接，请重新启动工作台。',true);return;}
      announce('');const pending=normalizeTask({clientTaskId:envelope.clientTaskId,state:'submitting',input:envelope.input});
      state.tasks.unshift(pending);persist();renderTasks();updateLock();
      try {
        const response=await options.submitTask(envelope);
        if(response?.success===false)throw Object.assign(new Error(response.error?.message || response.message || '提交失败'),{definite:true});
        const next=normalizeTask(response,pending);
        if(!next.taskId)throw new Error('后台没有返回任务编号');
        replaceTask(pending,next);schedule(0);
      } catch(error) {
        replaceTask(pending,{state:error.definite?'failed':'submission-unknown',error:error.definite?error.message:'提交结果尚未确认：'+error.message+'。请先检查历史缓存，避免重复提交。'});
        if(!destroyed)announce(error.message,true);
      }
    }
    async function refresh() {
      if(destroyed||polling||typeof options.getTask!=='function')return;
      polling=true;
      try {
        const list=state.tasks.filter(task=>task.taskId&&active(task));
        await Promise.all(list.map(async previous=>{
          try {
            const response=await options.getTask(previous.taskId);
            const current=state.tasks.find(task=>task.taskId===previous.taskId);
            if(!current||!active(current)||destroyed)return;
            if(response?.success===false)throw new Error(response.error?.message || response.message || '查询失败');
            const incoming=normalizeTask(response,current);
            if(current.state==='cancel_requested'&&active(incoming))return;
            replaceTask(current,incoming);
          } catch(error) {if(!destroyed)announce('状态查询暂时失败，任务仍在后台运行：'+error.message,true);}
        }));
      } finally {polling=false;schedule();}
    }
    function schedule(delay=options.pollMs || 3000) {
      if(timer)scope.clearTimeout(timer);
      if(!destroyed&&state.tasks.some(task=>task.taskId&&active(task)))timer=scope.setTimeout(refresh,delay);
    }
    function restoreInput(record) {
      readForm();const restored=fromHistory(record);
      if(state.tasks.some(task=>active(task)&&task.input.model===restored.model)){announce('该模型有任务运行中，取消跟踪或等待完成后再复用输入。',true);return false;}
      state.selectedModel=restored.model;state.drafts[restored.model]={values:restored.values,assets:restored.assets};
      persist();renderForm();announce('已恢复输入与素材；点击“开始生成”重新抽卡。');return true;
    }
    function restoreTask(response) {
      const task=normalizeTask(response);if(!task.taskId)return false;
      const previous=state.tasks.find(item=>item.taskId===task.taskId || (task.clientTaskId&&item.clientTaskId===task.clientTaskId));replaceTask(previous || {},task);schedule(0);return true;
    }
    function setAsset(slot,value,modelId=state.selectedModel) {
      const asset=assetValue(value,slot);
      if(destroyed) {
        if(container.__audioWorkbench && container.__audioWorkbench!==controller)container.__audioWorkbench.acceptAsset(modelId,slot.key,asset);
        else {
          const latest=readSavedState(storage);
          const saved=latest.drafts[modelId] || (latest.drafts[modelId]={values:defaultValues(modelId),assets:{}});
          saved.assets[slot.key]=asset;if(slot.exclusiveWith)delete saved.assets[slot.exclusiveWith];
          storage?.setItem(STORAGE_KEY,JSON.stringify(latest));
        }
        return;
      }
      const current=draft(modelId);current.assets[slot.key]=asset;
      if(slot.exclusiveWith)delete current.assets[slot.exclusiveWith];
      persist();if(modelId===state.selectedModel)renderForm();
    }
    async function upload(slot,file) {
      if(!file||isLocked())return;
      readForm();const modelId=state.selectedModel;
      if(file.type&&!file.type.startsWith(slot.type+'/')){announce('请选择'+slot.label+'类型的文件',true);return;}
      if(typeof options.uploadFile!=='function'){announce('上传服务尚未连接',true);return;}
      uploads.add(slot.key);updateLock();announce('正在上传 '+file.name+'…');
      try {const result=await options.uploadFile(file,{...slot,model:modelId});setAsset(slot,result,modelId);announce('素材已上传并记录到历史缓存。');}
      catch(error){announce('素材上传失败：'+error.message,true);}
      finally{uploads.delete(slot.key);if(!destroyed)updateLock();}
    }
    async function handleClick(event) {
      const modelButton=event.target.closest('[data-audio-model]');
      if(modelButton){readForm();state.selectedModel=modelButton.dataset.audioModel;persist();renderForm();announce('');return;}
      if(event.target.closest('[data-refresh]')){await refresh();return;}
      const assetButton=event.target.closest('[data-asset-action]');
      if(assetButton){
        if(isLocked())return;readForm();const modelId=state.selectedModel;
        const slot=modelFor(modelId).uploadSlots.find(item=>item.key===assetButton.closest('[data-asset-slot]').dataset.assetSlot);
        try {
          if(assetButton.dataset.assetAction==='remove'){delete draft().assets[slot.key];persist();renderForm();}
          if(assetButton.dataset.assetAction==='url')setAsset(slot,assetButton.closest('[data-asset-slot]').querySelector('[data-asset-url]').value);
          if(assetButton.dataset.assetAction==='history'){
            const result=await options.openAssetPicker?.({...slot,model:modelId});const value=Array.isArray(result)?result[0]:result;
            if(value)setAsset(slot,value,modelId);
          }
        }catch(error){announce(error.message,true);}return;
      }
      const button=event.target.closest('[data-task-action]');if(!button)return;
      const task=state.tasks.find(item=>taskKey(item)===button.closest('[data-task-key]').dataset.taskKey);if(!task)return;
      if(button.dataset.taskAction==='reuse'){try{restoreInput(task);}catch(error){announce(error.message,true);}return;}
      if(button.dataset.taskAction==='copy'){
        try{await scope.navigator.clipboard.writeText(task.results[Number(button.dataset.resultIndex)].url);announce('结果链接已复制。');}catch{announce('无法访问剪贴板，请打开结果后复制地址。',true);}return;
      }
      if(button.dataset.taskAction==='cancel'&&typeof options.cancelTask==='function'){
        const pending=replaceTask(task,{state:'cancel_requested'});
        try{const response=await options.cancelTask(task.taskId);if(response?.success===false)throw new Error(response.message || '取消失败');replaceTask(pending,response);announce('已请求取消跟踪；上游任务可能继续生成并计费。');schedule();}
        catch(error){replaceTask(pending,{state:task.state});announce('取消失败：'+error.message,true);}
      }
    }
    root.addEventListener('click',handleClick);
    root.addEventListener('submit',event=>{if(event.target.matches('[data-audio-compose]')){event.preventDefault();void submit();}});
    root.addEventListener('input',event=>{if(event.target.name){readForm();persist();}});
    root.addEventListener('change',event=>{
      if(event.target.dataset.fileSlot){const slot=modelFor(state.selectedModel).uploadSlots.find(item=>item.key===event.target.dataset.fileSlot);void upload(slot,event.target.files[0]);}
      else if(event.target.name){readForm();persist();}
    });
    root.addEventListener('paste',event=>{
      const zone=event.target.closest('[data-asset-slot]');if(!zone||isLocked())return;
      const slot=modelFor(state.selectedModel).uploadSlots.find(item=>item.key===zone.dataset.assetSlot);const file=event.clipboardData?.files?.[0];
      if(file){event.preventDefault();void upload(slot,file);}
      else if(event.target.matches('[data-asset-url]')){const text=event.clipboardData?.getData('text/plain');if(safeUrl(text)){event.preventDefault();readForm();try{setAsset(slot,text);}catch(error){announce(error.message,true);}}}
    });
    root.addEventListener('dragover',event=>{if(event.target.closest('[data-asset-slot]'))event.preventDefault();});
    root.addEventListener('drop',event=>{const zone=event.target.closest('[data-asset-slot]');if(!zone)return;event.preventDefault();const slot=modelFor(state.selectedModel).uploadSlots.find(item=>item.key===zone.dataset.assetSlot);void upload(slot,event.dataTransfer?.files?.[0]);});
    const controller={restoreInput,restoreTask,acceptAsset(modelId,slotKey,value){
      const slot=modelFor(modelId).uploadSlots.find(item=>item.key===slotKey);
      if(!slot)throw new Error('未知素材输入项');readForm();setAsset(slot,value,modelId);
    },destroy(){if(destroyed)return;readForm();persist();destroyed=true;if(timer)scope.clearTimeout(timer);root.remove();container.classList.remove('abw-host');if(container.__audioWorkbench===controller)delete container.__audioWorkbench;}};
    container.__audioWorkbench=controller;renderForm();renderTasks();schedule(0);
    return controller;
  }
  return {mount,fromHistory,makeTask,readSavedState,normalizeTask,STORAGE_KEY};
});
