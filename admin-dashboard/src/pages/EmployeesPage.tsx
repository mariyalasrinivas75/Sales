import { useEffect, useState } from "react";
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  toggleLeave,
  type Employee,
} from "../lib/supabase";
import { createEmployeeAccount } from "../lib/firebase";
import {
  UserPlus,
  Edit2,
  Trash2,
  Palmtree,
  Search,
  X,
  UserCheck,
  UserX,
} from "lucide-react";

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState({
    id: "",
    emp_code: "",
    name: "",
    phone: "",
    email: "",
    password: "",
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadEmployees = async () => {
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (err) {
      console.error("Failed to load employees:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const filtered = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.emp_code.toLowerCase().includes(search.toLowerCase())
  );

  const openAddModal = () => {
    setEditingEmployee(null);
    setForm({ id: "", emp_code: "", name: "", phone: "", email: "", password: "" });
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setForm({
      id: emp.id,
      emp_code: emp.emp_code,
      name: emp.name,
      phone: emp.phone || "",
      email: emp.email || "",
      password: "",
    });
    setFormError("");
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!form.emp_code.trim() || !form.name.trim()) {
      setFormError("Employee code and name are required.");
      return;
    }

    setSaving(true);
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, {
          emp_code: form.emp_code,
          name: form.name,
          phone: form.phone || null,
          email: form.email || null,
        });
      } else {
        if (!form.email.trim() || !form.password.trim()) {
          setFormError("Email and password are required to create the employee's login.");
          return;
        }
        // Creates the Firebase Auth login and the employees row in one step —
        // admin only ever enters email + password, no manual UID copy-paste.
        const uid = await createEmployeeAccount(form.email.trim(), form.password);
        await createEmployee({
          id: uid,
          emp_code: form.emp_code,
          name: form.name,
          phone: form.phone || null,
          email: form.email.trim(),
          active: true,
        } as Employee);
      }

      setShowModal(false);
      await loadEmployees();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save employee");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`Are you sure you want to delete ${emp.name}?`)) return;
    try {
      await deleteEmployee(emp.id);
      await loadEmployees();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleToggleActive = async (emp: Employee) => {
    try {
      await updateEmployee(emp.id, { active: !emp.active });
      await loadEmployees();
    } catch (err) {
      console.error("Failed to toggle active:", err);
    }
  };

  const handleToggleLeave = async (emp: Employee) => {
    try {
      await toggleLeave(emp.id, todayIST(), true);
      // Show brief confirmation
      alert(`${emp.name} marked as on leave for today.`);
    } catch (err) {
      console.error("Failed to toggle leave:", err);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen" style={{ minHeight: "auto", padding: "4rem 0" }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>Employees</h2>
          <p>Manage your sales team — {employees.filter((e) => e.active).length} active</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <UserPlus size={16} />
          Add Employee
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: "1.5rem", maxWidth: 400 }}>
        <div style={{ position: "relative" }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-muted)",
            }}
          />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Employee Table */}
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Emp Code</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <h3>No employees found</h3>
                      <p>{search ? "Try a different search term" : "Click 'Add Employee' to get started"}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: 600, fontFamily: "monospace" }}>{emp.emp_code}</td>
                    <td style={{ fontWeight: 500 }}>{emp.name}</td>
                    <td style={{ color: "var(--color-text-muted)" }}>{emp.email || "—"}</td>
                    <td style={{ color: "var(--color-text-muted)" }}>{emp.phone || "—"}</td>
                    <td>
                      <span
                        className={`badge ${emp.active ? "badge-success" : "badge-muted"}`}
                        style={{ cursor: "pointer" }}
                        onClick={() => handleToggleActive(emp)}
                        title={emp.active ? "Click to deactivate" : "Click to activate"}
                      >
                        {emp.active ? (
                          <>
                            <UserCheck size={12} /> Active
                          </>
                        ) : (
                          <>
                            <UserX size={12} /> Inactive
                          </>
                        )}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => openEditModal(emp)}
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => handleToggleLeave(emp)}
                          title="Mark on leave today"
                        >
                          <Palmtree size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => handleDelete(emp)}
                          title="Delete"
                          style={{ color: "var(--color-danger)" }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingEmployee ? "Edit Employee" : "Add Employee"}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && <div className="login-error">{formError}</div>}

                <div className="input-group">
                  <label className="input-label">Employee Code *</label>
                  <input
                    className="input"
                    placeholder="e.g. EMP001"
                    value={form.emp_code}
                    onChange={(e) => setForm({ ...form, emp_code: e.target.value })}
                    required
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Full Name *</label>
                  <input
                    className="input"
                    placeholder="e.g. John Doe"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Email {!editingEmployee && "*"}</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="e.g. john@company.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required={!editingEmployee}
                    disabled={!!editingEmployee}
                  />
                  {editingEmployee && (
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                      Login email can't be changed here.
                    </span>
                  )}
                </div>

                {!editingEmployee && (
                  <div className="input-group">
                    <label className="input-label">Password *</label>
                    <input
                      className="input"
                      type="password"
                      placeholder="At least 6 characters"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required
                      minLength={6}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                      This creates the employee's login — share it with them directly.
                    </span>
                  </div>
                )}

                <div className="input-group">
                  <label className="input-label">Phone</label>
                  <input
                    className="input"
                    placeholder="e.g. +91 98765 43210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving..." : editingEmployee ? "Save Changes" : "Add Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
