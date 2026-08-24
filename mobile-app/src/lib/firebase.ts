import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  // @ts-ignore – React Native specific persistence
  getReactNativePersistence,
  type User,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { firebaseConfig } from "./config";

const app = initializeApp(firebaseConfig);

// Use AsyncStorage for persistence on React Native
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export async function signIn(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

const SIGNUP_ERROR_MESSAGES: Record<string, string> = {
  EMAIL_EXISTS: "An account with this email already exists.",
  INVALID_EMAIL: "That email address looks invalid.",
  WEAK_PASSWORD: "Password must be at least 6 characters.",
  MISSING_PASSWORD: "Password is required.",
  MISSING_EMAIL: "Email is required.",
};

/**
 * Creates a new Firebase Auth account via the public Identity Toolkit REST API
 * (the same call the client SDK's createUserWithEmailAndPassword makes internally).
 * Using raw fetch here instead of the SDK avoids signing the admin out of their own
 * session — the SDK version signs in as the newly created user.
 */
export async function createEmployeeAccount(email: string, password: string): Promise<string> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    const code = data?.error?.message?.split(" ")[0] ?? "";
    throw new Error(SIGNUP_ERROR_MESSAGES[code] || data?.error?.message || "Failed to create account");
  }
  return data.localId as string;
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export type { User };
