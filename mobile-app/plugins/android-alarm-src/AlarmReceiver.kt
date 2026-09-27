package com.yourcompany.salestracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * BroadcastReceiver that fires when an AlarmManager alarm triggers.
 * Starts the foreground AlarmRingService (loops sound/vibration, shows the
 * full-screen alarm UI). Also handles BOOT_COMPLETED to reschedule alarms
 * after device restart, from the schedule SalesAlarmModule persisted.
 *
 * On every alarm fire this also (a) re-arms that same slot for the next day
 * — setExactAndAllowWhileIdle() is one-shot, so without this the alarm would
 * never fire again — and (b) kicks off a background sync of notification_config
 * from Supabase so admin time changes reach the phone even if the app is
 * never opened.
 */
class AlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AlarmReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> {
                rescheduleAlarmsFromStorage(context)
            }

            SalesAlarmModule.ACTION_ALARM -> {
                val slotKey = intent.getStringExtra("slot_key") ?: return
                if (slotKey !in SalesAlarmModule.SLOT_KEYS) {
                    // Legacy pm_final (admin-only, dropped from SLOT_KEYS) from an old
                    // install. Don't ring, don't re-arm — let it die out.
                    return
                }
                val title = intent.getStringExtra("title") ?: "Sales Tracker"
                val body = intent.getStringExtra("body") ?: "Time to fill your daily report!"

                val prefs = context.getSharedPreferences(SalesAlarmModule.PREFS_NAME, Context.MODE_PRIVATE)

                if (!shouldSkip(prefs, slotKey)) {
                    try {
                        val serviceIntent = Intent(context, AlarmRingService::class.java).apply {
                            putExtra("slot_key", slotKey)
                            putExtra("title", title)
                            putExtra("body", body)
                        }
                        ContextCompat.startForegroundService(context, serviceIntent)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to start ring service for $slotKey", e)
                    }
                }

                // Always re-arm this slot for tomorrow, regardless of whether it rang.
                val hour = prefs.getInt("${slotKey}_hour", -1)
                val minute = prefs.getInt("${slotKey}_minute", -1)
                if (hour >= 0 && minute >= 0) {
                    SalesAlarmModule.scheduleAlarmDirectly(context, slotKey, hour, minute, title, body)
                }

                // Always attempt a background config sync too.
                maybeSyncConfig(context, prefs)
            }
        }
    }

    /** Smart skip (Phase 4): only applies when the persisted day state is for today (IST). */
    private fun shouldSkip(prefs: SharedPreferences, slotKey: String): Boolean {
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("Asia/Kolkata")
        }.format(Date())
        if (prefs.getString(SalesAlarmModule.KEY_DAY_DATE, null) != today) return false

        if (prefs.getBoolean(SalesAlarmModule.KEY_DAY_ON_LEAVE, false)) return true
        if (slotKey.startsWith("am_") && prefs.getBoolean(SalesAlarmModule.KEY_DAY_PLAN_DONE, false)) return true
        if (slotKey.startsWith("pm_") && prefs.getBoolean(SalesAlarmModule.KEY_DAY_ACH_DONE, false)) return true
        return false
    }

    private fun maybeSyncConfig(context: Context, prefs: SharedPreferences) {
        val url = prefs.getString(SalesAlarmModule.KEY_SYNC_URL, null)
        val anonKey = prefs.getString(SalesAlarmModule.KEY_SYNC_ANON_KEY, null)
        if (url.isNullOrEmpty() || anonKey.isNullOrEmpty()) return

        val pendingResult = goAsync()
        Thread {
            try {
                syncConfig(context, prefs, url, anonKey)
            } catch (e: Exception) {
                // Any failure (network, parsing, ...) — keep the existing schedule, just log.
                Log.w(TAG, "Config sync failed", e)
            } finally {
                pendingResult.finish()
            }
        }.start()
    }

    private fun syncConfig(context: Context, prefs: SharedPreferences, url: String, anonKey: String) {
        val connection = URL("$url/rest/v1/notification_config?select=slot_key,fire_time")
            .openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 2500
            connection.readTimeout = 2500
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Authorization", "Bearer $anonKey")

            if (connection.responseCode != 200) {
                Log.w(TAG, "Config sync HTTP ${connection.responseCode}")
                return
            }

            val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
            val slots = JSONArray(responseBody)
            for (i in 0 until slots.length()) {
                val slot = slots.getJSONObject(i)
                val slotKey = slot.optString("slot_key", "")
                if (slotKey !in SalesAlarmModule.SLOT_KEYS) continue

                // Only touch slots this device already has scheduled — otherwise a
                // slot the user cancelled (or belongs to another/logged-out account)
                // would get silently re-armed by the sync.
                if (prefs.getInt("${slotKey}_hour", -1) < 0) continue

                val fireTime = slot.optString("fire_time", "")
                val parts = fireTime.split(":")
                if (parts.size < 2) continue
                val hour = parts[0].toIntOrNull() ?: continue
                val minute = parts[1].toIntOrNull() ?: continue
                if (hour !in 0..23 || minute !in 0..59) continue

                val alarmTitle = prefs.getString("${slotKey}_title", "Sales Tracker") ?: "Sales Tracker"
                val alarmBody = prefs.getString("${slotKey}_body", "Time for your daily report!")
                    ?: "Time for your daily report!"

                SalesAlarmModule.scheduleAlarmDirectly(context, slotKey, hour, minute, alarmTitle, alarmBody)
                SalesAlarmModule.persist(context, slotKey, hour, minute, alarmTitle, alarmBody)
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun rescheduleAlarmsFromStorage(context: Context) {
        val prefs = context.getSharedPreferences(SalesAlarmModule.PREFS_NAME, Context.MODE_PRIVATE)
        for (key in SalesAlarmModule.SLOT_KEYS) {
            val hour = prefs.getInt("${key}_hour", -1)
            val minute = prefs.getInt("${key}_minute", -1)
            val alarmTitle = prefs.getString("${key}_title", "Sales Tracker") ?: "Sales Tracker"
            val alarmBody = prefs.getString("${key}_body", "Time for your daily report!") ?: "Time for your daily report!"
            if (hour >= 0 && minute >= 0) {
                SalesAlarmModule.scheduleAlarmDirectly(context, key, hour, minute, alarmTitle, alarmBody)
            }
        }
    }
}
