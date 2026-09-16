// Shared by the coder and uploader. Only publish the list after every page loads.
export async function collectSessions(loadPage) {
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
