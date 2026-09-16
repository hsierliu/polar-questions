export function createSessionId(participantId, timestamp = Date.now()) {
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
