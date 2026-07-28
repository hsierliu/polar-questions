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

export async function getDropbox() {
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

export function assertSessionId(sessionId) {
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

export function sessionPath(sessionId, filename = "") {
  assertSessionId(sessionId);
  return `${BASE_PATH}/${sessionId}${filename ? `/${filename}` : ""}`;
}

export async function ensureBaseFolder(dbx) {
  try {
    await dbx.filesCreateFolderV2({ path: BASE_PATH });
  } catch (error) {
    if (error?.status !== 409) throw error;
  }
}

export async function downloadText(dbx, path) {
  const response = await dbx.filesDownload({ path });
  return Buffer.from(response.result.fileBinary).toString("utf8");
}

export async function uploadJson(dbx, path, value) {
  await dbx.filesUpload({
    path,
    contents: JSON.stringify(value, null, 2),
    mode: { ".tag": "overwrite" },
    autorename: false,
    mute: true,
    strict_conflict: false,
  });
}

export { BASE_PATH };
