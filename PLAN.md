# Sales Employee Daily Tracker — Full Project Plan

**Scope:** Internal tool, ≤20 employees, ≤1 admin/small admin team. **Two frontends total:** one Android app (single APK, shows the admin dashboard or the employee flow depending on who logs in) and one iOS web app (employee flow only, since no iOS admin surface was requested — admin on iPhone can just use a browser against the same web dashboard if needed). One shared Supabase backend. Every technology chosen is free-tier. Optimized for reliability at small scale over "enterprise-ready."

---

## 1. Read this first — final decided architecture: one Android app (role-routed) + iOS employee web app

You asked for a real alarm-clock-style buzz that fires even if the app is force-killed, at 9:00, 9:15, 9:30, 5:00, 5:15, 5:30, 5:45. This is only fully achievable on Android. After discussing the tradeoffs, the decided approach is a **platform split**, not one app for both:

- **Android employees → native app, installed via direct APK sideload (no Play Store).** `AlarmManager` (exact alarms) + a native foreground service plays sound/vibration and survives force-kill, just like a real alarm clock app. Sideloading also means Play Store's exact-alarm permission review doesn't apply — one less thing to worry about. Requires the employee to grant "exact alarm" + disable battery optimization once, at install.

- **iPhone employees → the same product, but as a website (PWA — Progressive Web App), not an installed app.** Same login, same question flow, same voice input, same Supabase backend, same admin dashboard/Excel export. No Apple Developer account, no App Store, no .ipa build. Employee opens the site in Safari once and taps "Add to Home Screen," which makes it behave like an installed app (icon on home screen, opens full-screen). From there it can send scheduled notifications with sound while the phone is locked or the app is backgrounded — same underlying iOS limitation as a native app would have (Apple does not allow **any** third-party app, installed or web-based, to run code or guarantee sound after the user force-quits it — this is an OS-level rule, not a store policy, so a native iOS app would hit the identical ceiling). If the employee never adds it to the home screen and just visits the URL in a browser tab, no reliable buzz at all — plain browser tabs get suspended by iOS.

**Why this split and not a native iOS app too:** a native iOS app on real iPhones requires an Apple Developer account ($99/year) purely to install it (via TestFlight or similar) — there is no free path to get custom software onto an iPhone, sideloading or not. The web-app route for iOS avoids that cost entirely while landing at the same practical alarm reliability (notification-level, not full alarm-clock level, on both approaches).

**Bottom line cost: $0 total**, covering all Android employees (full native alarm) and all iPhone employees (web app, notification-level buzz), as long as iPhone employees add the site to their home screen at onboarding — make that step 1 of onboarding for them, not optional.

Everything below assumes this structure: **one shared backend, one Android app (role-routed after login), one iOS employee web app, and a browser-accessible admin web dashboard as the desktop/web entry point for admin.**

---

## 2. User roles & core features

