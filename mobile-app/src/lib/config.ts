// Firebase configuration for the mobile app
// Uses the same Firebase project as admin dashboard and employee PWA.
// Set these in your .env or replace directly.

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "YOUR_APP_ID",
};

export const supabaseConfig = {
  url: process.env.EXPO_PUBLIC_SUPABASE_URL || "https://YOUR_PROJECT.supabase.co",
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "YOUR_ANON_KEY",
};
