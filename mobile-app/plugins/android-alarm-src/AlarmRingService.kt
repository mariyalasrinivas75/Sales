package com.yourcompany.salestracker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat

/**
 * Foreground service that actually rings: loops an alarm sound + vibrates,
 * and shows a full-screen-intent notification so the phone wakes up like a
 * real alarm clock, even if the app was force-killed. Started by AlarmReceiver,
 * stopped by AlarmActivity's dismiss button or after a safety timeout.
 */
class AlarmRingService : Service() {

    companion object {
        const val CHANNEL_ID = "sales_alarm_ring"
        const val CHANNEL_NAME = "Sales Alarm"
        const val NOTIFICATION_ID = 9911
        private const val SAFETY_TIMEOUT_MS = 120_000L // auto-stop after 2 min if never dismissed

        fun stop(context: Context) {
            context.stopService(Intent(context, AlarmRingService::class.java))
        }
    }

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private val handler = Handler(Looper.getMainLooper())
    private val timeoutRunnable = Runnable { stopSelf() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val slotKey = intent?.getStringExtra("slot_key") ?: "reminder"
        val title = intent?.getStringExtra("title") ?: "Sales Tracker"
        val body = intent?.getStringExtra("body") ?: "Time for your daily report!"

        startForeground(NOTIFICATION_ID, buildRingingNotification(slotKey, title, body))
        startRinging()
        handler.postDelayed(timeoutRunnable, SAFETY_TIMEOUT_MS)

        return START_NOT_STICKY
    }

    private fun buildRingingNotification(slotKey: String, title: String, body: String): android.app.Notification {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Full-screen alarm reminders"
                setSound(null, null) // service plays the sound itself (looped), not the channel
                enableVibration(false) // service handles vibration itself (looped)
            }
            notificationManager.createNotificationChannel(channel)
        }

        val fullScreenIntent = Intent(this, AlarmActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("slot_key", slotKey)
            putExtra("title", title)
            putExtra("body", body)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this, slotKey.hashCode(), fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(fullScreenPendingIntent)
            .setOngoing(true)
            .setAutoCancel(false)
            .build()
    }

    private fun startRinging() {
        try {
            val alarmUri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setDataSource(this@AlarmRingService, alarmUri)
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            // ponytail: no alarm sound available on this device/emulator, vibration alone still fires
        }

        val pattern = longArrayOf(0, 800, 400, 800, 400)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibrator = vm.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 1)) // repeatIndex 1 = loop from index 1
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(pattern, 1)
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(timeoutRunnable)
        mediaPlayer?.let { try { it.stop(); it.release() } catch (_: Exception) {} }
        mediaPlayer = null
        vibrator?.cancel()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_ID)
        super.onDestroy()
    }
}
