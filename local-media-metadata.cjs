'use strict';

const fs = require('node:fs/promises');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_HEADER_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS = 16384;
const unavailable = () => ({ metadataSource: 'unavailable' });

// Metadata inspection only: it does not decode media or prove that a complete
// stream is playable. All reads are positional and bounded; mdat/data/image
// payloads are skipped, so a large user video is never copied into memory.
function reader(handle, size) {
  let total = 0;
  return async (position, length) => {
    if (!Number.isSafeInteger(position) || !Number.isSafeInteger(length)
      || position < 0 || length < 0 || position + length > size
      || (total += length) > MAX_HEADER_BYTES) throw new Error('Invalid media header bounds');
    const buffer = Buffer.alloc(length);
    let done = 0;
    while (done < length) {
      const { bytesRead } = await handle.read(buffer, done, length - done, position + done);
      if (!bytesRead) throw new Error('Truncated media header');
      done += bytesRead;
    }
    return buffer;
  };
}

async function mp4Metadata(read, fileSize) {
  let itemCount = 0;
  let moovSeen = false;
  let duration;
  const videos = [];
  async function boxes(start, end, visit) {
    for (let offset = start; offset < end;) {
      if (++itemCount > MAX_ITEMS || end - offset < 8) throw new Error('Invalid MP4 box structure');
      const header = await read(offset, 8);
      let size = header.readUInt32BE(0);
      const type = header.toString('ascii', 4, 8);
      let headerLength = 8;
      if (size === 1) {
        if (end - offset < 16) throw new Error('Truncated extended MP4 box');
        const extended = (await read(offset + 8, 8)).readBigUInt64BE();
        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('MP4 box exceeds safe bounds');
        size = Number(extended);
        headerLength = 16;
      } else if (size === 0) size = end - offset;
      if (size < headerLength || size > end - offset) throw new Error('MP4 box outside its parent');
      await visit(type, offset + headerLength, offset + size);
      offset += size;
    }
  }
  async function fullHeader(start, end, v0Length, v1Length) {
    if (end - start < 4) throw new Error('Truncated MP4 full box');
    const version = (await read(start, 4))[0];
    const required = version === 0 ? v0Length : version === 1 ? v1Length : 0;
    if (!required || end - start < required) throw new Error('Unsupported or truncated MP4 full box');
    return { version, data: await read(start, required) };
  }
  async function parseTrack(start, end) {
    let dimensions;
    let handler = '';
    await boxes(start, end, async (type, body, limit) => {
      if (type === 'tkhd') {
        const { version, data } = await fullHeader(body, limit, 84, 96);
        let width = data.readUInt32BE(version ? 88 : 76) / 65536;
        let height = data.readUInt32BE(version ? 92 : 80) / 65536;
        const matrix = version ? 52 : 40;
        const a = data.readInt32BE(matrix), b = data.readInt32BE(matrix + 4);
        const c = data.readInt32BE(matrix + 12), d = data.readInt32BE(matrix + 16);
        if (a === 0 && d === 0 && Math.abs(b) === 65536 && Math.abs(c) === 65536) {
          [width, height] = [height, width];
        }
        if (width >= 1 && height >= 1) dimensions = { width: Math.round(width), height: Math.round(height) };
      } else if (type === 'mdia') {
        await boxes(body, limit, async (childType, childBody, childEnd) => {
          if (childType !== 'hdlr') return;
          if (childEnd - childBody < 24) throw new Error('Truncated MP4 handler');
          handler = (await read(childBody, 12)).toString('ascii', 8, 12);
        });
      }
    });
    if (handler === 'vide' && dimensions) videos.push(dimensions);
  }
  await boxes(0, fileSize, async (type, body, end) => {
    if (type !== 'moov') return;
    if (moovSeen) throw new Error('Ambiguous MP4 movie headers');
    moovSeen = true;
    await boxes(body, end, async (childType, childBody, childEnd) => {
      if (childType === 'mvhd') {
        const { version, data } = await fullHeader(childBody, childEnd, 100, 112);
        const scale = data.readUInt32BE(version ? 20 : 12);
        const ticks = version ? data.readBigUInt64BE(24) : BigInt(data.readUInt32BE(16));
        const unknown = version ? 0xffffffffffffffffn : 0xffffffffn;
        if (scale > 0 && ticks > 0n && ticks !== unknown && ticks <= BigInt(Number.MAX_SAFE_INTEGER)) {
          duration = Number(ticks) / scale;
        }
      } else if (childType === 'trak') await parseTrack(childBody, childEnd);
    });
  });
  const dimensions = videos.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!moovSeen || (!duration && !dimensions)) return unavailable();
  return { ...dimensions, ...(duration ? { duration } : {}), metadataSource: 'native-mp4' };
}

