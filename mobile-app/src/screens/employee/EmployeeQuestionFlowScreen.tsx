import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Vibration,
} from "react-native";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { isSTTAvailable, listenOnce } from "../../lib/speech";
import { scheduleAllAlarms } from "../../lib/alarms";
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
} from "../../lib/supabase";
import { parseSpokenNumber, isPastDeadline, todayIST, currentISTTime } from "../../lib/utils";

type Phase = "plan" | "ach";

export default function EmployeeQuestionFlowScreen() {
  const { employee } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<DailyAnswer[]>([]);
  const [notifConfig, setNotifConfig] = useState<NotificationConfig[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("plan");
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [allDone, setAllDone] = useState(false);
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
      const [qs, ans, config, status] = await Promise.all([
        getActiveQuestions(),
        getTodaysAnswers(employee.id, date),
        getNotificationConfig(),
        getDailyStatus(employee.id, date),
      ]);

      setQuestions(qs);
      setAnswers(ans);
      setNotifConfig(config);

      // Re-arm native alarms with the latest config every time this screen loads.
      // setExactAndAllowWhileIdle is one-shot — nothing else re-reads config and
      // re-schedules unless the app cold-starts, so an admin's time change (or a
      // reminder that already fired and was consumed) would otherwise go stale.
      scheduleAllAlarms(config).catch(() => {});

      if (status?.is_leave) { setIsLocked(true); setLoading(false); return; }

      const planDeadline = config.find((c) => c.slot_key === "am_deadline")?.fire_time || "09:30:00";
      const planAnswers = ans.filter((a) => a.phase === "plan");
      const achAnswers = ans.filter((a) => a.phase === "ach");

      if (achAnswers.length >= qs.length) {
        setAllDone(true);
      } else if (planAnswers.length >= qs.length || isPastDeadline(planDeadline)) {
        setPhase("ach");
        const answeredIds = new Set(achAnswers.map((a) => a.question_id));
        const first = qs.findIndex((q) => !answeredIds.has(q.id));
        setCurrentIndex(first >= 0 ? first : 0);
      } else {
        setPhase("plan");
        const answeredIds = new Set(planAnswers.map((a) => a.question_id));
        const first = qs.findIndex((q) => !answeredIds.has(q.id));
        setCurrentIndex(first >= 0 ? first : 0);
      }
    } catch (err) {
      console.error("Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, [employee, date]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => () => Speech.stop(), []);

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
  const speakQuestion = useCallback((q: Question) => {
    const prompt = phase === "plan" ? `How many ${q.label} today?` : `How many ${q.label} did you achieve?`;
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
  }, [phase, handleMicPress]);

  useEffect(() => {
    setMicStatus("");
    if (questions.length > 0 && currentIndex < questions.length && !allDone && !isLocked) {
      speakQuestion(questions[currentIndex]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, questions, allDone, isLocked]);

  const handleKeypadPress = (key: string) => {
    Vibration.vibrate(10);
    if (key === "del") setInputValue(inputValue.slice(0, -1));
    else if (key === "clear") setInputValue("");
    else setInputValue(inputValue + key);
  };

  const handleSubmit = async () => {
    if (!employee || !questions[currentIndex]) return;
    const value = parseInt(inputValue, 10);
    if (isNaN(value) || value < 0) return;

    // Re-check the deadline at write time — loadData only checked it on mount,
    // so a submit made while the app stayed open past the deadline would
    // otherwise still go through.
    if (isPastDeadline(getDeadline(phase))) {
      setIsLocked(true);
      return;
    }

    setSubmitting(true);
    try {
      const q = questions[currentIndex];
      await submitAnswer(employee.id, q.id, date, phase, value, "typed");

      const statusUpdate: Record<string, string> = {};
      if (phase === "plan" && currentIndex === 0) statusUpdate.plan_started_at = new Date().toISOString();
      if (phase === "plan" && currentIndex === questions.length - 1) statusUpdate.plan_completed_at = new Date().toISOString();
      if (phase === "ach" && currentIndex === 0) statusUpdate.ach_started_at = new Date().toISOString();
      if (phase === "ach" && currentIndex === questions.length - 1) statusUpdate.ach_completed_at = new Date().toISOString();
      if (Object.keys(statusUpdate).length > 0) {
        await updateDailyStatus(employee.id, date, statusUpdate);
      }

      if (currentIndex < questions.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setInputValue("");
      } else {
        if (phase === "plan") {
          setAllDone(true); // Plan done, wait for evening
        } else {
          setAllDone(true); // All done
        }
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

  if (isLocked) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.textMuted} />
        <Text style={styles.centerTitle}>Time's Up</Text>
        <Text style={styles.centerText}>
          The {phase === "plan" ? "morning plan" : "evening achievement"} deadline has passed.
        </Text>
      </View>
    );
  }

  if (allDone) {
    const achDone = answers.filter((a) => a.phase === "ach").length >= questions.length;
    return (
      <View style={styles.center}>
        <Ionicons
          name={achDone ? "trophy-outline" : "checkmark-circle-outline"}
          size={48}
          color={achDone ? colors.warning : colors.success}
        />
        <Text style={styles.centerTitle}>
          {achDone ? "All Done for Today!" : "Plan Submitted!"}
        </Text>
        <Text style={styles.centerText}>
          {achDone
            ? "Great work! Your plan and achievements have been recorded."
            : "Come back in the evening to fill your achievements."}
        </Text>
        {!achDone && (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              setPhase("ach");
              setCurrentIndex(0);
              setInputValue("");
              setAllDone(false);
            }}
          >
            <Text style={styles.primaryBtnText}>Fill Achievement Now</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

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
            onPress={() => speakQuestion(currentQuestion)}
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
  centerTitle: { fontSize: 22, fontWeight: "700", color: colors.textPrimary, marginTop: 12 },
  centerText: { fontSize: 14, color: colors.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 22 },
  progressTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 12, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 2 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap" },
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
  primaryBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32, marginTop: 20 },
  primaryBtnText: { color: "white", fontWeight: "600", fontSize: 15 },
});
