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

export const auth = getAuth(app);
