// Temporary admin-only migration. Remove after the migration is verified.
import { createHash } from 'node:crypto';
import { requireRole, getDropbox, listFolderEntries, downloadText, readOptionalFile, parseCsv, csvCell, rpc, readJson } from './dropbox.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };
const BASE = '/polar-questions-data';
const BACKUP = '/polar-questions-migration-backup';
const prefix = (name) => String(name || '').split('@')[0];
const participantId = (value) => {
  const match = /^S(\d+)(?:_\d+)*$/i.exec(String(value || '').trim());
  return match ? `S${match[1]}` : null;
};
const owner = (id) => {
  const n = Number(/^S(\d+)$/i.exec(id)?.[1]);
  return n >= 1 && n <= 61 ? 'iphillips' : n >= 63 && n <= 87 ? 'ecegunce' : null;
};
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (message) => { throw Object.assign(new Error(message), { status: 409 }); };

async function planFolder(dbx, folderName, expectedParticipant) {
  if (typeof folderName !== 'string' || !folderName || folderName === '.' || folderName === '..' ||
      [...folderName].some(char => char === '/' || char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fail('Invalid source folder name');
  const entries = await listFolderEntries(dbx, BASE);
  const entry = entries.find(e => e['.tag'] === 'folder' && e.name === folderName);
  if (!entry) fail(`Source folder ${folderName} no longer exists; preview again`);
  const from = `${BASE}/${entry.name}`;
  const children = await listFolderEntries(dbx, from);
  const pkg = JSON.parse(await downloadText(dbx, `${from}/session.json`));
  const metadataParticipant = participantId(pkg.meta?.participant_id);
  const folderParticipant = participantId(folderName);
  if (metadataParticipant && folderParticipant && metadataParticipant !== folderParticipant) {
    fail(`${folderName}: folder name and session.json identify different participants`);
  }
  const participant = metadataParticipant || folderParticipant;
  if (!participant) fail(`${folderName}/session.json has no recognizable participant ID, and its folder name cannot identify it`);
  if (expectedParticipant && expectedParticipant !== 'folder' && expectedParticipant !== participant) fail('Participant metadata changed after the preview');
  const to = `${BASE}/${participant}`;
  if (entries.some(e => e.name !== entry.name && e.name.toLowerCase() === participant.toLowerCase())) {
    fail(`Cannot rename ${folderName}: ${participant} already exists`);
  }
  const changes = [];
  for (const file of children.filter(e => e['.tag'] === 'file' && e.name.endsWith('.json'))) {
    const path = `${from}/${file.name}`;
    const original = await readOptionalFile(dbx, path);
    if (!original?.rev) fail(`Cannot read revision for ${path}`);
    const data = JSON.parse(original.text);
    let name = file.name;
    if (name === 'progress.json' && owner(participant)) {
      name = `${owner(participant)}.json`;
      if (children.some(e => e.name.toLowerCase() === name.toLowerCase())) fail(`${participant}/${name} already exists; nothing was overwritten`);
      if (!data.completedAt) fail(`${participant}/progress.json has no completion date; review it before migration`);
      data.coder = owner(participant);
      data.sessionId = participant;
      data.migratedFromLegacy = true;
    } else if (name === 'egunce.json' && owner(participant) === 'ecegunce') {
      if (prefix(data.coder) !== 'egunce') fail(`${participant}/egunce.json has unexpected coder ownership`);
      name = 'ecegunce.json';
      if (children.some(e => e.name.toLowerCase() === name)) fail(`${participant}/${name} already exists; nothing was overwritten`);
      data.coder = 'ecegunce';
      data.sessionId = participant;
      data.migratedFromLegacy = true;
    } else if (name !== 'session.json' && name !== 'progress.json') {
      if (!data.coder) fail(`Unknown response file ${path}`);
      data.coder = prefix(data.coder);
      data.sessionId = participant;
    }
    if (file.name === 'session.json') {
      data.meta = { ...data.meta, participant_id: participant };
    }
    for (const key of ['sessionId', 'session_id', 'participant_id']) {
      if (Object.hasOwn(data, key)) data[key] = participant;
    }
    if (Array.isArray(data.rows)) data.rows = data.rows.map(row => {
      const result = { ...row, participant_id: participant };
      delete result.session_id;
      if (data.coder) result.coder = data.coder;
      return result;
    });
    const contents = JSON.stringify(data, null, 2);
    if (name !== file.name || JSON.stringify(data) !== JSON.stringify(JSON.parse(original.text))) {
      changes.push({ from: path, to: `${from}/${name}`, finalPath: `${to}/${name}`, rev: original.rev, original: original.text, contents });
    }
  }
  return { participant, previousParticipant: pkg.meta?.participant_id ?? null, identitySource: metadataParticipant ? 'session.json' : 'folder name', folderName, from, to, changes, revisions: children.filter(e => e.rev).map(e => [e.name, e.rev]).sort() };
}

async function planCsv(dbx) {
  const path = `${BASE}/master_responses.csv`, original = await readOptionalFile(dbx, path);
  if (!original?.rev) fail('master_responses.csv was not found; check its exact filename');
  const records = parseCsv(original.text.replace(/^\uFEFF/, '')), headers = records.shift();
  if (!headers || new Set(headers).size !== headers.length || records.some(row => row.length !== headers.length)) fail('CSV has inconsistent columns');
  const subject = headers.indexOf('participant_id');
  if (subject < 0) fail('CSV has no participant_id column');
  let coder = headers.indexOf('coder');
  if (coder < 0) { coder = headers.length; headers.push('coder'); for (const row of records) row.push(''); }
  const counts = {};
  for (const row of records) {
    const participant = participantId(row[subject]);
    if (!participant) fail(`CSV contains an unrecognized participant ID: ${row[subject]}`);
    row[subject] = participant;
    const expected = owner(participant), existing = prefix(row[coder]);
    if (expected && existing && existing !== expected && !(expected === 'ecegunce' && existing === 'egunce')) fail(`${participant} already has coder ${existing}; review before replacing attribution`);
    row[coder] = expected || existing;
    counts[row[coder] || '(blank)'] = (counts[row[coder] || '(blank)'] || 0) + 1;
  }
  const sessionColumn = headers.indexOf('session_id');
  if (sessionColumn >= 0) { headers.splice(sessionColumn, 1); for (const row of records) row.splice(sessionColumn, 1); }
  const contents = [headers, ...records].map(row => row.map(csvCell).join(',')).join('\n');
  return { path, rev: original.rev, original: original.text, contents, rowCount: records.length, coderCounts: counts, removedSessionId: sessionColumn >= 0 };
}

async function backup(dbx, plan, token, key) {
  // An immutable snapshot contains originals and the exact source/destination plan.
  try { await dbx.filesCreateFolderV2({ path: BACKUP }); }
  catch (error) {
    const metadata = await rpc('files/get_metadata', { path: BACKUP });
    if (metadata.result['.tag'] !== 'folder') throw error;
  }
  const path = `${BACKUP}/${key}-${token}.json`;
  const existing = await readOptionalFile(dbx, path);
  if (existing) { if (existing.text !== JSON.stringify(plan, null, 2)) fail('Backup conflict'); return path; }
  await dbx.filesUpload({ path, contents: JSON.stringify(plan, null, 2), mode: { '.tag': 'add' }, autorename: false, strict_conflict: true });
  return path;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    await requireRole(req, ['admin']);
    const dbx = await getDropbox();
    if (req.method === 'GET' && req.query.inventory === '1') {
      const entries = await listFolderEntries(dbx, BASE);
      return res.status(200).json({ folders: entries.filter(e => e['.tag'] === 'folder').map(e => e.name), csvFiles: entries.filter(e => e.name.endsWith('.csv')).map(e => e.name) });
    }
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'GET or POST required' });
    const body = req.method === 'POST' ? await readJson(req) : req.query;
    const plan = body.participant === 'csv' ? await planCsv(dbx) : await planFolder(dbx, body.folderName, body.participant);
    const token = digest(plan);
    if (req.method === 'GET') {
      const summary = { ...plan };
      delete summary.original;
      delete summary.contents;
      const changes = summary.changes;
      delete summary.changes;
      return res.status(200).json({ ...summary, changes: changes?.map(({from,to,finalPath}) => ({from,to,finalPath})), token });
    }
    if (body.token !== token) fail('Dropbox changed after the dry run. Run the dry run again.');
    if (body.confirm !== 'APPLY REVIEWED MIGRATION') fail('Explicit migration confirmation is required');
    const backupPath = await backup(dbx, plan, token, body.participant);
    if (body.participant === 'csv') {
      await dbx.filesUpload({ path: plan.path, contents: plan.contents, mode: { '.tag': 'update', update: plan.rev }, autorename: false, strict_conflict: true });
      if ((await downloadText(dbx, plan.path)) !== plan.contents) fail('CSV verification failed');
    } else {
      for (const change of plan.changes) {
        // Revision checking prevents overwriting a response changed after review.
        await dbx.filesUpload({ path: change.from, contents: change.contents, mode: { '.tag': 'update', update: change.rev }, autorename: false, strict_conflict: true });
        if (change.to !== change.from) await rpc('files/move_v2', { from_path: change.from, to_path: change.to, autorename: false });
      }
      if (plan.from !== plan.to) await rpc('files/move_v2', { from_path: plan.from, to_path: plan.to, autorename: false });
      for (const change of plan.changes) if ((await downloadText(dbx, change.finalPath)) !== change.contents) fail('Response verification failed');
    }
    return res.status(200).json({ ok: true, backupPath });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Migration failed; stop and review backups before retrying' });
  }
}
