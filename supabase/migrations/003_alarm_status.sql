-- Adds per-employee alarm/battery/permission status reporting.
-- Never re-run 001 — it drops all tables.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS alarm_ok boolean,
  ADD COLUMN IF NOT EXISTS battery_ok boolean,
  ADD COLUMN IF NOT EXISTS alarm_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS platform text;
