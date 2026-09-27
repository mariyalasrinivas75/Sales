/**
 * Word-to-number parser for voice input.
 * Handles spoken numbers like "five", "twenty three", "forty two" etc.
 * Range: 0-100
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
  if (!text || !text.trim()) return null;

  const cleaned = text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "");

  // Try direct number parsing first
  const directNum = parseInt(cleaned, 10);
  if (!isNaN(directNum) && directNum >= 0 && directNum <= 9999) {
    return directNum;
  }

  // Try to extract digits from mixed text
  const digitMatch = cleaned.match(/\d+/);
  if (digitMatch) {
    const num = parseInt(digitMatch[0], 10);
    if (num >= 0 && num <= 9999) return num;
  }

  // Try word-to-number
  const words = cleaned.split(/\s+/);
  let total = 0;
  let found = false;

  for (const word of words) {
    if (word in WORD_MAP) {
      total += WORD_MAP[word];
      found = true;
    }
  }

  if (found) return total;

  // Single word exact match
  if (cleaned in WORD_MAP) {
    return WORD_MAP[cleaned];
  }

  return null;
}

/**
 * Check if the current time is past a deadline.
 * @param fireTime - Time string in "HH:MM:SS" format
 * @returns true if current IST time is past the deadline
 */
export function isPastDeadline(fireTime: string): boolean {
  const now = new Date();
  // Get current IST time
  const istStr = now.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return istStr >= fireTime;
}

/**
 * Get today's date in YYYY-MM-DD format (IST)
 */
export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Get current IST time as HH:MM
 */
export function currentISTTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Today state (plan/achievement gating) ──
// Mirrored in mobile-app/src/lib/utils.ts — keep semantics identical.

interface TodayStateQuestion {
  id: string;
  active?: boolean;
}

interface TodayStateAnswer {
  question_id: string;
  phase: "plan" | "ach";
  answered_at: string | null;
}

interface TodayStateStatus {
  is_leave?: boolean | null;
  plan_completed_at?: string | null;
  ach_completed_at?: string | null;
}

interface TodayStateConfig {
  am_deadline?: string | null;
  pm_deadline?: string | null;
}

export interface TodayState {
  plan: "open" | "done" | "missed";
  ach: "locked" | "open" | "done" | "missed";
  onLeave: boolean;
}

function istTimeString(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}


export function getTodayState({
  questions,
  answers,
  status,
  config,
  now,
}: {
  questions: TodayStateQuestion[];
  answers: TodayStateAnswer[];
  status: TodayStateStatus | null | undefined;
  config: TodayStateConfig | null | undefined;
  now: Date;
}): TodayState {
  const onLeave = !!status?.is_leave;
  const activeIds = new Set(questions.filter((q) => q.active !== false).map((q) => q.id));
  const amDeadline = config?.am_deadline || "09:30:00";
  const pmDeadline = config?.pm_deadline || "17:30:00";
  const nowIST = istTimeString(now);

  const planAnswers = answers.filter((a) => a.phase === "plan" && activeIds.has(a.question_id));
  const planAnsweredIds = new Set(planAnswers.map((a) => a.question_id));
  const planDoneByAnswers =
    activeIds.size > 0 && [...activeIds].every((id) => planAnsweredIds.has(id));
  const planDone = !!status?.plan_completed_at || planDoneByAnswers;
  const planMissed = !planDone && nowIST >= amDeadline;
  const plan: TodayState["plan"] = planDone ? "done" : planMissed ? "missed" : "open";

  if (plan !== "done") {
    // Strict: no goal, no achievement — even a partially-done/missed plan keeps ach locked all day.
    return { plan, ach: "locked", onLeave };
  }

  const achAnswers = answers.filter((a) => a.phase === "ach" && activeIds.has(a.question_id));
  const achAnsweredIds = new Set(achAnswers.map((a) => a.question_id));
  const achDoneByAnswers =
    activeIds.size > 0 && [...activeIds].every((id) => achAnsweredIds.has(id));
  const achDone = !!status?.ach_completed_at || achDoneByAnswers;

  let ach: TodayState["ach"];
  if (achDone) {
    ach = "done";
  } else if (nowIST >= pmDeadline) {
    ach = "missed";
  } else {
    ach = "open";
  }

  return { plan, ach, onLeave };
}
