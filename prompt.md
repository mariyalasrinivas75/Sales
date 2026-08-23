# Project prompt for Claude (Antigravity) — Sales Employee Daily Tracker

Paste everything below into Antigravity as the project brief. It assumes the accompanying `PLAN.md` is also available to you as reference context — read it fully before writing any code, and treat it as the source of truth for architecture decisions.

---

## Project

Build a small internal system for tracking daily sales activity of up to 20 employees: **three frontends, one shared Supabase backend**:

1. **One Android app** (React Native / Expo, single APK, distributed by direct sideload — no Play Store) used by **both** employees and admin. After login, the app checks the logged-in user's role in Supabase and routes to one of two completely separate navigation stacks: an employee stack (daily question flow, voice input, alarm system) or an admin stack (management/analytics dashboard). This is one codebase, one build, one APK — not two separate apps.
2. **iOS employee web app** (a responsive web app / PWA — NOT a native app, no App Store, no Apple Developer account — opened in Safari and added to the home screen). Employee-only; no iOS admin surface exists.
3. **Admin web dashboard** (React + Vite, web, deployable to Vercel/Netlify) — a separate codebase from the Android app (web vs. native), for admins who prefer a desktop/browser workflow. Same Supabase backend and feature set as the Android app's admin stack.

This split exists for a specific reason: true force-kill-surviving alarms are only achievable on Android; a native iOS app would cost $99/year (Apple Developer Program) for no real reliability gain over a web app, since Apple's force-quit restriction applies identically to native apps and PWAs. Do not suggest building a native iOS app unless the user explicitly asks and accepts that cost. No iOS admin app was requested — admin on iPhone uses the web dashboard.

**Admin never receives reminders, buzzes, or scheduled prompts of any kind, on any surface.** Admin's role is purely management and visibility: add/remove/deactivate employees, manage question categories, view analytics and live status, mark employees on leave, and download Excel exports. All alarm/notification logic in this project applies to the employee role only, and must never be armed, permission-prompted, or even code-loaded when an admin account is logged in.

This is a small internal tool for under 20 people. Do not over-engineer — no need for multi-tenant support, complex caching layers, or enterprise auth flows. Optimize for correctness and simplicity over scalability. Inside the Android app, keep the employee and admin navigation stacks cleanly separated (e.g., `app/employee/*` vs `app/admin/*`) sharing one login gate and one Supabase client, so admin never accidentally pulls in alarm-related native code paths.

## Hard constraints — read carefully before designing anything

1. **The Android app is one app with role-based routing, not two apps.** A single login screen; after Firebase Auth succeeds, look up the account's role from Supabase (`employees` vs `admins` table) and render the appropriate stack. Do not scaffold this as two separate Expo projects or two separate APKs.
2. **Alarm/buzz platform split is real and must not be papered over, and applies to the employee role only.** Within the Android app's employee stack, use `AlarmManager` + a foreground `Service` (native module) for exact, force-kill-surviving alarms with full-screen intent, loud sound, and strong vibration. The iOS employee PWA must use Web Push, triggered server-side by a Supabase Edge Function on `pg_cron` at each of the 7 scheduled times, delivered via the Notifications API — this does NOT survive a force-quit of Safari/the PWA, and that limitation must be documented in code comments and the app's onboarding copy, not hidden. Do not claim or attempt to build "true alarm on iOS via force-quit" — it is not possible for any third-party app, native or web. **The admin stack (in the Android app) and the admin web dashboard implement no part of this alarm system** — no `AlarmManager` module, no web push subscription, no permission prompts, nothing.
3. **No answer by deadline = 0, permanently, no retry.** This is a strict business rule. At 9:30 for morning ("plan") and 5:30 for evening ("achievement") — actually, use the values from `notification_config`, do not hardcode times in application logic, only as seed defaults.
4. **Voice is important but must never block progress.** Every voice-input screen must have an equally-accessible typed numeric keypad fallback, always visible, not hidden behind an error state.
5. **Admin can add/remove/edit question categories at any time.** Do not hardcode the 7 categories (Savings, Current, Fixed Deposit, Life Insurance, Value, Assets, Other Products) anywhere except as seed data — the schema and UI must treat questions as fully dynamic.
6. **Excel export must map columns exactly like the source sheet**: `Emp Code | Emp Name | [Category] Plan | [Category] Ach | [Category2] Plan | [Category2] Ach | ...` — one Plan/Ach column pair per active question, in `sort_order`.
7. **Everything must run on free tiers.** Firebase Auth (free), Supabase (free tier — Postgres + Realtime + Edge Functions), Vercel/Netlify (free) for the admin dashboard. Do not introduce any paid service without flagging it explicitly back to the user first.
8. **Employees never self-register.** Admin creates accounts (Firebase Auth user + `employees` row). Login screens are sign-in only, no registration flow anywhere.
9. **Row Level Security is mandatory from the first migration**, not added later. Employees can only read/write their own `daily_answers` and `daily_status` rows and can never update a row for a past `answer_date`. Admin role gets broader read/manage access via RLS policy, not by bypassing RLS.

## Tech stack to use

