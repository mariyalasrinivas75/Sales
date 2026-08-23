package com.yourcompany.salestracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/**
 * BroadcastReceiver that fires when an AlarmManager alarm triggers.
 * Starts the foreground AlarmRingService (loops sound/vibration, shows the
 * full-screen alarm UI). Also handles BOOT_COMPLETED to reschedule alarms
 * after device restart, from the schedule SalesAlarmModule persisted.
 */
class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> {
                rescheduleAlarmsFromStorage(context)
            }

            SalesAlarmModule.ACTION_ALARM -> {
                val slotKey = intent.getStringExtra("slot_key") ?: "reminder"
                val title = intent.getStringExtra("title") ?: "Sales Tracker"
                val body = intent.getStringExtra("body") ?: "Time to fill your daily report!"

                val serviceIntent = Intent(context, AlarmRingService::class.java).apply {
                    putExtra("slot_key", slotKey)
                    putExtra("title", title)
                    putExtra("body", body)
                }
                ContextCompat.startForegroundService(context, serviceIntent)
            }
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
