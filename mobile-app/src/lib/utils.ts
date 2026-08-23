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
