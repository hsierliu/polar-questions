import { verifyFirebaseToken } from "./firebase-admin.js";

function parseEmails(value) {
  return new Set(
    String(value || "")
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
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

export async function authenticate(req) {
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

export async function requireRole(req, allowedRoles) {
  const user = await authenticate(req);
  if (!allowedRoles.some((role) => user.roles.includes(role))) {
    const error = new Error("You do not have permission for this action");
    error.status = 403;
    throw error;
  }
  return user;
}
