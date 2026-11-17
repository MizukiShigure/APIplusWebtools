'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const invalid = () => Object.assign(new Error('Invalid API Base: use an HTTP(S) URL without credentials, query or fragment'), { status: 400 });

function normalizeGateway(value) {
  if (typeof value !== 'string') throw invalid();
  const base = value.trim().replace(/\/+$/, '');
  if (!base) return '';
  let url;
  try { url = new URL(base); } catch { throw invalid(); }
  if (!/^https?:\/\//i.test(base) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[\s\\]/.test(base)) throw invalid();
  return base;
}

function requireGateway(value) {
  const base = normalizeGateway(value || '');
  if (!base) throw Object.assign(new Error('Please configure API Base in the local workbench using the gateway supplied by your administrator'), { status: 400, code: 'GATEWAY_NOT_CONFIGURED', rejected: true });
  return base;
}

function createGatewayConfig({ dataDir, env = process.env }) {
  const file = path.join(dataDir, 'gateway.json');
  const override = () => env.API_PLUS_GATEWAY_BASE || env.API_GATEWAY_BASE || '';
  function read() {
    if (override()) return { apiBase: requireGateway(override()), configured: true, source: 'environment' };
    let saved;
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return { apiBase: '', configured: false, source: 'none' };
      throw new Error('Local gateway configuration could not be read; preserve gateway.json and repair it');
    }
    const apiBase = normalizeGateway(saved.apiBase);
    return { apiBase, configured: !!apiBase, source: 'local' };
  }
  function save(value) {
    if (override()) throw Object.assign(new Error('API Base is controlled by the service environment; update or remove that override first'), { status: 409 });
    const apiBase = normalizeGateway(value);
    fs.mkdirSync(dataDir, { recursive: true });
    const temporary = file + '.' + crypto.randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify({ schema: 1, apiBase }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return read();
  }
  return { read, save, require: () => requireGateway(read().apiBase), status: () => { const { configured, source } = read(); return { configured, source }; } };
}
module.exports = { createGatewayConfig, normalizeGateway, requireGateway };
