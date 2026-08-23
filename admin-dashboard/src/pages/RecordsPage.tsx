import { useEffect, useState, useCallback } from "react";
import {
  getEmployees,
  getQuestions,
  getDailyAnswers,
  type Employee,
  type Question,
} from "../lib/supabase";
import { generateSingleDateExcel } from "../lib/excel";
import { Search, Download, Calendar, ChevronLeft, ChevronRight } from "lucide-react";

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export default function RecordsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>[]>([]);
  const [date, setDate] = useState(todayIST());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, qs, ans] = await Promise.all([
        getEmployees(),
        getQuestions(true),
        getDailyAnswers(date, filterEmployee || undefined),
      ]);
      setEmployees(emps);
      setQuestions(qs);
      setAnswers(ans);
    } catch (err) {
      console.error("Failed to load records:", err);
    } finally {
      setLoading(false);
    }
  }, [date, filterEmployee]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sortedQuestions = [...questions].sort((a, b) => a.sort_order - b.sort_order);
  const activeEmployees = employees.filter((e) => e.active);
  const filteredEmployees = activeEmployees.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.emp_code.toLowerCase().includes(search.toLowerCase())
  );

  // Build answer lookup
  const answerMap = new Map<string, number>();
  for (const a of answers) {
    const key = `${a.employee_id}|${a.question_id}|${a.phase}`;
    answerMap.set(key, a.value as number);
  }

  const handleExport = () => {
    generateSingleDateExcel(employees, questions, answers as never[], date);
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>Records</h2>
          <p>View historical daily entries</p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport}>
          <Download size={16} />
          Export This Date
        </button>
      </div>

      {/* Date Picker & Filters */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setDate(shiftDate(date, -1))}>
            <ChevronLeft size={18} />
          </button>
          <div style={{ position: "relative" }}>
            <Calendar size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }} />
            <input
              type="date"
              className="input"
              style={{ paddingLeft: 32, width: 180 }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayIST()}
            />
          </div>
          <button className="btn btn-ghost btn-icon" onClick={() => setDate(shiftDate(date, 1))} disabled={date >= todayIST()}>
            <ChevronRight size={18} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(todayIST())}>
            Today
          </button>
        </div>

        <div style={{ position: "relative", minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }} />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="select"
          style={{ maxWidth: 200 }}
          value={filterEmployee}
          onChange={(e) => setFilterEmployee(e.target.value)}
        >
          <option value="">All Employees</option>
          {activeEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {/* Records Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">
              {new Date(date).toLocaleDateString("en-IN", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
            <div className="card-subtitle">
              {filteredEmployees.length} employees · {sortedQuestions.length} categories
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-screen" style={{ minHeight: "auto", padding: "2rem 0" }}>
            <div className="spinner" />
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Emp Code</th>
                  <th>Name</th>
                  {sortedQuestions.map((q) => (
                    <th key={q.id} colSpan={2} style={{ textAlign: "center", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
                      {q.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th></th>
                  <th></th>
                  {sortedQuestions.map((q) => (
                    <React.Fragment key={`sub-${q.id}`}>
                      <th style={{ borderLeft: "1px solid rgba(255,255,255,0.06)", color: "var(--color-info)" }}>Plan</th>
                      <th style={{ color: "var(--color-success)" }}>Ach</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={2 + sortedQuestions.length * 2}>
                      <div className="empty-state">
                        <h3>No data</h3>
                        <p>No records found for this date</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id}>
                      <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{emp.emp_code}</td>
                      <td style={{ fontWeight: 500 }}>{emp.name}</td>
                      {sortedQuestions.map((q) => {
                        const plan = answerMap.get(`${emp.id}|${q.id}|plan`);
                        const ach = answerMap.get(`${emp.id}|${q.id}|ach`);
                        return (
                          <React.Fragment key={`${emp.id}-${q.id}`}>
                            <td
                              style={{
                                textAlign: "center",
                                borderLeft: "1px solid rgba(255,255,255,0.06)",
                                color: plan !== undefined ? "var(--color-text-primary)" : "var(--color-text-muted)",
                              }}
                            >
                              {plan ?? "—"}
                            </td>
                            <td
                              style={{
                                textAlign: "center",
                                color: ach !== undefined ? "var(--color-text-primary)" : "var(--color-text-muted)",
                              }}
                            >
                              {ach ?? "—"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Need React import for React.Fragment usage with keys
import React from "react";
