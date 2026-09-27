import { useEffect, useState, useCallback } from "react";
import {
  getEmployees,
  getQuestions,
  getDailyAnswersRange,
  type Employee,
  type Question,
} from "../lib/supabase";
import { generateExcel } from "../lib/excel";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Download, TrendingUp } from "lucide-react";

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function startOfWeek(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split("T")[0];
}

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split("T")[0];
}

export default function AnalyticsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(daysAgo(7));
  const [endDate, setEndDate] = useState(todayIST());
  const [viewMode, setViewMode] = useState<"category" | "employee">("category");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, qs, ans] = await Promise.all([
        getEmployees(),
        getQuestions(true),
        getDailyAnswersRange(startDate, endDate),
      ]);
      setEmployees(emps);
      setQuestions(qs);
      setAnswers(ans);
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build chart data: plan vs ach per category
  const categoryChartData = questions
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((q) => {
      const qAnswers = answers.filter((a) => a.question_id === q.id);
      const planTotal = qAnswers
        .filter((a) => a.phase === "plan")
        .reduce((sum, a) => sum + (a.value as number), 0);
      const achTotal = qAnswers
        .filter((a) => a.phase === "ach")
        .reduce((sum, a) => sum + (a.value as number), 0);

      const rate = planTotal > 0 ? Math.round((achTotal / planTotal) * 100) : 0;

      return {
        name: q.label,
        Plan: planTotal,
        Achievement: achTotal,
        gap: planTotal - achTotal,
        rate,
      };
    });

  // Build daily trend data
  const dateSet = new Set<string>();
  answers.forEach((a) => dateSet.add(a.answer_date as string));
  const sortedDates = [...dateSet].sort();

  const dailyTrendData = sortedDates.map((date) => {
    const dayAnswers = answers.filter((a) => a.answer_date === date);
    const planTotal = dayAnswers
      .filter((a) => a.phase === "plan")
      .reduce((sum, a) => sum + (a.value as number), 0);
    const achTotal = dayAnswers
      .filter((a) => a.phase === "ach")
      .reduce((sum, a) => sum + (a.value as number), 0);

    return {
      date: new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      Plan: planTotal,
      Achievement: achTotal,
    };
  });

  // Per-employee summary
  const employeeData = employees
    .filter((e) => e.active)
    .map((emp) => {
      const empAnswers = answers.filter((a) => a.employee_id === emp.id);
      const planTotal = empAnswers
        .filter((a) => a.phase === "plan")
        .reduce((sum, a) => sum + (a.value as number), 0);
      const achTotal = empAnswers
        .filter((a) => a.phase === "ach")
        .reduce((sum, a) => sum + (a.value as number), 0);
      const rate = planTotal > 0 ? Math.round((achTotal / planTotal) * 100) : 0;
      const defaultDays = new Set(
        empAnswers.filter((a) => a.input_method === "auto_zero").map((a) => a.answer_date as string)
      );

      return { name: emp.name, Plan: planTotal, Achievement: achTotal, rate, defaults: defaultDays.size };
    })
    .sort((a, b) => b.Achievement - a.Achievement);

  const handleExport = () => {
    generateExcel(employees, questions, answers as never[], { start: startDate, end: endDate });
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>Analytics</h2>
          <p>Plan vs Achievement trends and insights</p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport}>
          <Download size={16} />
          Export Range
        </button>
      </div>

      {/* Date range + view mode */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <div className="input-group" style={{ gap: 4 }}>
          <label className="input-label">From</label>
          <input
            type="date"
            className="input"
            style={{ width: 160 }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={endDate}
          />
        </div>
        <div className="input-group" style={{ gap: 4 }}>
          <label className="input-label">To</label>
          <input
            type="date"
            className="input"
            style={{ width: 160 }}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            max={todayIST()}
          />
        </div>

        <div style={{ display: "flex", gap: "0.25rem", marginLeft: "auto" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setStartDate(startOfWeek()); setEndDate(todayIST()); }}>
            This Week
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setStartDate(startOfMonth()); setEndDate(todayIST()); }}>
            This Month
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setStartDate(daysAgo(7)); setEndDate(todayIST()); }}>
            7 Days
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setStartDate(daysAgo(30)); setEndDate(todayIST()); }}>
            30 Days
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setStartDate(daysAgo(90)); setEndDate(todayIST()); }}>
            90 Days
          </button>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="tab-nav">
        <button className={`tab-btn ${viewMode === "category" ? "active" : ""}`} onClick={() => setViewMode("category")}>
          By Category
        </button>
        <button className={`tab-btn ${viewMode === "employee" ? "active" : ""}`} onClick={() => setViewMode("employee")}>
          By Employee
        </button>
      </div>

      {loading ? (
        <div className="loading-screen" style={{ minHeight: "auto", padding: "4rem 0" }}>
          <div className="spinner" />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Daily Trend */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <TrendingUp size={16} style={{ display: "inline", marginRight: 8, verticalAlign: "middle" }} />
                  Daily Trend
                </div>
                <div className="card-subtitle">Total Plan vs Achievement over time</div>
              </div>
            </div>
            <div style={{ height: 300 }}>
              {dailyTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={12} />
                    <YAxis stroke="var(--color-text-muted)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-surface-raised)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        color: "var(--color-text-primary)",
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="Plan" stroke="var(--color-info)" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Achievement" stroke="var(--color-success)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state">
                  <p>No data available for the selected date range</p>
                </div>
              )}
            </div>
          </div>

          {/* Category or Employee chart */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                {viewMode === "category" ? "Plan vs Achievement by Category" : "Plan vs Achievement by Employee"}
              </div>
            </div>
            <div style={{ height: 350 }}>
              {viewMode === "category" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={12} angle={-20} textAnchor="end" height={60} />
                    <YAxis stroke="var(--color-text-muted)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-surface-raised)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        color: "var(--color-text-primary)",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="Plan" fill="var(--color-info)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Achievement" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={employeeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={12} angle={-20} textAnchor="end" height={60} />
                    <YAxis stroke="var(--color-text-muted)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-surface-raised)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        color: "var(--color-text-primary)",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="Plan" fill="var(--color-info)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Achievement" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Employee performance table */}
          {viewMode === "employee" && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Employee Performance Summary</div>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Employee</th>
                      <th>Total Plan</th>
                      <th>Total Achievement</th>
                      <th>Achievement Rate</th>
                      <th>Progress</th>
                      <th>Defaulter Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeData.map((emp, idx) => (
                      <tr key={emp.name}>
                        <td style={{ fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ fontWeight: 500 }}>{emp.name}</td>
                        <td>{emp.Plan}</td>
                        <td>{emp.Achievement}</td>
                        <td>
                          <span className={`badge ${emp.rate >= 80 ? "badge-success" : emp.rate >= 50 ? "badge-warning" : "badge-danger"}`}>
                            {emp.rate}%
                          </span>
                        </td>
                        <td style={{ minWidth: 120 }}>
                          <div className="progress-bar">
                            <div
                              className="progress-bar-fill"
                              style={{
                                width: `${Math.min(100, emp.rate)}%`,
                                background:
                                  emp.rate >= 80
                                    ? "var(--color-success)"
                                    : emp.rate >= 50
                                    ? "var(--color-warning)"
                                    : "var(--color-danger)",
                              }}
                            />
                          </div>
                        </td>
                        <td>
                          {emp.defaults > 0 ? (
                            <span className="badge badge-danger">{emp.defaults}</span>
                          ) : (
                            <span style={{ color: "var(--color-text-muted)" }}>0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Per-question rate table */}
          {viewMode === "category" && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Per-Question Achievement Rate</div>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Question</th>
                      <th>Total Plan</th>
                      <th>Total Achievement</th>
                      <th>Achievement Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryChartData.map((q, idx) => (
                      <tr key={q.name}>
                        <td style={{ fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ fontWeight: 500 }}>{q.name}</td>
                        <td>{q.Plan}</td>
                        <td>{q.Achievement}</td>
                        <td>
                          <span className={`badge ${q.rate >= 80 ? "badge-success" : q.rate >= 50 ? "badge-warning" : "badge-danger"}`}>
                            {q.rate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
