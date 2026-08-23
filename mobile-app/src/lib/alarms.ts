import { NativeModules, Platform } from "react-native";
import { isSundayIST } from "./utils";

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

  if (isSundayIST()) {
    console.log("[Alarms] Sunday — no reminders scheduled.");
    return;
  }

  const results = await Promise.allSettled(
    slots.map((slot) => {
      const [hourStr, minuteStr] = slot.fire_time.split(":");
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);
      const { title, body } = getMessageForSlot(slot.slot_key);

      return SalesAlarmModule.scheduleAlarm(slot.slot_key, hour, minute, title, body);
    })
  );

  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.warn(`[Alarms] Failed to schedule ${slots[i]?.slot_key}:`, result.reason);
    } else {
      console.log(`[Alarms] ✅ ${slots[i]?.slot_key}: ${result.value}`);
    }
  });
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
