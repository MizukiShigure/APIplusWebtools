const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const audio = require('./audio-models.js');

assert.deepEqual(Object.keys(audio.AUDIO_MODELS), ['minimaxTts', 'suno', 'seedAudio', 'wooshSound', 'klingVideoAudio']);
assert.equal(audio.getAudioModel('minimax_tts').id, 'minimaxTts');
assert.equal(audio.getAudioModel('kling-video-to-audio').resultType, 'video');
assert.equal(audio.getAudioModel('suno').queryEndpoint, '');
assert.equal(audio.getAudioModel('suno').async, false);
assert.throws(() => audio.getAudioModel('not-a-model'), /音频模型/);
const defaults = audio.getAudioDefaults('seedAudio');
defaults.speechRate = 100;
assert.equal(audio.getAudioDefaults('seedAudio').speechRate, 0);

assert.deepEqual(audio.buildAudioPayload('minimaxTts', { text: '  Hello there.  ' }), {
  text: 'Hello there.', voice_id: 'Friendly_Person', mode_name: 'speech-2.5-hd-preview', speed: 1, vol: 1
});
assert.deepEqual(audio.buildAudioPayload('minimax_tts', {
  prompt: 'Custom voice.', voice_id: 'my-voice-id', mode_name: 'speech-2.5-turbo-preview', speed: '0.8', vol: '1.5'
}), { text: 'Custom voice.', voice_id: 'my-voice-id', mode_name: 'speech-2.5-turbo-preview', speed: 0.8, vol: 1.5 });
assert.match(audio.validateAudioInput('minimaxTts', { text: '' }), /文本/);
assert.match(audio.validateAudioInput('minimaxTts', { text: 'Hi', speed: 0.4 }), /语速/);
assert.match(audio.validateAudioInput('minimaxTts', { text: 'Hi', voiceId: '' }), /音色/);
assert.match(audio.validateAudioInput('minimaxTts', { text: 'Hi', volume: NaN }), /音量/);
assert.match(audio.validateAudioInput('minimaxTts', { text: 'Hi', speed: true }), /语速/);
assert.match(audio.validateAudioInput('minimaxTts', { text: 'Hi', volume: [1] }), /音量/);
assert.match(audio.validateAudioInput('minimaxTts', { text: 'Hi', version: 'speech-unverified' }), /版本/);

const sound = { url: 'https://assets.example/source.wav', type: 'audio', name: 'source.wav' };
const portrait = { url: 'https://assets.example/portrait.png', type: 'image' };
assert.deepEqual(audio.buildAudioPayload('seedAudio', { text: '  Read this.\nRead that.  ', referenceAudio: sound, speechRate: -50, pitchRate: 100 }), {
  text: 'Read this.\nRead that.', model_name: 'seed-audio-1.0', references: [{ audio_url: sound.url }], speech_rate: -50, loudness_rate: 0, pitch_rate: 100
});
assert.deepEqual(audio.buildAudioPayload('seed_audio', { prompt: 'Hello.', referenceImage: portrait }).references, [{ image_url: portrait.url }]);
assert.deepEqual(audio.buildAudioPayload('seedAudio', { text: 'Hi', references: [{ audio_url: sound.url }] }).references, [{ audio_url: sound.url }]);
assert.match(audio.validateAudioInput('seedAudio', { text: 'Hi', referenceAudio: sound, referenceImage: portrait }), /二选一/);
assert.match(audio.validateAudioInput('seedAudio', { text: 'Hi', references: [{ audio_url: sound.url, image_url: portrait.url }] }), /二选一/);
assert.match(audio.validateAudioInput('seedAudio', { text: 'Hi', referenceAudio: 'C:\\voice.wav' }), /上传/);
assert.match(audio.validateAudioInput('seedAudio', { text: 'Hi', referenceAudio: portrait }), /音频/);
assert.match(audio.validateAudioInput('seedAudio', { text: 'Hi', speechRate: 1.5 }), /整数/);
assert.match(audio.validateAudioInput('seedAudio', { text: 'Hi', speechRate: '' }), /整数/);
assert.match(audio.validateAudioInput('seedAudio', { text: 'Hi', pitchRate: 101 }), /音调/);

