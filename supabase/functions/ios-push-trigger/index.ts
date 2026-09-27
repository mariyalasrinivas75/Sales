// iOS Push Trigger — Supabase Edge Function
//
// Invoked by pg_cron every minute (no input needed). Reads notification_config
// fresh on each run and matches it against the current IST minute — this is
// deliberate: fire_time is admin-editable, so a static per-slot cron schedule
// would silently go stale the moment an admin changes a time. The Android
// AlarmManager path reads fire_time the same way, this mirrors it server-side.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (_req) => {
  try {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidContact = Deno.env.get("VAPID_CONTACT_EMAIL") || "mailto:admin@example.com";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ success: false, error: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    webpush.setVapidDetails(vapidContact, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Current IST time (same fixed-offset approach the rest of this function used before)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const today = istDate.toISOString().split("T")[0];
    const currentHHMM = istDate.toISOString().slice(11, 16); // "HH:MM"

    // pm_final is admin-only (PLAN.md) — never pushed to employee phones.
    // Sunday is skipped entirely, same as the Android native path.
    if (istDate.getUTCDay() === 0) {
      return new Response(JSON.stringify({ success: true, matchedSlots: 0, reason: "sunday" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: allConfig } = await supabase.from("notification_config").select("*");
    const matchedSlots = (allConfig || []).filter(
      (c: { fire_time: string; slot_key: string }) =>
        c.fire_time?.slice(0, 5) === currentHHMM && c.slot_key !== "pm_final"
    );

    if (matchedSlots.length === 0) {
      return new Response(JSON.stringify({ success: true, matchedSlots: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: employees } = await supabase.from("employees").select("id").eq("active", true);
    const { data: dailyStatuses } = await supabase
      .from("daily_status")
      .select("employee_id, is_leave, plan_completed_at, ach_completed_at")
      .eq("status_date", today);

    const onLeaveIds = new Set<string>();
    const planDoneIds = new Set<string>();
    const achDoneIds = new Set<string>();
    for (const s of dailyStatuses || []) {
      if (s.is_leave) onLeaveIds.add(s.employee_id);
      if (s.plan_completed_at) planDoneIds.add(s.employee_id);
      if (s.ach_completed_at) achDoneIds.add(s.employee_id);
    }

    const activeEmployeeIds = (employees || [])
      .map((e: { id: string }) => e.id)
      .filter((id: string) => !onLeaveIds.has(id));

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("employee_id", activeEmployeeIds.length > 0 ? activeEmployeeIds : ["__none__"]);

    const results: Array<{ slot: string; sent: number; expired: number }> = [];

    for (const config of matchedSlots) {
      const isDeadline = config.slot_key.includes("deadline");
      const isPM = config.slot_key.startsWith("pm_");
      const phase = isPM ? "achievement" : "plan";
      const doneIds = isPM ? achDoneIds : planDoneIds;

      const payload = JSON.stringify({
        title: isDeadline ? `${isPM ? "Evening" : "Morning"} Deadline` : `Time for your daily ${phase}`,
        body: config.label || `Please fill in your ${phase} report`,
        tag: `sales-${config.slot_key}`,
      });

      let sent = 0;
      let expired = 0;

      for (const sub of subscriptions || []) {
        if (doneIds.has(sub.employee_id)) continue;
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
          sent++;
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
            expired++;
          } else {
            console.error(`[iOS Push Trigger] Send failed for ${sub.id}:`, err);
          }
        }
      }

      results.push({ slot: config.slot_key, sent, expired });
    }

    return new Response(
      JSON.stringify({
        success: true,
        matchedSlots: matchedSlots.length,
        targetEmployees: activeEmployeeIds.length,
        skippedOnLeave: onLeaveIds.size,
        results,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
