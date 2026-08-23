// iOS Push Trigger — Supabase Edge Function
// Triggered by pg_cron at each of the 7 scheduled notification times
// Sends web push notifications to all employee PWA subscribers

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Web Push library for Deno
// Note: In production, use the web-push npm package or a Deno equivalent.
// For now, this is the structure — you'll need VAPID keys configured.

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse the slot_key from the request (which scheduled time triggered this)
    const body = await req.json().catch(() => ({}));
    const slotKey = body.slot_key || "unknown";

    // Get the notification config for this slot
    const { data: config } = await supabase
      .from("notification_config")
      .select("*")
      .eq("slot_key", slotKey)
      .single();

    if (!config) {
      return new Response(
        JSON.stringify({ success: false, error: `No config found for slot: ${slotKey}` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get today's date
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const today = istDate.toISOString().split("T")[0];

    // Get all active employees who are NOT on leave today
    const { data: employees } = await supabase
      .from("employees")
      .select("id")
      .eq("active", true);

    const { data: leaveStatuses } = await supabase
      .from("daily_status")
      .select("employee_id")
      .eq("status_date", today)
      .eq("is_leave", true);

    const onLeaveIds = new Set((leaveStatuses || []).map((s: { employee_id: string }) => s.employee_id));
    const activeEmployees = (employees || []).filter((e: { id: string }) => !onLeaveIds.has(e.id));

    // Determine the push message
    const isDeadline = slotKey.includes("deadline");
    const isPM = slotKey.startsWith("pm_");
    const phase = isPM ? "achievement" : "plan";

    const pushPayload = {
      title: isDeadline
        ? `⚠️ ${isPM ? "Evening" : "Morning"} Deadline!`
        : `📊 Time for your daily ${phase}`,
      body: config.label || `Please fill in your ${phase} report`,
      tag: `sales-${slotKey}`,
    };

    // TODO: In production, iterate over push subscriptions stored in a
    // `push_subscriptions` table and send web push to each.
    // For MVP, this logs the push and returns success.
    // Implement actual web push with VAPID keys when deploying.

    console.log(`[iOS Push Trigger] Slot: ${slotKey}, Employees: ${activeEmployees.length}`, pushPayload);

    return new Response(
      JSON.stringify({
        success: true,
        slot: slotKey,
        message: pushPayload,
        targetEmployees: activeEmployees.length,
        skippedOnLeave: onLeaveIds.size,
        note: "Push delivery requires VAPID keys and push_subscriptions table - see setup guide",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
