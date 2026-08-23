import { useEffect, useState, useCallback, useRef } from "react";
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
} from "../lib/supabase";
import { parseSpokenNumber, isPastDeadline, todayIST, currentISTTime } from "../lib/utils";
import { Mic, MicOff, Volume2, Check, Lock, ChevronRight, Clock } from "lucide-react";

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

type Phase = "plan" | "ach";

export default function QuestionFlowPage() {
  const { employee } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<DailyAnswer[]>([]);
  const [notifConfig, setNotifConfig] = useState<NotificationConfig[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("plan");
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
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

      // If on leave, show locked
      if (status?.is_leave) {
        setIsLocked(true);
        setLoading(false);
        return;
      }

      // Determine current phase
      const planDeadline = config.find((c) => c.slot_key === "am_deadline")?.fire_time || "09:30:00";
      const planAnswers = ans.filter((a) => a.phase === "plan");
      const achAnswers = ans.filter((a) => a.phase === "ach");

      if (achAnswers.length >= qs.length) {
        // All done for today
        setAllDone(true);
      } else if (planAnswers.length >= qs.length || isPastDeadline(planDeadline)) {
        // Plan phase done or deadline passed, move to achievement
        setPhase("ach");
        // Find first unanswered achievement question
        const answeredIds = new Set(achAnswers.map((a) => a.question_id));
        const firstUnanswered = qs.findIndex((q) => !answeredIds.has(q.id));
        setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
      } else {
        // Still in plan phase
        setPhase("plan");
        const answeredIds = new Set(planAnswers.map((a) => a.question_id));
        const firstUnanswered = qs.findIndex((q) => !answeredIds.has(q.id));
        setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, [employee, date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Check deadline every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const deadline = getDeadline(phase);
      if (isPastDeadline(deadline)) {
        setIsLocked(true);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [phase, getDeadline]);

  // Text-to-speech: read current question aloud
  const speakQuestion = useCallback(
    (q: Question) => {
      if (!("speechSynthesis" in window)) return;

      window.speechSynthesis.cancel();
      const prompt =
        phase === "plan"
          ? `How many ${q.label} today?`
          : `How many ${q.label} did you achieve?`;

      const utterance = new SpeechSynthesisUtterance(prompt);
      utterance.lang = "en-IN";
      utterance.rate = 0.9;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [phase]
  );

  // Speak question when index changes
  useEffect(() => {
    if (questions.length > 0 && currentIndex < questions.length && !allDone && !isLocked) {
      speakQuestion(questions[currentIndex]);
    }
  }, [currentIndex, questions, allDone, isLocked, speakQuestion]);

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

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setVoiceText("");
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  // Submit answer
  const handleSubmit = async () => {
    if (!employee || !questions[currentIndex]) return;

    // Re-check the deadline at write time — the 60s background poll alone
    // leaves a window where a late submit still lands after the cutoff.
    if (isPastDeadline(getDeadline(phase))) {
      setIsLocked(true);
      return;
    }

    const value = parseInt(inputValue, 10);
    if (isNaN(value) || value < 0) {
      return;
    }

    setSubmitting(true);
    try {
      const q = questions[currentIndex];
      const inputMethod = voiceText ? "voice" : "typed";

      await submitAnswer(employee.id, q.id, date, phase, value, inputMethod as "voice" | "typed");

      // Update status
      const statusUpdate: Record<string, string> = {};
      if (phase === "plan" && currentIndex === 0) {
        statusUpdate.plan_started_at = new Date().toISOString();
      }
      if (phase === "plan" && currentIndex === questions.length - 1) {
        statusUpdate.plan_completed_at = new Date().toISOString();
      }
      if (phase === "ach" && currentIndex === 0) {
        statusUpdate.ach_started_at = new Date().toISOString();
      }
      if (phase === "ach" && currentIndex === questions.length - 1) {
        statusUpdate.ach_completed_at = new Date().toISOString();
      }
      if (Object.keys(statusUpdate).length > 0) {
        await updateDailyStatus(employee.id, date, statusUpdate);
      }

      // Move to next question
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setInputValue("");
        setVoiceText("");
      } else {
        // Phase complete
        if (phase === "plan") {
          // Check if it's time for achievement phase
          const pmReminder1 = notifConfig.find((c) => c.slot_key === "pm_reminder_1")?.fire_time || "17:00:00";
          if (isPastDeadline(pmReminder1)) {
            setPhase("ach");
            setCurrentIndex(0);
            setInputValue("");
            setVoiceText("");
          } else {
            setAllDone(true); // Plan done, waiting for evening
          }
        } else {
          setAllDone(true); // All done for today
        }
      }
    } catch (err) {
      console.error("Failed to submit answer:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Keypad
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

  if (isLocked) {
    return (
      <div className="screen-center">
        <Lock size={48} className="icon-muted" />
        <h2>Time's Up</h2>
        <p>
          The {phase === "plan" ? "morning plan" : "evening achievement"} deadline has passed.
          Unanswered entries have been recorded as 0.
        </p>
      </div>
    );
  }

  if (allDone) {
    const planDone = answers.filter((a) => a.phase === "plan").length >= questions.length;
    const achDone = answers.filter((a) => a.phase === "ach").length >= questions.length;

    return (
      <div className="screen-center">
        <div className="success-icon">
          <Check size={48} />
        </div>
        <h2>{achDone ? "All Done for Today! 🎉" : "Plan Submitted ✅"}</h2>
        <p>
          {achDone
            ? "Great work! Your plan and achievements have been recorded."
            : `Your morning plan is submitted. Come back at ${
                notifConfig.find((c) => c.slot_key === "pm_reminder_1")?.fire_time?.slice(0, 5) || "5:00 PM"
              } to fill your achievements.`}
        </p>
        {planDone && !achDone && (
          <button
            className="btn-primary"
            style={{ marginTop: "1rem" }}
            onClick={() => {
              setPhase("ach");
              setCurrentIndex(0);
              setInputValue("");
              setVoiceText("");
              setAllDone(false);
            }}
          >
            Fill Achievement Now
          </button>
        )}
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  const deadline = getDeadline(phase);
  const questionPrompt =
    phase === "plan"
      ? `How many ${currentQuestion.label} today?`
      : `How many ${currentQuestion.label} did you achieve?`;

  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="question-flow">
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

        {/* Voice feedback */}
        {voiceText && (
          <div className="voice-feedback">
            Heard: "{voiceText}"
          </div>
        )}

        {/* Input Display */}
        <div className="input-display">
          <span className="input-value">{inputValue || "0"}</span>
        </div>

        {/* Voice Controls */}
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
            onClick={() => speakQuestion(currentQuestion)}
            disabled={isSpeaking}
          >
            <Volume2 size={20} />
            {isSpeaking ? "Speaking..." : "Repeat Question"}
          </button>
        </div>

        {/* Numeric Keypad — always visible, never hidden */}
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

        {/* Submit */}
        <button
          className="btn-submit"
          onClick={handleSubmit}
          disabled={submitting || !inputValue}
        >
          {submitting ? (
            "Submitting..."
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
