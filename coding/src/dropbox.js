import { getIdToken } from "./auth.js";

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

export async function uploadVideo(videoBlob, participantId) {
  if (!(videoBlob instanceof Blob) || videoBlob.size === 0) {
    throw new Error("A non-empty video is required");
  }

  const started = await apiRequest("upload-start", {
    method: "POST",
    json: { participantId },
  });
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

export async function saveCompletion(sessionId, data) {
  await apiRequest("completion", {
    method: "POST",
    json: { sessionId, data },
  });
}

export async function listSessions() {
  return collectSessions((cursor) =>
    apiRequest("list", { query: cursor ? { cursor } : {} }),
  );
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

// Shared by the coder and uploader. Only publish the list after every page loads.
async function collectSessions(loadPage) {
  const sessions = [];
  const skipped = [];
  let cursor;
  do {
    const page = await loadPage(cursor);
    sessions.push(...(page.sessions || []));
    skipped.push(...(page.skipped || []));
    cursor = page.cursor;
  } while (cursor);
  const participantNumber = (session) => {
    const match = /^S(\d+)$/i.exec(String(session.meta?.participant_id || ""));
    return match ? Number(match[1]) : null;
  };
  sessions.sort((a, b) => {
    const aNumber = participantNumber(a);
    const bNumber = participantNumber(b);
    if (aNumber != null && bNumber != null && aNumber !== bNumber) {
      return bNumber - aNumber;
    }
    if (aNumber != null && bNumber == null) return -1;
    if (aNumber == null && bNumber != null) return 1;
    return new Date(b.savedAt) - new Date(a.savedAt);
  });
  Object.defineProperty(sessions, "loadWarnings", {
    value: skipped.sort((a, b) => a.id.localeCompare(b.id)),
    enumerable: false,
  });
  return sessions;
}
