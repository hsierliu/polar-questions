import { listSessions } from "../server/sessions.js";
import { createSessionId } from "../server/session-id.js";
import {
  BASE_PATH,
  assertSessionId,
  downloadText,
  ensureBaseFolder,
  getDropbox,
  sessionPath,
  uploadJson,
} from "../server/dropbox.js";
import { requireRole } from "../server/auth.js";

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

function actionFor(req) {
  return typeof req.query.action === "string" ? req.query.action : "";
}

async function readBody(req, maxBytes = 3 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Request body is too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req, maxBytes = 1024 * 1024) {
  const buffer = await readBody(req, maxBytes);
  try {
    return buffer.length ? JSON.parse(buffer.toString("utf8")) : {};
  } catch {
    const error = new Error("Invalid JSON request");
    error.status = 400;
    throw error;
  }
}

function statusFor(error) {
  if (error.status && Number.isInteger(error.status)) return error.status;
  return 500;
}

function safeMessage(error) {
  if (error.status && error.status < 500) return error.message;
  console.error("Dropbox API error:", error);
  return "The storage operation failed";
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

async function appendCsv(dbx, rows) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 1000) {
    const error = new Error("Invalid response rows");
    error.status = 400;
    throw error;
  }
  const path = `${BASE_PATH}/master_responses.csv`;
  let existingLines = [];
  let headers = null;
  try {
    const existing = await downloadText(dbx, path);
    existingLines = existing.split("\n").filter((line) => line.trim());
    if (existingLines.length) headers = existingLines.shift().split(",");
  } catch (error) {
    if (error?.status !== 409) throw error;
  }
  headers ||= Object.keys(rows[0]);
  const newLines = rows.map((row) =>
    headers.map((header) => csvCell(row[header])).join(","),
  );
  await dbx.filesUpload({
    path,
    contents: [headers.join(","), ...existingLines, ...newLines].join("\n"),
    mode: { ".tag": "overwrite" },
  });
}

async function handleGet(req, res, action, dbx) {
  if (action === "list") {
    await requireRole(req, ["uploader", "coder", "admin"]);
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    return res.status(200).json(await listSessions(dbx, cursor));
  }

  const sessionId = assertSessionId(req.query.sessionId);
  if (action === "session") {
    await requireRole(req, ["coder", "admin"]);
    const pkg = JSON.parse(
      await downloadText(dbx, sessionPath(sessionId, "session.json")),
    );
    const temporaryLink = await dbx.filesGetTemporaryLink({
      path: sessionPath(sessionId, "video.mp4"),
    });
    return res.status(200).json({
      id: sessionId,
      pkg,
      videoURL: temporaryLink.result.link,
    });
  }

  const error = new Error("Unknown operation");
  error.status = 400;
  throw error;
}

async function handlePost(req, res, action, dbx) {
  if (action === "upload-start") {
    await requireRole(req, ["uploader", "admin"]);
    const body = await readJson(req);
    const sessionId = createSessionId(body.participantId);
    await ensureBaseFolder(dbx);
    await dbx.filesCreateFolderV2({ path: sessionPath(sessionId) });
    const started = await dbx.filesUploadSessionStart({
      contents: Buffer.alloc(0),
      close: false,
    });
    return res.status(200).json({
      sessionId,
      uploadId: started.result.session_id,
    });
  }

  const body = await readJson(req);

  if (action === "append-csv") {
    await requireRole(req, ["coder", "admin"]);
    await appendCsv(dbx, body.rows);
    return res.status(200).json({ ok: true });
  }

  const sessionId = assertSessionId(body.sessionId);

  if (action === "upload-finish") {
    await requireRole(req, ["uploader", "admin"]);
    if (
      typeof body.uploadId !== "string" ||
      !Number.isSafeInteger(body.offset) ||
      body.offset < 0
    ) {
      const error = new Error("Invalid upload state");
      error.status = 400;
      throw error;
    }
    await dbx.filesUploadSessionFinish({
      cursor: { session_id: body.uploadId, offset: body.offset },
      commit: {
        path: sessionPath(sessionId, "video.mp4"),
        mode: { ".tag": "overwrite" },
      },
      contents: Buffer.alloc(0),
    });
    return res.status(200).json({ ok: true });
  }

  if (action === "session-data") {
    await requireRole(req, ["uploader", "admin"]);
    if (!body.data || typeof body.data !== "object") {
      const error = new Error("Invalid session data");
      error.status = 400;
      throw error;
    }
    await uploadJson(dbx, sessionPath(sessionId, "session.json"), {
      ...body.data,
      savedAt: new Date().toISOString(),
    });
    return res.status(200).json({ ok: true });
  }

  if (action === "completion") {
    const user = await requireRole(req, ["coder", "admin"]);
    if (
      !body.data ||
      body.data.phase !== 3 ||
      !body.data.answers ||
      typeof body.data.answers !== "object" ||
      Array.isArray(body.data.answers)
    ) {
      const error = new Error("Only completed responses can be saved");
      error.status = 400;
      throw error;
    }
    await uploadJson(dbx, sessionPath(sessionId, "progress.json"), {
      ...body.data,
      completedAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      modifiedBy: user.uid,
    });
    return res.status(200).json({ ok: true });
  }

  const error = new Error("Unknown operation");
  error.status = 400;
  throw error;
}

async function handlePut(req, res, action, dbx) {
  if (action !== "upload-chunk") {
    const error = new Error("Unknown operation");
    error.status = 400;
    throw error;
  }
  await requireRole(req, ["uploader", "admin"]);
  const uploadId = req.query.uploadId;
  const offset = Number(req.query.offset);
  if (
    typeof uploadId !== "string" ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    const error = new Error("Invalid upload state");
    error.status = 400;
    throw error;
  }
  const contents = await readBody(req);
  if (contents.length === 0) {
    const error = new Error("Upload chunk is empty");
    error.status = 400;
    throw error;
  }
  await dbx.filesUploadSessionAppendV2({
    cursor: { session_id: uploadId, offset },
    contents,
    close: false,
  });
  return res.status(200).json({ offset: offset + contents.length });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const action = actionFor(req);
    const dbx = await getDropbox();
    if (req.method === "GET") return await handleGet(req, res, action, dbx);
    if (req.method === "POST") return await handlePost(req, res, action, dbx);
    if (req.method === "PUT") return await handlePut(req, res, action, dbx);
    res.setHeader("Allow", "GET, POST, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(statusFor(error)).json({ error: safeMessage(error) });
  }
}
