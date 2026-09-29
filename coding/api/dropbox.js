import { createRemoteJWKSet, jwtVerify } from "jose";

const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

if (!projectId) {
  throw new Error("FIREBASE_PROJECT_ID is not configured");
}

const firebaseKeys = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

async function verifyFirebaseToken(token) {
  const { payload } = await jwtVerify(token, firebaseKeys, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Firebase token has no subject");
  }

  return {
    ...payload,
    uid: payload.sub,
  };
}


function parseEmails(value) {
  return new Set(
    String(value || "")
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function configuredCoders() {
  return [...parseEmails(process.env.CODER_EMAILS)].sort();
}

function rolesForEmail(email) {
  const normalized = email.toLowerCase();
  const roles = new Set();

  if (parseEmails(process.env.ADMIN_EMAILS).has(normalized)) {
    roles.add("admin");
    roles.add("uploader");
    roles.add("coder");
  }
  if (parseEmails(process.env.UPLOADER_EMAILS).has(normalized)) {
    roles.add("uploader");
  }
  if (parseEmails(process.env.CODER_EMAILS).has(normalized)) {
    roles.add("coder");
  }

  return [...roles];
}

async function authenticate(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) {
    const error = new Error("Authentication required");
    error.status = 401;
    throw error;
  }

  let decoded;
  try {
    decoded = await verifyFirebaseToken(authorization.slice(7));
  } catch {
    const error = new Error("Authentication failed");
    error.status = 401;
    throw error;
  }
  if (!decoded.email || decoded.email_verified !== true) {
    const error = new Error("A verified email address is required");
    error.status = 403;
    throw error;
  }

  const roles = rolesForEmail(decoded.email);
  if (roles.length === 0) {
    const error = new Error("This account is not authorized");
    error.status = 403;
    throw error;
  }

  return {
    uid: decoded.uid,
    email: decoded.email.toLowerCase(),
    name: decoded.name || decoded.email,
    roles,
  };
}

async function requireRole(req, allowedRoles) {
  const user = await authenticate(req);
  if (!allowedRoles.some((role) => user.roles.includes(role))) {
    const error = new Error("You do not have permission for this action");
    error.status = 403;
    throw error;
  }
  return user;
}

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



function isMissing(error) {
  return error?.status === 409 && error.detail?.includes("not_found");
}

function isConflict(error) {
  return error?.status === 409 && error.detail?.includes("conflict");
}

function coderName(email) {
  return email.includes("@") ? email.slice(0, email.lastIndexOf("@")) : email;
}

function coderFilename(email, legacy = false) {
  const name = legacy ? email : coderName(email);
  if (!name || (!legacy && ["session", "progress"].includes(name.toLowerCase()))) {
    const error = new Error("This email prefix conflicts with a reserved session filename");
    error.status = 409;
    throw error;
  }
  const filename = `${encodeURIComponent(name).replaceAll("%40", "@").replaceAll("%2B", "+")}.json`;
  if (filename.length > 255) {
    const error = new Error("Email address is too long for a response filename");
    error.status = 400;
    throw error;
  }
  return filename;
}

async function readOptionalFile(dbx, path) {
  try {
    const { result } = await dbx.filesDownload({ path });
    return { text: Buffer.from(result.fileBinary).toString("utf8"), rev: result.rev };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function readCoderResponse(dbx, sessionId, email, uid) {
  for (const legacy of [false, true]) {
    const path = sessionPath(sessionId, coderFilename(email, legacy));
    const file = await readOptionalFile(dbx, path);
    if (!file) continue;
    const data = JSON.parse(file.text);
    const migratedOwner = data.migratedFromLegacy === true &&
      configuredCoders().filter((account) => coderName(account) === data.coder).length === 1 &&
      configuredCoders().includes(email) && data.coder === coderName(email);
    if ((data.coder !== email && !(data.coder === coderName(email) && data.modifiedBy === uid) && !migratedOwner) || data.sessionId !== sessionId) {
      const error = new Error("This email prefix already belongs to another response. No file was overwritten.");
      error.status = 409;
      throw error;
    }
    return { data, rev: file.rev, path };
  }
  return null;
}

async function listFolderEntries(dbx, path) {
  let page = await dbx.filesListFolder({ path });
  const entries = [...page.result.entries];
  while (page.result.has_more) {
    page = await dbx.filesListFolderContinue({ cursor: page.result.cursor });
    entries.push(...page.result.entries);
  }
  return entries;
}

async function adminStatus(dbx, sessionId, data) {
  const entries = await listFolderEntries(dbx, sessionPath(sessionId));
  const completions = {};
  const pending = [];
  // Read only per-coder response files; never send answers to the status table.
  for (const entry of entries) {
    if (entry[".tag"] !== "file" || ["session.json", "progress.json"].includes(entry.name) || !entry.name.endsWith(".json")) continue;
    const response = JSON.parse(await downloadText(dbx, sessionPath(sessionId, entry.name)));
    if (typeof response.coder !== "string" || response.sessionId !== sessionId ||
        coderName(decodeURIComponent(entry.name.slice(0, -5))) !== coderName(response.coder)) continue;
    if (response.completedAt) completions[coderName(response.coder)] = response.completedAt;
    else pending.push(coderName(response.coder));
  }
  return {
    uploadedBy: data.uploadedBy || null,
    completions,
    pending,
    hasLegacyResponse: entries.some((entry) => entry.name === "progress.json"),
  };
}

async function listSessions(dbx, cursor, user, admin = false) {
  // Bound each request so libraries can grow without one long-running request.
  let response;
  if (cursor) {
    response = await dbx.filesListFolderContinue({ cursor });
  } else {
    try {
      response = await dbx.filesListFolder({ path: BASE_PATH, limit: admin ? 2 : 8 });
    } catch (error) {
      if (!isMissing(error)) throw error;
      return { sessions: [], skipped: [], cursor: null, ...(admin ? { emails: configuredCoders() } : {}) };
    }
  }
  const folders = response.result.entries.filter((entry) => entry[".tag"] === "folder");
  const skipped = [];
  const loadEntry = async (entry) => {
    try {
      assertSessionId(entry.name);
      const data = JSON.parse(await downloadText(dbx, sessionPath(entry.name, "session.json")));
      const session = {
        id: entry.name,
        label: `${data.meta?.participant_id || "Unknown"} | Order ${data.meta?.order || "?"}`,
        meta: data.meta || {},
        savedAt: data.savedAt || entry.client_modified || null,
      };
      if (admin) return { ...session, ...await adminStatus(dbx, entry.name, data) };
      const response = user.roles.includes("coder")
        ? await readCoderResponse(dbx, entry.name, user.email, user.uid)
        : null;
      // Only the requesting coder's completion can remove a video from their queue.
      const completedAt = response?.data.completedAt || null;
      return {
        ...session,
        progress: completedAt ? { completedAt } : null,
        status: completedAt ? "completed" : "uncoded",
        syncPending: Boolean(response && !completedAt),
      };
    } catch (error) {
      console.warn("Skipping unavailable Dropbox session entry", entry.name, error);
      const reason = isMissing(error) ? "session.json is missing" : "session or response status could not be read";
      skipped.push({ id: entry.name, reason });
      return null;
    }
  };
  const sessions = [];
  const concurrency = admin ? 2 : 4;
  for (let index = 0; index < folders.length; index += concurrency) {
    const batch = await Promise.all(folders.slice(index, index + concurrency).map(loadEntry));
    sessions.push(...batch.filter(Boolean));
  }
  return {
    sessions,
    cursor: response.result.has_more ? response.result.cursor : null,
    skipped: skipped.sort((a, b) => a.id.localeCompare(b.id)),
    ...(admin ? { emails: configuredCoders() } : {}),
  };
}

function createSessionId(participantId) {
  const subject = typeof participantId === "string" ? participantId.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(subject)) {
    const error = new Error(
      "Subject ID must contain only letters, numbers, hyphens, or underscores (up to 80 characters)",
    );
    error.status = 400;
    throw error;
  }
  return subject;
}

function actionFor(req) {
  return typeof req.query.action === "string" ? req.query.action : "";
}

async function readBody(req, maxBytes = 4 * 1024 * 1024) {
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

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("The existing master CSV has an unterminated quoted field");
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function appendCsv(dbx, rows, email) {
  const path = `${BASE_PATH}/master_responses.csv`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await readOptionalFile(dbx, path);
    const records = existing ? parseCsv(existing.text.replace(/^\uFEFF/, "")) : [];
    const headers = records.shift() || [];
    if (new Set(headers).size !== headers.length || records.some((row) => row.length !== headers.length)) {
      throw new Error("The existing master CSV has inconsistent columns");
    }
    // Participant + coder is the save identity; keep internal session IDs out of the CSV.
    const sessionIndex = headers.indexOf("session_id");
    if (sessionIndex >= 0) {
      headers.splice(sessionIndex, 1);
      for (const row of records) row.splice(sessionIndex, 1);
    }
    const coderIndex = headers.indexOf("coder");
    const participantIndex = headers.indexOf("participant_id");
    const participant = String(rows[0]?.participant_id || "");
    if (!participant || rows.some((row) => String(row.participant_id) !== participant)) {
      throw new Error("A submission must belong to one participant");
    }
    if (coderIndex >= 0) {
      for (const row of records) row[coderIndex] = coderName(row[coderIndex]);
    }
    const alreadySaved = coderIndex >= 0 && participantIndex >= 0 && records.some((row) =>
      row[coderIndex] === coderName(email) && row[participantIndex] === participant);
    const originalWidth = headers.length;
    for (const name of [...new Set(rows.flatMap((row) => Object.keys(row))), "coder"]) {
      if (name !== "session_id" && !headers.includes(name)) headers.push(name);
    }
    for (const row of records) {
      for (let i = originalWidth; i < headers.length; i += 1) row.push("");
    }
    const newRows = alreadySaved ? [] : rows.map((row) => headers.map((header) =>
      header === "coder" ? coderName(email) : row[header]));
    const contents = [headers, ...records, ...newRows]
      .map((row) => row.map(csvCell).join(",")).join("\n");
    if (existing && !existing.rev) throw new Error("The master CSV revision is missing");
    try {
      await dbx.filesUpload({
        path, contents,
        mode: existing ? { ".tag": "update", update: existing.rev } : { ".tag": "add" },
        autorename: false, strict_conflict: true,
      });
      return;
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  const error = new Error("Other responses are being saved. Please try saving again.");
  error.status = 409;
  throw error;
}

async function saveCompletion(dbx, sessionId, user, data, rows) {
  if (!data || data.phase !== 3 || !data.answers || typeof data.answers !== "object" ||
      Array.isArray(data.answers) || !Array.isArray(rows) || !rows.length || rows.length > 1000 ||
      rows.some((row) => !row || typeof row !== "object" || Array.isArray(row) ||
        Object.values(row).some((value) => value != null && !["string", "number", "boolean"].includes(typeof value)))) {
    const error = new Error("Only completed responses and their CSV rows can be saved");
    error.status = 400;
    throw error;
  }
  const path = sessionPath(sessionId, coderFilename(user.email));
  let saved = await readCoderResponse(dbx, sessionId, user.email, user.uid);
  if (!saved) {
    const pkg = JSON.parse(await downloadText(dbx, sessionPath(sessionId, "session.json")));
    const pending = {
      phase: 3, answers: data.answers, phaseOrders: data.phaseOrders || {},
      coder: coderName(user.email), modifiedBy: user.uid, sessionId,
      submittedAt: new Date().toISOString(), completedAt: null,
      rows: rows.map((row) => ({ ...row,
        participant_id: pkg.meta?.participant_id || "",
        age_months: pkg.meta?.age_months ?? "", order: pkg.meta?.order || "",
        coder: coderName(user.email),
      })),
    };
    try {
      const result = await dbx.filesUpload({
        path, contents: JSON.stringify(pending, null, 2),
        mode: { ".tag": "add" }, autorename: false, strict_conflict: true,
      });
      saved = { data: pending, rev: result.result.rev, path };
    } catch (error) {
      if (!isConflict(error)) throw error;
      saved = await readCoderResponse(dbx, sessionId, user.email, user.uid);
      if (!saved) throw error;
    }
  }
  if (saved.data.completedAt) return { ok: true, completedAt: saved.data.completedAt };
  // The first submission is immutable. A retry finishes that same submission.
  await appendCsv(dbx, saved.data.rows, user.email);
  const completedAt = saved.data.submittedAt;
  if (!saved.rev) throw new Error("The response file revision is missing");
  try {
    await dbx.filesUpload({
      path: saved.path, contents: JSON.stringify({ ...saved.data, coder: coderName(user.email), rows: saved.data.rows.map((row) => ({ ...row, coder: coderName(user.email) })), completedAt }, null, 2),
      mode: { ".tag": "update", update: saved.rev }, autorename: false, strict_conflict: true,
    });
  } catch (error) {
    if (!isConflict(error)) throw error;
    const latest = await readCoderResponse(dbx, sessionId, user.email, user.uid);
    if (!latest?.data.completedAt) throw error;
    return { ok: true, completedAt: latest.data.completedAt };
  }
  return { ok: true, completedAt };
}

async function handleGet(req, res, action, dbx) {
  if (action === "list" || action === "admin-status") {
    const admin = action === "admin-status";
    const user = await requireRole(req, admin ? ["admin"] : ["uploader", "coder", "admin"]);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    return res.status(200).json(await listSessions(dbx, cursor, user, admin));
  }

  const sessionId = assertSessionId(req.query.sessionId);
  if (action === "session") {
    const user = await requireRole(req, ["coder", "admin"]);
    const [sessionText, response, temporaryLink] = await Promise.all([
      downloadText(dbx, sessionPath(sessionId, "session.json")),
      readCoderResponse(dbx, sessionId, user.email, user.uid),
      dbx.filesGetTemporaryLink({ path: sessionPath(sessionId, "video.mp4") }),
    ]);
    const pkg = JSON.parse(sessionText);
    return res.status(200).json({
      id: sessionId, pkg, videoURL: temporaryLink.result.link,
      pendingSubmission: response && !response.data.completedAt ? {
        answers: response.data.answers, phaseOrders: response.data.phaseOrders, rows: response.data.rows,
      } : null,
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
    const user = await requireRole(req, ["uploader", "admin"]);
    if (!body.data || typeof body.data !== "object") {
      const error = new Error("Invalid session data");
      error.status = 400;
      throw error;
    }
    await uploadJson(dbx, sessionPath(sessionId, "session.json"), {
      ...body.data,
      uploadedBy: user.email,
      savedAt: new Date().toISOString(),
    });
    return res.status(200).json({ ok: true });
  }

  if (action === "completion") {
    const user = await requireRole(req, ["coder", "admin"]);
    return res.status(200).json(await saveCompletion(dbx, sessionId, user, body.data, body.rows));
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
    // Account access must work even when Dropbox is unavailable.
    if (action === "me") {
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
      }
      try {
        return res.status(200).json(await authenticate(req));
      } catch (error) {
        return res.status(error.status || 401).json({
          error: error.status === 403 ? error.message : "Authentication failed",
        });
      }
    }
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

// Used by the temporary, admin-only migration endpoint.
export { requireRole, getDropbox, listFolderEntries, downloadText, readOptionalFile, parseCsv, csvCell, rpc, readJson };
