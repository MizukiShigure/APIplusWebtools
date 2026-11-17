'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const modulePath = path.join(__dirname, 'local-media-metadata.cjs');
const load = () => require(modulePath);

function box(type, payload = Buffer.alloc(0), extended = false) {
  const header = Buffer.alloc(extended ? 16 : 8);
  header.writeUInt32BE(extended ? 1 : header.length + payload.length);
  header.write(type, 4, 'ascii');
  if (extended) header.writeBigUInt64BE(BigInt(header.length + payload.length), 8);
  return Buffer.concat([header, payload]);
}

function movieHeader(duration, version = 0) {
  const data = Buffer.alloc(version ? 112 : 100);
  data[0] = version;
  data.writeUInt32BE(1000, version ? 20 : 12);
  if (version) data.writeBigUInt64BE(BigInt(duration * 1000), 24);
  else data.writeUInt32BE(duration * 1000, 16);
  return box('mvhd', data);
}

function track(width, height, { version = 0, handler = 'vide', rotated = false } = {}) {
  const data = Buffer.alloc(version ? 96 : 84);
  data[0] = version;
  data[3] = 3;
  data.writeUInt32BE(1, version ? 20 : 12);
  const matrix = version ? 52 : 40;
  data.writeInt32BE(rotated ? 0 : 65536, matrix);
  data.writeInt32BE(rotated ? 65536 : 0, matrix + 4);
  data.writeInt32BE(rotated ? -65536 : 0, matrix + 12);
  data.writeInt32BE(rotated ? 0 : 65536, matrix + 16);
  data.writeInt32BE(0x40000000, matrix + 32);
  data.writeUInt32BE(width * 65536, version ? 88 : 76);
  data.writeUInt32BE(height * 65536, version ? 92 : 80);
  const hdlr = Buffer.alloc(25);
  hdlr.write(handler, 8, 'ascii');
  return box('trak', Buffer.concat([box('tkhd', data), box('mdia', box('hdlr', hdlr))]));
}

function mp4({ version = 0, rotated = false, audioOnly = false, extended = false } = {}) {
  return Buffer.concat([
    box('ftyp', Buffer.from('isom\0\0\0\0isomiso2', 'binary')),
    box('mdat', Buffer.alloc(4096)),
    box('moov', Buffer.concat([movieHeader(8.25, version),
      track(0, 0, { handler: 'soun', version }),
      ...(audioOnly ? [] : [track(1920, 1080, { version, rotated })])]), extended)
  ]);
}