### 2.1 Admin
Admin logs into the **same Android app as employees** and lands on a completely different dashboard based on their role (§2.1a) — plus a browser-based web dashboard for desktop use. No alarm/reminder logic applies to admin at all — admin never receives buzzes, reminders, or scheduled prompts of any kind, regardless of which surface they're on. Admin's entire role is management and visibility:
- Login (Firebase Auth — same login screen as employees; role read from the `admins`/`employees` tables after auth determines which UI renders).
- **Employee management:** add employee (name, emp code, phone, email, join date), edit, deactivate/delete, mark employee "on leave for today" (skips all reminders/buzzes/reports for that employee for that day only, auto-resets next day).
- **Question management:** add/edit/remove/reorder daily questions (category name, e.g. "Savings", "Current", "Fixed Deposit" — matches your Excel's Plan/Ach column pairs). Each question is auto a Plan (AM) + Ach (PM) pair. Admin can also add non-paired free-text/number questions if needed later.
- **Dashboard / analytics:** today's status per employee (not started / answered plan / pending eod / completed / defaulted-zero), live leaderboard (ranked by total achievement, or achievement-vs-plan %, admin picks metric), trends over time (daily/weekly/monthly totals per employee and per category, plan-vs-achieved gaps).
- **Records:** view any past date, any employee, full history table.
- **Excel export:** download any date range as .xlsx, columns mapped exactly like your sheet — Emp Code, Emp Name, then a Plan/Ach column pair per question/category, values numeric, unanswered = 0.
- **Notification config:** edit the 7 employee buzz times if needed later (kept as admin-editable settings, not hardcoded) — default 09:00/09:15/09:30 (AM prompts) and 17:00/17:15/17:30 (PM prompts) and 17:45 (final "all reports" compilation, admin-facing only, not employee-facing). This is the one place admin *configures* reminders — admin still never *receives* them.

### 2.1a One Android app, two logins, two dashboards
There is **one Android app and one APK**, not two. After login, the app checks the logged-in user's role in Supabase and renders one of two completely different experiences:
- **Employee logs in → the daily question flow, voice/typed answers, and the alarm system described in §2.2 and §4.** The native alarm module (§4) is only ever armed for this role.
- **Admin logs in → the management/analytics dashboard described in §2.1 above.** No alarm module, no scheduled buzzes, no voice/TTS screens — a completely different navigation stack within the same app.
- This is a single React Native/Expo codebase with role-based routing at the root — think of it as two apps' worth of screens sharing one login gate, one Supabase client, and one build. Keep the two navigation stacks cleanly separated (e.g., `app/employee/*` vs `app/admin/*`) so admin never accidentally pulls in alarm-related native code paths, and so the alarm permissions (exact-alarm, battery-optimization-exemption) are only ever requested when an employee account logs in — not shown to admins at all.
- **Admin web dashboard** (React + Vite, hosted on Vercel/Netlify) exists alongside this for anyone who prefers a browser/desktop — same Supabase backend, same features as the admin side of the app, just a separate frontend for convenience. This is the one place a second admin-facing codebase genuinely exists, since a phone app and a desktop-oriented web dashboard are different enough experiences to be worth building separately; everything else (employee vs. admin) is one shared codebase split by login.
- No iOS admin app was requested or is needed — an admin on iPhone uses the web dashboard in Safari.

### 2.2 Employee
- Login (Firebase Auth, admin pre-creates the account; employee just signs in — no self-registration, keeps it locked to your 15–20 people).
- Receives buzzes on schedule (see §4).
- **Morning flow (9:30 hard deadline):** app reads out each question ("How many Savings accounts today?") via text-to-speech, employee answers by voice ("five") or by typing a number, system captures/normalizes to an integer, confirms, moves to next question automatically. Any question not answered by 9:30 → auto-recorded as 0, no retry, no override, and if the employee opens the app after the deadline the plan section shows locked/zeroed.
- **Evening flow (5:30 hard deadline for input, 5:45 = system finalizes):** same flow, asking achievement per category ("How many Savings accounts did you achieve?"). Same 0-if-unanswered rule.
- Employee can see their own day's plan vs. achieved and simple personal history/streak — motivational, not required, but cheap to add and good for adoption.
- Employee cannot edit past answers.

---

## 3. Data model (Supabase / Postgres)

```sql
-- Employees (mirrors Firebase Auth UID)
employees (
  id            uuid primary key,           -- = Firebase UID
  emp_code      text unique not null,
  name          text not null,
  phone         text,
  email         text,
  active        boolean default true,
  created_at    timestamptz default now()
)

-- Admins (small table, could also be a boolean flag on employees, kept separate for clarity)
admins (
  id            uuid primary key,           -- = Firebase UID
  name          text,
  email         text
)

-- Question categories — admin-editable, matches Plan/Ach column pairs in Excel
questions (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,              -- "Savings", "Current", "Fixed Deposit", etc.
  sort_order    int not null,
  active        boolean default true,       -- soft delete, keeps historical data intact
  created_at    timestamptz default now()
)

-- One row per employee per question per day per phase (plan/ach)
-- This is the core table the Excel export is built from.
daily_answers (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid references employees(id),
  question_id   uuid references questions(id),
  answer_date   date not null,
  phase         text check (phase in ('plan','ach')),
  value         int not null default 0,
  input_method  text check (input_method in ('voice','typed','auto_zero')),
  answered_at   timestamptz,
  unique (employee_id, question_id, answer_date, phase)
)

-- Daily employee status — drives the admin dashboard's live view
daily_status (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid references employees(id),
  status_date       date not null,
  is_leave          boolean default false,   -- admin toggles; skips all buzzes for this date
  plan_started_at   timestamptz,
  plan_completed_at timestamptz,
  ach_started_at    timestamptz,
  ach_completed_at  timestamptz,
  unique (employee_id, status_date)
)

-- Notification schedule — admin-editable, not hardcoded in app
notification_config (
  id          int primary key default 1,
  slot_key    text,     -- 'am_reminder_1','am_reminder_2','am_deadline','pm_reminder_1','pm_reminder_2','pm_deadline','pm_final'
  fire_time   time,     -- default 09:00 / 09:15 / 09:30 / 17:00 / 17:15 / 17:30 / 17:45
  label       text
)
```

Row Level Security: employees can only `select`/`insert` their own `daily_answers`/`daily_status` rows (via `auth.uid() = employee_id`), never update/delete past dates. Admins get a service-role-backed API for full read + the management writes (employees, questions, leave toggle). This is the single most important security rule in the whole app — get RLS right and most other security concerns fall away for a 20-person internal tool.

---

## 4. Notification / buzz architecture

**Two-layer design, because "notification" and "alarm" are different problems:**

### Layer 1 — Scheduling (what decides *when*)
Each morning (or on login), the app computes today's 7 fire-times from `notification_config`, skipping entirely if `daily_status.is_leave = true` for that employee/date.

### Layer 2 — Delivery (what actually buzzes)

**Android (native app, sideloaded APK):**
- `AlarmManager.setExactAndAllowWhileIdle()` schedules each of the 7 alarms as native Android alarms (not FCM push — pure on-device scheduling, which is why it survives no-internet and app-kill).
- Each alarm fires a `BroadcastReceiver` → starts a foreground `Service` → plays a loud looping alarm sound + strong vibration pattern (`VibrationEffect`) → shows a full-screen intent notification (the kind that wakes the screen, like an alarm clock or incoming call) → stops when employee taps "I'm here" or completes that question set.
- Needs `SCHEDULE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `VIBRATE`, `WAKE_LOCK`, `FOREGROUND_SERVICE` permissions and one-time battery-optimization-exemption prompt at first login. Implement via a small native module (`react-native-alarm-module` pattern or a thin custom Kotlin bridge — no free package does the *full-screen exact alarm* behavior out of the box reliably, so budget 1 native file). Sideloading (not Play Store) means no store review gate on `SCHEDULE_EXACT_ALARM` usage.

**iOS (PWA, added to home screen via Safari):**
- Web Push API + Notifications API, scheduled client-side and backed by a Supabase Edge Function that sends the push payload at each of the 7 times (web push needs a server-side trigger, unlike the on-device Android alarm — this is the one place iOS needs a small always-on scheduling job, covered by `pg_cron` in the free tier).
- Requires the employee to have added the site to their home screen (installs it as a PWA) and granted notification permission — both one-time steps to walk through at onboarding.
- Same ceiling as a native iOS app: works while locked/backgrounded, does not survive a force-quit of Safari/the PWA. This is an iOS platform rule, not a limitation of the web-app approach specifically.
- Re-registers its push subscription every time the employee opens the PWA, to keep it alive.

**Why not Firebase Cloud Messaging (FCM) for Android:** FCM requires network + Google Play Services delivery and is not reliable to the second, and standard push notifications (not full-screen alarm UI) don't vibrate/sound the way an alarm clock does, and are trivially swipe-dismissable without action. Android uses on-device `AlarmManager` as primary since it doesn't need this problem at all.

---

## 5. Voice input

- **Speech-to-text (employee answering):** `@react-native-voice/voice` (free, wraps native iOS `SFSpeechRecognizer` / Android `SpeechRecognizer`, on-device, no API cost). Employee taps mic, says a number, library returns text, app extracts the first integer found (e.g. handles "five" via a small word-to-number map for 0–100, plus digit parsing for "5"). If parsing fails or confidence is low, app asks the employee to confirm or falls back to the type-a-number keypad — no dead ends.
- **Text-to-speech (app reading questions):** `expo-speech` (free, on-device, no API cost) reads each question label aloud before capturing the answer.
- **Typed fallback:** always available as a big numeric keypad below the mic button — never gated behind voice failing, exactly as you specified.

---

## 6. Tech stack (all free tier)

| Layer | Choice | Why / free-tier limits |
|---|---|---|
| Android app (single app, both roles) | React Native (Expo, prebuild/dev-client for the native alarm module), role-routed after login into an employee stack or an admin stack | Free. Needs a prebuild/dev-client (can't stay in pure Expo Go) because of the employee-side alarm module — the admin stack within the same app just doesn't use it. Distributed as one sideloaded APK — no Play Store. |
| iOS employee app | **Not a native app.** A responsive web app (PWA), opened via Safari and added to home screen. Employee-only — no iOS admin surface. | Free. Zero App Store, zero Apple Developer account, zero .ipa builds. |
| Admin web dashboard | React (Vite) + Tailwind, calling Supabase client directly | Free to build/host. A separate codebase from the Android app by nature (web vs. native), but shares the same Supabase schema/queries conceptually. Exists for anyone who prefers a desktop/browser workflow over the phone app. |
| Auth | Firebase Authentication | Free tier: unlimited email/password users, way beyond 20. One login screen on the Android app for both roles; role is looked up from Supabase after auth, not a separate login flow. |
| Database | Supabase (Postgres) | Free tier: 500MB DB, 2GB bandwidth/mo — enormous headroom for 20 employees × a handful of int rows per day. |
| Realtime dashboard updates | Supabase Realtime (Postgres change subscriptions) | Included free; both the Android app's admin stack and the web dashboard subscribe to the same Realtime channel, so either one live-updates as employees answer. |
| Voice (STT) | `@react-native-voice/voice` on the Android app's employee stack · Web Speech API (`SpeechRecognition`) on the iOS employee PWA | Free, on-device/browser-native, no per-call API cost on either platform. Never loaded on the admin stack. |
| Voice (TTS) | `expo-speech` on the Android app's employee stack · Web Speech API (`SpeechSynthesis`) on the iOS employee PWA | Free on both. Never loaded on the admin stack. |
| Android alarm/vibration | `AlarmManager` + custom Kotlin native module — **wired up only when an employee account is logged in** | Free, no dependency limits. Admin login never triggers the alarm-permission prompts or arms this module. |
| iOS PWA notifications | Web Push API + Notifications API, triggered server-side — **employee iOS web app only** | Free. Requires "Add to Home Screen" + notification permission granted once at onboarding. Admin never receives buzzes on any surface. |
| Push scheduling trigger for iOS | Supabase Edge Function + `pg_cron` sends the web push payload at each of the 7 scheduled times | Free tier covers this easily at 20 users. (Android app's alarms are on-device only, no server trigger needed. Not used by admin at all.) |
| Excel export | `xlsx` (SheetJS) — generate client-side, same library on both the Android app's admin stack and the web dashboard | Free, no server needed. |
| Hosting — admin web dashboard AND the iOS employee PWA | Vercel or Netlify (either works; user specified both as options) — can be the same hosting project or two separate free projects | Free tier plenty for this volume. |
| Scheduled server-side jobs (nightly auto-zero sweep + iOS push trigger) | Supabase Edge Functions + `pg_cron` | Free tier covers a handful of scheduled jobs/day easily. |
| Android app distribution | One APK, shared by employees and admins — direct sideload, install manually (enabling "install from unknown sources" once) | Free, no Play Store review needed since it's not published. |
| iOS distribution | None needed for employees — it's a URL, not an install. No iOS admin app exists; admin on iPhone uses the web dashboard in Safari. | Free. This is what removes the $99/year Apple Developer cost entirely, for every role. |

**Total recurring cost: $0/month, with no exceptions.**

---

## 7. System architecture

```
┌───────────────────────────────┐  ┌──────────────────────┐  ┌────────────────────────┐
│      One Android App           │  │  iPhone Employee      │  │  Admin Web Dashboard     │
│  (React Native/Expo,            │  │  Web App / PWA         │  │  (React + Vite, Vercel)  │
│   sideloaded APK)                │  │  (Safari → Add to      │  │                          │
│                                   │  │   Home Screen, web      │  │                          │
│  ┌─────────────┐ ┌─────────────┐│  │   push)                 │  │                          │
│  │ Employee     │ │ Admin        ││  └──────────┬─────────────┘  └────────────┬─────────────┘
│  │ stack:       │ │ stack:        ││             │  Firebase Auth               │  Firebase Auth
│  │ questions,   │ │ CRUD,         ││             │  Supabase client              │  Supabase client
│  │ voice, alarm │ │ analytics,    ││             │                               │
│  │ module       │ │ Excel export  ││             │                               │
│  └──────┬───────┘ └──────┬───────┘│             │                               │
│         │  chosen by role after login             │                             │
└─────────┼────────────────┼────────┘             │                               │
          │  Firebase Auth │ Firebase Auth          │                              │
          │  Supabase      │ Supabase                │                              │
          ▼                ▼                         ▼                              ▼
   ┌───────────────────────────────────────────────────────────────────────────────────┐
   │                                Supabase (Postgres)                                   │
   │  - employees, questions, daily_answers,                                               │
   │    daily_status, notification_config                                                  │
   │  - Row Level Security (employee accounts isolated to their own rows; admin role        │
   │    gets full read/manage access, same policy whether hitting it from the Android        │
   │    app's admin stack or the web dashboard)                                              │
   │  - Realtime subscriptions → both admin surfaces live-update identically                  │
   │  - Edge Functions:                                                                        │
   │      • nightly-auto-zero (safety net sweep)                                               │
   │      • ios-push-trigger (fires web push at each of the 7 times, employee-only)            │
   │      • excel-export (optional server-side generator, used by either admin surface)         │
   └───────────────────────────────────────────────────────────────────────────────────┘

   Alarm/buzz delivery — employees only, two different mechanisms by necessity:
   Android app's employee stack → AlarmManager + foreground Service, purely on-device (survives kill)
   iOS employee PWA              → Web Push, triggered by the Supabase Edge Function above (survives background, not force-quit)
   Admin (Android app's admin stack, or the web dashboard) → no alarms, no scheduled buzzes, ever.
```

The Android app's employee-side buzz is deliberately **not** server-dependent — it's scheduled on-device once the app has synced today's config and leave-status, so it fires even with no internet. iOS's PWA buzz *does* need the small server-side trigger above (`pg_cron` firing web push at each scheduled time) since Web Push requires a server to originate the push. Admin, whether inside the Android app or on the web dashboard, is an ordinary CRUD/read client with zero notification logic. Neither adds meaningful load: 20 employees × 7 pushes/day, plus occasional admin reads/writes, is trivial on the free tier.

---

## 8. Reliability at 20 users (won't crash under load)

Realistically, "20 employees" means at most ~20 concurrent writes twice a day, each write being a handful of small integer rows — this is nowhere near any free-tier limit on Supabase (which comfortably handles far higher). The actual risks worth designing against are different:

- **Missed alarms** (phone OS killed the app, permissions revoked) → mitigated by the 17:45 admin-facing "all reports" compile step plus the nightly auto-zero Edge Function sweep, so a missed buzz still results in a correctly zeroed, visible record rather than a silent gap.
- **Duplicate submissions** (employee answers twice) → prevented by the `unique(employee_id, question_id, answer_date, phase)` constraint — second write just upserts, no duplicate rows possible.
- **Clock drift / timezone bugs** → store all times in one fixed timezone server-side (IST, since this is India-based), don't rely on device local time for the auto-zero deadline logic, only for the on-device alarm firing itself.
- **Admin download while data is mid-day / incomplete** → export always reflects current DB state at click-time; unanswered = 0, matches the "no answer = zero" rule you specified, so there's no ambiguous "blank" state to worry about.

---

## 9. Build phases (suggested order)

1. Supabase schema + RLS policies + seed the 7 categories from your Excel.
2. Firebase Auth wired to all three frontends (the single Android app, the iOS employee web app, and the admin web dashboard — one auth system, one login screen per frontend, role read from Supabase after auth, not a separate login flow per role).
3. Admin web dashboard: employee CRUD, question CRUD, leave toggle — get data flowing before touching notifications or the Android app.
4. Android app admin stack: same features as the web dashboard, same Supabase queries — build this as one of the two role-based navigation stacks in the single Android app codebase, reusing logic from step 3 where practical.
5. Android app employee stack + iOS employee web app: build the typed-only "answer today's questions" flow once conceptually, then implement it as the second navigation stack inside the Android app and as the iOS PWA. Prove this works end-to-end on both before adding voice or alarms. Confirm role-based routing correctly sends employee logins to this stack and admin logins to the stack from step 4, from the same login screen.
6. Add voice (STT/TTS) to the Android app's employee stack and the iOS PWA — `@react-native-voice/voice`/`expo-speech` on Android, Web Speech API on the iOS PWA.
7. Add the Android `AlarmManager` native module, wired so it only activates within the employee stack (never armed or permission-prompted for admin logins). Separately, add the iOS Edge Function push-trigger + PWA notification permission flow + "Add to Home Screen" onboarding prompt.
8. Add live leaderboard + Excel export to both the Android app's admin stack and the web dashboard.
9. Add nightly auto-zero Edge Function as the safety net (covers missed alarms on both employee platforms).
10. Distribution: package the single Android app as one signed APK covering both roles, send directly to everyone (employees and admin alike — the app just looks different after they log in); deploy the iOS employee web app + admin web dashboard to Vercel/Netlify and document onboarding (iPhone employees: add to home screen + allow notifications; admin: open the dashboard URL, or use the Android app if on that platform).

---

## 10. What to build next

The accompanying `prompt.md` is written to hand directly to Claude in Antigravity (or Claude Code) to scaffold this project against this plan.
