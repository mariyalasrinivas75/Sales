import { useEffect, useState, useCallback } from "react";
import {
  getEmployees,
  getQuestions,
  getDailyAnswers,
  getDailyStatuses,
  type Employee,
  type Question,
} from "../lib/supabase";
import { generateSingleDateExcel } from "../lib/excel";
import {
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  Download,
  Palmtree,
  XCircle,
} from "lucide-react";

// Today's date in YYYY-MM-DD format (IST)
function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

interface EmployeeStatus {
  employee: Employee;
  status: "not_started" | "plan_done" | "pending_eod" | "completed" | "defaulted" | "on_leave";
  planTotal: number;
  achTotal: number;
}

export default function DashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [statuses, setStatuses] = useState<EmployeeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [date] = useState(todayIST());

  const loadData = useCallback(async () => {
    try {
      const [emps, qs, answers, dailyStatuses] = await Promise.all([
        getEmployees(),
        getQuestions(true),
        getDailyAnswers(date),
        getDailyStatuses(date),
      ]);

      setEmployees(emps);
      setQuestions(qs);

      const statusList: EmployeeStatus[] = emps
        .filter((e) => e.active)
        .map((emp) => {
          const dailyStatus = dailyStatuses.find(
            (s: Record<string, unknown>) => s.employee_id === emp.id
          );
          const empAnswers = answers.filter(
            (a: Record<string, unknown>) => a.employee_id === emp.id
          );

          if (dailyStatus && (dailyStatus as Record<string, unknown>).is_leave) {
            return { employee: emp, status: "on_leave" as const, planTotal: 0, achTotal: 0 };
          }

          const planAnswers = empAnswers.filter((a: Record<string, unknown>) => a.phase === "plan");
          const achAnswers = empAnswers.filter((a: Record<string, unknown>) => a.phase === "ach");
          const planTotal = planAnswers.reduce((sum: number, a: Record<string, unknown>) => sum + (a.value as number), 0);
          const achTotal = achAnswers.reduce((sum: number, a: Record<string, unknown>) => sum + (a.value as number), 0);

          // "Completed" means every active question was answered in both
          // phases — having at least one answer in each phase is not enough
          // (a partial submission before the deadline was previously read as
          // "completed").
          const planComplete = qs.length > 0 && planAnswers.length >= qs.length;
          const achComplete = qs.length > 0 && achAnswers.length >= qs.length;

          let status: EmployeeStatus["status"] = "not_started";
          if (planComplete && achComplete) {
            status = "completed";
          } else if (planAnswers.length > 0 || achAnswers.length > 0) {
            const now = new Date();
            const hour = now.getHours();
            if (hour >= 17) {
              status = "pending_eod";
            } else {
              status = "plan_done";
            }
          } else {
            // Check if any were auto-zeroed
            const hasAutoZero = empAnswers.some(
              (a: Record<string, unknown>) => a.input_method === "auto_zero"
            );
            if (hasAutoZero) {
              status = "defaulted";
            }
          }

          return { employee: emp, status, planTotal, achTotal };
        });

      setStatuses(statusList);
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds for live updates
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const stats = {
    total: statuses.length,
    completed: statuses.filter((s) => s.status === "completed").length,
    pending: statuses.filter((s) =>
      ["not_started", "plan_done", "pending_eod"].includes(s.status)
    ).length,
    onLeave: statuses.filter((s) => s.status === "on_leave").length,
    defaulted: statuses.filter((s) => s.status === "defaulted").length,
  };

  const handleExport = async () => {
    try {
      const answers = await getDailyAnswers(date);
      generateSingleDateExcel(employees, questions, answers, date);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const statusConfig: Record<
    EmployeeStatus["status"],
    { label: string; badge: string; icon: React.ReactNode }
  > = {
    not_started: {
      label: "Not Started",
      badge: "badge-muted",
      icon: <XCircle size={14} />,
    },
    plan_done: {
      label: "Plan Done",
      badge: "badge-info",
      icon: <Clock size={14} />,
    },
    pending_eod: {
      label: "Pending EOD",
      badge: "badge-warning",
      icon: <AlertTriangle size={14} />,
    },
    completed: {
      label: "Completed",
      badge: "badge-success",
      icon: <CheckCircle size={14} />,
    },
    defaulted: {
      label: "Defaulted (0)",
      badge: "badge-danger",
      icon: <AlertTriangle size={14} />,
    },
    on_leave: {
      label: "On Leave",
      badge: "badge-muted",
      icon: <Palmtree size={14} />,
    },
  };

  if (loading) {
    return (
      <div className="loading-screen" style={{ minHeight: "auto", padding: "4rem 0" }}>
        <div className="spinner" />
        <p style={{ color: "var(--color-text-muted)" }}>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>Dashboard</h2>
          <p>Today's activity — {new Date(date).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport}>
          <Download size={16} />
          Export Today
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card" style={{ "--stat-color": "var(--color-brand-500)" } as React.CSSProperties}>
          <div className="stat-icon" style={{ background: "rgba(14, 165, 233, 0.15)" }}>
            <Users size={20} color="var(--color-brand-400)" />
          </div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Active</div>
        </div>

        <div className="stat-card" style={{ "--stat-color": "var(--color-success)" } as React.CSSProperties}>
          <div className="stat-icon" style={{ background: "rgba(16, 185, 129, 0.15)" }}>
            <CheckCircle size={20} color="var(--color-success)" />
          </div>
          <div className="stat-value">{stats.completed}</div>
          <div className="stat-label">Completed</div>
        </div>

        <div className="stat-card" style={{ "--stat-color": "var(--color-warning)" } as React.CSSProperties}>
          <div className="stat-icon" style={{ background: "rgba(245, 158, 11, 0.15)" }}>
            <Clock size={20} color="var(--color-warning)" />
          </div>
          <div className="stat-value">{stats.pending}</div>
          <div className="stat-label">Pending</div>
        </div>

        <div className="stat-card" style={{ "--stat-color": "var(--color-danger)" } as React.CSSProperties}>
          <div className="stat-icon" style={{ background: "rgba(239, 68, 68, 0.15)" }}>
            <AlertTriangle size={20} color="var(--color-danger)" />
          </div>
          <div className="stat-value">{stats.defaulted}</div>
          <div className="stat-label">Defaulted</div>
        </div>
      </div>

      {/* Employee Status Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Employee Status</div>
            <div className="card-subtitle">Live updates every 30 seconds</div>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Code</th>
                <th>Status</th>
                <th>Plan Total</th>
                <th>Achievement Total</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {statuses.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <Users size={32} />
                      <h3>No employees yet</h3>
                      <p>Add employees from the Employee Management page</p>
                    </div>
                  </td>
                </tr>
              ) : (
                statuses.map((s) => {
                  const cfg = statusConfig[s.status];
                  const progress =
                    s.planTotal > 0
                      ? Math.min(100, Math.round((s.achTotal / s.planTotal) * 100))
                      : 0;

                  return (
                    <tr key={s.employee.id}>
                      <td style={{ fontWeight: 600 }}>{s.employee.name}</td>
                      <td style={{ color: "var(--color-text-muted)" }}>{s.employee.emp_code}</td>
                      <td>
                        <span className={`badge ${cfg.badge}`}>
                          {cfg.icon}
                          <span style={{ marginLeft: 4 }}>{cfg.label}</span>
                        </span>
                      </td>
                      <td>{s.planTotal}</td>
                      <td>{s.achTotal}</td>
                      <td style={{ minWidth: 120 }}>
                        {s.status !== "on_leave" && (
                          <div>
                            <div className="progress-bar" style={{ marginBottom: 4 }}>
                              <div
                                className="progress-bar-fill"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                              {progress}%
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