async function pngMetadata(read, size) {
  if (size < 33) throw new Error('Truncated PNG header');
  const header = await read(8, 25);
  if (header.readUInt32BE(0) !== 13 || header.toString('ascii', 4, 8) !== 'IHDR') throw new Error('Missing PNG IHDR');
  const width = header.readUInt32BE(8), height = header.readUInt32BE(12);
  if (!width || !height || width > 0x7fffffff || height > 0x7fffffff
    || header[18] !== 0 || header[19] !== 0 || header[20] > 1) throw new Error('Invalid PNG dimensions');
  return { width, height, metadataSource: 'native-png' };
}

async function jpegMetadata(read, size) {
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  for (let offset = 2, count = 0; offset < size && count < MAX_ITEMS; count += 1) {
    if ((await read(offset++, 1))[0] !== 0xff) throw new Error('Invalid JPEG marker');
    let marker = (await read(offset++, 1))[0];
    while (marker === 0xff) marker = (await read(offset++, 1))[0];
    if (marker === 0xd9 || marker === 0xda) return unavailable();
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (await read(offset, 2)).readUInt16BE();
    if (length < 2 || offset + length > size) throw new Error('Truncated JPEG segment');
    if (frameMarkers.has(marker)) {
      if (length < 8) throw new Error('Truncated JPEG frame');
      const frame = await read(offset + 2, 6);
      const height = frame.readUInt16BE(1), width = frame.readUInt16BE(3), channels = frame[5];
      if (!width || !height || !channels || length !== 8 + 3 * channels) throw new Error('Invalid JPEG frame');
      return { width, height, metadataSource: 'native-jpeg' };
    }
    offset += length;
  }
  return unavailable();
}

async function wavMetadata(read, size) {
  const header = await read(0, 12);
  const end = header.readUInt32LE(4) + 8;
  if (end < 12 || end > size) throw new Error('Invalid WAV bounds');
  let bytes = 0;
  let byteRate = 0;
  let blockAlign = 0;
  for (let offset = 12, count = 0; offset < end; count += 1) {
    if (count >= MAX_ITEMS || end - offset < 8) throw new Error('Invalid WAV chunks');
    const chunk = await read(offset, 8);
    const id = chunk.toString('ascii', 0, 4), length = chunk.readUInt32LE(4);
    const body = offset + 8;
    const next = body + length + length % 2;
    if (next > end) throw new Error('Truncated WAV chunk');
    if (id === 'fmt ') {
      if (length < 16) throw new Error('Truncated WAV format');
      const format = await read(body, 16);
      const encoding = format.readUInt16LE(0), channels = format.readUInt16LE(2);
      const sampleRate = format.readUInt32LE(4), rate = format.readUInt32LE(8);
      const align = format.readUInt16LE(12), bits = format.readUInt16LE(14);
      if (![1, 3].includes(encoding) || !channels || !sampleRate || !bits || bits % 8
        || align !== channels * bits / 8 || rate !== sampleRate * align) return unavailable();
      byteRate = rate;
      blockAlign = align;
    } else if (id === 'data') bytes += length;
    offset = next;
  }
  if (!byteRate || !bytes || bytes % blockAlign) return unavailable();
  return { duration: bytes / byteRate, metadataSource: 'native-wav' };
}

async function probeLocalMedia(file, options = {}) {
  // name/mime are accepted for the upload API, but never trusted over content.
  // No subprocess or network request is needed, and no caller metadata is copied.
  void options;
  let handle;
  try {
    handle = await fs.open(file, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 8) return unavailable();
    const read = reader(handle, stat.size);
    const signature = await read(0, Math.min(16, stat.size));
    if (signature.subarray(0, 8).equals(PNG_SIGNATURE)) return await pngMetadata(read, stat.size);
    if (signature[0] === 0xff && signature[1] === 0xd8) return await jpegMetadata(read, stat.size);
    if (signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WAVE') {
      return await wavMetadata(read, stat.size);
    }
    if (['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'].includes(signature.toString('ascii', 4, 8))) {
      return await mp4Metadata(read, stat.size);
    }
    return unavailable();
  } catch {
    return unavailable();
  } finally {
    await handle?.close().catch(() => {});
  }
}

module.exports = { probeLocalMedia };
