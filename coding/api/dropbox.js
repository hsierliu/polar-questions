import { requireRole } from "./me.js";

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

const BASE_PATH = "/polar-questions-data";

let cachedToken = null;
let tokenExpiresAt = 0;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function fetchWithRetry(url, options) {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(url, options);
    if (
      !RETRYABLE_STATUSES.has(response.status) ||
      attempt === maxAttempts - 1
    ) {
      return response;
    }
    await response.body?.cancel().catch(() => {});
    const retryAfter = Number(response.headers.get("Retry-After"));
    const serverDelay =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 0;
    const exponentialDelay = 500 * 2 ** attempt;
    const jitter = Math.floor(Math.random() * 250);
    const delay = Math.min(
      Math.max(serverDelay, exponentialDelay) + jitter,
      8000,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("Dropbox retry failed");
}

function credentials() {
  const clientId = process.env.DROPBOX_APP_KEY;
  const clientSecret = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Dropbox server credentials are not configured");
  }
  return { clientId, clientSecret, refreshToken };
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const { clientId, clientSecret, refreshToken } = credentials();
  const response = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) throw new Error("Dropbox authorization failed");

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + Math.max(data.expires_in - 300, 60) * 1000;
  return cachedToken;
}

async function dropboxError(response) {
  const detail = await response.text();
  const error = new Error(`Dropbox request failed (${response.status})`);
  error.status = response.status;
  error.detail = detail;
  return error;
}

async function rpc(route, args) {
  const response = await fetchWithRetry(`https://api.dropboxapi.com/2/${route}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw await dropboxError(response);
  return { result: await response.json() };
}

async function contentUpload(route, args, contents) {
  const response = await fetchWithRetry(`https://content.dropboxapi.com/2/${route}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify(args),
    },
    body: contents,
  });
  if (!response.ok) throw await dropboxError(response);
  return { result: await response.json() };
}

async function contentDownload(route, args) {
  const response = await fetchWithRetry(`https://content.dropboxapi.com/2/${route}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Dropbox-API-Arg": JSON.stringify(args),
    },
  });
  if (!response.ok) throw await dropboxError(response);

  const metadataHeader = response.headers.get("Dropbox-API-Result");
  const metadata = metadataHeader ? JSON.parse(metadataHeader) : {};
  return {
    result: {
      ...metadata,
      fileBinary: Buffer.from(await response.arrayBuffer()),
    },
  };
}

async function getDropbox() {
  return {
    filesCreateFolderV2: (args) => rpc("files/create_folder_v2", args),
    filesListFolder: (args) => rpc("files/list_folder", args),
    filesListFolderContinue: (args) => rpc("files/list_folder/continue", args),
    filesGetTemporaryLink: (args) => rpc("files/get_temporary_link", args),
    filesDownload: (args) => contentDownload("files/download", args),
    filesUpload: ({ contents, ...args }) =>
      contentUpload("files/upload", args, contents),
    filesUploadSessionStart: ({ contents, ...args }) =>
      contentUpload("files/upload_session/start", args, contents),
    filesUploadSessionAppendV2: ({ contents, ...args }) =>
      contentUpload("files/upload_session/append_v2", args, contents),
    filesUploadSessionFinish: ({ contents, ...args }) =>
      contentUpload("files/upload_session/finish", args, contents),
  };
}

function assertSessionId(sessionId) {
  const value = String(sessionId || "");
  const hasUnsafeCharacters = [...value].some((character) => {
    const code = character.charCodeAt(0);
    return character === "/" || character === "\\" || code < 32 || code === 127;
  });
  if (
    value.length === 0 ||
    value.length > 200 ||
    value === "." ||
    value === ".." ||
    hasUnsafeCharacters
  ) {
    const error = new Error("Invalid session identifier");
    error.status = 400;
    throw error;
  }
  return sessionId;
}

function sessionPath(sessionId, filename = "") {
  assertSessionId(sessionId);
  return `${BASE_PATH}/${sessionId}${filename ? `/${filename}` : ""}`;
}

async function ensureBaseFolder(dbx) {
  try {
    await dbx.filesCreateFolderV2({ path: BASE_PATH });
  } catch (error) {
    if (error?.status !== 409) throw error;
  }
}

async function downloadText(dbx, path) {
  const response = await dbx.filesDownload({ path });
  return Buffer.from(response.result.fileBinary).toString("utf8");
}

async function uploadJson(dbx, path, value) {
  await dbx.filesUpload({
    path,
    contents: JSON.stringify(value, null, 2),
    mode: { ".tag": "overwrite" },
    autorename: false,
    mute: true,
    strict_conflict: false,
  });
}



async function listSessions(dbx, cursor) {
  // Finish each page before Vercel's request deadline, regardless of library size.
  let response;
  if (cursor) {
    response = await dbx.filesListFolderContinue({ cursor });
  } else {
    try {
      response = await dbx.filesListFolder({ path: BASE_PATH, limit: 4 });
    } catch (error) {
      if (error?.status !== 409 || !error.detail?.includes("path/not_found")) {
        throw error;
      }
      return { sessions: [], skipped: [], cursor: null };
    }
  }
  const entries = response.result.entries;

  const folders = entries.filter((entry) => entry[".tag"] === "folder");
  const skipped = [];
  const loadEntry = async (entry) => {
    try {
      assertSessionId(entry.name);
      const dataText = await downloadText(
        dbx,
        sessionPath(entry.name, "session.json"),
      );
      const progress = await downloadText(
        dbx,
        sessionPath(entry.name, "progress.json"),
      )
        .then((text) => JSON.parse(text))
        .catch((error) => {
          if (error?.status !== 409) {
            console.warn(
              "Progress unavailable; listing session without status",
              entry.name,
              error,
            );
          }
          return null;
        });
      const data = JSON.parse(dataText);
      return {
        id: entry.name,
        label: `${data.meta?.participant_id || "Unknown"} | Order ${data.meta?.order || "?"}`,
        meta: data.meta || {},
        savedAt: data.savedAt || entry.client_modified || null,
        // Legacy partial saves are ignored; final submissions remain visible.
        progress: progress?.completedAt ? progress : null,
        status: progress?.completedAt ? "completed" : "uncoded",
      };
    } catch (error) {
      console.warn("Skipping invalid Dropbox session entry", entry.name, error);
      let reason = "storage error";
      if (error?.status === 409) {
        reason = "session.json is missing";
      } else if (error instanceof SyntaxError) {
        reason = "session.json contains invalid JSON";
      } else if (error?.status === 400) {
        reason = "folder name is not supported";
      } else if (error?.status) {
        reason = `storage error (HTTP ${error.status})`;
      }
      skipped.push({ id: entry.name, reason });
      return null;
    }
  };

  const sessions = [];
  const concurrency = 2;
  for (let index = 0; index < folders.length; index += concurrency) {
    const batch = await Promise.all(
      folders.slice(index, index + concurrency).map(loadEntry),
    );
    sessions.push(...batch.filter(Boolean));
  }
  return {
    sessions,
    cursor: response.result.has_more ? response.result.cursor : null,
    skipped: skipped.sort((a, b) => a.id.localeCompare(b.id)),
  };
}


function createSessionId(participantId, timestamp = Date.now()) {
  const subject = typeof participantId === "string" ? participantId.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(subject)) {
    const error = new Error(
      "Subject ID must contain only letters, numbers, hyphens, or underscores (up to 80 characters)",
    );
    error.status = 400;
    throw error;
  }
  return `${subject}_${timestamp}`;
}

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
