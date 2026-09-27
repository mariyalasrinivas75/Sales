import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../lib/auth";
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
} from "../lib/supabase";
import { parseSpokenNumber, todayIST, currentISTTime, getTodayState } from "../lib/utils";
import {
  Mic,
  MicOff,
  Volume2,
  Check,
  ChevronRight,
  ChevronLeft,
  Clock,
  Target,
  Award,
} from "lucide-react";

// Web Speech API types (not always in TypeScript's lib)
interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type Mode = "summary" | "plan" | "ach";
type Phase = "plan" | "ach";

export default function QuestionFlowPage() {
  const { employee } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<DailyAnswer[]>([]);
  const [notifConfig, setNotifConfig] = useState<NotificationConfig[]>([]);
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [mode, setMode] = useState<Mode>("summary");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingSingle, setEditingSingle] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [tick, setTick] = useState(0);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const date = todayIST();

  const config = useMemo(
    () => ({
      am_deadline: notifConfig.find((c) => c.slot_key === "am_deadline")?.fire_time,
      pm_deadline: notifConfig.find((c) => c.slot_key === "pm_deadline")?.fire_time,
    }),
    [notifConfig]
  );

  const loadData = useCallback(async () => {
    if (!employee) return;
    try {
      const [qs, ans, cfg, st] = await Promise.all([
        getActiveQuestions(),
        getTodaysAnswers(employee.id, date),
        getNotificationConfig(),
        getDailyStatus(employee.id, date),
      ]);
      setQuestions(qs);
      setAnswers(ans);
      setNotifConfig(cfg);
      setStatus(st);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, [employee, date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Recompute deadline-sensitive state periodically without touching `questions`
  // identity, so the speech effect below never fires from a background poll.
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const todayState = useMemo(
    () => getTodayState({ questions, answers, status, config, now: new Date() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, answers, status, config, tick]
  );

  // Cancel any in-flight speech the moment we're not in a flow.
  useEffect(() => {
    if (mode === "summary" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [mode]);
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const speakQuestion = useCallback((p: Phase, q: Question) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const prompt =
      p === "plan" ? `How many ${q.label} today?` : `How many ${q.label} did you achieve?`;
    const utterance = new SpeechSynthesisUtterance(prompt);
    utterance.lang = "en-IN";
    utterance.rate = 0.9;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  // Speak the current question only when entering/advancing a flow — never on
  // background refresh (deliberately NOT keyed on `questions` identity).
  useEffect(() => {
    if (mode === "summary") return;
    const q = questions[currentIndex];
    if (!q) return;
    speakQuestion(mode, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentIndex]);

  // Speech-to-text
  const startListening = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Speech recognition is not supported in this browser. Please use the keypad.");
      return;
    }

    const SpeechRecognitionAPI =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    const recognition = new (SpeechRecognitionAPI as new () => ISpeechRecognition)();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setVoiceText(transcript);

      if (event.results[0].isFinal) {
        const num = parseSpokenNumber(transcript);
        if (num !== null) {
          setInputValue(String(num));
        }
        setIsListening(false);
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setVoiceText("");
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const resetInput = () => {
    setInputValue("");
    setVoiceText("");
  };

  // Start a phase at the first unanswered question.
  const startPhase = (target: Phase) => {
    const answeredIds = new Set(answers.filter((a) => a.phase === target).map((a) => a.question_id));
    const firstUnanswered = questions.findIndex((q) => !answeredIds.has(q.id));
    setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
    setEditingSingle(false);
    resetInput();
    setMode(target);
  };

  // Tapping a table cell re-opens just that one question for edit.
  const editQuestion = (target: Phase, index: number) => {
    const q = questions[index];
    const existing = answers.find((a) => a.phase === target && a.question_id === q.id);
    setCurrentIndex(index);
    setEditingSingle(true);
    setInputValue(existing ? String(existing.value) : "");
    setVoiceText("");
    setMode(target);
  };

  const backToSummary = () => {
    resetInput();
    setMode("summary");
  };

  const handleSubmit = async () => {
    if (!employee || mode === "summary" || !questions[currentIndex]) return;
    const phase: Phase = mode;

    // Re-check gating at write time — a stale 60s poll could otherwise let a
    // late submit land after the phase locked/missed.
    const fresh = getTodayState({ questions, answers, status, config, now: new Date() });
    const stillOpen = phase === "plan" ? fresh.plan === "open" : fresh.ach === "open";
    if (!stillOpen) {
      await loadData();
      setMode("summary");
      return;
    }

    const value = parseInt(inputValue, 10);
    if (isNaN(value) || value < 0) return;

    setSubmitting(true);
    try {
      const q = questions[currentIndex];
      const inputMethod = voiceText ? "voice" : "typed";
      const nowIso = new Date().toISOString();

      await submitAnswer(employee.id, q.id, date, phase, value, inputMethod as "voice" | "typed");

      const answeredIdsAfter = new Set(
        answers.filter((a) => a.phase === phase).map((a) => a.question_id)
      );
      answeredIdsAfter.add(q.id);
      const allAnsweredNow = questions.every((qq) => answeredIdsAfter.has(qq.id));

      const statusUpdate: Partial<DailyStatus> = {};
      const startedKey: keyof DailyStatus = phase === "plan" ? "plan_started_at" : "ach_started_at";
      const completedKey: keyof DailyStatus =
        phase === "plan" ? "plan_completed_at" : "ach_completed_at";
      if (!status?.[startedKey]) statusUpdate[startedKey] = nowIso;
      if (allAnsweredNow && !status?.[completedKey]) {
        statusUpdate[completedKey] = nowIso;
      }
      if (Object.keys(statusUpdate).length > 0) {
        await updateDailyStatus(employee.id, date, statusUpdate);
      }

      const nextIdx = questions.findIndex((qq) => !answeredIdsAfter.has(qq.id));
      if (editingSingle || nextIdx === -1) {
        await loadData();
        setMode("summary");
      } else {
        setCurrentIndex(nextIdx);
        resetInput();
      }
    } catch (err) {
      console.error("Failed to submit answer:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeypadPress = (digit: string) => {
    if (digit === "del") {
      setInputValue(inputValue.slice(0, -1));
    } else if (digit === "clear") {
      setInputValue("");
    } else {
      setInputValue(inputValue + digit);
    }
  };

  if (loading) {
    return (
      <div className="screen-center">
        <div className="spinner" />
        <p>Loading your questions...</p>
      </div>
    );
  }

  // ── Summary mode ──
  if (mode === "summary") {
    const planLabel =
      todayState.plan === "done"
        ? "Goal submitted ✓"
        : todayState.plan === "missed"
        ? "Deadline passed"
        : "Not started";
    const achLabel =
      todayState.ach === "locked"
        ? "Complete goal first"
        : todayState.ach === "done"
        ? "Done ✓"
        : todayState.ach === "missed"
        ? "Deadline passed"
        : "Not started";

    return (
      <div className="summary-page">
        <div className="summary-date">
          {new Date(date).toLocaleDateString("en-IN", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </div>

        {todayState.onLeave && <div className="leave-banner">You're marked on leave today.</div>}

        <div className="summary-buttons">
          <button
            className={`summary-btn ${todayState.plan === "done" ? "done" : ""}`}
            disabled={todayState.onLeave || todayState.plan !== "open"}
            onClick={() => startPhase("plan")}
          >
            <Target size={28} />
            <span className="summary-btn-label">Start Goal</span>
            <span className="summary-btn-state">{planLabel}</span>
          </button>
          <button
            className={`summary-btn ${todayState.ach === "done" ? "done" : ""}`}
            disabled={todayState.onLeave || todayState.ach !== "open"}
            onClick={() => startPhase("ach")}
          >
            <Award size={28} />
            <span className="summary-btn-label">Start Achievements</span>
            <span className="summary-btn-state">{achLabel}</span>
          </button>
        </div>

        <table className="qa-table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Plan</th>
              <th>Ach</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q, i) => {
              const planAns = answers.find((a) => a.phase === "plan" && a.question_id === q.id);
              const achAns = answers.find((a) => a.phase === "ach" && a.question_id === q.id);
              const planEditable = todayState.plan === "open";
              const achEditable = todayState.ach === "open";
              return (
                <tr key={q.id}>
                  <td>{q.label}</td>
                  <td
                    className={planEditable ? "qa-editable" : ""}
                    onClick={() => planEditable && editQuestion("plan", i)}
                  >
                    {planAns ? planAns.value : "–"}
                  </td>
                  <td
                    className={achEditable ? "qa-editable" : ""}
                    onClick={() => achEditable && editQuestion("ach", i)}
                  >
                    {achAns ? achAns.value : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Flow mode (plan/ach) ──
  const phase: Phase = mode;
  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) {
    backToSummary();
    return null;
  }

  const deadline =
    (phase === "plan" ? config.am_deadline : config.pm_deadline) ||
    (phase === "plan" ? "09:30:00" : "17:30:00");
  const questionPrompt =
    phase === "plan"
      ? `How many ${currentQuestion.label} today?`
      : `How many ${currentQuestion.label} did you achieve?`;
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="question-flow">
      <button className="speak-btn" style={{ marginBottom: "0.75rem" }} onClick={backToSummary}>
        <ChevronLeft size={16} />
        Back
      </button>

      {/* Progress Bar */}
      <div className="flow-progress">
        <div className="flow-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {/* Header */}
      <div className="flow-header">
        <span className="phase-badge">
          {phase === "plan" ? "☀️ Morning Plan" : "🌙 Evening Achievement"}
        </span>
        <span className="time-badge">
          <Clock size={12} />
          Deadline: {deadline.slice(0, 5)} · Now: {currentISTTime()}
        </span>
      </div>

      {/* Question Counter */}
      <div className="question-counter">
        Question {currentIndex + 1} of {questions.length}
      </div>

      {/* Question */}
      <div className="question-card">
        <h2 className="question-text">{questionPrompt}</h2>

        {voiceText && <div className="voice-feedback">Heard: "{voiceText}"</div>}

        <div className="input-display">
          <span className="input-value">{inputValue || "0"}</span>
        </div>

        <div className="voice-controls">
          <button
            className={`mic-btn ${isListening ? "listening" : ""}`}
            onClick={isListening ? stopListening : startListening}
            disabled={isSpeaking}
          >
            {isListening ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          <button
            className="speak-btn"
            onClick={() => speakQuestion(phase, currentQuestion)}
            disabled={isSpeaking}
          >
            <Volume2 size={20} />
            {isSpeaking ? "Speaking..." : "Repeat Question"}
          </button>
        </div>

        <div className="keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"].map((key) => (
            <button
              key={key}
              className={`keypad-btn ${key === "clear" || key === "del" ? "keypad-action" : ""}`}
              onClick={() => handleKeypadPress(key)}
            >
              {key === "del" ? "⌫" : key === "clear" ? "C" : key}
            </button>
          ))}
        </div>

        <button className="btn-submit" onClick={handleSubmit} disabled={submitting || !inputValue}>
          {submitting ? (
            "Submitting..."
          ) : editingSingle ? (
            <>
              <Check size={18} />
              Save
            </>
          ) : (
            <>
              Submit & Next
              <ChevronRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
