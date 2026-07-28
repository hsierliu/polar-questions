import { getIdToken } from "./auth";

const CHUNK_SIZE = 2 * 1024 * 1024;

async function apiRequest(action, options = {}) {
  const token = await getIdToken();
  const query = new URLSearchParams({ action, ...(options.query || {}) });
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`/api/dropbox?${query}`, {
    method: options.method || "GET",
    headers,
    body:
      options.json !== undefined
        ? JSON.stringify(options.json)
        : options.body,
    cache: "no-store",
  });
  const responseText = await response.text();
  let data = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    // Vercel may return a non-JSON platform error before the function runs.
  }
  if (!response.ok) {
    throw new Error(
      data.error || `Storage request failed (HTTP ${response.status})`,
    );
  }
  return data;
}

export async function uploadVideo(videoBlob) {
  if (!(videoBlob instanceof Blob) || videoBlob.size === 0) {
    throw new Error("A non-empty video is required");
  }

  const started = await apiRequest("upload-start", { method: "POST" });
  let offset = 0;
  while (offset < videoBlob.size) {
    const chunk = videoBlob.slice(offset, offset + CHUNK_SIZE);
    const result = await apiRequest("upload-chunk", {
      method: "PUT",
      query: {
        uploadId: started.uploadId,
        offset: String(offset),
      },
      headers: { "Content-Type": "application/octet-stream" },
      body: chunk,
    });
    offset = result.offset;
  }

  await apiRequest("upload-finish", {
    method: "POST",
    json: {
      sessionId: started.sessionId,
      uploadId: started.uploadId,
      offset,
    },
  });
  return started.sessionId;
}

export async function saveSessionData(sessionId, data) {
  await apiRequest("session-data", {
    method: "POST",
    json: { sessionId, data },
  });
}

export async function saveProgress(sessionId, data) {
  await apiRequest("progress", {
    method: "POST",
    json: { sessionId, data },
  });
}

export async function loadProgress(sessionId) {
  const result = await apiRequest("progress", {
    query: { sessionId },
  });
  return result.progress;
}

export async function listSessions() {
  const result = await apiRequest("list");
  const sessions = result.sessions || [];
  Object.defineProperty(sessions, "loadWarnings", {
    value: result.skipped || [],
    enumerable: false,
  });
  return sessions;
}

export async function loadSession(sessionId) {
  return apiRequest("session", { query: { sessionId } });
}

export async function appendToMasterSpreadsheet(rows) {
  await apiRequest("append-csv", {
    method: "POST",
    json: { rows },
  });
}