async function fixture(t, bytes, name = 'source.bin') {
  const root = path.resolve(__dirname, '.codex-tmp');
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, 'metadata-test-'));
  const file = path.join(dir, name);
  await fs.writeFile(file, bytes);
  t.after(async () => {
    const relative = path.relative(root, path.resolve(dir));
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return file;
}

test('native local metadata probe exists without an external executable', async () => {
  assert.ok(await fs.stat(modulePath).catch(() => false), 'native metadata parser must exist');
  assert.equal(typeof load().probeLocalMedia, 'function');
});

test('MP4 locates a tail moov, ignores audio tracks and reads v0 duration and dimensions', async t => {
  const file = await fixture(t, mp4(), 'source.mp4');
  assert.deepEqual(await load().probeLocalMedia(file),
    { width: 1920, height: 1080, duration: 8.25, metadataSource: 'native-mp4' });
});

test('MOV extended boxes and v1 timestamps preserve portrait display dimensions', async t => {
  const file = await fixture(t, mp4({ version: 1, extended: true, rotated: true }), 'source.mov');
  assert.deepEqual(await load().probeLocalMedia(file, { mime: 'video/quicktime' }),
    { width: 1080, height: 1920, duration: 8.25, metadataSource: 'native-mp4' });
});

test('M4A reports its audio duration without inventing video dimensions', async t => {
  const file = await fixture(t, mp4({ audioOnly: true }), 'audio.m4a');
  assert.deepEqual(await load().probeLocalMedia(file), { duration: 8.25, metadataSource: 'native-mp4' });
});

test('unknown duration sentinel is not reported as an extremely long video', async t => {
  const data = movieHeader(1);
  data.writeUInt32BE(0xffffffff, 8 + 16);
  const file = await fixture(t, box('moov', Buffer.concat([data, track(1280, 720)])), 'unknown.mov');
  assert.deepEqual(await load().probeLocalMedia(file), { width: 1280, height: 720, metadataSource: 'native-mp4' });
});

test('truncated and impossible box lengths fail closed without partial or caller supplied metadata', async t => {
  const huge = Buffer.alloc(16);
  huge.writeUInt32BE(1);
  huge.write('moov', 4, 'ascii');
  huge.writeBigUInt64BE(0xffffffffffffffffn, 8);
  const tooSmall = Buffer.from([0, 0, 0, 4, 109, 111, 111, 118]);
  const badChild = box('moov', Buffer.from([0, 0, 0, 100, 109, 118, 104, 100]));
  for (const [index, bytes] of [mp4().subarray(0, -1), huge, tooSmall, badChild,
    Buffer.concat([mp4(), Buffer.from([1, 2, 3])])].entries()) {
    const file = await fixture(t, bytes, `invalid-${index}.mp4`);
    assert.deepEqual(await load().probeLocalMedia(file, { width: 1, height: 1, duration: 30 }),
      { metadataSource: 'unavailable' });
  }
});

test('PNG dimensions are detected by contents even when stored under an opaque asset filename', async t => {
  const file = await fixture(t, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
  assert.deepEqual(await load().probeLocalMedia(file, { name: 'pixel.png', mime: 'image/png' }),
    { width: 1, height: 1, metadataSource: 'native-png' });
});

test('JPEG skips metadata segments to find progressive frame dimensions', async t => {
  const app = Buffer.from([0xff, 0xe0, 0, 6, 74, 70, 73, 70]);
  const sof = Buffer.from([0xff, 0xc2, 0, 17, 8, 3, 0, 4, 0, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const file = await fixture(t, Buffer.concat([Buffer.from([0xff, 0xd8]), app, sof, Buffer.from([0xff, 0xd9])]), 'image.jpg');
  assert.deepEqual(await load().probeLocalMedia(file),
    { width: 1024, height: 768, metadataSource: 'native-jpeg' });
});

test('PCM WAV reads padded chunks and computes duration from validated byte rate', async t => {
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(8000, 4);
  fmt.writeUInt32LE(16000, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14);
  const chunk = (id, value) => {
    const header = Buffer.alloc(8); header.write(id); header.writeUInt32LE(value.length, 4);
    return Buffer.concat([header, value, ...(value.length % 2 ? [Buffer.alloc(1)] : [])]);
  };
  const body = Buffer.concat([Buffer.from('WAVE'), chunk('JUNK', Buffer.alloc(3)), chunk('fmt ', fmt), chunk('data', Buffer.alloc(64000))]);
  const header = Buffer.alloc(8); header.write('RIFF'); header.writeUInt32LE(body.length, 4);
  const file = await fixture(t, Buffer.concat([header, body]), 'voice.wav');
  assert.deepEqual(await load().probeLocalMedia(file), { duration: 4, metadataSource: 'native-wav' });
});

test('unsupported, empty, missing and wrong-signature files safely report unavailable', async t => {
  const file = await fixture(t, Buffer.from('not actually a video'), 'misleading.mp4');
  assert.deepEqual(await load().probeLocalMedia(file, { name: 'fake.png', mime: 'image/png' }), { metadataSource: 'unavailable' });
  assert.deepEqual(await load().probeLocalMedia(path.join(path.dirname(file), 'missing.mp4')), { metadataSource: 'unavailable' });
  const empty = await fixture(t, Buffer.alloc(0), 'empty.wav');
  assert.deepEqual(await load().probeLocalMedia(empty), { metadataSource: 'unavailable' });
});
