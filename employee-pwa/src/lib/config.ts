// Firebase configuration — same credentials as admin dashboard
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID",
};

// Supabase configuration — same as admin dashboard
export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL || "https://YOUR_PROJECT.supabase.co",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR_ANON_KEY",
};

// VAPID public key for Web Push subscriptions (iOS PWA reminders)
export const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";
