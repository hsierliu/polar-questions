import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingFirebaseValues = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([name]) => name);

export const firebaseConfigurationError = missingFirebaseValues.length
  ? `Missing Firebase configuration: ${missingFirebaseValues.join(", ")}`
  : "";

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);


const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutUser() {
  return signOut(auth);
}

export async function getIdToken() {
  if (!auth.currentUser) {
    throw new Error("You must sign in again.");
  }
  return auth.currentUser.getIdToken();
}

export async function getAccessProfile() {
  const token = await getIdToken();
  const response = await fetch("/api/dropbox?action=me", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "This account is not authorized.");
  }
  return data;
}

// Dropbox requests through the authenticated server AP1 (below 4.5 MB limit)
const CHUNK_SIZE = 4 * 1024 * 1024;

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
    // Keep the HTTP error fallback when the server returns non-JSON content.
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

export async function saveCompletion(sessionId, data, rows) {
  return apiRequest("completion", {
    method: "POST",
    json: { sessionId, data, rows },
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

export async function loadAdminStatus() {
  const emails = new Set();
  const sessions = await collectSessions(async (cursor) => {
    const page = await apiRequest("admin-status", { query: cursor ? { cursor } : {} });
    for (const email of page.emails || []) emails.add(email);
    for (const session of page.sessions || []) {
      for (const email of Object.keys(session.completions || {})) emails.add(email);
      for (const email of session.pending || []) emails.add(email);
    }
    return page;
  });
  const headings = [...new Set([...emails].map((email) => email.split("@")[0]))];
  return { sessions, emails: headings.sort() };
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

// Temporary migration controls; remove after the live data migration is verified.
export async function migrationRequest(participant, token, folderName) {
  const authToken = await getIdToken();
  const query = participant === undefined ? "inventory=1" : new URLSearchParams({ participant, ...(folderName ? { folderName } : {}) });
  const response = await fetch(`/api/migrate?${query}`, {
    method: token ? "POST" : "GET",
    headers: { Authorization: `Bearer ${authToken}`, ...(token ? { "Content-Type": "application/json" } : {}) },
    ...(token ? { body: JSON.stringify({ participant, token, folderName, confirm: "APPLY REVIEWED MIGRATION" }) } : {}),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Migration request failed");
  return result;
}
