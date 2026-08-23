# Sales Employee Daily Tracker — Setup Guide

This guide walks you through setting up the complete system from scratch.

## Prerequisites

- Node.js 18+ installed
- A Google account (for Firebase)
- A GitHub account (for Supabase, optional)

---

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **"New Project"**
3. Choose a name (e.g., `sales-tracker`), set a database password, pick a region (Mumbai for India)
4. Wait for the project to be created (~2 minutes)

### Get your credentials:

5. Go to **Settings → API** in the Supabase dashboard
6. Copy:
   - **Project URL** (e.g., `https://abcdefg.supabase.co`)
   - **anon (public) key** (starts with `eyJ...`)
   - **service_role key** (starts with `eyJ...` — keep this secret, only for edge functions)

### Run the database migration:

7. Go to **SQL Editor** in the Supabase dashboard
8. Copy the contents of `supabase/migrations/001_initial_schema.sql` and paste it into the editor
9. Click **Run** — this creates all 6 tables with RLS policies
10. Then paste and run the contents of `supabase/seed.sql` — this adds the 7 question categories and notification schedule

### Verify:

11. Go to **Table Editor** — you should see: `employees`, `admins`, `questions`, `daily_answers`, `daily_status`, `notification_config`
12. The `questions` table should have 7 rows (Savings, Current, Fixed Deposit, etc.)
13. The `notification_config` table should have 7 rows (9:00, 9:15, 9:30, 17:00, 17:15, 17:30, 17:45)

---

## Step 2: Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"**, name it (e.g., `sales-tracker`)
3. Disable Google Analytics (not needed) → **Create project**
4. Once created, click **Authentication** → **Get Started**
5. Enable **Email/Password** sign-in method

### Register a web app:

6. In Project Overview, click the **</>** (web) icon
7. Register with a nickname (e.g., `sales-tracker-web`)
8. Copy the Firebase config object:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc..."
};
```

### Create your first admin account:

9. Go to **Authentication → Users → Add user**
10. Enter the admin email and password
11. Copy the **User UID** (e.g., `abc123-def456-...`)

### Register the admin in Supabase:

12. Go back to Supabase SQL Editor and run:

```sql
INSERT INTO admins (id, name, email) 
VALUES ('PASTE_FIREBASE_UID_HERE', 'Admin Name', 'admin@company.com');
```

---

## Step 3: Configure the Admin Dashboard

1. In the `admin-dashboard/` folder, create a `.env` file (copy from `.env.example`):

```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc
VITE_SUPABASE_URL=https://abcdefg.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

2. Run the dashboard:

```bash
cd admin-dashboard
npm run dev
```

3. Open `http://localhost:5173` and log in with the admin email/password you created
4. You should see the admin dashboard with all 7 navigation items

---

## Step 4: Add Employees

### In Firebase:
1. Go to Firebase Console → Authentication → Users → Add user
2. Create an account for each employee (email + password)
3. Note down each employee's Firebase UID

### In the Admin Dashboard:
1. Go to **Employees → Add Employee**
2. Paste the Firebase UID, enter the employee code, name, etc.
3. Repeat for all employees

---

## Step 5: Configure the Employee PWA

1. In the `employee-pwa/` folder, create a `.env` file with the **same credentials** as the admin dashboard
2. Run: `cd employee-pwa && npm run dev`
3. Open in a browser — employees can now log in and answer questions

---

## Step 6: Deploy to Vercel/Netlify (Production)

### Admin Dashboard:

```bash
cd admin-dashboard
npm run build
# Deploy the `dist/` folder to Vercel or Netlify
```

Or use Vercel CLI:
```bash
npx -y vercel --prod
```

### Employee PWA:

```bash
cd employee-pwa
npm run build
# Deploy the `dist/` folder to Vercel or Netlify
```

Set the same environment variables in your Vercel/Netlify project settings.

---

## Step 7: Set Up Edge Functions (Optional — for auto-zero and iOS push)

### Nightly Auto-Zero:

1. Install Supabase CLI: `npm install -g supabase`
2. Link your project: `supabase link --project-ref your-project-ref`
3. Deploy: `supabase functions deploy nightly-auto-zero`
4. Set up pg_cron in the SQL Editor:

```sql
-- Enable pg_cron extension (run once)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule nightly auto-zero at 23:59 IST (18:29 UTC)
SELECT cron.schedule(
  'nightly-auto-zero',
  '29 18 * * *',
  $$SELECT net.http_post(
    'https://YOUR_PROJECT.supabase.co/functions/v1/nightly-auto-zero',
    '{}',
    'application/json',
    ARRAY[ARRAY['Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY']]
  )$$
);
```

### iOS Push Trigger:

Deploy similarly — requires VAPID key generation and a `push_subscriptions` table (documented in the edge function file).

---

## Folder Structure Summary

```
app-reminder-sales/
├── supabase/
│   ├── migrations/001_initial_schema.sql   ← Run in SQL Editor
│   ├── seed.sql                             ← Run after migration
│   └── functions/
│       ├── nightly-auto-zero/index.ts       ← Deploy with Supabase CLI
│       └── ios-push-trigger/index.ts        ← Deploy with Supabase CLI
├── admin-dashboard/                         ← React + Vite + Tailwind
│   └── (full admin dashboard)
├── employee-pwa/                            ← React + Vite PWA
│   └── (employee question flow + history)
└── mobile-app/                              ← (Phase 4-7: React Native/Expo)
    └── (coming next)
```

---

## What's Built So Far

| Component | Status | Description |
|---|---|---|
| Supabase Schema | ✅ Complete | 6 tables, RLS policies, indexes |
| Seed Data | ✅ Complete | 7 categories + 7 notification slots |
| Admin Dashboard | ✅ Complete | Login, Dashboard, Employees, Questions, Records, Analytics, Leaderboard, Notifications |
| Employee PWA | ✅ Complete | Login, Question Flow (voice + keypad), History |
| Edge Functions | ✅ Complete | Nightly auto-zero + iOS push trigger |
| Mobile App (Android) | 🔲 Next | React Native/Expo with alarm module |

## What's Next

- **Phase 4-5:** React Native/Expo Android app with role-based routing (employee + admin stacks)
- **Phase 6:** Voice input on Android (react-native-voice + expo-speech)
- **Phase 7:** Android AlarmManager native module (Kotlin) for force-kill-surviving alarms
