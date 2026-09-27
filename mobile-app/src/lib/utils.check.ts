/**
 * Self-check for getTodayState. Run with: npx tsx src/lib/utils.check.ts
 * No framework — plain asserts, exits non-zero on failure.
 */
import assert from "node:assert";
import { getTodayState, type GetTodayStateArgs } from "./utils";

const Q1 = { id: "q1" };
const Q2 = { id: "q2" };
const QUESTIONS = [Q1, Q2];
const CONFIG = [
  { slot_key: "am_deadline", fire_time: "09:30:00" },
  { slot_key: "pm_deadline", fire_time: "17:30:00" },
];

// IST wall-clock helper: build the Date instant whose IST time-of-day is hh:mm.
function istDate(hh: number, mm: number, dateStr = "2026-09-27"): Date {
  return new Date(`${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`);
}

function base(overrides: Partial<GetTodayStateArgs> = {}): GetTodayStateArgs {
  return {
    questions: QUESTIONS,
    answers: [],
    status: null,
    config: CONFIG,
    now: istDate(9, 0),
    ...overrides,
  };
}

// 1. Plan open — before deadline, nothing answered.
{
  const s = getTodayState(base({ now: istDate(8, 0) }));
  assert.strictEqual(s.plan, "open", "plan should be open before deadline");
  assert.strictEqual(s.ach, "locked", "ach locked while plan not done");
}

// 2. Plan done via status timestamp.
{
  const s = getTodayState(
    base({
      status: { plan_completed_at: istDate(8, 30).toISOString(), ach_completed_at: null },
      now: istDate(8, 45),
    })
  );
  assert.strictEqual(s.plan, "done");
}

// 3. Plan missed — past am_deadline, nothing answered.
{
  const s = getTodayState(base({ now: istDate(9, 30) }));
  assert.strictEqual(s.plan, "missed");
  assert.strictEqual(s.ach, "locked", "strict: missed plan locks ach all day");
}

// 4. Partial at deadline = missed (5 of 7 style: here 1 of 2 answered).
{
  const s = getTodayState(
    base({
      answers: [{ question_id: "q1", phase: "plan", answered_at: istDate(8, 0).toISOString() }],
      now: istDate(9, 30),
    })
  );
  assert.strictEqual(s.plan, "missed", "partial answers at deadline must be missed, not done");
  assert.strictEqual(s.ach, "locked");
}

// 5. Plan done via answers (id-set match, no status timestamp) -> ach open immediately.
{
  const answeredAt = istDate(8, 0).toISOString();
  const s = getTodayState(
    base({
      answers: [
        { question_id: "q1", phase: "plan", answered_at: answeredAt },
        { question_id: "q2", phase: "plan", answered_at: answeredAt },
      ],
      now: istDate(8, 1),
    })
  );
  assert.strictEqual(s.plan, "done");
  assert.strictEqual(s.ach, "open", "ach unlocks immediately after goal");
}

// 6. Ach opens the moment plan_completed_at is set.
{
  const completedAt = istDate(10, 0).toISOString();
  const s = getTodayState(
    base({ status: { plan_completed_at: completedAt, ach_completed_at: null }, now: istDate(10, 0) })
  );
  assert.strictEqual(s.ach, "open");
}

// 7. Ach open -> done once all active ids answered.
{
  const completedAt = istDate(10, 0).toISOString();
  const answeredAt = istDate(12, 5).toISOString();
  const s = getTodayState(
    base({
      status: { plan_completed_at: completedAt, ach_completed_at: null },
      answers: [
        { question_id: "q1", phase: "ach", answered_at: answeredAt },
        { question_id: "q2", phase: "ach", answered_at: answeredAt },
      ],
      now: istDate(12, 10),
    })
  );
  assert.strictEqual(s.ach, "done");
}

// 8. Ach missed — unlocked, past pm_deadline, not all answered.
{
  const completedAt = istDate(10, 0).toISOString();
  const s = getTodayState(
    base({ status: { plan_completed_at: completedAt, ach_completed_at: null }, now: istDate(17, 30) })
  );
  assert.strictEqual(s.ach, "missed");
}

// 9. On leave.
{
  const s = getTodayState(base({ status: { plan_completed_at: null, ach_completed_at: null, is_leave: true }, now: istDate(9, 0) }));
  assert.strictEqual(s.onLeave, true);
}

// 10. Question added mid-day after plan_completed_at still counts as done.
{
  const completedAt = istDate(8, 0).toISOString();
  const s = getTodayState(
    base({
      questions: [Q1, Q2, { id: "q3-added-later" }],
      status: { plan_completed_at: completedAt, ach_completed_at: null },
      answers: [
        { question_id: "q1", phase: "plan", answered_at: completedAt },
        { question_id: "q2", phase: "plan", answered_at: completedAt },
      ],
      now: istDate(8, 5),
    })
  );
  assert.strictEqual(s.plan, "done", "trusted plan_completed_at timestamp beats id-set re-check");
}

// 11. Answers to deactivated (no longer active) questions are ignored.
{
  const s = getTodayState(
    base({
      questions: [Q1], // q2 no longer active
      answers: [{ question_id: "q2", phase: "plan", answered_at: istDate(8, 0).toISOString() }],
      now: istDate(8, 5),
    })
  );
  assert.strictEqual(s.plan, "open", "answer for inactive q2 must not count toward active q1-only plan");
}

console.log("utils.check.ts: all", 11, "checks passed");
