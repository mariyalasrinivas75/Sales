// Nightly Auto-Zero Sweep — Supabase Edge Function
// Runs daily at 23:59 IST via pg_cron
// Inserts value=0, input_method='auto_zero' for any missing daily_answers rows

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get today's date in IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const today = istDate.toISOString().split("T")[0];

    // Get all active employees
    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select("id")
      .eq("active", true);

    if (empErr) throw empErr;

    // Get all active questions
    const { data: questions, error: qErr } = await supabase
      .from("questions")
      .select("id")
      .eq("active", true);

    if (qErr) throw qErr;

    // Get employees on leave today
    const { data: leaveStatuses } = await supabase
      .from("daily_status")
      .select("employee_id")
      .eq("status_date", today)
      .eq("is_leave", true);

    const onLeaveIds = new Set((leaveStatuses || []).map((s: { employee_id: string }) => s.employee_id));

    // Get existing answers for today
    const { data: existingAnswers, error: ansErr } = await supabase
      .from("daily_answers")
      .select("employee_id, question_id, phase")
      .eq("answer_date", today);

    if (ansErr) throw ansErr;

    // Build a set of existing answer keys
    const existingKeys = new Set(
      (existingAnswers || []).map(
        (a: { employee_id: string; question_id: string; phase: string }) =>
          `${a.employee_id}|${a.question_id}|${a.phase}`
      )
    );

    // Build missing answer rows
    const missingRows: Array<{
      employee_id: string;
      question_id: string;
      answer_date: string;
      phase: string;
      value: number;
      input_method: string;
      answered_at: string;
    }> = [];

    for (const emp of employees || []) {
      // Skip employees on leave
      if (onLeaveIds.has(emp.id)) continue;

      for (const q of questions || []) {
        for (const phase of ["plan", "ach"] as const) {
          const key = `${emp.id}|${q.id}|${phase}`;
          if (!existingKeys.has(key)) {
            missingRows.push({
              employee_id: emp.id,
              question_id: q.id,
              answer_date: today,
              phase,
              value: 0,
              input_method: "auto_zero",
              answered_at: new Date().toISOString(),
            });
          }
        }
      }
    }

    // Insert missing rows (auto-zero)
    if (missingRows.length > 0) {
      const { error: insertErr } = await supabase
        .from("daily_answers")
        .insert(missingRows);

      if (insertErr) throw insertErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: today,
        employeesProcessed: (employees || []).length,
        questionsProcessed: (questions || []).length,
        autoZeroedEntries: missingRows.length,
        skippedOnLeave: onLeaveIds.size,
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
