/**
 * Self-check for getTodayState. Not part of the build; run manually with:
 *   npx tsc --module commonjs --outDir .check-out src/lib/utils.ts src/lib/utils.check.ts && node .check-out/utils.check.js
 */
import { getTodayState } from "./utils";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok: " + msg);
}

const Q = [
  { id: "q1", active: true },
  { id: "q2", active: true },
];
const config = { am_deadline: "09:30:00", pm_deadline: "17:30:00" };

// plan open, no answers, before deadline
{
  const now = new Date("2026-09-27T03:00:00Z"); // ~08:30 IST
  const s = getTodayState({ questions: Q, answers: [], status: null, config, now });
  assert(s.plan === "open", "plan open before deadline with no answers");
  assert(s.ach === "locked", "ach locked when plan not done");
}

// plan missed: partial answers, past am_deadline
{
  const now = new Date("2026-09-27T04:15:00Z"); // ~09:45 IST
  const answers = [{ question_id: "q1", phase: "plan" as const, answered_at: "2026-09-27T03:30:00Z" }];
  const s = getTodayState({ questions: Q, answers, status: null, config, now });
  assert(s.plan === "missed", "partial plan at/after deadline = missed");
  assert(s.ach === "locked", "ach locked all day when plan missed (strict, incl. partial)");
}

// plan done via all-answered (no explicit completed_at), ach open immediately
{
  const planCompletedAt = "2026-09-27T03:00:00Z";
  const answers = [
    { question_id: "q1", phase: "plan" as const, answered_at: "2026-09-27T02:50:00Z" },
    { question_id: "q2", phase: "plan" as const, answered_at: planCompletedAt },
  ];
  const s1 = getTodayState({ questions: Q, answers, status: null, config, now: new Date(planCompletedAt) });
  assert(s1.plan === "done", "plan done via all active answered, no completed_at needed");
  assert(s1.ach === "open", "ach unlocks immediately after goal");
}

// question added mid-day after plan_completed_at stays done
{
  const status = { plan_completed_at: "2026-09-27T03:00:00Z" };
  const now = new Date("2026-09-27T03:05:00Z");
  const s = getTodayState({ questions: [...Q, { id: "q3", active: true }], answers: [], status, config, now });
  assert(s.plan === "done", "plan_completed_at trusted even if a new active question has no answer yet");
}

// answers to deactivated questions not counted
{
  const answers = [
    { question_id: "q1", phase: "plan" as const, answered_at: "2026-09-27T02:00:00Z" },
    { question_id: "qDeactivated", phase: "plan" as const, answered_at: "2026-09-27T02:00:00Z" },
  ];
  const now = new Date("2026-09-27T03:00:00Z");
  const s = getTodayState({ questions: Q, answers, status: null, config, now });
  assert(s.plan === "open", "answer to inactive question doesn't count toward completion");
}

// ach done + missed + leave
{
  const status = { plan_completed_at: "2026-09-27T00:00:00Z", ach_completed_at: "2026-09-27T05:00:00Z" };
  const now = new Date("2026-09-27T05:30:00Z");
  const s = getTodayState({ questions: Q, answers: [], status, config, now });
  assert(s.ach === "done", "ach done via ach_completed_at");
}
{
  const status = { plan_completed_at: "2026-09-27T00:00:00Z" };
  const now = new Date("2026-09-27T12:15:00Z"); // ~17:45 IST, past pm_deadline
  const s = getTodayState({ questions: Q, answers: [], status, config, now });
  assert(s.ach === "missed", "ach missed after pm_deadline");
}
{
  const status = { is_leave: true };
  const now = new Date("2026-09-27T03:00:00Z");
  const s = getTodayState({ questions: Q, answers: [], status, config, now });
  assert(s.onLeave === true, "onLeave flag reflects status.is_leave");
}

console.log("All getTodayState checks passed.");
