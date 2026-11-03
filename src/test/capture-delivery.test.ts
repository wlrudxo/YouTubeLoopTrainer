import assert from 'node:assert/strict';
import { test, vi, afterEach } from 'vitest';
import { validateDraftMarkers } from '../shared/validation';
import * as storage from '../shared/storage';
import { importLoopToCompanion } from '../shared/companion';
import { validateImportPayload } from '../../scripts/companion/storage.mjs';
import { STORAGE_KEY } from '../shared/constants';
afterEach(() => vi.unstubAllGlobals());
test('synthetic capture, failed delivery, successful retry, and last-loop queue removal', async () => {
  let records = {};
  let accepted = false;
  const delivered = [];
  vi.stubGlobal('fetch', async () => { throw new Error('Unexpected real fetch'); });
  vi.stubGlobal('chrome', {
    storage: { local: {
      async get(key) { return structuredClone({ [key]: records[key] }); },
      async set(value) { records = { ...records, ...structuredClone(value) }; }
    } },
    runtime: { async sendMessage(message) {
      assert.equal(message.path, '/import');
      if (!accepted) throw new Error('Synthetic companion offline');
      const payload = JSON.parse(message.body);
      validateImportPayload(payload);
      delivered.push(payload);
      return { ok: true, status: 200, body: { ok: true } };
    } }
  });
  // This composes the same shared calls used by saveDraftLoop/sendAll; no DOM or server is started.
  const invalid = validateDraftMarkers(NaN, 10);
  assert.equal(invalid.ok, false);
  assert.deepEqual((await storage.readData()).videos, {});
  const range = validateDraftMarkers(0, 1);
  assert.equal(range.ok, true);
  const loop = { id: 'lp_synthetic', start: range.start, end: range.end, label: 'Synthetic only',
    createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z' };
  const video = await storage.addLoop('video_synthetic', 'Synthetic only', 'https://www.youtube.com/watch?v=video_synthetic', loop);
  const config = { url: 'http://127.0.0.1:17311', token: 'synthetic-token' };
  await assert.rejects(importLoopToCompanion(config, video, loop), /Could not connect/);
  assert.deepEqual((await storage.readData()).videos.video_synthetic.loops, [loop]);
  accepted = true;
  await importLoopToCompanion(config, video, loop);
  await storage.deleteLoop(video.videoId, loop.id);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].start, 0);
  assert.equal(delivered[0].end, 1);
  assert.equal(delivered[0].loopId, loop.id);
  assert.deepEqual(records[STORAGE_KEY].videos, {});
});
