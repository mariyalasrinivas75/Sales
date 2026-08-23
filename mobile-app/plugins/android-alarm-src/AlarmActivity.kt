package com.yourcompany.salestracker

import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Full-screen alarm UI launched by AlarmRingService's full-screen-intent
 * notification. Wakes/unlocks the screen like a real alarm clock. Dismiss
 * stops the ringing service and closes.
 */
class AlarmActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        val title = intent?.getStringExtra("title") ?: "Sales Tracker"
        val body = intent?.getStringExtra("body") ?: "Time for your daily report!"

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0f172a"))
            setPadding(48, 48, 48, 48)
        }
        root.addView(TextView(this).apply {
            text = title
            textSize = 26f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        })
        root.addView(TextView(this).apply {
            text = body
            textSize = 16f
            setTextColor(Color.LTGRAY)
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 64)
        })
        root.addView(Button(this).apply {
            text = "I'm here — Dismiss"
            setOnClickListener {
                AlarmRingService.stop(this@AlarmActivity)
                finish()
            }
        })

        setContentView(root)
    }

    override fun onDestroy() {
        // Belt-and-suspenders: if the user backs out instead of tapping Dismiss, still stop the ringer.
        AlarmRingService.stop(this)
        super.onDestroy()
    }
}
