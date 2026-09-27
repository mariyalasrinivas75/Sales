import { NativeModules, Platform, PermissionsAndroid } from "react-native";
import { supabaseConfig } from "./config";

/**
 * JavaScript bridge to the native Android AlarmManager module.
 * On iOS this is a no-op since iOS uses web push (handled by the PWA service worker).
 */

interface SalesAlarmModuleType {
  scheduleAlarm(
    slotKey: string,
    hour: number,
    minute: number,
    title: string,
    body: string
  ): Promise<string>;
  cancelAlarm(slotKey: string): Promise<string>;
  cancelAllAlarms(): Promise<string>;
  canScheduleExactAlarms(): Promise<boolean>;
  openExactAlarmSettings(): Promise<boolean>;
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  requestIgnoreBatteryOptimizations(): Promise<boolean>;
  setSyncConfig(url: string, anonKey: string): Promise<boolean>;
  setDayState(
    date: string,
    planDone: boolean,
    achDone: boolean,
    onLeave: boolean
  ): Promise<boolean>;
}

const { SalesAlarmModule } = NativeModules as {
  SalesAlarmModule: SalesAlarmModuleType | undefined;
};

/**
 * Whether the native alarm module is available on this platform.
 * Only available on Android with a dev-client or production build.
 */
export const isAlarmModuleAvailable = Platform.OS === "android" && !!SalesAlarmModule;

export interface NotificationSlot {
  slot_key: string;
  fire_time: string; // "HH:MM:SS"
  label: string | null;
}

// pm_final is admin-only (PLAN.md) — never scheduled on employee phones. Mirrors
// SalesAlarmModule.SLOT_KEYS on the native side.
const KNOWN_SLOT_KEYS = [
  "am_reminder_1",
  "am_reminder_2",
  "am_deadline",
  "pm_reminder_1",
  "pm_reminder_2",
  "pm_deadline",
];

function getMessageForSlot(slotKey: string): { title: string; body: string } {
  const messages: Record<string, { title: string; body: string }> = {
    am_reminder_1: {
      title: "Morning Plan Reminder",
      body: "Please fill in your daily sales plan for today.",
    },
    am_reminder_2: {
      title: "Plan Still Pending",
      body: "Your morning plan is not submitted. Deadline approaching!",
    },
    am_deadline: {
      title: "Plan Deadline",
      body: "Last chance to fill your morning plan. It will auto-zero soon.",
    },
    pm_reminder_1: {
      title: "Evening Achievement",
      body: "How did today go? Fill in your achievements now.",
    },
    pm_reminder_2: {
      title: "Achievement Still Pending",
      body: "Your evening achievements are not submitted. Deadline approaching!",
    },
    pm_deadline: {
      title: "Achievement Deadline",
      body: "Last chance to fill your achievements. They will auto-zero soon.",
    },
    pm_final: {
      title: "Day Complete",
      body: "All reports have been compiled. Good work today!",
    },
  };

  return messages[slotKey] || {
    title: "Sales Tracker Reminder",
    body: "Please check your Sales Tracker app.",
  };
}

/**
 * Schedule all 7 alarm slots based on the notification config from Supabase.
 * Should be called on login and whenever the config changes.
 */
export async function scheduleAllAlarms(slots: NotificationSlot[]): Promise<void> {
  if (!isAlarmModuleAvailable || !SalesAlarmModule) {
    console.log("[Alarms] Native module not available. Skipping alarm scheduling.");
    return;
  }
  // Sunday skip is handled natively (scheduleAlarmDirectly pushes to Monday) —
  // no early return here, otherwise the app would never re-arm/sync on Sundays.

  try {
    await SalesAlarmModule.setSyncConfig(supabaseConfig.url, supabaseConfig.anonKey);
  } catch (err) {
    console.warn("[Alarms] Failed to set sync config:", err);
  }

  const active = slots.filter((s) => s.slot_key !== "pm_final");

  const results = await Promise.allSettled(
    active.map((slot) => {
      const [hourStr, minuteStr] = slot.fire_time.split(":");
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);
      const { title, body } = getMessageForSlot(slot.slot_key);

      return SalesAlarmModule.scheduleAlarm(slot.slot_key, hour, minute, title, body);
    })
  );

  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.warn(`[Alarms] Failed to schedule ${active[i]?.slot_key}:`, result.reason);
    } else {
      console.log(`[Alarms] ✅ ${active[i]?.slot_key}: ${result.value}`);
    }
  });

  // Cancel any slot the admin removed from config entirely (missing from `slots`).
  // Guarded on active.length so a transient empty fetch can't wipe every alarm.
  if (active.length > 0) {
    const configuredKeys = new Set(active.map((s) => s.slot_key));
    for (const key of KNOWN_SLOT_KEYS) {
      if (!configuredKeys.has(key)) {
        await cancelAlarm(key);
      }
    }
  }
}