- **The Android app (single app, both roles):** React Native via **Expo**, using a **dev client / prebuild** (not Expo Go) because the employee stack's alarm feature requires a custom native module. Root-level role-based routing after login sends the user into either the employee stack or the admin stack.
- **iOS employee app:** a plain responsive **web app (PWA)** — React (Vite), a web manifest for "Add to Home Screen" installability, and a service worker to receive Web Push. This is a separate frontend from the Android app, not a shared React Native codebase.
- **Admin web dashboard:** React + Vite + Tailwind CSS — a separate codebase from the Android app, sharing the same Supabase schema/queries conceptually.
- **TypeScript** throughout, all three frontends.
- **Supabase** (Postgres) as the database, using their JS client (`@supabase/supabase-js`) directly from all three frontends — no custom backend server needed except the small Edge Functions below.
- **Firebase Authentication** for login (email/password is sufficient — admin pre-creates employee accounts; admin accounts can be set up directly in Firebase/seeded), shared across all three frontends, with role (`employee`/`admin`) read from the Supabase `employees`/`admins` tables after auth, not encoded in Firebase itself or via separate login flows.
- **Android employee-stack voice:** `@react-native-voice/voice` for speech-to-text, `expo-speech` for text-to-speech.
- **iOS employee PWA voice:** browser-native **Web Speech API** (`SpeechRecognition` for STT, `SpeechSynthesis` for TTS) — free, no extra dependency.
- A small custom **Kotlin native module** for the Android app's **employee stack** `AlarmManager` + foreground `Service` + full-screen intent alarm UI (research current best-practice APIs — `setExactAndAllowWhileIdle`, `USE_FULL_SCREEN_INTENT`, `VibrationEffect` — and confirm against current Android docs since exact-alarm permission rules have changed across API levels). **Never invoke this module from the admin stack** — admin has no alarms, and the alarm-permission prompts (exact-alarm, battery-optimization exemption) must only appear for employee logins.
- **Web Push API** (VAPID keys, service worker `push` event) for the iOS employee PWA's notifications, triggered by a Supabase Edge Function on a `pg_cron` schedule — do not attempt to use `expo-notifications` for the iOS path since that's a native-only library and there is no native iOS app in this project.
- **`xlsx`** (SheetJS) for generating the Excel export client-side, used identically in the Android app's admin stack and the admin web dashboard.
- **Supabase Edge Functions + `pg_cron`** for (a) the nightly auto-zero sweep and (b) firing the iOS employee web push payloads at each scheduled time.

## Data model

Use the schema in `PLAN.md` §3 exactly (`employees`, `admins`, `questions`, `daily_answers`, `daily_status`, `notification_config`). Write it as a versioned Supabase migration (`supabase/migrations/`), including the RLS policies described in §3 and §7 above. Seed `questions` with the 7 categories from the user's source spreadsheet (Savings, Current, Fixed Deposit, Life Insurance, Value, Assets, Other Products) as initial/default data, not as hardcoded logic.

## Build order — follow this sequence, don't jump ahead

Follow `PLAN.md` §9 exactly:

1. Supabase schema + RLS + seed data.
2. Firebase Auth wiring for all three frontends (the single Android app, the iOS employee web app, the admin web dashboard) — one login screen per frontend, role read from Supabase after auth.
3. Admin web dashboard: employee CRUD, question CRUD, per-day leave toggle. Verify data flows correctly before touching the Android app or notifications.
4. Android app admin stack: build this as one of the two role-routed navigation stacks in the single Android app codebase, reusing logic from step 3 where practical — this should be largely mechanical since there's no native alarm work on the admin side.
5. Android app employee stack + iOS employee web app: build the typed-only daily question flow (plan/AM and achievement/PM phases, deadline-lock rule) as the second navigation stack in the Android app and as the iOS PWA. Prove this works end-to-end on both before adding voice or alarms. Confirm role-based routing correctly sends employee logins here and admin logins to step 4's stack, from the same login screen.
6. Layer voice (STT/TTS) on top of the Android app's employee stack and the iOS PWA — `@react-native-voice/voice`/`expo-speech` on Android, Web Speech API on the iOS PWA. Typed keypad must remain visible throughout on both.
7. Add the Android `AlarmManager` native module, wired so it only ever activates within the employee stack. Separately: iOS employee PWA web push setup — VAPID keys, service worker, the Edge Function + `pg_cron` trigger, and the "Add to Home Screen" + notification-permission onboarding flow. Treat these as fully separate tasks with different mechanisms — do not conflate them or assume one implementation covers both. Confirm neither touches the admin stack or the admin web dashboard.
8. Live leaderboard (Supabase Realtime subscription) + Excel export button in both the Android app's admin stack and the admin web dashboard.
9. Nightly auto-zero Edge Function (safety net for both employee platforms).
10. Distribution: produce one signed, shareable Android APK covering both roles; deploy the iOS employee PWA + admin web dashboard to Vercel/Netlify and document onboarding steps for iPhone employees (open URL → Add to Home Screen → allow notifications) and for admins (open the dashboard URL, or use the Android app if on that platform).

## What to ask the user before proceeding, if anything is unclear

- Whether they have (or want to set up) a Firebase project and Supabase project already, or need step-by-step setup instructions first.
- How they want to distribute the single Android APK to both employees and admin — direct file share, a simple download link, etc. — this affects nothing architecturally but is worth confirming.
- Exact wording/order they want for the spoken questions (defaults can come from the seeded category names, e.g. "How many Savings today?").

## Definition of done for a first working milestone

Not the full system — just: an employee (on the Android app's employee stack or the iOS web app) can log in, get asked all active questions via typed input, submit, see it stored correctly with plan/ach separation; an admin (on the Android app's admin stack or the web dashboard) can log in, see that employee's live answer, and export it to an .xlsx matching the required column layout. Get this loop solid on all three frontends before adding alarms and voice.
