import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Vibration,
  AppState,
  ScrollView,
} from "react-native";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { isSTTAvailable, listenOnce } from "../../lib/speech";
import { scheduleAllAlarms, setDayState } from "../../lib/alarms";
import { useAuth } from "../../lib/auth";
import { colors } from "../../lib/theme";
import {
  getActiveQuestions,
  getTodaysAnswers,
  submitAnswer,
  getNotificationConfig,
  updateDailyStatus,
  getDailyStatus,
  type Question,
  type DailyAnswer,
  type NotificationConfig,
  type DailyStatus,
} from "../../lib/supabase";
import { parseSpokenNumber, isPastDeadline, todayIST, currentISTTime, getTodayState } from "../../lib/utils";

type Phase = "plan" | "ach";
type Mode = "summary" | Phase;

export default function EmployeeQuestionFlowScreen() {
  const { employee } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<DailyAnswer[]>([]);
  const [notifConfig, setNotifConfig] = useState<NotificationConfig[]>([]);
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [mode, setMode] = useState<Mode>("summary");
  const [flowKind, setFlowKind] = useState<"phase" | "edit">("phase");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micStatus, setMicStatus] = useState("");
  const date = todayIST();

  const getDeadline = useCallback(
    (p: Phase) => {
      const key = p === "plan" ? "am_deadline" : "pm_deadline";
      const config = notifConfig.find((c) => c.slot_key === key);
      return config?.fire_time || (p === "plan" ? "09:30:00" : "17:30:00");
    },
    [notifConfig]
  );

  const loadData = useCallback(async () => {
    if (!employee) return;
    try {
      const [qs, ans, config, st] = await Promise.all([
        getActiveQuestions(),
        getTodaysAnswers(employee.id, date),
        getNotificationConfig(),
        getDailyStatus(employee.id, date),
      ]);

      setQuestions(qs);
      setAnswers(ans);
      setNotifConfig(config);
      setStatus(st);

      // Re-arm native alarms with the latest config every time this screen loads.
      // setExactAndAllowWhileIdle is one-shot — nothing else re-reads config and
      // re-schedules unless the app cold-starts, so an admin's time change (or a
      // reminder that already fired and was consumed) would otherwise go stale.
      scheduleAllAlarms(config).catch(() => {});

      const ts = getTodayState({ questions: qs, answers: ans, status: st, config, now: new Date() });
      setDayState(date, ts.plan === "done", ts.ach === "done", ts.onLeave).catch(() => {});
    } catch (err) {
      console.error("Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, [employee, date]);

  useEffect(() => { loadData(); }, [loadData]);

  // Re-run loadData (and its alarm re-arm) when the app comes back to the
  // foreground, not just on first mount — React Navigation keeps this screen
  // mounted across background/foreground cycles, so the mount effect alone
  // misses config changes made while the app was merely backgrounded, not killed.
  // This only refreshes data; it never touches `mode`/`currentIndex`, so it can
  // never re-trigger speech or jump the user out of an in-progress flow.
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") loadDataRef.current();
    });
    return () => sub.remove();
  }, []);

  // Leaving flow mode (back to summary) always stops any in-flight speech.
  useEffect(() => {
    if (mode === "summary") Speech.stop();
  }, [mode]);
  useEffect(() => () => { Speech.stop(); }, []);
  // Flow index out of range (e.g. questions changed) → fall back to summary.
  useEffect(() => {
    if (mode !== "summary" && !loading && !questions[currentIndex]) setMode("summary");
  }, [mode, loading, questions, currentIndex]);

  const handleMicPress = useCallback(async () => {
    if (isListening) return;
    setIsListening(true);
    setMicStatus("");
    Vibration.vibrate(15);
    try {
      const transcript = await listenOnce((partial) => setMicStatus(partial));
      const num = parseSpokenNumber(transcript);
      if (num !== null) {
        setInputValue(String(num));
        setMicStatus("");
      } else {
        setMicStatus(transcript ? `Heard "${transcript}" — couldn't find a number. Try again or use the keypad.` : "Didn't catch a number. Try again or use the keypad.");
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "";
      setMicStatus(
        reason === "timeout" || reason === "no-speech"
          ? "Didn't hear anything. Try again or use the keypad."
          : reason === "Microphone permission denied"
          ? "Microphone permission denied — enable it in Settings, or use the keypad."
          : "Couldn't hear that. Try again or use the keypad."
      );
      console.warn("[STT] Failed:", err);
    } finally {
      setIsListening(false);
    }
  }, [isListening]);

  // Speak question when it changes, then auto-start listening (no button tap needed).
  // expo-speech queues calls by default — stop() first so a leftover/earlier
  // utterance never plays ahead of the current question.
  const speakQuestion = useCallback((p: Phase, q: Question) => {
    const prompt = p === "plan" ? `How many ${q.label} today?` : `How many ${q.label} did you achieve?`;
    Speech.stop();
    setIsSpeaking(true);
    Speech.speak(prompt, {
      language: "en-IN",
      rate: 0.9,
      onDone: () => {
        setIsSpeaking(false);
        if (isSTTAvailable) handleMicPress();
      },
      onError: () => setIsSpeaking(false),
    });
  }, [handleMicPress]);

  // Keyed on mode + currentIndex only — never on `questions` identity — so a
  // background/foreground reload (which replaces the `questions` array) never
  // re-triggers speech or the mic. Speech+auto-mic only ever run in flow mode.
  const questionsRef = useRef(questions);
  questionsRef.current = questions;
  useEffect(() => {
    setMicStatus("");
    if (mode === "summary") return;
    const qs = questionsRef.current;
    if (qs.length > 0 && currentIndex < qs.length) {
      speakQuestion(mode, qs[currentIndex]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentIndex]);

  const firstUnansweredIndex = (p: Phase, ans: DailyAnswer[], qs: Question[]) => {
    const answeredIds = new Set(ans.filter((a) => a.phase === p).map((a) => a.question_id));
    const idx = qs.findIndex((q) => !answeredIds.has(q.id));
    return idx >= 0 ? idx : 0;
  };

  const startPhase = useCallback(async (p: Phase) => {
    if (!employee) return;
    const startedKey = p === "plan" ? "plan_started_at" : "ach_started_at";
    if (!status?.[startedKey]) {
      const updates = { [startedKey]: new Date().toISOString() } as Partial<DailyStatus>;
      updateDailyStatus(employee.id, date, updates).catch(() => {});
      setStatus((s) => ({ ...(s ?? {}), ...updates } as DailyStatus));
    }
    setFlowKind("phase");
    setCurrentIndex(firstUnansweredIndex(p, answers, questions));
    setInputValue("");
    setMode(p);
  }, [employee, status, answers, questions, date]);

  const startEdit = useCallback((p: Phase, idx: number) => {
    const q = questions[idx];
    if (!q) return;
    const existing = answers.find((a) => a.phase === p && a.question_id === q.id);
    setFlowKind("edit");
    setCurrentIndex(idx);
    setInputValue(existing ? String(existing.value) : "");
    setMode(p);
  }, [questions, answers]);

  const handleKeypadPress = (key: string) => {
    Vibration.vibrate(10);
    if (key === "del") setInputValue(inputValue.slice(0, -1));
    else if (key === "clear") setInputValue("");
    else setInputValue(inputValue + key);
  };

  const handleSubmit = async () => {
    if (mode === "summary" || !employee || !questions[currentIndex]) return;
    const p = mode as Phase;
    const value = parseInt(inputValue, 10);
    if (isNaN(value) || value < 0) return;

    // Re-check the deadline at write time — loadData only checked it on mount,
    // so a submit made while the app stayed open past the deadline would
    // otherwise still go through.
    if (isPastDeadline(getDeadline(p))) {
      await loadData();
      setMode("summary");
      return;
    }

    setSubmitting(true);
    try {
      const q = questions[currentIndex];
      await submitAnswer(employee.id, q.id, date, p, value, "typed");

      const nextAnswers: DailyAnswer[] = [
        ...answers.filter((a) => !(a.phase === p && a.question_id === q.id)),
        {
          id: `${q.id}-${p}`,
          employee_id: employee.id,
          question_id: q.id,
          answer_date: date,
          phase: p,
          value,
          input_method: "typed",
          answered_at: new Date().toISOString(),
        },
      ];
      setAnswers(nextAnswers);

      // Completion is based on every active question id having an answer —
      // not merely "we're on the last index" — so a question added mid-flow
      // or an out-of-order edit doesn't falsely mark the phase complete/incomplete.
      const activeIds = new Set(questions.map((qq) => qq.id));
      const answeredIds = new Set(
        nextAnswers.filter((a) => a.phase === p && activeIds.has(a.question_id)).map((a) => a.question_id)
      );
      const allAnswered = [...activeIds].every((id) => answeredIds.has(id));
      const completedKey = p === "plan" ? "plan_completed_at" : "ach_completed_at";

      if (allAnswered && !status?.[completedKey]) {
        const updates = { [completedKey]: new Date().toISOString() } as Partial<DailyStatus>;
        await updateDailyStatus(employee.id, date, updates);
        setStatus((s) => ({ ...(s ?? {}), ...updates } as DailyStatus));
      }

      if (flowKind === "edit" || allAnswered || currentIndex >= questions.length - 1) {
        await loadData();
        setMode("summary");
      } else {
        setCurrentIndex(currentIndex + 1);
        setInputValue("");
      }
    } catch (err) {
      console.error("Submit failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.centerText}>Loading questions...</Text>
      </View>
    );
  }

  const todayState = getTodayState({ questions, answers, status, config: notifConfig, now: new Date() });

  if (mode === "summary") {
    const planLabel =
      todayState.plan === "done" ? "Goal submitted ✓" : todayState.plan === "missed" ? "Deadline passed" : "Tap to start";
    const achLabel =
      todayState.ach === "locked"
        ? "Complete goal first"
        : todayState.ach === "done"
        ? "Done ✓"
        : todayState.ach === "missed"
        ? "Deadline passed"
        : "Tap to start";
    const planDisabled = todayState.onLeave || todayState.plan !== "open";
    const achDisabled = todayState.onLeave || todayState.ach !== "open";
    // Answers stay editable until that phase's deadline, even after the phase is submitted.
    const canEdit = (p: Phase) => {
      const st = p === "plan" ? todayState.plan : todayState.ach;
      return !todayState.onLeave && (st === "open" || (st === "done" && !isPastDeadline(getDeadline(p))));
    };

    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={styles.summaryDate}>
          {new Date(date).toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long" })}
        </Text>

        {todayState.onLeave && (
          <View style={styles.leaveBanner}>
            <Ionicons name="airplane-outline" size={16} color={colors.warning} />
            <Text style={styles.leaveBannerText}>You're marked on leave today</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.summaryBtn, planDisabled && styles.summaryBtnDisabled]}
          onPress={() => startPhase("plan")}
          disabled={planDisabled}
        >
          <Ionicons name="sunny-outline" size={22} color={colors.accentLight} />
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryBtnTitle}>Start Goal</Text>
            <Text style={styles.summaryBtnState}>{planLabel}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.summaryBtn, achDisabled && styles.summaryBtnDisabled]}
          onPress={() => startPhase("ach")}
          disabled={achDisabled}
        >
          <Ionicons name="trophy-outline" size={22} color={colors.accentLight} />
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryBtnTitle}>Start Achievements</Text>
            <Text style={styles.summaryBtnState}>{achLabel}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <Text style={styles.tableHeading}>Today's questions</Text>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 2 }]}>Label</Text>
            <Text style={[styles.tableCell, styles.tableHeaderCell]}>Plan</Text>
            <Text style={[styles.tableCell, styles.tableHeaderCell]}>Ach</Text>
          </View>
          {questions.map((q, idx) => {
            const planAns = answers.find((a) => a.phase === "plan" && a.question_id === q.id);
            const achAns = answers.find((a) => a.phase === "ach" && a.question_id === q.id);
            return (
              <View key={q.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{q.label}</Text>
                <TouchableOpacity
                  style={styles.tableCellTouch}
                  disabled={!canEdit("plan")}
                  onPress={() => startEdit("plan", idx)}
                >
                  <Text style={styles.tableCellValue}>{planAns ? planAns.value : "—"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.tableCellTouch}
                  disabled={!canEdit("ach")}
                  onPress={() => startEdit("ach", idx)}
                >
                  <Text style={styles.tableCellValue}>{achAns ? achAns.value : "—"}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  const phase = mode as Phase;
  const deadline = getDeadline(phase);
  const questionPrompt = phase === "plan"
    ? `How many ${currentQuestion.label} today?`
    : `How many ${currentQuestion.label} did you achieve?`;
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backRow}
          onPress={() => { Speech.stop(); setMode("summary"); }}
        >
          <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.badgeRow}>
          <Ionicons name={phase === "plan" ? "sunny-outline" : "moon-outline"} size={14} color={colors.accentLight} />
          <Text style={styles.phaseBadge}>{phase === "plan" ? "Morning Plan" : "Evening Achievement"}</Text>
        </View>
        <View style={styles.badgeRow}>
          <Ionicons name="time-outline" size={12} color={colors.textMuted} />
          <Text style={styles.timeBadge}>{deadline.slice(0, 5)} · Now: {currentISTTime()}</Text>
        </View>
      </View>

      <Text style={styles.counter}>Question {currentIndex + 1} of {questions.length}</Text>

      {/* Question Card */}
      <View style={styles.questionCard}>
        <Text style={styles.questionText}>{questionPrompt}</Text>

        <View style={styles.inputDisplay}>
          <Text style={styles.inputValue}>{inputValue || "0"}</Text>
        </View>

        {/* TTS + STT buttons */}
        <View style={styles.voiceRow}>
          <TouchableOpacity
            style={styles.speakBtn}
            onPress={() => speakQuestion(phase, currentQuestion)}
            disabled={isSpeaking}
          >
            <Ionicons name="volume-high-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.speakBtnText}>
              {isSpeaking ? "Speaking..." : "Repeat Question"}
            </Text>
          </TouchableOpacity>

          {isSTTAvailable && (
            <TouchableOpacity
              style={styles.speakBtn}
              onPress={handleMicPress}
              disabled={isListening}
            >
              <Ionicons name="mic-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.speakBtnText}>
                {isListening ? "Listening..." : "Answer again"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {!!micStatus && (
          <Text style={styles.micStatusText}>{micStatus}</Text>
        )}

        {/* Keypad — always available, voice is optional */}
        <View style={styles.keypad}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"].map((key) => (
            <TouchableOpacity
              key={key}
              style={styles.keypadBtn}
              onPress={() => handleKeypadPress(key)}
              activeOpacity={0.6}
            >
              <Text style={[styles.keypadText, (key === "clear" || key === "del") && styles.keypadAction]}>
                {key === "del" ? "⌫" : key === "clear" ? "C" : key}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, (!inputValue || submitting) && { opacity: 0.4 }]}
          onPress={handleSubmit}
          disabled={!inputValue || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Submit & Next →</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: 32 },
  centerText: { fontSize: 14, color: colors.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 22 },
  progressTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 12, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 2 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { fontSize: 13, color: colors.textSecondary },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  phaseBadge: { fontSize: 14, fontWeight: "600", color: colors.accentLight },
  timeBadge: { fontSize: 11, color: colors.textMuted },
  counter: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  questionCard: {
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  questionText: { fontSize: 20, fontWeight: "700", textAlign: "center", color: colors.textPrimary, marginBottom: 16 },
  inputDisplay: { alignItems: "center", marginBottom: 16 },
  inputValue: {
    fontSize: 48,
    fontWeight: "800",
    color: colors.textPrimary,
    borderBottomWidth: 3,
    borderBottomColor: colors.accent,
    paddingHorizontal: 16,
    paddingBottom: 4,
    minWidth: 80,
    textAlign: "center",
  },
  voiceRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  speakBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 99,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  speakBtnText: { fontSize: 13, color: colors.textSecondary },
  micStatusText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: -8,
    marginBottom: 16,
  },
  keypad: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  keypadBtn: {
    width: "30%",
    flexGrow: 1,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  keypadText: { fontSize: 20, fontWeight: "600", color: colors.textPrimary },
  keypadAction: { fontSize: 16, color: colors.textSecondary },
  submitBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  submitBtnText: { color: "white", fontSize: 16, fontWeight: "600" },
  summaryDate: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
  leaveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  leaveBannerText: { color: colors.warning, fontSize: 13, fontWeight: "600" },
  summaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  summaryBtnDisabled: { opacity: 0.5 },
  summaryBtnTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  summaryBtnState: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  tableHeading: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginTop: 12, marginBottom: 8 },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderRow: { backgroundColor: "rgba(255,255,255,0.04)" },
  tableCell: { flex: 1, padding: 10, fontSize: 13, color: colors.textPrimary },
  tableHeaderCell: { fontWeight: "700", color: colors.textMuted, fontSize: 11 },
  tableCellTouch: { flex: 1, padding: 10, alignItems: "flex-start" },
  tableCellValue: { fontSize: 13, color: colors.textPrimary, fontWeight: "600" },
});