/**
 * Cancel all scheduled alarms.
 * Should be called on logout.
 */
export async function cancelAllAlarms(): Promise<void> {
  if (!isAlarmModuleAvailable || !SalesAlarmModule) return;

  try {
    await SalesAlarmModule.cancelAllAlarms();
    console.log("[Alarms] All alarms cancelled.");
  } catch (err) {
    console.warn("[Alarms] Failed to cancel alarms:", err);
  }
}

/**
 * Cancel a single alarm by slot key.
 */
export async function cancelAlarm(slotKey: string): Promise<void> {
  if (!isAlarmModuleAvailable || !SalesAlarmModule) return;
  try {
    await SalesAlarmModule.cancelAlarm(slotKey);
  } catch (err) {
    console.warn(`[Alarms] Failed to cancel ${slotKey}:`, err);
  }
}

/**
 * alarmOk = exact-alarm scheduling AND POST_NOTIFICATIONS are both granted — a hard
 * requirement, since without them scheduleAlarm() silently throws and nothing fires.
 * batteryOk = ignoring battery optimization — reported to admin, no longer a hard
 * gate (some OEMs don't offer the exemption at all, which would be a permanent lockout).
 */
export async function getAlarmPermissionState(): Promise<{ alarmOk: boolean; batteryOk: boolean }> {
  if (!isAlarmModuleAvailable || !SalesAlarmModule) return { alarmOk: true, batteryOk: true }; // nothing to check off-Android

  const exactAlarmOk = await SalesAlarmModule.canScheduleExactAlarms().catch(() => false);
  const batteryOk = await SalesAlarmModule.isIgnoringBatteryOptimizations().catch(() => true);

  let notificationsOk = true;
  if (Platform.OS === "android" && Platform.Version >= 33) {
    notificationsOk =
      (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) ?? false;
  }

  return { alarmOk: exactAlarmOk && notificationsOk, batteryOk };
}

/** Alarm-only view of getAlarmPermissionState(), kept for existing callers. */
export async function hasAlarmPermissions(): Promise<boolean> {
  return (await getAlarmPermissionState()).alarmOk;
}

/**
 * Smart skip (Phase 4): persist today's plan/achievement/leave state natively so
 * AlarmReceiver can skip ringing slots that are no longer needed. No-op off Android.
 */
export async function setDayState(
  date: string,
  planDone: boolean,
  achDone: boolean,
  onLeave: boolean
): Promise<void> {
  if (!isAlarmModuleAvailable || !SalesAlarmModule) return;
  try {
    await SalesAlarmModule.setDayState(date, planDone, achDone, onLeave);
  } catch (err) {
    console.warn("[Alarms] Failed to set day state:", err);
  }
}

/**
 * Ask for both permissions the alarm feature needs. POST_NOTIFICATIONS uses the
 * standard OS dialog; SCHEDULE_EXACT_ALARM has no dialog and must be granted from
 * Settings, so this opens that screen for the user.
 */
export async function requestAlarmPermissions(): Promise<void> {
  if (!isAlarmModuleAvailable || !SalesAlarmModule) return;

  if (Platform.OS === "android" && Platform.Version >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => {});
  }

  const exactAlarmOk = await SalesAlarmModule.canScheduleExactAlarms().catch(() => true);
  if (!exactAlarmOk) {
    await SalesAlarmModule.openExactAlarmSettings().catch(() => {});
  }

  const batteryOk = await SalesAlarmModule.isIgnoringBatteryOptimizations().catch(() => true);
  if (!batteryOk) {
    await SalesAlarmModule.requestIgnoreBatteryOptimizations().catch(() => {});
  }
}
