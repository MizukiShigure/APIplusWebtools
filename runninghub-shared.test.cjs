const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('./runninghub-shared.js');

function fixture() {
  const library = { workflows: [{ id: 'one', name: 'One', title: 'One', provider: 'runninghub', nodeInfoList: '[]', version: 1 }],
    settings: [{ id: 'runninghub', version: 1, hasApiKey: true }] };
  const writes = [];
  const failures = [];
  let current;
  const client = create({ session: async () => true, onChange: value => { current = value; }, onError: error => failures.push(error),
    fetch: async (url, init = {}) => {
      if (!init.body) return { ok: true, status: 200, json: async () => structuredClone(library) };
      const body = JSON.parse(init.body);
      writes.push({ url, body });
      if (url.endsWith('/migrate')) return { ok: true, status: 200, json: async () => ({ success: true }) };
      const collection = url.split('/').at(-1);
      const previous = library[collection].find(item => item.id === body.item.id);
      if (previous && previous.version !== body.expectedVersion) return { ok: false, status: 409, json: async () => ({ message: 'Conflict' }) };
      const item = { ...previous, ...body.item, version: (previous?.version || 0) + 1 };
      if (item.apiKey) { delete item.apiKey; item.hasApiKey = true; }
      library[collection] = [...library[collection].filter(entry => entry.id !== item.id), item];
      return { ok: true, status: 200, json: async () => ({ success: true, item: structuredClone(item) }) };
    } });
  return { client, library, writes, failures, current: () => current };
}

test('load exposes saved-key state without exposing a key', async () => {
  const { client, writes } = fixture();
  const settings = await client.load();
  assert.equal(settings.apiKey, '');
  assert.equal(settings.hasApiKey, true);
  assert.equal(settings.configs[0].hasApiKey, true);
  client.save(settings);
  await client.flush();
  assert.equal(writes.length, 0);
});

test('one edited workflow writes one versioned record, not an entire snapshot', async () => {
  const { client, writes, current } = fixture();
  const settings = await client.load();
  settings.configs[0].title = 'Renamed';
  client.save(settings);
  await client.flush();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.expectedVersion, 1);
  assert.equal(current().configs[0].version, 2);
  assert.equal(current().configs[0].name, 'Renamed');
});

test('stale browser save is surfaced and not retried as an overwrite', async () => {
  const { client, library, writes, failures } = fixture();
  const settings = await client.load();
  library.workflows[0].version = 2;
  library.workflows[0].title = 'Other browser';
  settings.configs[0].title = 'Old browser';
  client.save(settings);
  await client.flush();
  await client.flush();
  assert.equal(failures[0].status, 409);
  assert.equal(writes.length, 1);
  assert.equal(library.workflows[0].title, 'Other browser');
});

test('an in-flight refresh cannot replace edits saved after refresh began', async () => {
  let library = { settings: [], workflows: [{ id: 'one', name: 'One', title: 'One', provider: 'runninghub', nodeInfoList: '[]', version: 1 }] };
  let reads = 0;
  let release;
  let announce;
  let current;
  const started = new Promise(resolve => { announce = resolve; });
  const client = create({ session: async () => true, onChange: value => { current = value; },
    fetch: async (_url, init = {}) => {
      if (!init.body) {
        const result = structuredClone(library);
        if (++reads === 2) { announce(); await new Promise(resolve => { release = resolve; }); }
        return { ok: true, json: async () => result };
      }
      const body = JSON.parse(init.body);
      const item = { ...body.item, version: 2 };
      library.workflows = [item];
      return { ok: true, json: async () => ({ item }) };
    } });
  const settings = await client.load();
  const refresh = client.refresh('one');
  await started;
  settings.configs[0].title = 'Latest edit';
  client.save(settings);
  await client.flush();
  release();
  assert.equal(await refresh, null);
  assert.equal(current.configs[0].title, 'Latest edit');
});
