(function (scope, factory) {
  'use strict';
  const api = factory(scope);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (scope) scope.AvatarWorkflowUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (scope) {
  'use strict';

  const DEFAULT_BASE = '/api/control/v1/avatar-workflow';
  const PAGE_SIZE = 12;
  const secretKey = /^(api[_-]?key|token|accessToken|authorization|secret|password)$/i;
  const tabs = {production:'制作', album:'形象相册', voices:'音色库', workflows:'工作流', settings:'设置'};
  const stageTabs = {speech:'语音', avatar:'数字人', subtitle:'字幕'};
  function historyStage(record) {
    const operation=(record?.inputSnapshot || record?.input || record)?.operation;
    return Object.hasOwn(stageTabs,operation) ? operation : 'speech';
  }
  const statusLabels = {completed:'完成',done:'完成',pending:'待处理',queued:'排队中',running:'处理中',polling:'查询中',
    submitting:'提交中',partial:'部分完成',failed:'失败','submission-unknown':'提交待核查',canceled:'已取消',cancelled:'已取消'};
  const stageLabels = {speech:'语音合成',adjustAudio:'音频调整',image:'形象上传',uploading:'素材上传',
    avatar:'数字人',subtitle:'字幕生成',pending:'待处理',completed:'完成'};
  const trim = value => String(value == null ? '' : value).trim();
  const list = value => Array.isArray(value) ? value : [];
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, char =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  const tags = value => Array.isArray(value) ? value.map(trim).filter(Boolean) : trim(value).split(/[,，\n]/).map(trim).filter(Boolean);
  const uid = () => 'awf-' + (scope.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  let mounted = null;
  let remembered = {};

  function voicePreferences(item) {
    const languages = tags(item.preferredLanguages);
    const requirements = trim(item.selectionRequirements);
    const annotated = languages.length > 0 || Boolean(requirements);
    return '<div class="awf-voice-preferences"><span class="awf-voice-label" data-voice-annotation="' +
      (annotated ? 'annotated' : 'pending') + '">' + (annotated ? '已标注' : '待标注') + '</span>' +
      (languages.length ? '<p class="awf-meta">优先语言：' + escape(languages.join(' · ')) + '</p>' : '') +
      (requirements ? '<p class="awf-notes">适用要求：' + escape(requirements) + '</p>' : '') + '</div>';
  }

  function publicRecord(value) {
    if (Array.isArray(value)) return value.map(publicRecord);
    if (!value || typeof value !== 'object') return value;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (secretKey.test(key)) {
        if (/api[_-]?key/i.test(key) && item) result.apiKeyConfigured = true;
      } else if (!['__proto__','constructor','prototype'].includes(key)) result[key] = publicRecord(item);
    }
    if (secretKey.test(String(result.fieldName || result.field_name || ''))) {
      result.fieldValue = '';
      if ('field_value' in result) result.field_value = '';
    }
    return result;
  }

  function safeUrl(value, relative = true) {
    const text = trim(value);
    if (/^https?:\/\/[^\s]+$/i.test(text)) {
      try { const url = new URL(text); return url.username || url.password ? '' : text; } catch { return ''; }
    }
    return relative && /^\/(?!\/)[^\s\\]*$/.test(text) ? text : '';
  }

  function workflowJson(value) {
    try { return typeof value === 'string' ? JSON.parse(value) : value; }
    catch { throw new Error('Payload JSON 无效'); }
  }

  function isAvatarWorkflow(item) {
    return Boolean(item && (!item.workflowType || item.workflowType === 'avatar'));
  }

  function parseWorkflow(source, sourceUrl, explicitId) {
    const payload = workflowJson(source);
    const data = payload?.data || payload;
    const nodes = workflowJson(Array.isArray(payload) ? payload : data?.nodeInfoList || data?.inputs || data?.nodes);
    const linked = trim(sourceUrl).match(/(?:ai-detail\/|run\/ai-app\/|webappId[=/]|appId[=/])([a-zA-Z0-9_-]+)/i);
    const webappId = trim(explicitId || payload?.webappId || data?.webappId || payload?.appId || linked?.[1]);
    if (!webappId) throw new Error('请填写 webappId 或有效的 RunningHub 应用链接');
    if (!Array.isArray(nodes) || !nodes.length) throw new Error('Payload 缺少 inputs / nodeInfoList 节点');
    const nodeInfoList = nodes.map(node => {
      const clean = publicRecord(node);
      if (!clean || !trim(clean.nodeId ?? clean.node_id) || !trim(clean.fieldName ?? clean.field_name)) {
        throw new Error('每个节点必须包含 nodeId 和 fieldName');
      }
      return {...clean,nodeId:trim(clean.nodeId ?? clean.node_id),fieldName:trim(clean.fieldName ?? clean.field_name),
        fieldValue:clean.fieldValue ?? clean.field_value ?? '',binding:clean.binding ?? clean.dynamicBinding ?? ''};
    });
    return {webappId,sourceUrl:trim(sourceUrl),nodeInfoList};
  }

  function mutation(base, fields, changedKey) {
    const item = {...publicRecord(base || {}),...publicRecord(fields)};
    delete item.version;
    delete item.createdAt;
    delete item.updatedAt;
    delete item.apiKeyConfigured;
    delete item.hasApiKey;
    if (trim(changedKey)) item.apiKey = trim(changedKey);
    const result = {item};
    if (base) {
      if (base.version == null) throw new Error('缺少条目版本，请重新载入后编辑');
      result.expectedVersion = base.version;
    }
    return result;
  }

  function speechOptions(source = {}) {
    const result = {model:trim(source.model) || 'speech-2.8-hd',language:trim(source.language) || 'auto'};
    for (const [key,fallback,min,max] of [['speed',1,0.5,2],['volume',1,0,10],['pitch',0,-12,12],
      ['voiceModifyPitch',0,-100,100],['voiceModifyIntensity',0,-100,100],['voiceModifyTimbre',0,-100,100]]) {
      if (key.startsWith('voiceModify') && source[key] == null) continue;
      const number = Number(source[key] ?? fallback);
      if (!Number.isFinite(number) || number < min || number > max) throw new Error('语音参数超出范围：' + key);
      result[key] = number;
    }
    if (trim(source.soundEffects)) result.soundEffects = trim(source.soundEffects);
    return result;
  }

  function buildJob(draft, context = {}) {
    const audioUrl = trim(draft.audioUrl);
    const text = audioUrl ? '' : trim(draft.text);
    const voiceId = audioUrl ? '' : trim(draft.voiceId);
    const avatarEnabled = draft.avatarEnabled !== false;
    const imageId = avatarEnabled ? trim(draft.imageId) : '';
    const workflowId = avatarEnabled && draft.workflowId !== 'kling' ? trim(draft.workflowId) : '';
    if (audioUrl && !safeUrl(audioUrl)) throw new Error('音频地址必须是 HTTP(S) 或本站资源地址');
    if (!audioUrl && (!text || !voiceId)) throw new Error('请输入文本并选择音色，或提供已有音频');
    if (avatarEnabled && !imageId) throw new Error('请选择数字人形象，或关闭数字人步骤');
    const adjustAudio = {enabled:Boolean(draft.adjustAudio)};
    if (adjustAudio.enabled) {
      adjustAudio.speed = Number(draft.speed ?? 1);
      adjustAudio.trimStart = Number(draft.trimStart || 0);
      if (trim(draft.trimEnd)) adjustAudio.duration = Number(draft.trimEnd) - adjustAudio.trimStart;
      if (!Number.isFinite(adjustAudio.speed) || adjustAudio.speed < 0.5 || adjustAudio.speed > 2 ||
          !Number.isFinite(adjustAudio.trimStart) || adjustAudio.trimStart < 0 || adjustAudio.trimStart > 3600 ||
          (adjustAudio.duration != null && (!Number.isFinite(adjustAudio.duration) || adjustAudio.duration < 0.05 || adjustAudio.duration > 3600))) {
        throw new Error('速度范围为 0.5–2；裁切结束时间必须大于开始时间');
      }
    }
    return {clientTaskId:context.clientTaskId || uid(),origin:context.origin || {type:'browser',client:'web',id:'local-browser',label:'Local browser'},
      input:{text,voiceId,imageId,workflowId,audioUrl,prompt:trim(draft.prompt),...(context.apiBase ? {apiBase:context.apiBase} : {}),
        options:{speech:speechOptions(draft.speech),avatar:{enabled:avatarEnabled,model:workflowId ? 'runninghub' : 'kling'},
          subtitle:{enabled:Boolean(draft.subtitle)},adjustAudio}}};
  }

  function pageImages(images, filter = {}) {
    const query = trim(filter.query).toLowerCase();
    const selected = list(images).filter(item => (!filter.voiceId || list(item.voiceIds).includes(filter.voiceId)) &&
      (!filter.favorite || item.favorite) && (!query || [item.name,item.notes,...tags(item.tags)].join(' ').toLowerCase().includes(query)));
    const pages = Math.max(1,Math.ceil(selected.length / PAGE_SIZE));
    const page = Math.max(1,Math.min(pages,Number(filter.page) || 1));
    return {items:selected.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE),total:selected.length,pages,page};
  }

  function readLegacy(storage) {
    function read(key) {
      const raw = storage.getItem(key);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { throw new Error('旧配置 JSON 无效：' + key); }
    }
    const voices = [];
    for (const key of ['voices','voiceLibrary','api_console_voice_library_v1','tts_avatar_voice_library_v1']) {
      const value = read(key);
      voices.push(...list(value?.voices || value));
    }
    const runningHubWorkflows = [];
    for (const key of ['runningHubWorkflows','api_console_runninghub_motion_config_v1','tts_avatar_runninghub_workflows_v1']) {
      const value = read(key);
      if (!value) continue;
      const configs = Array.isArray(value) ? value : value.configs || value.workflows || (value.webappId ? [value] : []);
      for (const item of configs) runningHubWorkflows.push({...item,...(item.apiKey || !value.apiKey ? {} : {apiKey:value.apiKey})});
    }
    return {source:'browser',voices,runningHubWorkflows};
  }

  function historyDraft(record) {
    const input = record?.inputSnapshot || record?.input || record?.params?.input || record?.snapshot?.input || record?.params || record || {};
    const options = input.options || {};
    return {text:trim(input.text),voiceId:trim(input.voiceId),imageId:trim(input.imageId),
      workflowId:trim(input.workflowId),audioUrl:safeUrl(input.audioUrl),prompt:trim(input.prompt),
      speech:speechOptions(options.speech),avatarEnabled:options.avatar?.enabled !== false,subtitle:Boolean(options.subtitle?.enabled),
      adjustAudio:Boolean(options.adjustAudio?.enabled),speed:options.adjustAudio?.speed ?? 1,
      trimStart:options.adjustAudio?.trimStart ?? 0,trimEnd:options.adjustAudio?.duration != null ?
        Number(options.adjustAudio?.trimStart || 0) + Number(options.adjustAudio.duration) : options.adjustAudio?.trimEnd ?? ''};
  }

  function message(error) {
    return trim(typeof error === 'object' ? error?.message || error?.error || error?.code : error)
      .replace(/((?:api[_-]?key|token|authorization|secret|password)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,'$1[redacted]')
      .replace(/Bearer\s+\S+/gi,'Bearer [redacted]').slice(0,800);
  }

  function button(label, attrs = '', primary = false) {
    return '<button type="button" class="awf-button' + (primary ? ' awf-primary' : '') + '" ' + attrs + '>' + label + '</button>';
  }
  function field(label, name, value = '', attrs = '') {
    return '<label class="awf-field"><span>' + label + '</span><input name="' + name + '" value="' + escape(value) + '" ' + attrs + '></label>';
  }
  function area(label, name, value = '', attrs = '') {
    return '<label class="awf-field"><span>' + label + '</span><textarea name="' + name + '" ' + attrs + '>' + escape(value) + '</textarea></label>';
  }
  function check(label, name, checked = false, attrs = '') {
    return '<label class="awf-check"><input type="checkbox" name="' + name + '" ' + (checked ? 'checked ' : '') + attrs + '><span>' + label + '</span></label>';
  }
  function option(value, label, selected = '') {
    return '<option value="' + escape(value) + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' + escape(label) + '</option>';
  }
  function select(label, name, options, attrs = '') {
    return '<label class="awf-field"><span>' + label + '</span><select name="' + name + '" ' + attrs + '>' + options + '</select></label>';
  }
  function heading(title, actions = '') {
    return '<div class="awf-section-head"><h3>' + title + '</h3><div class="awf-actions">' + actions + '</div></div>';
  }
  function depAvailable(deps, name) {
    const source = deps?.dependencies || deps?.data || deps || {};
    const value = source[name];
    return value === true || value?.available === true || value?.ready === true || value?.ok === true;
  }

  function mount(element, options = {}) {
    if (!element?.ownerDocument) throw new TypeError('AvatarWorkflowUI.mount requires a DOM element');
    unmount();
    const document = element.ownerDocument;
    const window = document.defaultView;
    // apiBase is the gateway setting supplied by the shell, never the local REST origin.
    const base = DEFAULT_BASE;
    const gatewayBase = options.apiBase ? safeUrl(options.apiBase,false).replace(/\/$/,'') : '';
    if (options.apiBase && !gatewayBase) throw new Error('Invalid gateway API base');
    const controller = new window.AbortController();
    const state = {library:{voices:[],images:[],workflows:[],settings:[]},deps:{},jobs:[],tab:remembered.tab || 'production',
      filter:{page:1,...remembered.filter},editor:null,disposed:false,ready:false,refreshing:null,session:null,submitting:false,
      pendingSubmission:remembered.pendingSubmission || null,importPayload:null,libraryStamp:'',jobStamp:'',timer:null,
      jobsLoaded:false,jobRevision:0,stage:remembered.stage || 'speech'};
    const root = document.createElement('div');
    root.className = 'awf';
    element.classList.add('awf-host');
    element.replaceChildren(root);
    root.innerHTML = '<header class="awf-header"><div class="awf-header-title"><p class="awf-eyebrow">AVATAR WORKFLOW</p><h2>数字人工作流</h2></div>' +
      '<nav class="awf-tabs awf-library-tabs" role="tablist" aria-label="资料与设置">' + Object.entries(tabs).filter(([id])=>id!=='production').map(([id,label]) =>
        '<button type="button" role="tab" id="awf-tab-' + id + '" data-tab="' + id + '" aria-controls="awf-panel-' + id +
        '" aria-selected="false" tabindex="' + (id==='album' ? 0 : -1) + '">' + label + '</button>').join('') + '</nav>' +
      '<div class="awf-actions awf-header-actions"><span class="awf-sync" data-sync>连接中</span>' +
      button('&#8635;','data-action="refresh" aria-label="刷新状态" title="刷新状态"') + '</div></header>' +
      '<nav class="awf-tabs awf-primary-tabs" role="tablist" aria-label="制作步骤">' + Object.entries(stageTabs).map(([id,label]) =>
        '<button type="button" role="tab" id="awf-stage-tab-' + id + '" data-stage-tab="' + id + '" aria-controls="awf-stage-panel-' + id +
        '" aria-selected="false" tabindex="' + (id===state.stage ? 0 : -1) + '">' + label + '</button>').join('') +
      '</nav><div class="awf-notice" data-notice role="status" aria-live="polite" hidden></div>' +
      '<div class="awf-scroll">' + Object.keys(tabs).map(id =>
        '<div ' + (id==='production' ? '' : 'role="tabpanel" aria-labelledby="awf-tab-' + id + '" ') + 'id="awf-panel-' + id + '" data-panel="' + id + '" ' +
        (id === 'production' ? '' : 'hidden') + '></div>').join('') + '</div>';
    const q = selector => root.querySelector(selector);
    const panel = name => q('[data-panel="' + name + '"]');
    const value = (form,name) => form.elements.namedItem(name)?.value || '';
    const checked = (form,name) => Boolean(form.elements.namedItem(name)?.checked);
    let production = null;
    function productionDraft() {
      return production?.snapshot() || remembered.production || {};
    }
    function captureForm(form) {
      if (!form) return null;
      const fields={};
      for (const input of form.elements) {
        if (!input.name || input.type==='password' || input.type==='file' || secretKey.test(input.name)) continue;
        if (input.name==='boundVoice') {
          fields.boundVoice ||= [];
          if (input.checked) fields.boundVoice.push(input.value);
        } else if (input.type==='checkbox') fields[input.name]=input.checked;
        else if (input.name==='payload') {
          try {fields.payload=JSON.stringify(publicRecord(JSON.parse(input.value)),null,2);}
          catch {fields.payload=input.value.replace(/((?:api[_-]?key|token|authorization|secret|password)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,'$1[redacted]');}
        } else fields[input.name]=input.value;
      }
      return fields;
    }
    function restoreForm(form,fields) {
      if (!form || !fields) return;
      for (const input of form.elements) {
        if (!Object.hasOwn(fields,input.name) || input.type==='password' || input.type==='file') continue;
        if (input.name==='boundVoice') input.checked=list(fields.boundVoice).includes(input.value);
        else if (input.type==='checkbox') input.checked=Boolean(fields[input.name]);
        else input.value=fields[input.name];
      }
    }
    const setNotice = (text, error = false) => {
      if (state.disposed) return;
      q('[data-notice]').textContent = text;
      q('[data-notice]').hidden = !text;
      q('[data-notice]').classList.toggle('awf-error',error);
    };
    const fail = error => {
      if (error?.name !== 'AbortError') setNotice(error.status === 409 ?
        '409：此条目已被其他窗口修改。当前草稿已保留；取消编辑并重新打开后再保存。' : message(error) || '请求失败',true);
    };

    async function session() {
      if (!state.session) state.session = window.fetch('/api/control/v1/session',{
        credentials:'same-origin',cache:'no-store',signal:controller.signal
      }).then(response => {
        if (!response.ok) throw new Error('本地会话不可用 (HTTP ' + response.status + ')');
      }).catch(error => {state.session=null; throw error;});
      return state.session;
    }
    async function request(path, method = 'GET', body) {
      await session();
      const multipart = body instanceof window.FormData;
      const response = await window.fetch(base + path,{method,credentials:'same-origin',cache:'no-store',
        signal:controller.signal,headers:body && !multipart ? {'Content-Type':'application/json'} : {},
        body:body ? (multipart ? body : JSON.stringify(body)) : undefined});
      let data = {};
      try { data = await response.json(); } catch {
        if (response.ok && response.status !== 204) throw new Error('本地服务返回了无效 JSON');
      }
      if (!response.ok || data.success === false) {
        // Response bodies may echo credentials. HTTP errors never render raw server bodies.
        const error = new Error('本地请求失败 (HTTP ' + response.status + ')');
        error.status = response.status;
        if (response.status === 401 || response.status === 403) state.session = null;
        throw error;
      }
      return data;
    }

    function voiceOptions(selected = '', imageId = '') {
      const image = state.library.images.find(item => item.id === imageId);
      const bound = list(image?.voiceIds);
      const sorted = [...state.library.voices].sort((a,b) => Number(bound.includes(b.id))-Number(bound.includes(a.id)));
      let html = option('','选择音色',selected);
      if (selected && !sorted.some(item => item.id === selected)) html += option(selected,'已删除音色 (' + selected + ')',selected);
      return html + sorted.map(item => option(item.id,(bound.includes(item.id) ? '推荐 · ' : '') + (item.name || item.voiceId),selected)).join('');
    }
    function workflowOptions(selected = '') {
      if (selected === 'kling') selected = '';
      const workflows = state.library.workflows.filter(isAvatarWorkflow);
      let html = option('','Kling',selected);
      if (selected && !workflows.some(item => item.id === selected)) {
        html += '<option value="__unavailable_workflow__" disabled selected>工作流不可用，请重新选择</option>';
      }
      return html + workflows.map(item=>option(item.id,'RunningHub · ' + (item.name || item.title || item.id),selected)).join('');
    }
    function imageOptions(selected = '', voiceId = '') {
      let html = option('','选择形象',selected);
      const images = state.library.images.filter(item=>!voiceId || list(item.voiceIds).includes(voiceId) || item.id===selected);
      if (selected && !images.some(item=>item.id===selected)) html += option(selected,'已删除形象 (' + selected + ')',selected);
      return html + images.map(item=>option(item.id,item.name || item.id,selected)).join('');
    }
    function imageUrl(item) {
      return safeUrl(item.url) || base + '/images/' + encodeURIComponent(item.id) + '/content';
    }
    function renderProduction(draft = {}) {
      production?.dispose();
      panel('production').innerHTML = '<div data-production-host></div><details class="awf-section awf-jobs"><summary>全部制作任务</summary><div data-jobs></div></details>';
      production = scope.AvatarWorkflowProduction.mount(q('[data-production-host]'), {
        saved: draft, library: state.library, deps: state.deps, apiBase: gatewayBase,
        origin: () => typeof options.origin === 'function' ? options.origin() : options.origin,
        notice: setNotice, request, imageUrl,
        openAlbum: () => showTab('album'),
        openSection: showStage,
        refreshLibrary: async () => { await reloadLibrary(); production.setLibrary(state.library); },
        readText: async url => {
          await session();
          const target = new URL(url,window.location.href);
          if (target.origin !== window.location.origin || !target.pathname.startsWith(base + '/media/')) throw new Error('字幕结果不是本站资源');
          const response = await window.fetch(target.href,{credentials:'same-origin',signal:controller.signal});
          if (!response.ok) throw new Error('字幕读取失败');
          const text = await response.text();
          if (text.length > 2 * 1024 * 1024) throw new Error('字幕内容过大');
          return text;
        },
        submit: async job => {
          const data = await request('/jobs','POST',job);
          if (state.disposed) return;
          const created = publicRecord(data.job || data.data || data);
          if (created.id) acceptJobs([created,...state.jobs.filter(item => item.id !== created.id)]);
          await refresh();
        }
      });
      if (state.jobsLoaded) production.setJobs(state.jobs);
      updateStageTabs();
      renderJobs();
    }
    function updateProduction() { production?.setDependencies(state.deps); }
    function refreshSelects() { production?.setLibrary(state.library); }

    function renderAlbum() {
      panel('album').innerHTML = '<section class="awf-section">' + heading('形象相册',
        '<label class="awf-button awf-upload">上传形象<input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp"></label>') +
        '<div class="awf-row">' + field('搜索名称、标签、备注','imageSearch',state.filter.query,'type="search"') +
        select('绑定音色','albumVoice',option('','全部音色',state.filter.voiceId)+state.library.voices.map(v=>option(v.id,v.name,state.filter.voiceId)).join('')) +
        check('仅收藏','favoriteOnly',state.filter.favorite) + '</div><div data-image-editor></div>' +
        '<div class="awf-album-grid"></div><div class="awf-pagination" data-image-pages></div></section>';
      renderImages();
    }
    function renderImages() {
      const grid = q('.awf-album-grid');
      if (!grid) return;
      const result = pageImages(state.library.images,state.filter);
      state.filter.page = result.page;
      grid.innerHTML = result.items.map(item=>'<article class="awf-image-card"><div class="awf-image-preview"><img loading="lazy" decoding="async" ' +
        'src="' + escape(imageUrl(item)) + '" alt="' + escape(item.name || '形象') + '"></div><div class="awf-image-body"><h4>' +
        escape(item.name || item.id) + '</h4><p class="awf-meta">' + escape(tags(item.tags).join(' · ')) + '</p><p class="awf-notes">' +
        escape(item.notes || '') + '</p><p class="awf-meta">' + list(item.voiceIds).length + ' 个绑定音色' + (item.favorite ? ' · 已收藏' : '') +
        '</p><div class="awf-actions">' + button('编辑','data-edit="images" data-id="' + escape(item.id) + '"') +
        button('用于制作','data-action="use-image" data-id="' + escape(item.id) + '"') + '</div></div></article>').join('') ||
        '<p class="awf-empty">暂无匹配形象</p>';
      q('[data-image-pages]').innerHTML = button('&#8592;','data-action="prev-images" aria-label="上一页" title="上一页" ' + (result.page===1?'disabled':'')) +
        '<span>' + result.page + ' / ' + result.pages + ' · ' + result.total + ' 张</span>' +
        button('&#8594;','data-action="next-images" aria-label="下一页" title="下一页" ' + (result.page===result.pages?'disabled':''));
    }
    function renderRegistry(collection) {
      panel(collection).innerHTML = '<section class="awf-section">' + heading(tabs[collection],
        button('新增','data-new="' + collection + '"')) + '<div data-registry-editor="' + collection + '"></div>' +
        '<div class="awf-registry-list">' + state.library[collection].map(item=>'<article class="awf-registry-row"><div><h4>' +
          escape(item.name || item.title || item.id) + '</h4><p class="awf-meta">' +
          escape(collection==='voices' ? [item.voiceId,item.language,...tags(item.tags)].filter(Boolean).join(' · ') :
            'RunningHub · ' + item.webappId + ((item.apiKeyConfigured || item.hasApiKey) ? ' · 密钥已配置' : '')) +
          '</p><p class="awf-notes">' + escape(item.notes || '') + '</p>' +
          (collection==='voices' ? voicePreferences(item) : '') + '</div><div class="awf-actions">' +
          (collection==='voices' ? button('绑定形象','data-action="voice-images" data-id="' + escape(item.id) + '"') : '') +
          button('编辑','data-edit="' + collection + '" data-id="' + escape(item.id) + '"') + '</div></article>').join('') +
          (state.library[collection].length ? '' : '<p class="awf-empty">暂无条目</p>') + '</div></section>';
    }

    function openEditor(collection,id,restore) {
      if (state.editor && !window.confirm('放弃当前未保存的编辑？')) return;
      closeEditor();
      const original = restore ? restore.base : id ? state.library[collection].find(item=>item.id===id) : null;
      if (id && !original && !restore) return setNotice('条目已不存在，请刷新。',true);
      const item = publicRecord(original || {});
      // This snapshot intentionally keeps the loaded version, even if polling refreshes the library.
      state.editor = {collection,base:original ? publicRecord(original) : null,id:restore?.id || id || uid()};
      const host = collection==='images' ? q('[data-image-editor]') : q('[data-registry-editor="' + collection + '"]');
      let body = field('名称','name',item.name || item.title,'required maxlength="180"');
      if (collection==='voices') body += '<div class="awf-row">' + field('供应商 Voice ID','voiceId',item.voiceId,'required') +
        field('语言','language',item.language) + '</div>' +
        field('优先语言（逗号分隔）','preferredLanguages',tags(item.preferredLanguages).join(', '),'placeholder="如：英语, 葡萄牙语"') +
        area('适用要求','selectionRequirements',item.selectionRequirements,'rows="3" placeholder="如：英语广告优先，语气活泼；教程旁白需要清晰自然"') +
        '<p class="awf-meta">填写优先语言或适用要求后显示「已标注」；留空显示「待标注」。</p>' + check('收藏','favorite',item.favorite);
      if (collection==='images') {
        body += check('收藏','favorite',item.favorite) + '<fieldset class="awf-bindings"><legend>绑定音色</legend>' +
          state.library.voices.map(voice=>check(escape(voice.name || voice.voiceId),'boundVoice',list(item.voiceIds).includes(voice.id),'value="' + escape(voice.id) + '"')).join('') +
          '</fieldset>' + select('默认音色','defaultVoiceId',option('','无默认音色',item.defaultVoiceId) +
          state.library.voices.filter(voice=>list(item.voiceIds).includes(voice.id)).map(voice=>option(voice.id,voice.name,item.defaultVoiceId)).join(''));
      }
      if (collection==='workflows') {
        const rawNodes = item.nodeInfoList || item.nodes || [];
        let payloadText;
        try { payloadText = JSON.stringify(publicRecord(workflowJson(rawNodes)),null,2); }
        catch { payloadText = message(rawNodes); setNotice('已保存的节点 JSON 无效，请修正后保存。',true); }
        body += '<div class="awf-row">' + field('RunningHub 应用链接','sourceUrl',item.sourceUrl,'type="url"') +
          field('webappId','webappId',item.webappId) + '</div>' +
          area('节点 Payload / JSON','payload',payloadText,'rows="8" spellcheck="false"') +
          button('解析节点','data-action="parse-workflow"') + '<div data-node-bindings></div>' +
          field('API Key','apiKey','','type="password" autocomplete="new-password" placeholder="' +
          (item.apiKeyConfigured || item.hasApiKey ? '已配置 (already configured)' : '未配置') + '"');
      }
      body += field('标签（逗号分隔）','tags',tags(item.tags).join(', ')) + area('备注','notes',item.notes,'rows="2"') +
        '<div class="awf-actions"><button class="awf-button awf-primary" type="submit">保存</button>' +
        button('取消','data-action="cancel-editor"') + (original ? button('删除','data-action="delete-item" class="awf-danger"') : '') + '</div>';
      host.innerHTML = '<form class="awf-editor" data-editor="' + collection + '">' + body + '</form>';
      if (restore) {
        const form=host.querySelector('form');
        if (collection==='images') {
          form.elements.defaultVoiceId.innerHTML=option('','无默认音色') + state.library.voices
            .filter(v=>list(restore.fields.boundVoice).includes(v.id)).map(v=>option(v.id,v.name)).join('');
        }
        restoreForm(form,restore.fields);
      }
      if (state.tab===(collection==='images'?'album':collection)) host.querySelector('[name="name"]').focus();
    }
    function closeEditor() {
      q('[data-editor]')?.remove();
      state.editor = null;
    }
    function parseEditor() {
      const form = q('[data-editor="workflows"]');
      const parsed = parseWorkflow(value(form,'payload'),value(form,'sourceUrl'),value(form,'webappId'));
      form.elements.webappId.value = parsed.webappId;
      form.elements.payload.value = JSON.stringify(parsed.nodeInfoList,null,2);
      const bindings = [['','固定值'],['referenceImage','形象'],['referenceAudio','音频'],['prompt','提示词']];
      q('[data-node-bindings]').innerHTML = parsed.nodeInfoList.map((node,index) =>
        select(escape(node.nodeId + ' · ' + node.fieldName),'binding-' + index,
          bindings.concat(bindings.some(([key])=>key===node.binding) ? [] : [[node.binding,node.binding]])
            .map(([key,label])=>option(key,label,node.binding)).join(''),'data-node-binding="' + index + '"')).join('');
    }
    async function saveEditor(form) {
      const editor = state.editor;
      if (!editor) return;
      const fields = {id:editor.id,name:trim(value(form,'name')),tags:tags(value(form,'tags')),notes:value(form,'notes')};
      if (!fields.name) throw new Error('请填写名称');
      if (editor.collection==='voices') Object.assign(fields,{voiceId:trim(value(form,'voiceId')),language:trim(value(form,'language')),
        preferredLanguages:[...new Set(tags(value(form,'preferredLanguages')))],selectionRequirements:trim(value(form,'selectionRequirements')),
        favorite:checked(form,'favorite')});
      if (editor.collection==='images') {
        fields.voiceIds = Array.from(form.querySelectorAll('[name="boundVoice"]:checked'),input=>input.value);
        fields.defaultVoiceId = value(form,'defaultVoiceId');
        fields.favorite = checked(form,'favorite');
        if (fields.defaultVoiceId && !fields.voiceIds.includes(fields.defaultVoiceId)) throw new Error('默认音色必须属于绑定音色');
      }
      if (editor.collection==='workflows') {
        Object.assign(fields,parseWorkflow(value(form,'payload'),value(form,'sourceUrl'),value(form,'webappId')),
          {title:fields.name,provider:editor.base?.provider || 'runninghub',workflowType:editor.base?.workflowType || 'avatar'});
        if (editor.base?.nodes) fields.nodes = fields.nodeInfoList;
      }
      const body = mutation(editor.base,fields,value(form,'apiKey'));
      await request('/library/' + editor.collection,'POST',body);
      if (state.disposed) return;
      if (form.elements.apiKey) form.elements.apiKey.value = '';
      closeEditor();
      await reloadLibrary();
      if (editor.collection==='images') renderImages(); else renderRegistry(editor.collection);
      setNotice('已保存');
    }
    async function deleteEditor() {
      const editor = state.editor;
      if (!editor?.base || !window.confirm('删除此条目？已有生成历史不会被删除。')) return;
      if (editor.base.version == null) throw new Error('缺少条目版本，请重新载入');
      await request('/library/' + editor.collection + '/' + encodeURIComponent(editor.id),'DELETE',{expectedVersion:editor.base.version});
      if (state.disposed) return;
      closeEditor();
      await reloadLibrary();
      if (editor.collection==='images') renderImages(); else renderRegistry(editor.collection);
      setNotice('已删除');
    }

    function renderSettings() {
      const item = state.library.settings.find(item=>item.id==='dependencies') || null;
      state.settingsBase = item ? publicRecord(item) : null;
      panel('settings').innerHTML = '<section class="awf-section">' + heading('本地依赖',button('检查依赖','data-action="check-deps"')) +
        '<div class="awf-dependencies" data-dependencies></div><form data-settings>' +
        field('FFmpeg 路径','ffmpeg',item?.ffmpeg) + field('Python 路径','python',item?.python) +
        field('字幕工具路径','subtitleService',item?.subtitleService) +
        '<div class="awf-actions"><button class="awf-button awf-primary" type="submit">保存路径</button>' +
        button('重新载入路径','data-action="reload-settings"') + '</div></form></section>' +
        '<section class="awf-section">' + heading('旧配置导入') + '<div class="awf-actions">' +
        button('检查浏览器旧配置','data-action="inspect-import"') +
        button('导入旧工具本地配置','data-action="import-standalone"') + '</div><div data-import></div></section>';
      renderDependencies();
    }
    function renderDependencies() {
      const host = q('[data-dependencies]');
      if (!host) return;
      host.innerHTML = ['ffmpeg','subtitle'].map(name=>'<span class="awf-dependency">' + (name==='ffmpeg'?'FFmpeg':'字幕') +
        ' · ' + (depAvailable(state.deps,name)?'可用':'不可用') + '</span>').join('');
    }
    async function checkDependencies() {
      try {state.deps = publicRecord(await request('/dependencies'));}
      catch(error) {state.deps={}; throw error;}
      finally {if (!state.disposed) {renderDependencies(); updateProduction();}}
    }
    async function reloadLibrary() {
      const data = publicRecord(await request('/library'));
      if (state.disposed) return;
      for (const key of ['voices','images','workflows','settings']) state.library[key] = list(data[key] || data.data?.[key]);
      const stamp = JSON.stringify(state.library);
      const changed = stamp !== state.libraryStamp;
      if (state.ready && stamp!==state.libraryStamp) q('[data-sync]').textContent = '库已更新';
      state.libraryStamp = stamp;
      if (changed) production?.setLibrary(state.library);
    }

    function resultLinks(job) {
      const found = new Map();
      function add(value,label) {
        const url = safeUrl(typeof value==='string' ? value : value?.url);
        if (url) found.set(url,label);
      }
      function collect(result) {
        if (!result || typeof result !== 'object') return;
        for (const [key,label] of [['audioUrl','音频'],['audio','音频'],['videoUrl','视频'],['video','视频'],['subtitleUrl','字幕'],['subtitle','字幕'],['url','结果']]) add(result[key],label);
        for (const child of list(result.results)) collect(child);
      }
      collect(job);
      collect(job.result);
      collect(job.output);
      for (const result of list(job.results)) collect(result);
      const stages = Array.isArray(job.stages) ? job.stages : Object.entries(job.steps || job.stages || {}).map(([name,data])=>({name,...data}));
      for (const stage of stages) {
        add(stage.url,/speech|audio/i.test(stage.name || stage.id || '')?'音频':stage.name==='subtitle'?'字幕':stage.name==='avatar'?'视频':'结果');
        collect(stage.result); collect(stage.output);
      }
      return Array.from(found,([url,label])=>'<a href="' + escape(url) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>').join('');
    }
    function renderJobs() {
      const host = q('[data-jobs]');
      if (!host) return;
      const stamp = JSON.stringify(state.jobs);
      if (stamp===state.jobStamp && host.childElementCount) return;
      state.jobStamp = stamp;
      const active = document.activeElement;
      const focusedJob = active?.closest?.('[data-job-id]')?.dataset.jobId;
      const focusedAction = active?.dataset.action;
      host.innerHTML = state.jobs.slice(0,40).map(job=>{
        const stages = Array.isArray(job.stages) ? job.stages : Object.entries(job.steps || job.stages || {}).map(([name,data])=>
          ({name,...data,status:data.status || data.state || (data.url?'done':name===job.stage?job.state:'pending')}));
        if (job.stage && !['completed','pending'].includes(job.stage) && !stages.some(item=>item.name===job.stage)) {
          stages.push({name:job.stage,status:job.state});
        }
        const status=job.status || job.state || 'pending';
        return '<article class="awf-job" data-job-id="' + escape(job.id) + '" data-state="' + escape(status) + '">' +
          '<div class="awf-section-head"><h4>' + escape(job.name || job.input?.text?.slice(0,60) || job.id) +
          '</h4><span class="awf-status" data-state="' + escape(status) + '">' + escape(statusLabels[status] || status) + '</span></div>' +
          '<ol class="awf-stages">' + stages.map(stage=>{
            const name=stage.name || stage.id || stage.stage || '步骤';
            const status=stage.status || stage.state || 'pending';
            return '<li data-stage="' + escape(name) + '" data-state="' + escape(status) + '"><span>' + escape(stageLabels[name] || name) +
            '</span><span>' + escape(statusLabels[status] || status) + '</span>' +
            (Number.isFinite(Number(stage.progress)) ? '<progress max="100" value="' + Math.min(100,Math.max(0,Number(stage.progress))) + '" aria-label="' + escape(stage.name || '步骤') + '"></progress>' : '') +
            (stage.error ? '<p class="awf-error">' + escape(message(stage.error)) + '</p>' : '') + '</li>';
          }).join('') + '</ol>' +
          (job.error ? '<p class="awf-error">' + escape(message(job.error)) + '</p>' : '') +
          '<div class="awf-actions awf-results">' + resultLinks(job) +
          button('查询','data-action="query-job" data-id="' + escape(job.id) + '"') +
          button('复用输入','data-action="reuse-job" data-id="' + escape(job.id) + '"') + '</div></article>';
      }).join('') || '<p class="awf-empty">暂无制作任务</p>';
      if (focusedJob && focusedAction) Array.from(host.querySelectorAll('button')).find(button=>
        button.dataset.id===focusedJob && button.dataset.action===focusedAction)?.focus({preventScroll:true});
    }
    function acceptJobs(jobs, requestRevision = state.jobRevision) {
      // A list requested before a submission cannot erase its accepted task.
      if (requestRevision !== state.jobRevision) return;
      const previous = new Map(state.jobs.map(job=>[job.id,JSON.stringify(job)]));
      const changed = jobs.some(job=>previous.has(job.id) && previous.get(job.id)!==JSON.stringify(job));
      state.jobs = publicRecord(jobs);
      state.jobsLoaded = true;
      state.jobRevision++;
      production?.setJobs(state.jobs);
      renderJobs();
      if (changed && typeof options.onHistoryChanged==='function') {
        Promise.resolve().then(()=>options.onHistoryChanged()).catch(()=>{});
      }
    }
    async function refresh() {
      if (state.disposed) return;
      if (state.refreshing) return state.refreshing;
      state.refreshing = (async()=>{
        await reloadLibrary();
        const requestRevision = state.jobRevision;
        const data = await request('/jobs');
        if (!state.disposed) acceptJobs(list(data.jobs || data.data?.jobs || data.data),requestRevision);
      })().catch(fail).finally(()=>{state.refreshing=null;});
      return state.refreshing;
    }


    function updateStageTabs() {
      root.querySelectorAll('[data-stage-tab]').forEach(tab=>{
        tab.setAttribute('aria-selected',String(state.tab==='production' && tab.dataset.stageTab===state.stage));
        tab.tabIndex=tab.dataset.stageTab===state.stage ? 0 : -1;
      });
      root.querySelectorAll('[data-section]').forEach(section=>{
        const id=section.dataset.section;
        section.hidden=id!==state.stage;
        section.id='awf-stage-panel-' + id;
        section.setAttribute('role','tabpanel');
        section.setAttribute('aria-labelledby','awf-stage-tab-' + id);
      });
    }
    function pauseHiddenMedia() {
      root.querySelectorAll('audio,video').forEach(media=>{if(media.closest('[hidden]'))media.pause();});
    }
    function showStage(name) {
      if (!Object.hasOwn(stageTabs,name)) return;
      state.stage=name;
      showTab('production');
      q('.awf-scroll').scrollTop=0;
    }
    function showTab(name) {
      if (!tabs[name]) return;
      state.tab = name;
      root.querySelectorAll('[data-tab]').forEach(tab=>{
        const selected = tab.dataset.tab===name;
        tab.setAttribute('aria-selected',String(selected));
        tab.tabIndex = selected || (state.tab==='production' && tab.dataset.tab==='album') ? 0 : -1;
      });
      root.querySelectorAll('[data-panel]').forEach(el=>{el.hidden=el.dataset.panel!==name;});
      updateStageTabs();
      pauseHiddenMedia();
      if (!state.ready || panel(name).childElementCount) return;
      if (name==='album') renderAlbum();
      if (name==='voices' || name==='workflows') renderRegistry(name);
      if (name==='settings') renderSettings();
    }
    async function upload(input) {
      const file = input.files?.[0];
      if (!file) return;
      const isAudio = input.name==='audioFile';
      if (!isAudio && !['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('仅支持 PNG、JPEG、WebP 形象');
      if (isAudio && file.type && !file.type.startsWith('audio/')) throw new Error('请选择音频文件');
      const body = new window.FormData();
      body.append(isAudio ? 'file' : 'image',file);
      const origin = typeof options.origin==='function' ? options.origin() : options.origin;
      if (origin) body.append('origin',JSON.stringify(publicRecord(origin)));
      input.disabled = true;
      try {
        const data = await request(isAudio ? '/audio' : '/images','POST',body);
        if (state.disposed) return;
        if (isAudio) {
          const url = safeUrl(data.url || data.data?.url);
          if (!url) throw new Error('音频上传结果缺少有效 URL');
          q('[data-production]').elements.audioUrl.value = url;
          updateProduction();
        } else {await reloadLibrary(); state.filter={page:1}; renderAlbum();}
        setNotice(isAudio?'音频已上传':'形象已上传');
      } finally {if (!state.disposed) {input.disabled=false; input.value='';}}
    }
    async function action(trigger) {
      const id = trigger.dataset.id;
      switch(trigger.dataset.action) {
        case 'new-production':
          if (!window.confirm('清空当前制作草稿并新建？')) return;
          state.pendingSubmission=null;
          renderProduction(); setNotice('已新建制作草稿'); break;
        case 'refresh':
          if (!state.ready) {await initialize(); break;}
          await refresh();
          if (state.tab==='album' && state.editor?.collection!=='images') renderAlbum();
          if (['voices','workflows'].includes(state.tab) && state.editor?.collection!==state.tab) renderRegistry(state.tab);
          setNotice('状态已刷新；当前输入保持不变。'); break;
        case 'refresh-selects': await reloadLibrary(); refreshSelects(); break;
        case 'prev-images': state.filter.page--; renderImages(); break;
        case 'next-images': state.filter.page++; renderImages(); break;
        case 'cancel-editor': closeEditor(); break;
        case 'parse-workflow': parseEditor(); break;
        case 'delete-item': await deleteEditor(); break;
        case 'voice-images':
          state.filter={page:1,voiceId:id}; showTab('album'); renderAlbum(); break;
        case 'use-image': {
          showTab('production');
          production?.useImage(id); break;
        }
        case 'check-deps': await checkDependencies(); break;
        case 'reload-settings':
          if (!window.confirm('放弃未保存的路径修改并重新载入？')) return;
          await reloadLibrary(); renderSettings(); break;
        case 'inspect-import': {
          const payload=readLegacy(window.localStorage);
          state.importPayload=payload;
          q('[data-import]').innerHTML='<p>' + payload.voices.length + ' 个音色 · ' + payload.runningHubWorkflows.length + ' 个工作流</p>' +
            button('确认导入浏览器配置','data-action="import-legacy" ' + (payload.voices.length || payload.runningHubWorkflows.length ? '' : 'disabled'));
          break;
        }
        case 'import-legacy':
          if (!state.importPayload) return;
          await request('/migrate','POST',state.importPayload);
          state.importPayload=null;
          q('[data-import]').replaceChildren();
          await reloadLibrary(); setNotice('导入完成，浏览器旧配置已保留。'); break;
        case 'import-standalone':
          if (!window.confirm('导入旧工具的本地配置？已有库条目不会被覆盖。')) return;
          await request('/migrate','POST',{source:'standalone'});
          await reloadLibrary(); setNotice('导入完成，旧工具原配置已保留。'); break;
        case 'query-job': {
          const data=await request('/jobs/' + encodeURIComponent(id));
          const job=publicRecord(data.job || data.data || data);
          if (job.id) acceptJobs(state.jobs.map(item=>item.id===id?job:item));
          break;
        }
        case 'reuse-job': reuse(state.jobs.find(item=>item.id===id)); break;
      }
    }
    root.addEventListener('focusin',event=>{
      if (event.target.name && event.target.type!=='password') state.lastFocus=event.target;
    },{signal:controller.signal});
    root.addEventListener('click',event=>{
      const stageTab=event.target.closest('[data-stage-tab]');
      if (stageTab) return showStage(stageTab.dataset.stageTab);
      const tab=event.target.closest('[data-tab]');
      if (tab) return showTab(tab.dataset.tab);
      const edit=event.target.closest('[data-edit], [data-new]');
      if (edit) return openEditor(edit.dataset.edit || edit.dataset.new,edit.dataset.id);
      const target=event.target.closest('[data-action]');
      if (!target || target.type==='submit' || target.disabled) return;
      target.disabled=true;
      Promise.resolve().then(()=>action(target)).catch(fail).finally(()=>{if (!state.disposed) target.disabled=false;});
    },{signal:controller.signal});
    root.addEventListener('keydown',event=>{
      if (!event.target.matches('[data-tab],[data-stage-tab]') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const primary=event.target.hasAttribute('data-stage-tab');
      const keys=primary ? Object.keys(stageTabs) : Object.keys(tabs).filter(key=>key!=='production');
      const index=keys.indexOf(primary ? event.target.dataset.stageTab : event.target.dataset.tab);
      const next=event.key==='Home'?0:event.key==='End'?keys.length-1:(index+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;
      if (primary) showStage(keys[next]); else showTab(keys[next]);
      q('[' + (primary ? 'data-stage-tab' : 'data-tab') + '="' + keys[next] + '"]').focus();
    },{signal:controller.signal});
    root.addEventListener('input',event=>{
      if (event.target.name==='imageSearch') {state.filter.query=event.target.value; state.filter.page=1; renderImages();}
    },{signal:controller.signal});
    root.addEventListener('change',event=>{
      const input=event.target;
      if (input.closest('[data-production-host]')) return;
      if (input.type==='file') {upload(input).catch(fail); return;}
      if (input.name==='albumVoice' || input.name==='favoriteOnly') {
        state.filter.voiceId=q('[name="albumVoice"]').value;
        state.filter.favorite=q('[name="favoriteOnly"]').checked;
        state.filter.page=1; renderImages();
      }
      if (input.name==='boundVoice') {
        const form=input.form, selected=value(form,'defaultVoiceId');
        const ids=Array.from(form.querySelectorAll('[name="boundVoice"]:checked'),el=>el.value);
        form.elements.defaultVoiceId.innerHTML=option('','无默认音色',selected) +
          state.library.voices.filter(v=>ids.includes(v.id)).map(v=>option(v.id,v.name,selected)).join('');
      }
      if (input.dataset.nodeBinding!=null) {
        try {
          const form=input.form;
          const parsed=parseWorkflow(value(form,'payload'),value(form,'sourceUrl'),value(form,'webappId'));
          parsed.nodeInfoList[Number(input.dataset.nodeBinding)].binding=input.value;
          form.elements.payload.value=JSON.stringify(parsed.nodeInfoList,null,2);
        } catch(error) {fail(error);}
      }
    },{signal:controller.signal});
    root.addEventListener('submit',event=>{
      if (event.target.closest('[data-production-host]')) return;
      event.preventDefault();
      const form=event.target, submit=form.querySelector('[type="submit"]');
      if (submit.disabled) return;
      const run=async()=>{
        submit.disabled=true;
        try {
          if (form.hasAttribute('data-editor')) await saveEditor(form);
          if (form.hasAttribute('data-settings')) {
            const fields={id:'dependencies',ffmpeg:trim(value(form,'ffmpeg')),python:trim(value(form,'python')),subtitleService:trim(value(form,'subtitleService'))};
            await request('/library/settings','POST',mutation(state.settingsBase,fields));
            await reloadLibrary();
            state.settingsBase=state.library.settings.find(item=>item.id==='dependencies') || null;
            await checkDependencies(); setNotice('依赖路径已保存');
          }
        } finally {if (!state.disposed) submit.disabled=false;}
      };
      run().catch(fail);
    },{signal:controller.signal});
    function reuse(record) {
      if (!record) return;
      if (!state.ready) {state.historyDraft=record; return;}
      showStage(historyStage(record));
      production.reuse(record);
      setNotice('已载入历史输入，尚未提交。');
    }
    function dispose() {
      if (state.disposed) return;
      const editorForm=q('[data-editor]');
      const focused=state.lastFocus;
      const focus=focused && !focused.closest('[data-production-host]') ? {name:focused.name,kind:focused.closest('[data-editor]')?'editor':'settings',
        start:focused.selectionStart,end:focused.selectionEnd} : null;
      const savedProduction=productionDraft();
      remembered={...remembered,production:state.historyDraft ? mergeHistoryDraft(savedProduction,state.historyDraft) : savedProduction,tab:state.tab,stage:state.historyDraft ? historyStage(state.historyDraft) : state.stage,filter:{...state.filter},
        pendingSubmission:state.pendingSubmission,focus,scrollTop:q('.awf-scroll').scrollTop,
        editor:state.editor && editorForm ? {...state.editor,fields:captureForm(editorForm)} : state.ready ? null : remembered.editor,
        settings:q('[data-settings]') ? {base:state.settingsBase,fields:captureForm(q('[data-settings]'))} : remembered.settings};
      state.disposed=true;
      production?.dispose();
      clearTimeout(state.timer);
      controller.abort();
      state.importPayload=null;
      root.querySelectorAll('audio,video').forEach(media=>{media.pause(); media.removeAttribute('src'); media.load();});
      root.remove();
      element.classList.remove('awf-host');
      if (mounted===instance) mounted=null;
    }
    const instance={refresh,unmount:dispose,fromHistory:reuse,ready:null};
    mounted=instance;
    async function initialize() {
      if (state.initializing) return state.initializing;
      state.initializing=boot().catch(fail).finally(()=>{state.initializing=null;});
      return state.initializing;
    }
    async function boot() {
      await reloadLibrary();
      try {await checkDependencies();} catch(error) {fail(error);}
      if (state.disposed) return;
      state.ready=true;
      renderProduction(remembered.production || {});
      if (state.historyDraft) reuse(state.historyDraft);
      state.historyDraft=null;
      q('[data-sync]').textContent='已连接';
      showTab(state.tab);
      if (remembered.editor) {
        const editor=remembered.editor, name=editor.collection==='images'?'album':editor.collection;
        if (!panel(name).childElementCount) {
          if (name==='album') renderAlbum(); else renderRegistry(name);
        }
        openEditor(editor.collection,editor.id,editor);
      }
      if (remembered.settings) {
        if (!panel('settings').childElementCount) renderSettings();
        state.settingsBase=remembered.settings.base;
        restoreForm(q('[data-settings]'),remembered.settings.fields);
      }
      const savedFocus=remembered.focus;
      if (savedFocus) {
        const form=q('[data-' + savedFocus.kind + ']');
        const input=form && Array.from(form.elements).find(el=>el.name===savedFocus.name);
        if (input && !input.closest('[hidden]')) {
          input.focus({preventScroll:true});
          if (typeof input.setSelectionRange==='function' && savedFocus.start!=null) input.setSelectionRange(savedFocus.start,savedFocus.end);
        }
      }
      q('.awf-scroll').scrollTop=remembered.scrollTop || 0;
      await refresh();
      function poll() {
        state.timer=setTimeout(async()=>{await refresh(); if (!state.disposed) poll();},8000);
      }
      if (!state.disposed) poll();
    }
    instance.ready=initialize();
    return instance;
  }

  function unmount() {mounted?.unmount();}
  function mergeHistoryDraft(saved,record) {
    return {...saved,drafts:{...saved?.drafts,...scope.AvatarWorkflowProduction.draftsFromHistory(record)}};
  }
  function fromHistory(record) {
    const draft=historyDraft(record);
    if (mounted) mounted.fromHistory(record);
    else remembered={...remembered,production:mergeHistoryDraft(remembered.production,record),tab:'production',stage:historyStage(record),focus:null,scrollTop:0};
    return draft;
  }
  return {mount,unmount,fromHistory,buildJob,parseWorkflow,publicRecord,mutation,pageImages,readLegacy,historyDraft};
});
