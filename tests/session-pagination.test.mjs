import test from 'node:test';
import assert from 'node:assert/strict';
import { listSessions } from '../server/sessions.js';
import { collectSessions } from '../src/services/session-list.js';

test('large libraries load over bounded requests and sort across pages', async () => {
  const entries = Array.from({ length: 41 }, (_, i) => ({ '.tag': 'folder', name: `session-${i + 1}` }));
  let listCalls = 0;
  let downloads = 0;
  const page = (start) => ({ result: { entries: entries.slice(start, start + 4), has_more: start + 4 < entries.length, cursor: String(start + 4) } });
  const dbx = {
    filesListFolder: async (args) => { listCalls++; assert.equal(args.limit, 4); return page(0); },
    filesListFolderContinue: async ({ cursor }) => { listCalls++; return page(Number(cursor)); },
    filesDownload: async ({ path }) => {
      downloads++;
      const number = Number(/session-(\d+)/.exec(path)[1]);
      const data = path.endsWith('progress.json') ? { answers: { one: 'yes' }, phase: 3, completedAt: '2026-09-16T12:00:00Z' } : { meta: { participant_id: `S${number}` }, segments: [{ type: 'child_response' }] };
      return { result: { fileBinary: Buffer.from(JSON.stringify(data)) } };
    },
  };
  const result = await collectSessions(async (cursor) => {
    const previousDownloads = downloads;
    const previousCalls = listCalls;
    const result = await listSessions(dbx, cursor);
    assert.equal(listCalls - previousCalls, 1, 'one Dropbox directory page per request');
    assert.ok(downloads - previousDownloads <= 8, 'no full-library download in one request');
    return result;
  });
  assert.equal(result.length, 41);
  assert.equal(listCalls, 11);
  assert.equal(result[0].meta.participant_id, 'S41');
  assert.equal(result[40].meta.participant_id, 'S1');
  assert.ok(result.every((session) => session.status === 'completed'));
});

test('empty intermediate pages continue and warnings from all pages survive', async () => {
  const cursors = [];
  const result = await collectSessions(async (cursor) => {
    cursors.push(cursor);
    return cursor ? { sessions: [{ id: 'valid' }], skipped: [{ id: 'a' }], cursor: null } : { sessions: [], skipped: [{ id: 'z' }], cursor: 'next' };
  });
  assert.deepEqual(cursors, [undefined, 'next']);
  assert.equal(result.length, 1);
  assert.deepEqual(result.loadWarnings, [{ id: 'a' }, { id: 'z' }]);
  assert.equal(Object.keys(result).includes('loadWarnings'), false);
});

test('a failed later page rejects rather than presenting an incomplete library', async () => {
  await assert.rejects(collectSessions(async (cursor) => {
    if (cursor) throw new Error('storage unavailable');
    return { sessions: [{ id: 'one' }], cursor: 'next' };
  }), /storage unavailable/);
});

test('missing base folder is empty, while unrelated Dropbox errors propagate', async () => {
  const missing = { status: 409, detail: 'path/not_found/' };
  const dbx = { filesListFolder: async () => { throw missing; } };
  assert.deepEqual(await listSessions(dbx), { sessions: [], skipped: [], cursor: null });
  missing.detail = 'path/not_folder/';
  await assert.rejects(listSessions(dbx), (error) => error === missing);
});

test('invalid session files remain warnings and missing progress remains uncoded', async () => {
  const dbx = {
    filesListFolder: async () => ({ result: { entries: [{ '.tag': 'folder', name: 'broken' }, { '.tag': 'folder', name: 'valid' }, { '.tag': 'file', name: 'master_responses.csv' }], has_more: false } }),
    filesDownload: async ({ path }) => {
      if (path.endsWith('progress.json')) throw { status: 409 };
      return { result: { fileBinary: Buffer.from(path.includes('/broken/') ? '{' : JSON.stringify({ segments: [] })) } };
    },
  };
  const result = await listSessions(dbx);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].status, 'uncoded');
  assert.deepEqual(result.skipped, [{ id: 'broken', reason: 'session.json contains invalid JSON' }]);
});


test('legacy partial saves are uncoded even when every segment has an answer', async () => {
  const dbx = {
    filesListFolder: async () => ({ result: { entries: [{ '.tag': 'folder', name: 'legacy' }], has_more: false } }),
    filesDownload: async ({ path }) => ({ result: { fileBinary: Buffer.from(JSON.stringify(
      path.endsWith('progress.json') ? { answers: { one: 'yes' }, phase: 2 } : { segments: [{ id: 'one', type: 'child_response' }] }
    )) } }),
  };
  const result = await listSessions(dbx);
  assert.equal(result.sessions[0].status, 'uncoded');
  assert.equal(result.sessions[0].progress, null);
});
