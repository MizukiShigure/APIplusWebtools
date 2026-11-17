(function(scope,factory) {
  const api=factory();
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  if (scope) scope.AvatarWorkflowProduction=api;
})(typeof globalThis!=='undefined'?globalThis:this,function() {
  'use strict';
  const operations=['speech','adjustAudio','avatar','subtitle'];
  const labels={speech:'语音',adjustAudio:'音频调整',avatar:'数字人',subtitle:'字幕'};
  const states={pending:'待处理',queued:'排队中',submitting:'提交中',running:'处理中',polling:'查询中',completed:'完成',done:'完成',failed:'失败',partial:'部分完成','submission-unknown':'提交待核查'};
  const terminal=new Set(['completed','done','failed','partial','submission-unknown','canceled','cancelled']);
  const trim=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const copy=v=>JSON.parse(JSON.stringify(v));
  function originIdentity(origin) {
    if (!origin||!['browser','agent'].includes(origin.type)) return '';
    const client=trim(origin.client)||(origin.type==='browser'?'web':'agent');
    return JSON.stringify([origin.type,client,trim(origin.id)||client+'-local']);
  }
  function url(v) {
    const s=trim(v);
    if (/^\/api\/control\/v1\/avatar-workflow\/media\/[^/\\\s]+$/.test(s)) return s;
    try {const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?s:'';} catch {return '';}
  }
  function number(v,fallback,min,max) {
    const n=Number(v===undefined||v===''?fallback:v);
    if (!Number.isFinite(n)||n<min||n>max) throw new Error('参数超出范围：'+min+'–'+max);
    return n;
  }
  function buildStageJob(operation,draft,context={}) {
    if (!operations.includes(operation)) throw new Error('未知制作步骤');
    const input={operation,options:{}};
    if (context.apiBase) input.apiBase=context.apiBase;
    if (draft.sourceJobId) input.sourceJobId=trim(draft.sourceJobId);
    if (operation==='speech') {
      input.text=trim(draft.text); input.voiceId=trim(draft.voiceId);
      if (!input.text||!input.voiceId) throw new Error('请输入文本并选择音色');
      const s=draft.speech||{}, params={model:trim(s.model)||'speech-2.8-hd',language:trim(s.language)||'auto'};
      for(const [key,fallback,min,max] of [['speed',1,0.5,2],['volume',1,0,10],['pitch',0,-12,12],['voiceModifyPitch',0,-100,100],['voiceModifyIntensity',0,-100,100],['voiceModifyTimbre',0,-100,100]]) {
        if (key.startsWith('voiceModify')&&s[key]==null) continue;
        params[key]=number(s[key],fallback,min,max);
      }
      if (trim(s.soundEffects)) params.soundEffects=trim(s.soundEffects);
      input.options.speech=params;
    } else if (operation==='subtitle') {
      input.mediaUrl=url(draft.mediaUrl); input.text=trim(draft.text);
      if (['audio','video'].includes(draft.mediaKind)) input.mediaType=draft.mediaKind;
      if (!input.mediaUrl) throw new Error('请选择音频或视频文件，或填写有效媒体地址');
      const mode=draft.mode||'sentence', model=draft.model||'base';
      if (!['word','sentence'].includes(mode)||!['tiny','base','small','medium'].includes(model)) throw new Error('字幕模式或模型无效');
      input.options.subtitle={enabled:true,mode,model,language:trim(draft.language)||'auto',refine:Boolean(draft.refine),ignoreLines:Boolean(draft.ignoreLines)};
    } else {
      input.audioUrl=url(draft.audioUrl);
      if (!input.audioUrl) throw new Error('请选择音频或填写有效音频地址');
      input.text=trim(draft.text);
      if (operation==='avatar') {
        input.imageId=trim(draft.imageId); input.workflowId=draft.workflowId==='kling'?'':trim(draft.workflowId); input.prompt=trim(draft.prompt);
        if (!input.imageId) throw new Error('请选择数字人形象');
        input.options.avatar={enabled:true};
      } else {
        const params={enabled:true,speed:number(draft.speed,1,0.5,2),trimStart:number(draft.trimStart,0,0,3600)};
        if (trim(draft.trimEnd)) params.duration=number(Number(draft.trimEnd)-params.trimStart,0,0.05,3600);
        input.options.adjustAudio=params;
      }
    }
    return {clientTaskId:context.clientTaskId||(globalThis.crypto?.randomUUID?.()||'stage-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),origin:context.origin||{type:'browser',client:'web',id:'local-browser',label:'Local browser'},input};
  }
  function transferDraft(drafts,target,result) {
    if (!url(result?.url)||!['avatar','subtitle','adjustAudio'].includes(target)) throw new Error('无效的结果传递');
    if (target!=='subtitle'&&result.kind!=='audio') throw new Error('此步骤需要音频结果');
    const next=copy(drafts), dest=next[target]||{};
    dest[target==='subtitle'?'mediaUrl':'audioUrl']=result.url;
    dest.sourceJobId=result.jobId||'';
    if (target==='subtitle') {if (!trim(dest.text)) dest.text=result.text||'';dest.mediaKind=result.kind;}
    else dest.text=result.text||'';
    next[target]=dest; return next;
  }
  function draftsFromHistory(record) {
    const i=record?.inputSnapshot||record?.input||record||{},o=i.options||{};
    const all={speech:{text:i.text||'',voiceId:i.voiceId||'',speech:o.speech||{}},
      adjustAudio:{audioUrl:i.audioUrl||'',text:i.text||'',speed:o.adjustAudio?.speed??1,trimStart:o.adjustAudio?.trimStart??0,trimEnd:o.adjustAudio?.duration!=null?Number(o.adjustAudio.trimStart||0)+Number(o.adjustAudio.duration):''},
      avatar:{audioUrl:i.audioUrl||'',text:i.text||'',imageId:i.imageId||'',workflowId:i.workflowId||'',prompt:i.prompt||''},
      subtitle:{mediaUrl:i.mediaUrl||i.audioUrl||'',mediaKind:i.mediaType||'',text:i.text||'',mode:o.subtitle?.mode||'sentence',model:o.subtitle?.model||'base',language:o.subtitle?.language||'auto',refine:Boolean(o.subtitle?.refine),ignoreLines:Boolean(o.subtitle?.ignoreLines)}};
    return operations.includes(i.operation)?{[i.operation]:all[i.operation]}:all;
  }
  const field=(label,name,value='',attrs='')=>'<label class="awf-field"><span>'+label+'</span><input name="'+name+'" value="'+esc(value)+'" '+attrs+'></label>';
  const area=(label,name,value='',attrs='')=>'<label class="awf-field"><span>'+label+'</span><textarea name="'+name+'" '+attrs+'>'+esc(value)+'</textarea></label>';
  const option=(v,label,s)=>'<option value="'+esc(v)+'"'+(String(v)===String(s)?' selected':'')+'>'+esc(label)+'</option>';
  const select=(label,name,opts)=>'<label class="awf-field"><span>'+label+'</span><select name="'+name+'">'+opts+'</select></label>';
  const button=(label,attrs='',primary=false)=>'<button type="button" class="awf-button'+(primary?' awf-primary':'')+'" '+attrs+'>'+label+'</button>';
  const check=(label,name,on=false)=>'<label class="awf-check"><input type="checkbox" name="'+name+'" '+(on?'checked':'')+'>'+label+'</label>';
  const submit=op=>'<div class="awf-submit-row"><button type="submit" class="awf-button awf-primary" data-submit="'+op+'">'+(op==='adjustAudio'?'应用音频调整':'生成'+labels[op])+'</button><span class="awf-meta" data-submit-status="'+op+'" role="status"></span></div>';
  const resultPane=section=>'<div class="awf-output" data-output="'+section+'"><h4>'+labels[section]+'结果</h4><div data-result-select="'+section+'"></div><div data-result-preview="'+section+'"></div><div class="awf-actions" data-result-actions="'+section+'"></div></div>';
  const upload=(label,kind)=>'<label class="awf-field"><span>'+label+'</span><input name="'+kind+'File" data-upload="'+kind+'" type="file" accept="'+(kind==='image'?'image/png,image/jpeg,image/webp':kind==='media'?'audio/*,video/*':'audio/*')+'"></label>';

  function mount(host,context) {
    const doc=host.ownerDocument,win=doc.defaultView,controller=new win.AbortController();
    const saved=context.saved||{}, drafts={speech:{},avatar:{},subtitle:{},adjustAudio:{},...saved.drafts};
    let library=context.library, deps=context.deps, jobs=[],disposed=false;
    const pending={...saved.pending},sending=new Set(),selected={...saved.selected},subtitleTexts={...saved.subtitleTexts};
    const subtitleLoads=new Map(),targetRevisions={},mediaFields=['audioUrl','mediaUrl','imageId'];
    const touchTarget=(op,name)=>{if(mediaFields.includes(name)){const key=op+':'+name;targetRevisions[key]=(targetRevisions[key]||0)+1;}};
    const previewKeys={}, choices={},notice=context.notice||(()=>{}),q=s=>host.querySelector(s);
    const form=op=>q('[data-operation="'+op+'"]');
    const get=(f,name)=>f.elements.namedItem(name)?.value||'';
    const activeCheckbox=(f,name)=>Boolean(f.elements.namedItem(name)?.checked);
    const read=op=>{
      const f=form(op); if(!f)return drafts[op]||{};
      const d={...drafts[op]};
      for(const el of f.elements) if(el.name&&el.type!=='file') d[el.name]=el.type==='checkbox'?el.checked:el.value;
      if(op==='speech') {d.speech={};for(const [name,key] of [['speechModel','model'],['speechLanguage','language'],['speechSpeed','speed'],['speechVolume','volume'],['speechPitch','pitch'],['voiceModifyPitch','voiceModifyPitch'],['voiceModifyIntensity','voiceModifyIntensity'],['voiceModifyTimbre','voiceModifyTimbre'],['soundEffects','soundEffects']])d.speech[key]=get(f,name);}
      return d;
    };
    const values=()=>Object.fromEntries(operations.map(op=>[op,read(op)]));
    const imageUrl=item=>context.imageUrl(item);
    const listOptions=(items,selected,empty)=>option('',empty,selected)+(!selected||items.some(i=>i.id===selected)?'':option(selected,'已不可用，请重新选择',selected))+items.map(i=>option(i.id,i.name||i.id,selected)).join('');
    function speechFields(d) {
      const s={model:'speech-2.8-hd',language:'auto',speed:1,volume:1,pitch:0,...d.speech};
      const models=['speech-2.8-hd','speech-2.8-turbo','speech-2.6-hd','speech-2.6-turbo','speech-02-hd','speech-02-turbo','speech-01-hd','speech-01-turbo'];
      if(!models.includes(s.model))models.push(s.model);
      const languages=[['auto','自动识别'],['zh','中文'],['en','英语'],['ja','日语'],['ko','韩语'],['tr','土耳其语'],['es','西语'],['pt','葡语'],['ar','阿语'],['fr','法语'],['de','德语'],['it','意语'],['id','印尼语'],['hi','印地语']];
      return select('音色','voiceId',listOptions(library.voices,d.voiceId,'选择音色'))+
        '<div class="awf-speech-controls">'+select('TTS 模型','speechModel',models.map(x=>option(x,x,s.model)).join(''))+
        select('语言','speechLanguage',languages.map(([v,l])=>option(v,l,s.language)).join(''))+
        field('语速','speechSpeed',s.speed,'type="number" min="0.5" max="2" step="0.05"')+field('音量','speechVolume',s.volume,'type="number" min="0" max="10" step="0.1"')+
        field('音高','speechPitch',s.pitch,'type="number" min="-12" max="12" step="1"')+'</div><details class="awf-advanced"><summary>高级声音参数</summary><div class="awf-speech-controls">'+
        ['voiceModifyPitch','voiceModifyIntensity','voiceModifyTimbre'].map((key,n)=>field(['音高修饰','强度修饰','音色修饰'][n],key,s[key]??0,'type="number" min="-100" max="100" step="1"')).join('')+
        select('声音效果','soundEffects',option('','无',s.soundEffects)+option('spacious_echo','宽阔回声',s.soundEffects))+'</div></details>';
    }
    function render() {
      host.innerHTML='<div class="awf-production" data-production>'+
        '<section class="awf-section awf-production-section" data-section="speech"><div class="awf-section-head"><h3>01 / 语音</h3></div>'+
        '<form data-operation="speech"><div class="awf-production-columns"><div class="awf-input-column">'+area('文本','text',drafts.speech.text,'rows="9"')+submit('speech')+'</div>'+
        '<div class="awf-parameters-column">'+speechFields(drafts.speech)+'</div></div></form>'+
        '<div class="awf-production-columns"><div>'+resultPane('speech')+'</div><details class="awf-advanced awf-audio-adjust" '+(drafts.adjustAudio.audioUrl?'open':'')+'><summary>已有音频 / 音频调整</summary>'+
        '<form data-operation="adjustAudio">'+field('音频 URL','audioUrl',drafts.adjustAudio.audioUrl,'type="text" inputmode="url"')+upload('上传音频','audio')+'<div data-input-preview="adjustAudio"></div><div class="awf-speech-controls">'+
        field('速度','speed',drafts.adjustAudio.speed??1,'type="number" min="0.5" max="2" step="0.05"')+field('开始（秒）','trimStart',drafts.adjustAudio.trimStart??0,'type="number" min="0" step="0.1"')+
        field('结束（秒，可留空）','trimEnd',drafts.adjustAudio.trimEnd,'type="number" min="0" step="0.1"')+'</div>'+submit('adjustAudio')+'<div class="awf-actions">'+button('用于数字人','data-production-action="input-transfer" data-target="avatar"')+button('用于字幕','data-production-action="input-transfer" data-target="subtitle"')+'</div></form></details></div></section>'+
        '<section class="awf-section awf-production-section" data-section="avatar"><div class="awf-section-head"><h3>02 / 数字人</h3></div><form data-operation="avatar"><div class="awf-production-columns"><div class="awf-input-column">'+
        field('音频 URL','audioUrl',drafts.avatar.audioUrl,'type="text" inputmode="url"')+upload('上传音频','audio')+'<div data-input-preview="avatar"></div>'+
        select('形象','imageId',listOptions(library.images,drafts.avatar.imageId,'选择形象'))+'<div class="awf-actions">'+button('从相册选择','data-production-action="album"')+button('使用形象默认音色','data-production-action="default-voice"')+'</div>'+
        '<div class="awf-row">'+check('仅看所选音色绑定形象','voiceFilter',drafts.avatar.voiceFilter)+'</div>'+upload('上传新形象','image')+'<div data-image-preview></div></div>'+
        '<div class="awf-parameters-column">'+select('工作流','workflowId','')+area('表演提示词','prompt',drafts.avatar.prompt,'rows="8"')+submit('avatar')+'</div></div></form>'+resultPane('avatar')+'</section>'+
        '<section class="awf-section awf-production-section" data-section="subtitle"><div class="awf-section-head"><h3>03 / 字幕</h3></div><div class="awf-production-columns"><div class="awf-input-column"><form data-operation="subtitle">'+
        field('音频 / 视频 URL','mediaUrl',drafts.subtitle.mediaUrl,'type="text" inputmode="url"')+upload('选择音频 / 视频文件','media')+'<div data-input-preview="subtitle"></div>'+area('原文（可选）','text',drafts.subtitle.text,'rows="7"')+
        '<details class="awf-advanced"><summary>字幕参数</summary><div class="awf-speech-controls">'+select('分段','mode',option('sentence','按句',drafts.subtitle.mode||'sentence')+option('word','逐词',drafts.subtitle.mode))+
        select('识别模型','model',['tiny','base','small','medium'].map(v=>option(v,v,drafts.subtitle.model||'base')).join(''))+field('语言','language',drafts.subtitle.language||'auto')+'</div>'+check('细化时间轴','refine',drafts.subtitle.refine)+check('忽略原文换行','ignoreLines',drafts.subtitle.ignoreLines)+'</details>'+submit('subtitle')+'</form></div>'+
        '<div class="awf-results-column">'+resultPane('subtitle')+'</div></div></section></div>';
      refreshSelects();updateInputs();updateBusy();
    }
    function apply(op,draft) {
      const f=form(op);
      for(const name of mediaFields)if(Object.hasOwn(draft,name)&&String(draft[name]??'')!==get(f,name))touchTarget(op,name);
      drafts[op]={...drafts[op],...draft};
      for(const el of f.elements)if(el.name&&el.type!=='file'&&Object.hasOwn(draft,el.name)) {
        if(el.type==='checkbox')el.checked=Boolean(draft[el.name]);else el.value=draft[el.name]??'';
      }
      if(op==='speech'&&draft.speech)for(const [name,key] of [['speechModel','model'],['speechLanguage','language'],['speechSpeed','speed'],['speechVolume','volume'],['speechPitch','pitch'],['voiceModifyPitch','voiceModifyPitch'],['voiceModifyIntensity','voiceModifyIntensity'],['voiceModifyTimbre','voiceModifyTimbre'],['soundEffects','soundEffects']])if(draft.speech[key]!=null)f.elements[name].value=draft.speech[key];
      refreshSelects();updateInputs();
    }
    function refreshSelects() {
      const speech=form('speech'),avatar=form('avatar');if(!speech||!avatar)return;
      const selectedVoice=get(speech,'voiceId')||drafts.speech.voiceId||'';
      speech.elements.voiceId.innerHTML=listOptions(library.voices,selectedVoice,'选择音色');
      const selectedImage=get(avatar,'imageId')||drafts.avatar.imageId||'';
      const images=library.images.filter(i=>!activeCheckbox(avatar,'voiceFilter')||(i.voiceIds||[]).includes(selectedVoice)||i.id===selectedImage);
      avatar.elements.imageId.innerHTML=listOptions(images,selectedImage,'选择形象');
      const workflow=get(avatar,'workflowId')||drafts.avatar.workflowId||'';
      const workflows=library.workflows.filter(i=>!i.workflowType||i.workflowType==='avatar');
      avatar.elements.workflowId.innerHTML=option('','Kling',workflow)+(!workflow||workflows.some(i=>i.id===workflow)?'':'<option value="__unavailable_workflow__" selected disabled>工作流不可用，请重新选择</option>')+workflows.map(i=>option(i.id,'RunningHub · '+(i.name||i.id),workflow)).join('');
    }
    function updateInputs() {
      for(const op of ['adjustAudio','avatar','subtitle']) {
        const f=form(op),host=q('[data-input-preview="'+op+'"]'),u=url(get(f,op==='subtitle'?'mediaUrl':'audioUrl'));
        const tag=op==='subtitle'&&(drafts.subtitle.mediaKind==='video'||/\.(mp4|mov|webm)(?:[?#]|$)/i.test(u))?'video':'audio';
        const key=tag+u;if(host.dataset.key!==key){host.dataset.key=key;host.innerHTML=u?'<'+tag+' controls preload="none" src="'+esc(u)+'"></'+tag+'>':'';}
      }
      const image=library.images.find(i=>i.id===get(form('avatar'),'imageId')),host=q('[data-image-preview]'),key=image?.id||'';
      if(host.dataset.key!==key){host.dataset.key=key;host.innerHTML=image?'<img class="awf-selected-image" src="'+esc(imageUrl(image))+'" alt="'+esc(image.name||'形象')+'">':'';}
    }
    function updateBusy() {
      for(const op of operations) {
        const f=form(op),submit=f.querySelector('[type="submit"]');
        const active=jobs.find(j=>j.input?.operation===op&&!terminal.has(j.state||j.status));
        const latest=jobs.find(j=>j.input?.operation===op);
        const available=op==='adjustAudio'?deps?.ffmpeg?.available:op==='subtitle'?deps?.subtitle?.available:true;
        submit.disabled=sending.has(op)||Boolean(active)||!available;
        const status=f.querySelector('[data-submit-status]');
        status.textContent=!available?'依赖不可用，请检查设置':sending.has(op)?'提交中':active?(states[active.state||active.status]||'处理中'):pending[op]?'提交待核查，原输入重试不会重复创建任务':latest?((states[latest.state||latest.status]||'')+(latest.error?'：'+String(latest.error).slice(0,300):'')):'';
        status.classList.toggle('awf-error',Boolean(latest?.error&&!active));
      }
    }
    function outputs(section) {
      const allowed=section==='speech'?['speech','adjustAudio']:[section],out=[];
      for(const job of jobs)for(const stage of allowed){const s=job.steps?.[stage];if(s?.url&&!s.supplied&&url(s.url))out.push({id:job.id+':'+stage,jobId:job.id,stage,url:s.url,kind:section==='avatar'?'video':section==='subtitle'?'subtitle':'audio',text:job.input?.text||'',title:(labels[stage]||stage)+' · '+(job.completedAt||job.createdAt?new Date(job.completedAt||job.createdAt).toLocaleString():job.id)});}
      return out;
    }
    async function showResult(section) {
      const choice=(choices[section]||[]).find(r=>r.id===selected[section]),host=q('[data-result-preview="'+section+'"]'),actions=q('[data-result-actions="'+section+'"]');
        if(previewKeys[section]===(choice?.id||''))return;
      previewKeys[section]=choice?.id||'';
      host.innerHTML='';actions.innerHTML='';
      if(!choice){host.innerHTML='<p class="awf-empty">暂无结果</p>';return;}
      if(choice.kind==='subtitle') {
        host.innerHTML=area('字幕内容','subtitleResult',subtitleTexts[choice.id]??'','rows="16" data-subtitle-id="'+esc(choice.id)+'"');
        actions.innerHTML=button('下载 SRT','data-production-action="download-subtitle"');
        if(subtitleTexts[choice.id]==null) {
          const input=host.querySelector('textarea');input.disabled=true;
          try {
            // Returning to a loading result shares its request; only an empty cache may be filled.
            if(!subtitleLoads.has(choice.id))subtitleLoads.set(choice.id,Promise.resolve().then(()=>context.readText(choice.url)).then(text=>{
              if(!disposed&&subtitleTexts[choice.id]==null)subtitleTexts[choice.id]=text;
            }).finally(()=>subtitleLoads.delete(choice.id)));
            await subtitleLoads.get(choice.id);
            if(!disposed&&previewKeys[section]===choice.id&&host.contains(input))input.value=subtitleTexts[choice.id]??'';
          }
          catch(error){if(!disposed&&previewKeys[section]===choice.id&&host.contains(input)){notice('字幕内容读取失败，请重新选择结果重试',true);previewKeys[section]='';}}
          finally {input.disabled=false;}
        }
      } else {
        host.innerHTML='<'+choice.kind+' controls preload="none" src="'+esc(choice.url)+'"></'+choice.kind+'>';
        actions.innerHTML='<a class="awf-button" href="'+esc(choice.url)+'" target="_blank" rel="noopener noreferrer" download>下载</a>'+
          (choice.kind==='audio'?button('用于数字人','data-production-action="transfer" data-source="'+section+'" data-target="avatar"')+button('用于音频调整','data-production-action="transfer" data-source="'+section+'" data-target="adjustAudio"'):'')+
          button('用于字幕','data-production-action="transfer" data-source="'+section+'" data-target="subtitle"');
      }
    }
    function setJobs(next) {
      jobs=next;
      for(const op of operations) {
        const item=pending[op],identity=originIdentity(item?.origin);
        if(identity&&jobs.some(job=>job.clientTaskId===item.id&&job.input?.operation===op&&originIdentity(job.origin)===identity))delete pending[op];
      }
      for(const section of ['speech','avatar','subtitle']) {
        const available=outputs(section),old=choices[section]||[];
        choices[section]=available;
        const fresh=available.find(r=>!old.some(o=>o.id===r.id));
        if(!available.some(r=>r.id===selected[section]))selected[section]=available[0]?.id||'';
        const choiceHost=q('[data-result-select="'+section+'"]');
        const stamp=JSON.stringify(available.map(r=>[r.id,r.title]));
        if(choiceHost.dataset.stamp!==stamp){choiceHost.dataset.stamp=stamp;choiceHost.innerHTML=available.length?select('结果记录','output-'+section,available.map(r=>option(r.id,r.title,selected[section])).join('')):'';}
        // Existing selection and player remain stable when unrelated jobs complete.
        void showResult(section);
        if(fresh&&old.length&&fresh.id!==selected[section])notice(labels[section]+'有新结果，可在结果记录中选择');
      }
      updateBusy();
    }
    function scrollTo(op) {
      const section=op==='adjustAudio'?'speech':op;
      if(context.openSection)context.openSection(section);
      else q('[data-section="'+section+'"]').scrollIntoView({behavior:'smooth',block:'start'});
    }
    async function transfer(target,result) {
      const d=values(),key=target==='subtitle'?'mediaUrl':'audioUrl';
      if(d[target]?.[key]&&d[target][key]!==result.url&&!win.confirm('替换'+labels[target]+'当前选中的素材？其他参数保持不变。'))return;
      const next=transferDraft(d,target,result);apply(target,next[target]);
      if(target==='adjustAudio')q('.awf-audio-adjust').open=true;
      scrollTo(target);notice('已填入'+labels[target]+'，尚未生成');
    }
    async function send(f) {
      const op=f.dataset.operation;if(sending.has(op))return;
      const d=read(op);
      if(op==='avatar'&&d.workflowId&&!library.workflows.some(w=>w.id===d.workflowId&&(!w.workflowType||w.workflowType==='avatar')))throw new Error('所选工作流不适用于数字人，请重新选择');
      const job=buildStageJob(op,d,{apiBase:context.apiBase,origin:context.origin()});
      const signature=JSON.stringify(job.input);
      if(pending[op]&&pending[op].signature!==signature)throw new Error('此步骤上次提交结果不明，请保留原输入并刷新核查');
      if(pending[op]){job.clientTaskId=pending[op].id;if(pending[op].origin)job.origin=copy(pending[op].origin);}
      pending[op]={id:job.clientTaskId,signature,origin:copy(job.origin)};sending.add(op);updateBusy();
      try {await context.submit(job);delete pending[op];notice(labels[op]+'任务已提交');}
      catch(error){if(error.status>=400&&error.status<500)delete pending[op];throw error;}
      finally {sending.delete(op);if(!disposed)updateBusy();}
    }
    async function uploadFile(input) {
      const file=input.files?.[0];if(!file)return;
      const op=input.form.dataset.operation,kind=input.dataset.upload;
      const field=kind==='image'?'imageId':kind==='media'?'mediaUrl':'audioUrl',key=op+':'+field;
      const original=get(form(op),field),revision=targetRevisions[key]||0;
      const body=new win.FormData();body.append(kind==='image'?'image':'file',file);body.append('origin',JSON.stringify(context.origin()||{}));
      input.disabled=true;
      try {
        const data=await context.request(kind==='image'?'/images':kind==='media'?'/media':'/audio','POST',body);
        if(disposed)return;
        let draft;
        if(kind==='image') {await context.refreshLibrary();draft={imageId:data.item.id};}
        else {if(!url(data.url))throw new Error('上传结果缺少有效地址');draft={[field]:data.url,sourceJobId:'',...(kind==='media'?{mediaKind:file.type.startsWith('video/')?'video':'audio'}:{text:''})};}
        if(disposed)return;
        if((targetRevisions[key]||0)!==revision||get(form(op),field)!==original){notice('素材已上传，已保留较新的选择');return;}
        apply(op,draft);
        notice('素材已上传，尚未生成');
      } finally {input.disabled=false;input.value='';}
    }
    const handle=fn=>Promise.resolve().then(fn).catch(error=>notice(error.message||'操作失败',true));
    host.addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();const f=e.target;if(f.matches('[data-operation]')&&!f.querySelector('[type="submit"]').disabled)handle(()=>send(f));},{signal:controller.signal});
    host.addEventListener('input',e=>{if(e.target.dataset.subtitleId)subtitleTexts[e.target.dataset.subtitleId]=e.target.value;const op=e.target.form?.dataset.operation;if(op)touchTarget(op,e.target.name);},{signal:controller.signal});
    host.addEventListener('change',e=>{
      e.stopPropagation();const el=e.target;
      if(el.dataset.upload)return handle(()=>uploadFile(el));
      if(el.name?.startsWith('output-')) {const section=el.name.slice(7);selected[section]=el.value;return handle(()=>showResult(section));}
      if(el.form?.dataset.operation)touchTarget(el.form.dataset.operation,el.name);
      if(el.form?.dataset.operation){const op=el.form.dataset.operation;drafts[op]=read(op);if(['audioUrl','mediaUrl'].includes(el.name)){drafts[op].sourceJobId='';if(el.name==='audioUrl')drafts[op].text='';else drafts[op].mediaKind='';}if(['voiceId','voiceFilter','imageId','workflowId'].includes(el.name))refreshSelects();updateInputs();}
    },{signal:controller.signal});
    host.addEventListener('click',e=>{
      const b=e.target.closest('[data-production-action]');if(!b||b.disabled)return;e.stopPropagation();
      handle(async()=>{
        const action=b.dataset.productionAction;
        if(action==='album')return context.openAlbum();
        if(action==='default-voice') {
          const image=library.images.find(i=>i.id===get(form('avatar'),'imageId'));
          if(!image?.defaultVoiceId)throw new Error('此形象尚未设置默认音色');
          apply('speech',{voiceId:image.defaultVoiceId});notice('已选用形象的默认音色');return;
        }
        if(action==='transfer')return transfer(b.dataset.target,(choices[b.dataset.source]||[]).find(r=>r.id===selected[b.dataset.source]));
        if(action==='input-transfer')return transfer(b.dataset.target,{url:get(form('adjustAudio'),'audioUrl'),kind:'audio',text:drafts.adjustAudio.text||''});
        if(action==='download-subtitle') {
          const text=subtitleTexts[selected.subtitle];if(text==null)throw new Error('字幕仍在载入');
          const object=win.URL.createObjectURL(new win.Blob([text],{type:'application/x-subrip;charset=utf-8'}));
          const a=doc.createElement('a');a.href=object;a.download='subtitle.srt';a.click();win.setTimeout(()=>win.URL.revokeObjectURL(object),1000);
        }
      });
    },{signal:controller.signal});
    render();
    if(saved.focus) {const f=form(saved.focus.operation),input=f?.elements.namedItem(saved.focus.name);if(input){input.focus({preventScroll:true});if(saved.focus.start!=null&&input.setSelectionRange)input.setSelectionRange(saved.focus.start,saved.focus.end);}}
    return {
      setJobs,refreshSelects,
      setLibrary(value){library=value;refreshSelects();updateInputs();},
      setDependencies(value){deps=value;updateBusy();},
      useImage(id){apply('avatar',{imageId:id});scrollTo('avatar');},
      reuse(record){for(const [op,d]of Object.entries(draftsFromHistory(record)))apply(op,d);},
      snapshot(){const el=doc.activeElement,op=el?.form?.dataset.operation;return {drafts:values(),pending,selected,subtitleTexts,focus:op?{operation:op,name:el.name,start:el.selectionStart,end:el.selectionEnd}:null};},
      dispose(){disposed=true;controller.abort();host.querySelectorAll('audio,video').forEach(m=>{m.pause();m.removeAttribute('src');m.load();});}
    };
  }
  return {buildStageJob,transferDraft,draftsFromHistory,mount};
});
