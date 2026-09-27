import { useEffect, useState } from "react";
import {
  getNotificationConfig,
  updateNotificationConfig,
  type NotificationConfig,
} from "../lib/supabase";
import { Bell, Save, Clock, Sun, Moon } from "lucide-react";

const slotLabels: Record<string, string> = {
  am_reminder_1: "Morning Reminder 1",
  am_reminder_2: "Morning Reminder 2",
  am_deadline: "Morning Deadline",
  pm_reminder_1: "Evening Reminder 1",
  pm_reminder_2: "Evening Reminder 2",
  pm_deadline: "Evening Deadline",
  pm_final: "Final Compilation (Admin)",
};

const slotDescriptions: Record<string, string> = {
  am_reminder_1: "First buzz to remind employees to fill their daily plan",
  am_reminder_2: "Second buzz — plan submission still pending",
  am_deadline: "Hard deadline — unanswered plans become 0 after this time",
  pm_reminder_1: "First buzz to remind employees to fill their achievement",
  pm_reminder_2: "Second buzz — achievement submission still pending",
  pm_deadline: "Hard deadline — unanswered achievements become 0 after this time",
  pm_final: "System compiles all reports for admin review (admin-facing only)",
};

export default function NotificationConfigPage() {
  const [configs, setConfigs] = useState<NotificationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editedTimes, setEditedTimes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const loadConfig = async () => {
    try {
      const data = await getNotificationConfig();
      setConfigs(data);
    } catch (err) {
      console.error("Failed to load config:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleTimeChange = (id: string, time: string) => {
    setEditedTimes({ ...editedTimes, [id]: time });
  };

  const handleSave = async (config: NotificationConfig) => {
    const newTime = editedTimes[config.id];
    if (!newTime) return;

    setSaving(config.id);
    try {
      await updateNotificationConfig(config.id, { fire_time: newTime + ":00" });
      await loadConfig();
      const updated = { ...editedTimes };
      delete updated[config.id];
      setEditedTimes(updated);
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen" style={{ minHeight: "auto", padding: "4rem 0" }}>
        <div className="spinner" />
      </div>
    );
  }

  // Split into AM and PM groups
  const amConfigs = configs.filter((c) => c.slot_key.startsWith("am_"));
  const pmConfigs = configs.filter((c) => c.slot_key.startsWith("pm_"));

  return (
    <div>
      <div className="page-header">
        <h2>
          <Bell size={24} style={{ display: "inline", marginRight: 8, verticalAlign: "middle" }} />
          Notification Schedule
        </h2>
        <p>Configure employee reminder and deadline times</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "1.5rem" }}>
        {/* Morning Schedule */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title" style={{ color: "var(--color-info)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Sun size={16} />
                Morning Schedule (Plan Phase)
              </div>
              <div className="card-subtitle">
                Reminders for employees to submit their daily plan
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {amConfigs.map((config) => (
              <div
                key={config.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "0.75rem",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <Clock size={16} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                    {slotLabels[config.slot_key] || config.slot_key}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {slotDescriptions[config.slot_key] || ""}
                  </div>
                </div>
                <input
                  type="time"
                  className="input"
                  style={{ width: 120, textAlign: "center" }}
                  defaultValue={config.fire_time?.slice(0, 5)}
                  onChange={(e) => handleTimeChange(config.id, e.target.value)}
                />
                {editedTimes[config.id] && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleSave(config)}
                    disabled={saving === config.id}
                  >
                    {saving === config.id ? (
                      <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    ) : (
                      <Save size={14} />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Evening Schedule */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title" style={{ color: "var(--color-warning)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Moon size={16} />
                Evening Schedule (Achievement Phase)
              </div>
              <div className="card-subtitle">
                Reminders for employees to submit their achievements
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {pmConfigs.map((config) => (
              <div
                key={config.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "0.75rem",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <Clock size={16} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                    {slotLabels[config.slot_key] || config.slot_key}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {slotDescriptions[config.slot_key] || ""}
                  </div>
                </div>
                <input
                  type="time"
                  className="input"
                  style={{ width: 120, textAlign: "center" }}
                  defaultValue={config.fire_time?.slice(0, 5)}
                  onChange={(e) => handleTimeChange(config.id, e.target.value)}
                />
                {editedTimes[config.id] && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleSave(config)}
                    disabled={saving === config.id}
                  >
                    {saving === config.id ? (
                      <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    ) : (
                      <Save size={14} />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <div style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          <strong>How it works:</strong>
          <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem" }}>
            <li>Reminder times trigger buzzes on employee devices (Android alarm / iOS push notification)</li>
            <li>Deadline times enforce the auto-zero rule — unanswered entries become 0 permanently</li>
            <li>The "Final Compilation" time is admin-facing only — it triggers the system to compile all reports</li>
            <li>Phones pick up changes at the next alarm or when the app is opened</li>
            <li>Admin never receives any of these reminders or buzzes</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
