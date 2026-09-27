import { useEffect, useState, useCallback } from "react";
import {
  getEmployees,
  getQuestions,
  getDailyAnswers,
  getDailyStatuses,
  getNotificationConfig,
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
  BellOff,
  BellRing,
  BatteryWarning,
  WifiOff,
} from "lucide-react";

// Today's date in YYYY-MM-DD format (IST)
function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// Current time-of-day in IST as "HH:MM:SS", comparable against fire_time strings.
function nowISTTime(): string {
  return new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false });
}


type TodayStatus = "not_started" | "goal_done" | "ach_done" | "missed" | "on_leave";

interface EmployeeStatus {
  employee: Employee;
  status: TodayStatus;
  planTotal: number;
  achTotal: number;
}

type AlarmBadge = "on" | "off" | "battery_restricted" | "not_seen";

function alarmBadgeFor(emp: Employee): AlarmBadge {
  const checkedAt = emp.alarm_checked_at;
  const seenRecently = !!checkedAt && Date.now() - new Date(checkedAt).getTime() < 24 * 60 * 60 * 1000;
  if (!seenRecently) return "not_seen";
  if (emp.alarm_ok && emp.battery_ok === false) return "battery_restricted";
  if (emp.alarm_ok) return "on";
  return "off";
}

const alarmBadgeConfig: Record<AlarmBadge, { label: string; badge: string; icon: React.ReactNode }> = {
  on: { label: "Alarms ON", badge: "badge-success", icon: <BellRing size={14} /> },
  off: { label: "Alarms OFF", badge: "badge-danger", icon: <BellOff size={14} /> },
  battery_restricted: { label: "Battery restricted", badge: "badge-warning", icon: <BatteryWarning size={14} /> },
  not_seen: { label: "Not seen 24h+", badge: "badge-muted", icon: <WifiOff size={14} /> },
};

export default function DashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [statuses, setStatuses] = useState<EmployeeStatus[]>([]);
  const [defaulters, setDefaulters] = useState<{ employee: Employee; reason: "Missed Goal" | "Missed Ach" }[]>([]);
  const [loading, setLoading] = useState(true);
  const [date] = useState(todayIST());

  const loadData = useCallback(async () => {
    try {
      const [emps, qs, answers, dailyStatuses, config] = await Promise.all([
        getEmployees(),
        getQuestions(true),
        getDailyAnswers(date),
        getDailyStatuses(date),
        getNotificationConfig(),
      ]);

      setEmployees(emps);
      setQuestions(qs);

      const amDeadline = config.find((c) => c.slot_key === "am_deadline")?.fire_time;
      const pmDeadline = config.find((c) => c.slot_key === "pm_deadline")?.fire_time;
      const now = nowISTTime();
      const amPassed = !!amDeadline && now >= amDeadline;
      const pmPassed = !!pmDeadline && now >= pmDeadline;

      const activeEmps = emps.filter((e) => e.active);
      const defaulterList: { employee: Employee; reason: "Missed Goal" | "Missed Ach" }[] = [];

      const statusList: EmployeeStatus[] = activeEmps.map((emp) => {
        const dailyStatus = dailyStatuses.find(
          (s: Record<string, unknown>) => s.employee_id === emp.id
        ) as Record<string, unknown> | undefined;
        const empAnswers = answers.filter(
          (a: Record<string, unknown>) => a.employee_id === emp.id
        );

        const planTotal = empAnswers
          .filter((a: Record<string, unknown>) => a.phase === "plan")
          .reduce((sum: number, a: Record<string, unknown>) => sum + (a.value as number), 0);
        const achTotal = empAnswers
          .filter((a: Record<string, unknown>) => a.phase === "ach")
          .reduce((sum: number, a: Record<string, unknown>) => sum + (a.value as number), 0);

        if (dailyStatus?.is_leave) {
          return { employee: emp, status: "on_leave" as const, planTotal, achTotal };
        }

        const planCompletedAt = dailyStatus?.plan_completed_at as string | null | undefined;
        const achCompletedAt = dailyStatus?.ach_completed_at as string | null | undefined;

        let status: TodayStatus;
        if (!planCompletedAt) {
          if (amPassed) {
            status = "missed";
            defaulterList.push({ employee: emp, reason: "Missed Goal" });
          } else {
            status = "not_started";
          }
        } else if (!achCompletedAt) {
          if (pmPassed) {
            status = "missed";
            defaulterList.push({ employee: emp, reason: "Missed Ach" });
          } else {
            status = "goal_done";
          }
        } else {
          status = "ach_done";
        }

        return { employee: emp, status, planTotal, achTotal };
      });

      setStatuses(statusList);
      setDefaulters(defaulterList);
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
    completed: statuses.filter((s) => s.status === "ach_done").length,
    pending: statuses.filter((s) =>
      ["not_started", "goal_done"].includes(s.status)
    ).length,
    onLeave: statuses.filter((s) => s.status === "on_leave").length,
    defaulted: statuses.filter((s) => s.status === "missed").length,
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
    TodayStatus,
    { label: string; badge: string; icon: React.ReactNode }
  > = {
    not_started: {
      label: "Not Started",
      badge: "badge-muted",
      icon: <XCircle size={14} />,
    },
    goal_done: {
      label: "Goal Done",
      badge: "badge-info",
      icon: <Clock size={14} />,
    },
    ach_done: {
      label: "Ach Done",
      badge: "badge-success",
      icon: <CheckCircle size={14} />,
    },
    missed: {
      label: "Missed",
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

      {/* Defaulters Today */}
      {defaulters.length > 0 && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-header">
            <div>
              <div className="card-title">Defaulters Today</div>
              <div className="card-subtitle">Deadline passed with no submission (excludes leave)</div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {defaulters.map((d) => (
              <span key={d.employee.id + d.reason} className="badge badge-danger">
                <AlertTriangle size={14} />
                <span style={{ marginLeft: 4 }}>{d.employee.name} — {d.reason}</span>
              </span>
            ))}
          </div>
        </div>
      )}

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
                <th>Alarms</th>
                <th>Plan Total</th>
                <th>Achievement Total</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {statuses.length === 0 ? (
                <tr>
                  <td colSpan={7}>
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
                  const alarmCfg = alarmBadgeConfig[alarmBadgeFor(s.employee)];
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
                      <td>
                        <span className={`badge ${alarmCfg.badge}`}>
                          {alarmCfg.icon}
                          <span style={{ marginLeft: 4 }}>{alarmCfg.label}</span>
                        </span>
                        {s.employee.platform && (
                          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                            {s.employee.platform}
                          </div>
                        )}
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
