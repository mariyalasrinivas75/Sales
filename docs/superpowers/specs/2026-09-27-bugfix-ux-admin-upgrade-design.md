# Sales Tracker — Bug Fixes + UX/Admin Upgrade Plan

## Context
Three apps share one Supabase backend: `mobile-app/` (Expo RN, Android, role-routed admin/employee), `employee-pwa/` (iOS web app), `admin-dashboard/` (web). User reports:
1. **Alarms** — when admin changes times, phones don't pick them up; alarms stop firing.
2. **Question flow** — opening the app auto-starts voice questions; after goals (plan) are done, the app jumps straight into achievement questions. Not user friendly.
3. Wants more features for employee + admin.

### Root causes found
- `AlarmReceiver.kt` never re-arms after an alarm fires. `setExactAndAllowWhileIdle` is one-shot → each slot rings once, then is dead until the employee opens the app again. Admin time changes also only land when the app is opened.
- `alarms.ts:89` `isSundayIST()` early-return → on Sundays the app doesn't re-arm at all (native already skips Sunday itself).
- `pm_final` (admin-only per PLAN.md) rings on employee phones; "still pending" reminders ring even after submission; iOS push does the same.
- `EmployeeQuestionFlowScreen.tsx:84-96`: if plan is complete → `phase="ach"` immediately (achievements shown in the morning). If plan deadline missed → also jumps to ach.
- `EmployeeQuestionFlowScreen.tsx:112-117`: every app foreground calls `loadData` → new `questions` array → speak effect (`:167`) re-reads the question and opens the mic.
- "Fill Achievement Now" (`:268`) resets to index 0 → re-asks already answered questions. No `pm_deadline` check on load.
- Permission denial only shows a dismissible red banner; admin has no visibility.
- Same flow bugs duplicated in `employee-pwa/src/pages/QuestionFlowPage.tsx`.
- `handleSubmit` (`:201-204`) overwrites `plan_started_at`/`plan_completed_at` on every submit of first/last question → unsafe anchor for unlock timing once edits exist.
- `OnboardingGate` in `App.tsx` asks **admins** for alarm permissions too (PLAN.md says admin never gets alarms).
- Verified: `android/` copies of Kotlin files match `plugins/android-alarm-src/`; manifest has boot receiver, `foregroundServiceType=mediaPlayback`, required perms. Not a cause.

## Decisions (from user answers)
- App opens on a **Today summary** with 2 buttons: **Start Goal** and **Start Achievements**. Voice starts only after tapping.
- Achievements **locked until goal is complete**, then unlock **2 hours after goal completion** (`plan_completed_at + 120 min`), close at `pm_deadline`.
- Goal missed (am_deadline passed, incomplete) → achievements stay locked for the day (strict "no goal, no achievement"); nightly auto-zero fills zeros. **Includes partial:** 5 of 7 answered at deadline = achievements locked all day. *(Flag: change if they want achievements anyway.)*
- Alarms must work on all phones: Android native alarms, iPhone via PWA web push.
- Employee **cannot disable reminders**: blocking gate until permissions granted, and admin sees who has alarms off.
- Scope: all 4 feature groups; Android app + iOS PWA.

---

