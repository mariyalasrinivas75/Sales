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
        val SLOT_KEYS = listOf(
            "am_reminder_1", "am_reminder_2", "am_deadline",
            "pm_reminder_1", "pm_reminder_2", "pm_deadline", "pm_final"
        )

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

        private fun persist(context: Context, slotKey: String, hour: Int, minute: Int, title: String, body: String) {
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
            for (key in SLOT_KEYS) {
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
}
