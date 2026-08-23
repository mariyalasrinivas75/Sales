import { useEffect, useState } from "react";
import {
  getQuestions,
  createQuestion,
  updateQuestion,
  reorderQuestions,
  type Question,
} from "../lib/supabase";
import {
  Plus,
  Edit2,
  GripVertical,
  X,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formError, setFormError] = useState("");
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const loadQuestions = async () => {
    try {
      const data = await getQuestions();
      setQuestions(data);
    } catch (err) {
      console.error("Failed to load questions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const openAddModal = () => {
    setEditingQuestion(null);
    setFormLabel("");
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (q: Question) => {
    setEditingQuestion(q);
    setFormLabel(q.label);
    setFormError("");
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formLabel.trim()) {
      setFormError("Category name is required.");
      return;
    }

    try {
      if (editingQuestion) {
        await updateQuestion(editingQuestion.id, { label: formLabel.trim() });
      } else {
        const maxOrder = questions.reduce((max, q) => Math.max(max, q.sort_order), 0);
        await createQuestion({ label: formLabel.trim(), sort_order: maxOrder + 1 });
      }

      setShowModal(false);
      await loadQuestions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleToggleActive = async (q: Question) => {
    try {
      await updateQuestion(q.id, { active: !q.active });
      await loadQuestions();
    } catch (err) {
      console.error("Failed to toggle:", err);
    }
  };

  // Drag-and-drop reordering
  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;

    const newQuestions = [...questions];
    const [removed] = newQuestions.splice(draggedIdx, 1);
    newQuestions.splice(idx, 0, removed);
    setQuestions(newQuestions);
    setDraggedIdx(idx);
  };

  const handleDragEnd = async () => {
    setDraggedIdx(null);
    try {
      await reorderQuestions(questions.map((q) => q.id));
    } catch (err) {
      console.error("Failed to reorder:", err);
      await loadQuestions(); // Reset on error
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
          <h2>Questions</h2>
          <p>Manage daily plan/achievement categories — drag to reorder</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} />
          Add Category
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Categories</div>
            <div className="card-subtitle">
              Each category creates a Plan/Ach column pair in the daily report
            </div>
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="empty-state">
            <h3>No categories yet</h3>
            <p>Click "Add Category" to create your first one</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {questions.map((q, idx) => (
              <div
                key={q.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  background:
                    draggedIdx === idx
                      ? "rgba(14, 165, 233, 0.1)"
                      : "rgba(255, 255, 255, 0.02)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  cursor: "grab",
                  transition: "all 0.2s ease",
                  opacity: q.active ? 1 : 0.5,
                }}
              >
                <GripVertical
                  size={16}
                  style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
                />

                <span
                  style={{
                    background: "var(--color-brand-600)",
                    color: "white",
                    width: 28,
                    height: 28,
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {q.sort_order}
                </span>

                <span style={{ flex: 1, fontWeight: 500 }}>{q.label}</span>

                <span className={`badge ${q.active ? "badge-success" : "badge-muted"}`}>
                  {q.active ? "Active" : "Inactive"}
                </span>

                <div style={{ display: "flex", gap: "0.25rem" }}>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(q);
                    }}
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleActive(q);
                    }}
                    title={q.active ? "Deactivate" : "Activate"}
                  >
                    {q.active ? <ToggleRight size={16} color="var(--color-success)" /> : <ToggleLeft size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingQuestion ? "Edit Category" : "Add Category"}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && <div className="login-error">{formError}</div>}

                <div className="input-group">
                  <label className="input-label">Category Name *</label>
                  <input
                    className="input"
                    placeholder="e.g. Fixed Deposit, Life Insurance"
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    required
                    autoFocus
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    This will appear as "[Name] Plan" and "[Name] Ach" columns in the Excel export
                  </span>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingQuestion ? "Save Changes" : "Add Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
