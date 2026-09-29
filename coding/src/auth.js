import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

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

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";

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
  const response = await fetch("/api/me", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "This account is not authorized.");
  }
  return data;
}
