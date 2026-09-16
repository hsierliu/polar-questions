import { BASE_PATH, assertSessionId, downloadText, sessionPath } from "./dropbox.js";

export async function listSessions(dbx, cursor) {
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