## Phase 1 — Alarm reliability (Android native)
Files: `mobile-app/plugins/android-alarm-src/AlarmReceiver.kt`, `SalesAlarmModule.kt`, `mobile-app/src/lib/alarms.ts`
1. `AlarmReceiver` `ACTION_ALARM` branch: after starting ring service, re-arm that slot for next day from SharedPreferences via existing `SalesAlarmModule.scheduleAlarmDirectly(...)` (reuse `rescheduleAlarmsFromStorage` logic, single slot).
2. **Background config sync**: JS passes Supabase URL + anon key once (new `@ReactMethod setSyncConfig(url, key)` → prefs). On each alarm fire, receiver uses `goAsync()` + `HttpURLConnection` GET `/rest/v1/notification_config?select=slot_key,fire_time` → re-schedules slots + persists times, reusing title/body already persisted in prefs per slot. So admin changes reach phones within one alarm cycle even if the app is never opened. Failure → keep old schedule (log only).
3. Remove `isSundayIST()` early return in `scheduleAllAlarms` (native already skips Sunday).
4. `scheduleAllAlarms`: cancel slots missing from config (use existing `cancelAlarm`).
5. Drop `pm_final` from employee alarms — single source: remove it from native `SLOT_KEYS` scheduling list (both JS path and native sync go through it; cancel keeps it so old installs get cleared).
6. Fix admin text in `admin-dashboard/src/pages/NotificationConfigPage.tsx:228` ("take effect next day" → "phones update at next alarm or app open").

## Phase 2 — Today summary + flow gating (mobile + PWA)
Files: `mobile-app/src/lib/utils.ts`, `employee-pwa/src/lib/utils.ts` (duplicated helper, matches existing pattern), `EmployeeQuestionFlowScreen.tsx`, `QuestionFlowPage.tsx`
1. New pure fn `getTodayState({questions, answers, status, config, now})` → `{ plan: 'open'|'done'|'missed', ach: 'locked'|'waiting'|'open'|'done'|'missed', achUnlockAt, onLeave }`. Constant `ACH_UNLOCK_DELAY_MIN = 120`. Plan done = `plan_completed_at` set (trusted first); else every active question id has a plan answer (match by id set, not `.length`). Unlock = first `plan_completed_at` + 120 min, so later edits or admin adding a question mid-day don't move/relock it.
   - `handleSubmit`: write `*_started_at` / `*_completed_at` only when currently null.
2. Screen gets a `mode: 'summary' | 'plan' | 'ach'` state; default `summary`.
   - Summary: date, two big buttons with state text ("Goal submitted ✓", "Unlocks at 11:32", "Deadline passed"), per-question table Plan | Ach.
   - Tapping a button → flow starts at **first unanswered** question of that phase; speak+mic only then.
   - Finishing a phase → back to summary (no auto-jump).
3. AppState foreground → refresh data + alarms only; **never** re-trigger speech. Speech effect keyed on `mode` + `currentIndex`, not on `questions` identity.
4. Deadline re-checked on submit (keep existing) and on load for both phases.

