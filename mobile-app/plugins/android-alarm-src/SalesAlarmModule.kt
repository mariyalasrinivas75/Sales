package com.yourcompany.salestracker

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.*
import java.util.Calendar

/**
 * Native Android AlarmManager module exposed to React Native.
 *
 * Uses AlarmManager.setExactAndAllowWhileIdle() so alarms fire even in Doze
 * mode and after the app is force-killed. AlarmReceiver restarts an
 * AlarmRingService (foreground service) that loops sound/vibration and shows
 * a full-screen alarm UI. RECEIVE_BOOT_COMPLETED + the SharedPreferences
 * schedule written here let alarms survive a device reboot too.
 *
 * Usage from RN/JS:
 *   import { NativeModules } from 'react-native';
 *   const { SalesAlarmModule } = NativeModules;
 *   await SalesAlarmModule.scheduleAlarm(slotKey, hour, minute, title, body);
 *   await SalesAlarmModule.cancelAlarm(slotKey);
 *   await SalesAlarmModule.cancelAllAlarms();
 */
class SalesAlarmModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SalesAlarmModule"

    companion object {
        const val ACTION_ALARM = "com.yourcompany.salestracker.ALARM_TRIGGER"
        const val PREFS_NAME = "sales_alarms"
        // pm_final is admin-only (PLAN.md) — never scheduled/synced on employee phones.
        // Kept out of SLOT_KEYS; cancelAllAlarms() still clears it below for old installs.
        val SLOT_KEYS = listOf(
            "am_reminder_1", "am_reminder_2", "am_deadline",
            "pm_reminder_1", "pm_reminder_2", "pm_deadline"
        )
        private const val LEGACY_SLOT_KEYS = "pm_final"
        const val KEY_SYNC_URL = "sync_url"
        const val KEY_SYNC_ANON_KEY = "sync_key"
        const val KEY_DAY_DATE = "day_date"
        const val KEY_DAY_PLAN_DONE = "day_plan_done"
        const val KEY_DAY_ACH_DONE = "day_ach_done"
        const val KEY_DAY_ON_LEAVE = "day_on_leave"

        private fun getPendingIntent(context: Context, slotKey: String, title: String, body: String): PendingIntent {
            val intent = Intent(context, AlarmReceiver::class.java).apply {
                action = ACTION_ALARM
                putExtra("slot_key", slotKey)
                putExtra("title", title)
                putExtra("body", body)
            }
            return PendingIntent.getBroadcast(
                context, slotKey.hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        /** Shared by the JS-facing scheduleAlarm() and AlarmReceiver's boot-time reschedule. */
        fun scheduleAlarmDirectly(context: Context, slotKey: String, hour: Int, minute: Int, title: String, body: String) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val cal = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, hour)
                set(Calendar.MINUTE, minute)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
                if (timeInMillis <= System.currentTimeMillis()) {
                    add(Calendar.DAY_OF_YEAR, 1)
                }
                // No reminders on Sunday — push straight to Monday.
                while (get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY) {
                    add(Calendar.DAY_OF_YEAR, 1)
                }
            }
            val pendingIntent = getPendingIntent(context, slotKey, title, body)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pendingIntent)
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pendingIntent)
            }
        }

        /** Not private: AlarmReceiver persists the new time after a background config sync. */
        fun persist(context: Context, slotKey: String, hour: Int, minute: Int, title: String, body: String) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putInt("${slotKey}_hour", hour)
                .putInt("${slotKey}_minute", minute)
                .putString("${slotKey}_title", title)
                .putString("${slotKey}_body", body)
                .apply()
        }

        private fun forget(context: Context, slotKey: String) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .remove("${slotKey}_hour")
                .remove("${slotKey}_minute")
                .remove("${slotKey}_title")
                .remove("${slotKey}_body")
                .apply()
        }
    }

    /** SCHEDULE_EXACT_ALARM has no standard permission dialog — check + deep-link to Settings instead. */
    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        val allowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
        } else {
            true
        }
        promise.resolve(allowed)
    }

    @ReactMethod
    fun openExactAlarmSettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val intent = Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = android.net.Uri.parse("package:${reactContext.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.message, e)
        }
    }

    /**
     * Standard AOSP battery-optimization exemption. Doesn't help on OEMs (Vivo, Xiaomi,
     * Oppo) that run their own separate background-app killer on top of stock Android —
     * those need a manual whitelist in the OEM's own settings, no API for it — but it's
     * the one thing app code can legitimately request, and some OEMs partially honor it.
     */
    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        val pm = reactContext.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        promise.resolve(pm.isIgnoringBatteryOptimizations(reactContext.packageName))
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = android.net.Uri.parse("package:${reactContext.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun scheduleAlarm(slotKey: String, hour: Int, minute: Int, title: String, body: String, promise: Promise) {
        try {
            scheduleAlarmDirectly(reactContext, slotKey, hour, minute, title, body)
            persist(reactContext, slotKey, hour, minute, title, body)
            promise.resolve("Alarm scheduled for $hour:${minute.toString().padStart(2, '0')}")
        } catch (e: Exception) {
            promise.reject("ALARM_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelAlarm(slotKey: String, promise: Promise) {
        try {
            val pendingIntent = getPendingIntent(reactContext, slotKey, "", "")
            (reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pendingIntent)
            pendingIntent.cancel()
            forget(reactContext, slotKey)
            promise.resolve("Alarm cancelled: $slotKey")
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelAllAlarms(promise: Promise) {
        try {
            val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            for (key in SLOT_KEYS + LEGACY_SLOT_KEYS) {
                val pi = getPendingIntent(reactContext, key, "", "")
                alarmManager.cancel(pi)
                pi.cancel()
                forget(reactContext, key)
            }
            promise.resolve("All alarms cancelled")
        } catch (e: Exception) {
            promise.reject("CANCEL_ALL_ERROR", e.message, e)
        }
    }

    /** JS passes the Supabase URL + anon key once so AlarmReceiver can sync config with no app open. */
    @ReactMethod
    fun setSyncConfig(url: String, anonKey: String, promise: Promise) {
        try {
            reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putString(KEY_SYNC_URL, url.trimEnd('/'))
                .putString(KEY_SYNC_ANON_KEY, anonKey)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SYNC_CONFIG_ERROR", e.message, e)
        }
    }

    /** Smart skip: today's plan/achievement/leave state, so AlarmReceiver can skip already-done slots. */
    @ReactMethod
    fun setDayState(date: String, planDone: Boolean, achDone: Boolean, onLeave: Boolean, promise: Promise) {
        try {
            reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putString(KEY_DAY_DATE, date)
                .putBoolean(KEY_DAY_PLAN_DONE, planDone)
                .putBoolean(KEY_DAY_ACH_DONE, achDone)
                .putBoolean(KEY_DAY_ON_LEAVE, onLeave)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DAY_STATE_ERROR", e.message, e)
        }
    }
}
