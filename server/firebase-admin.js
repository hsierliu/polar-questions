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

export async function verifyFirebaseToken(token) {
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
