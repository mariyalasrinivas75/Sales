import { useEffect, useState, useCallback } from "react";
import {
  getEmployees,
  getDailyAnswersRange,
  type Employee,
} from "../lib/supabase";
import { Trophy, Medal } from "lucide-react";

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

interface LeaderboardEntry {
  employee: Employee;
  totalAch: number;
  totalPlan: number;
  rate: number;
}

type MetricType = "achievement" | "rate";
type PeriodType = "today" | "week" | "month";

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<MetricType>("achievement");
  const [period, setPeriod] = useState<PeriodType>("today");

  const getDateRange = (p: PeriodType) => {
    const end = todayIST();
    switch (p) {
      case "today":
        return { start: end, end };
      case "week":
        return { start: daysAgo(7), end };
      case "month":
        return { start: daysAgo(30), end };
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange(period);
      const [emps, answers] = await Promise.all([
        getEmployees(),
        getDailyAnswersRange(start, end),
      ]);



      const leaderboard: LeaderboardEntry[] = emps
        .filter((e) => e.active)
        .map((emp) => {
          const empAnswers = answers.filter(
            (a: Record<string, unknown>) => a.employee_id === emp.id
          );
          const totalPlan = empAnswers
            .filter((a: Record<string, unknown>) => a.phase === "plan")
            .reduce((sum: number, a: Record<string, unknown>) => sum + (a.value as number), 0);
          const totalAch = empAnswers
            .filter((a: Record<string, unknown>) => a.phase === "ach")
            .reduce((sum: number, a: Record<string, unknown>) => sum + (a.value as number), 0);
          const rate = totalPlan > 0 ? Math.round((totalAch / totalPlan) * 100) : 0;

          return { employee: emp, totalAch, totalPlan, rate };
        });

      // Sort based on selected metric
      leaderboard.sort((a, b) =>
        metric === "achievement" ? b.totalAch - a.totalAch : b.rate - a.rate
      );

      setEntries(leaderboard);
    } catch (err) {
      console.error("Failed to load leaderboard:", err);
    } finally {
      setLoading(false);
    }
  }, [period, metric]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rankStyle = (idx: number) => {
    if (idx === 0) return "gold";
    if (idx === 1) return "silver";
    if (idx === 2) return "bronze";
    return "default";
  };

  return (
    <div>
      <div className="page-header">
        <h2>
          <Trophy size={24} style={{ display: "inline", marginRight: 8, verticalAlign: "middle", color: "var(--color-warning)" }} />
          Leaderboard
        </h2>
        <p>Employee rankings by performance</p>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div className="tab-nav" style={{ marginBottom: 0 }}>
          <button className={`tab-btn ${period === "today" ? "active" : ""}`} onClick={() => setPeriod("today")}>
            Today
          </button>
          <button className={`tab-btn ${period === "week" ? "active" : ""}`} onClick={() => setPeriod("week")}>
            This Week
          </button>
          <button className={`tab-btn ${period === "month" ? "active" : ""}`} onClick={() => setPeriod("month")}>
            This Month
          </button>
        </div>

        <div className="tab-nav" style={{ marginBottom: 0 }}>
          <button className={`tab-btn ${metric === "achievement" ? "active" : ""}`} onClick={() => setMetric("achievement")}>
            Total Achievement
          </button>
          <button className={`tab-btn ${metric === "rate" ? "active" : ""}`} onClick={() => setMetric("rate")}>
            Achievement Rate %
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen" style={{ minHeight: "auto", padding: "4rem 0" }}>
          <div className="spinner" />
        </div>
      ) : (
        <div className="card">
          {entries.length === 0 ? (
            <div className="empty-state">
              <Trophy size={48} />
              <h3>No data yet</h3>
              <p>Rankings will appear once employees start submitting answers</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {entries.map((entry, idx) => (
                <div key={entry.employee.id} className="leaderboard-item">
                  <div className={`leaderboard-rank ${rankStyle(idx)}`}>
                    {idx < 3 ? <Medal size={16} /> : idx + 1}
                  </div>

                  <div className="leaderboard-info">
                    <div className="leaderboard-name">{entry.employee.name}</div>
                    <div className="leaderboard-meta">
                      {entry.employee.emp_code} · Plan: {entry.totalPlan} · Ach: {entry.totalAch}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div style={{ minWidth: 100 }}>
                      <div className="progress-bar" style={{ marginBottom: 2 }}>
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${Math.min(100, entry.rate)}%`,
                            background:
                              entry.rate >= 80
                                ? "var(--color-success)"
                                : entry.rate >= 50
                                ? "var(--color-warning)"
                                : "var(--color-danger)",
                          }}
                        />
                      </div>
                    </div>

                    <div className="leaderboard-score">
                      {metric === "achievement" ? entry.totalAch : `${entry.rate}%`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
