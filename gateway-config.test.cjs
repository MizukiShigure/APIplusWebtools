const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createGatewayConfig, normalizeGateway } = require('./gateway-config.cjs');

test('gateway is opt-in, private, persistent and read dynamically', t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-config-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const config = createGatewayConfig({ dataDir, env: {} });
  assert.deepEqual(config.status(), { configured: false, source: 'none' });
  assert.throws(() => config.require(), /configure.*API Base/i);
  assert.equal(fs.existsSync(path.join(dataDir, 'gateway.json')), false);
  config.save(' https://gateway.example/api/// ');
  assert.equal(config.require(), 'https://gateway.example/api');
  const second = createGatewayConfig({ dataDir, env: {} });
  assert.equal(second.require(), config.require());
  second.save('http://another.example/api');
  assert.equal(config.require(), 'http://another.example/api');
  assert.equal(JSON.stringify(config.status()).includes('another.example'), false);
  config.save('');
  assert.equal(config.status().configured, false);
});

test('gateway validation never echoes credentials or malformed input', () => {
  for (const value of ['file:///tmp/key', 'javascript:alert(1)', 'https://user:secret@example.com/api',
    'https://example.com/api?key=secret', 'https://example.com/api#secret', 'not-a-url', {}, null]) {
    assert.throws(() => normalizeGateway(value), error => /Invalid API Base/.test(error.message) && !error.message.includes('secret'));
  }
});

test('environment override is explicit and cannot be silently overwritten', t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-env-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const config = createGatewayConfig({ dataDir, env: { API_PLUS_GATEWAY_BASE: 'https://env.example/api' } });
  assert.equal(config.require(), 'https://env.example/api');
  assert.equal(config.status().source, 'environment');
  assert.throws(() => config.save('https://other.example/api'), /environment/i);
  assert.equal(fs.existsSync(path.join(dataDir, 'gateway.json')), false);
});
