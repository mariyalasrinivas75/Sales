/**
 * Word-to-number parser for voice input (shared between mobile and PWA).
 */

const WORD_MAP: Record<string, number> = {
  zero: 0, oh: 0, nil: 0, none: 0,
  one: 1, won: 1,
  two: 2, to: 2, too: 2,
  three: 3,
  four: 4, for: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8, ate: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40, fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

export function parseSpokenNumber(text: string): number | null {
  if (!text?.trim()) return null;
  const cleaned = text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const directNum = parseInt(cleaned, 10);
  if (!isNaN(directNum) && directNum >= 0 && directNum <= 9999) return directNum;
  const digitMatch = cleaned.match(/\d+/);
  if (digitMatch) {
    const num = parseInt(digitMatch[0], 10);
    if (num >= 0 && num <= 9999) return num;
  }
  const words = cleaned.split(/\s+/);
  let total = 0;
  let found = false;
  for (const word of words) {
    if (word in WORD_MAP) { total += WORD_MAP[word]; found = true; }
  }
  if (found) return total;
  return null;
}

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function isSundayIST(): boolean {
  const weekday = new Date().toLocaleDateString("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  });
  return weekday === "Sun";
}

export function isPastDeadline(fireTime: string): boolean {
  const now = new Date();
  const istStr = now.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return istStr >= fireTime;
}

export function currentISTTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Today state (plan/achievement gating) ──

export const ACH_UNLOCK_DELAY_MIN = 120;

function istTimeOfDay(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function istHHMM(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface TodayStateQuestion {
  id: string;
}

interface TodayStateAnswer {
  question_id: string;
  phase: "plan" | "ach";
  answered_at: string | null;
}

interface TodayStateStatus {
  plan_completed_at: string | null;
  ach_completed_at: string | null;
  is_leave?: boolean;
}

interface TodayStateConfig {
  slot_key: string;
  fire_time: string;
}

export interface GetTodayStateArgs {
  questions: TodayStateQuestion[];
  answers: TodayStateAnswer[];
  status: TodayStateStatus | null;
  config: TodayStateConfig[];
  now: Date;
}

export interface TodayState {
  plan: "open" | "done" | "missed";
  ach: "locked" | "waiting" | "open" | "done" | "missed";
  achUnlockAt: string | null; // "HH:MM" IST, or null while ach is locked
  onLeave: boolean;
}

/**
 * Pure function computing the employee's plan/achievement state for "today".
 * Strict "no goal, no achievement": achievements stay locked all day unless
 * the plan phase is fully done (including the partial-at-deadline case).
 */
export function getTodayState({ questions, answers, status, config, now }: GetTodayStateArgs): TodayState {
  const onLeave = !!status?.is_leave;
  const activeIds = new Set(questions.map((q) => q.id));
  const amDeadline = config.find((c) => c.slot_key === "am_deadline")?.fire_time || "09:30:00";
  const pmDeadline = config.find((c) => c.slot_key === "pm_deadline")?.fire_time || "17:30:00";
  const nowTime = istTimeOfDay(now);

  const planAnswers = answers.filter((a) => a.phase === "plan" && activeIds.has(a.question_id));
  const planAnsweredIds = new Set(planAnswers.map((a) => a.question_id));
  const planDoneByAnswers = activeIds.size > 0 && [...activeIds].every((id) => planAnsweredIds.has(id));
  const planDone = !!status?.plan_completed_at || planDoneByAnswers;

  let plan: TodayState["plan"];
  if (planDone) plan = "done";
  else if (nowTime >= amDeadline) plan = "missed";
  else plan = "open";

  let ach: TodayState["ach"];
  let achUnlockAt: string | null = null;

  if (!planDone) {
    ach = "locked";
  } else {
    let anchor: Date;
    if (status?.plan_completed_at) {
      anchor = new Date(status.plan_completed_at);
    } else {
      const times = planAnswers
        .map((a) => a.answered_at)
        .filter((t): t is string => !!t)
        .map((t) => new Date(t).getTime());
      anchor = times.length > 0 ? new Date(Math.max(...times)) : now;
    }
    const unlockDate = new Date(anchor.getTime() + ACH_UNLOCK_DELAY_MIN * 60000);
    achUnlockAt = istHHMM(unlockDate);

    const achAnswers = answers.filter((a) => a.phase === "ach" && activeIds.has(a.question_id));
    const achAnsweredIds = new Set(achAnswers.map((a) => a.question_id));
    const achDoneByAnswers = activeIds.size > 0 && [...activeIds].every((id) => achAnsweredIds.has(id));
    const achDone = !!status?.ach_completed_at || achDoneByAnswers;

    if (now.getTime() < unlockDate.getTime()) ach = "waiting";
    else if (achDone) ach = "done";
    else if (nowTime >= pmDeadline) ach = "missed";
    else ach = "open";
  }

  return { plan, ach, achUnlockAt, onLeave };
}
