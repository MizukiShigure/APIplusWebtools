(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RunningHubShared = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const base = '/api/control/v1/avatar-workflow';
  const comparable = item => JSON.stringify(Object.fromEntries(Object.entries(item || {})
    .filter(([key]) => !['version', 'createdAt', 'updatedAt', 'hasApiKey', 'apiKey'].includes(key)).sort(([a], [b]) => a.localeCompare(b))));
  function create({ fetch: fetcher = globalThis.fetch.bind(globalThis), session, onChange, onError }) {
    let snapshot = null;
    let pending = null;
    let timer = null;
    let saving = false;
    let conflict = false;
    let revision = 0;
    async function request(url, body) {
      await session();
      const response = await fetcher(base + url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
      const result = await response.json();
      if (!response.ok || result.success === false) throw Object.assign(new Error(result.message || `HTTP ${response.status}`), { status: response.status });
      return result;
    }
    function present(activeId) {
      const global = snapshot.settings.find(item => item.id === 'runninghub') || {};
      return { apiKey: '', hasApiKey: Boolean(global.hasApiKey), sharedVersion: global.version,
        activeId, configs: snapshot.workflows.map(item => ({ ...item, title: item.title || item.name,
          hasApiKey: Boolean(item.hasApiKey || global.hasApiKey), nodeInfoList: typeof item.nodeInfoList === 'string' ? item.nodeInfoList : JSON.stringify(item.nodeInfoList || item.nodes || [], null, 2) })) };
    }
    async function load(local) {
      const result = await request('/library');
      snapshot = result;
      // Migration is create-only by omission: existing server records always win.
      if (local) {
        const configured = (local.configs || []).filter(config => config.webappId || config.sourceUrl);
        if (configured.some(config => !result.workflows.some(item => item.id === config.id))) {
          await request('/migrate', { source: 'browser', voices: [], runningHubWorkflows: configured });
        }
        if (local.apiKey && !result.settings.some(item => item.id === 'runninghub' && item.hasApiKey)) {
          const old = result.settings.find(item => item.id === 'runninghub');
          await request('/library/settings', { item: { id: 'runninghub', apiKey: local.apiKey }, expectedVersion: old?.version });
        }
        snapshot = await request('/library');
      }
      conflict = false;
      return present(local?.activeId);
    }
    async function flush() {
      clearTimeout(timer); timer = null;
      if (saving || !pending || !snapshot || conflict) return;
      saving = true;
      const value = pending; pending = null;
      try {
        const global = snapshot.settings.find(item => item.id === 'runninghub');
        if (value.apiKey) {
          const result = await request('/library/settings', { item: { id: 'runninghub', apiKey: value.apiKey }, expectedVersion: global?.version });
          snapshot.settings = [...snapshot.settings.filter(item => item.id !== 'runninghub'), result.item];
        }
        for (const config of value.configs || []) {
          const old = snapshot.workflows.find(item => item.id === config.id);
          const item = { ...config, provider: 'runninghub', name: config.title || config.name };
          delete item.apiKey;
          if (old && comparable(item) === comparable({ ...old, hasApiKey: config.hasApiKey })) continue;
          const result = await request('/library/workflows', { item, expectedVersion: old?.version });
          snapshot.workflows = [...snapshot.workflows.filter(entry => entry.id !== item.id), result.item];
        }
        if (!pending) onChange?.(present(value.activeId));
      } catch (error) {
        pending ||= value;
        conflict = true;
        onError?.(error);
      } finally { saving = false; if (pending && !conflict) timer = setTimeout(flush, 500); }
    }
    return { load, flush, save(value) { revision++; pending = JSON.parse(JSON.stringify(value)); clearTimeout(timer); timer = setTimeout(flush, 600); },
      async refresh(activeId) {
        if (saving || pending) return null;
        const startedAtRevision = revision;
        const result = await request('/library');
        if (saving || pending || revision !== startedAtRevision) return null;
        snapshot = result;
        return present(activeId);
      },
      get pending() { return Boolean(pending || saving); } };
  }
  return { create };
});