## Phase 3 — Mandatory reminders + admin visibility
1. Migration `supabase/migrations/003_alarm_status.sql` using `ALTER TABLE employees ADD COLUMN IF NOT EXISTS`: `alarm_ok boolean`, `battery_ok boolean`, `alarm_checked_at timestamptz`, `platform text`. (Never re-run 001 — it drops all tables.) New `Employee` TS fields optional so `createEmployee` forms don't break.
2. Mobile `App.tsx`: replace red banner with **blocking screen, employees only**, when exact-alarm or notification permission missing (checked on login + every foreground). Battery optimization is NOT gated (some OEMs don't offer it → permanent lockout); reported to admin as a badge instead. Only button: "Allow reminders" → `requestAlarmPermissions()`. Move the pre-login `OnboardingGate` permission ask into this employee-only gate (admins never asked). Report status on every check (new `reportAlarmStatus` in `mobile-app/src/lib/supabase.ts`).
3. PWA: gate only on iOS — if not installed to Home Screen (`navigator.standalone`) show "Add to Home Screen" steps; if installed and `typeof Notification === 'undefined'` or permission not granted → "Allow notifications" button (reuse `employee-pwa/src/lib/push.ts` subscribe). Non-iOS browsers (desktop dev) not blocked. Report status.
4. Admin (web `DashboardPage.tsx`, mobile `AdminDashboardScreen.tsx`/`AdminEmployeesScreen.tsx`): badge per employee — "Alarms ON", "Alarms OFF", "Battery restricted", "Not seen 24h+".

## Phase 4 — Smart alarms (skip when not needed)
1. JS → native `setDayState(date, planDone, achDone, onLeave)` (prefs), called after load and after each phase completes.
2. `AlarmReceiver`: if prefs date == today → skip ringing `am_*` when plan done, `pm_*` when ach done, all when on leave. Still re-arms (Phase 1).
3. Web push `supabase/functions/ios-push-trigger/index.ts`: skip `pm_final`, skip Sunday, skip `am_*` if `plan_completed_at` set, `pm_*` if `ach_completed_at` set (one `daily_status` query already partly there).

## Phase 5 — Employee: review/edit + streak
1. Summary table rows tappable while that phase is still open (before its deadline) → edit value via `submitAnswer` (verify it upserts on the unique key; if not, switch to upsert).
2. History screen: streak (consecutive working days with both phases done, Sundays skipped) + plan-vs-ach % for last 30 days, reusing `getEmployeeHistory`.

## Phase 6 — Admin insights (web + mobile)
1. Today board: per employee status (Not started / Goal done / Waiting / Ach done / Missed / Leave) + alarm badge.
2. Defaulters list: who missed goal/ach today and count over last 7/30 days.
3. Plan-vs-achievement % per employee and per question for week/month (extend `AnalyticsPage.tsx`, reuse `getDailyAnswersRange`).
- Skipped: one-tap "nudge" to a single employee — needs FCM on Android; add when FCM is set up.

## Phase 7 — Admin mobile parity
Add tabs in `mobile-app/App.tsx` `AdminTabs`: **Questions** (add/edit/reorder/deactivate — `getQuestions`, `createQuestion`, `updateQuestion`), **Schedule** (edit 7 times — `getNotificationConfig`, `updateNotificationConfig`), **Records** (date + employee picker — `getDailyAnswers`). All helpers already exist in `mobile-app/src/lib/supabase.ts`. Excel export stays web-only.

---

## Not in scope (flag to user)
- RLS policies are wide open (`anon` full access on all tables in `001_initial_schema.sql`) — any holder of the anon key can read/write everything. Recommend a follow-up security pass.
- iOS force-quit PWA can't guarantee sound (OS limit, documented in PLAN.md).

## Execution order
After approval: create branch `feat/alarm-flow-admin-upgrade` (currently on `main`), write spec to `docs/superpowers/specs/2026-09-27-bugfix-ux-admin-upgrade-design.md`, commit, then implement Phase 1 → 7, one commit per phase.

## Deploy steps (user runs)
1. Run `003_alarm_status.sql` in Supabase SQL editor.
2. `supabase functions deploy ios-push-trigger`.
3. Android: `npx expo prebuild --clean` then rebuild/install APK (plugin copies Kotlin only at prebuild).
4. Redeploy PWA + admin dashboard.

## Verification
- `getTodayState`: small assert script `mobile-app/src/lib/utils.check.ts` run with `npx tsx` (plan open/done/missed, partial-at-deadline = missed, ach locked/waiting/open/done/missed, 2h unlock, leave, question added mid-day after `plan_completed_at` stays done, answers to deactivated questions not counted).
- Type check: `npx tsc --noEmit` in `mobile-app`, `employee-pwa`, `admin-dashboard`; `npm run build` for both web apps.
- Android (`npx expo prebuild --clean` then `npx expo run:android` on device):
  - Set a slot 2 min ahead in admin → rings; then `adb shell dumpsys alarm | grep salestracker` shows it re-armed for next day.
  - Change a time in admin while app is closed → after next alarm fires, dumpsys shows new time.
  - Submit goal → `am_reminder_2` does not ring.
  - Revoke notification permission → app shows blocking gate; admin shows "Alarms OFF".
- Flow: open app → summary only, no voice; background/foreground → no re-read; after goal, Achievements shows "Unlocks at HH:MM".
- PWA: `npm run dev`, check summary/gating in browser; push trigger via `supabase functions serve` with a slot at current minute.