assert.deepEqual(audio.buildAudioPayload('suno', { prompt: 'A calm piano track' }), { prompt: 'A calm piano track' });
assert.match(audio.validateAudioInput('suno', { prompt: 'A song', customMode: true }), /自定义/);
assert.match(audio.validateAudioInput('suno', { prompt: 'A song', operation: 'extend' }), /续写/);
assert.match(audio.validateAudioInput('suno', { prompt: 'A song', instrumental: true }), /提示词/);
assert.deepEqual(audio.buildAudioPayload('wooshSound', { prompt: 'footsteps on gravel' }), { prompt: 'footsteps on gravel' });
assert.match(audio.validateAudioInput('wooshSound', { prompt: '木地板脚步声' }), /英文/);
assert.deepEqual(audio.buildAudioPayload('klingVideoAudio', { video: { url: 'https://assets.example/source.mp4', type: 'video' } }), { video_url: 'https://assets.example/source.mp4' });
assert.match(audio.validateAudioInput('klingVideoAudio', {}), /视频/);
assert.match(audio.validateAudioInput('klingVideoAudio', { video: sound }), /视频/);
assert.throws(() => audio.buildAudioPayload('wooshSound', {}), /提示词/);

const encodedId = '{"task_id":"abc","supplier":"upstream-a"}';
assert.deepEqual(audio.buildAudioQuery('wooshSound', { taskId: encodedId, taskPath: '/jobs/a' }), { task_id: encodedId, task_path: '/jobs/a' });
assert.throws(() => audio.buildAudioQuery('suno', { taskId: 'a' }), /同步/);
assert.throws(() => audio.buildAudioQuery('wooshSound', {}), /task_id/);
assert.deepEqual(audio.normalizeAudioResult('minimaxTts', { success: true, data: 'https://cdn.example/out.mp3' }), {
  status: 'done', results: ['https://cdn.example/out.mp3'], outputs: [{ url: 'https://cdn.example/out.mp3', type: 'audio' }], taskId: '', taskPath: '', error: ''
});
assert.equal(audio.normalizeAudioResult('wooshSound', { success: true, data: encodedId }).taskId, encodedId);
assert.equal(audio.normalizeAudioResult('wooshSound', { success: true, data: { task_id: 'abc', task_status: 'processing', input: { url: sound.url } } }).status, 'pending');
assert.deepEqual(audio.normalizeAudioResult('wooshSound', { success: true, data: { task_id: 'abc', status: 'running', audio_url: sound.url } }).results, []);
assert.equal(audio.normalizeAudioResult('wooshSound', { success: true, data: { task_id: 'abc', status: 'failed', message: 'No capacity', audio_url: sound.url } }).error, 'No capacity');
assert.equal(audio.normalizeAudioResult('suno', { success: false, message: 'Unavailable' }).status, 'failed');
assert.equal(audio.normalizeAudioResult('suno', { success: true, data: 'not-a-url' }).status, 'failed');
assert.equal(audio.normalizeAudioResult('suno', { success: true, data: null }).status, 'failed');
assert.equal(audio.normalizeAudioResult('wooshSound', { success: true, data: null }).status, 'pending');
assert.equal(audio.normalizeAudioResult('klingVideoAudio', { success: true, data: { task_status: 'succeed', task_result: { videos: [{ url: 'https://cdn.example/result.mp4' }], audios: [{ url: 'https://cdn.example/result.mp3' }] } } }).outputs[0].type, 'video');
assert.equal(audio.normalizeAudioResult('klingVideoAudio', { success: true, data: { audio_url: 'https://cdn.example/result.mp3' } }).outputs[0].type, 'audio');
assert.deepEqual(audio.normalizeAudioResult('suno', { success: true, data: { audio_url: 'https://cdn.example/a.mp3', image_url: 'https://cdn.example/cover.png', prompt: 'https://assets.example/source.mp3' } }).results, ['https://cdn.example/a.mp3']);
assert.equal(audio.normalizeAudioResult('wooshSound', { success: true, data: { status: 'completed' } }).status, 'failed');
assert.equal(audio.normalizeAudioResult('suno', { success: true, data: { results: [{ status: 'processing', audio_url: 'https://cdn.example/partial.mp3' }] } }).status, 'pending');
assert.equal(audio.normalizeAudioResult('suno', { success: true, data: { outputs: [{ status: 'failed', message: 'Audio render failed', url: 'https://cdn.example/partial.mp3' }] } }).error, 'Audio render failed');
assert.deepEqual(audio.normalizeAudioResult('klingVideoAudio', { success: true, data: { outputs: [{ type: 'audio', url: 'https://cdn.example/download?id=123' }, { type: 'image', url: 'https://cdn.example/download?id=456' }] } }).outputs, [{ type: 'audio', url: 'https://cdn.example/download?id=123' }]);

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('./audio-models.js'), 'utf8'), context);
assert.equal(context.ApiBatchAudioModels.getAudioModel('seedAudio').endpoint, '/seed_audio');
console.log('audio-models tests passed');
