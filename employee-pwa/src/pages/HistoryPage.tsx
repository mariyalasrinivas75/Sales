import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { getEmployeeHistory, type DailyAnswer } from "../lib/supabase";
import { History, Calendar } from "lucide-react";

export default function HistoryPage() {
  const { employee } = useAuth();
  const [answers, setAnswers] = useState<DailyAnswer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee) return;

    const load = async () => {
      try {
        const data = await getEmployeeHistory(employee.id, 100);
        setAnswers(data);
      } catch (err) {
        console.error("Failed to load history:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [employee]);

  if (loading) {
    return (
      <div className="screen-center">
        <div className="spinner" />
      </div>
    );
  }

  // Group by date
  const byDate = new Map<string, DailyAnswer[]>();
  for (const a of answers) {
    const existing = byDate.get(a.answer_date) || [];
    existing.push(a);
    byDate.set(a.answer_date, existing);
  }

  const sortedDates = [...byDate.keys()].sort().reverse();

  // Calculate streak
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    if (byDate.has(dateStr)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  // Today's totals
  const todayStr = today.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const todayAnswers = byDate.get(todayStr) || [];
  const todayPlan = todayAnswers
    .filter((a) => a.phase === "plan")
    .reduce((sum, a) => sum + a.value, 0);
  const todayAch = todayAnswers
    .filter((a) => a.phase === "ach")
    .reduce((sum, a) => sum + a.value, 0);

  return (
    <div className="history-page">
      <h2>
        <History size={22} />
        My Performance
      </h2>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-box">
          <div className="stat-number">{streak}</div>
          <div className="stat-text">Day Streak 🔥</div>
        </div>
        <div className="stat-box">
          <div className="stat-number">{todayPlan}</div>
          <div className="stat-text">Today's Plan</div>
        </div>
        <div className="stat-box">
          <div className="stat-number">{todayAch}</div>
          <div className="stat-text">Today's Ach</div>
        </div>
      </div>

      {/* History List */}
      <div className="history-list">
        {sortedDates.length === 0 ? (
          <div className="empty-msg">
            <Calendar size={32} />
            <p>No entries yet. Submit your first daily plan!</p>
          </div>
        ) : (
          sortedDates.map((dateStr) => {
            const dayAnswers = byDate.get(dateStr)!;
            const planTotal = dayAnswers
              .filter((a) => a.phase === "plan")
              .reduce((s, a) => s + a.value, 0);
            const achTotal = dayAnswers
              .filter((a) => a.phase === "ach")
              .reduce((s, a) => s + a.value, 0);
            const rate = planTotal > 0 ? Math.round((achTotal / planTotal) * 100) : 0;

            return (
              <div key={dateStr} className="history-item">
                <div className="history-date">
                  {new Date(dateStr).toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                  })}
                </div>
                <div className="history-details">
                  <div className="history-bar-row">
                    <span>Plan: {planTotal}</span>
                    <span>Ach: {achTotal}</span>
                  </div>
                  <div className="history-bar">
                    <div
                      className="history-bar-fill"
                      style={{
                        width: `${Math.min(100, rate)}%`,
                        background:
                          rate >= 80 ? "var(--color-success)" : rate >= 50 ? "var(--color-warning)" : "var(--color-danger)",
                      }}
                    />
                  </div>
                </div>
                <div className="history-rate">{rate}%</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
