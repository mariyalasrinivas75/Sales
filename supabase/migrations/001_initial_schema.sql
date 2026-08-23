-- ============================================================================
-- Complete Clean Schema Fix for Firebase Auth UIDs (TEXT primary keys)
-- ============================================================================

-- Drop old tables if they exist with UUID types
DROP TABLE IF EXISTS daily_answers CASCADE;
DROP TABLE IF EXISTS daily_status CASCADE;
DROP TABLE IF EXISTS notification_config CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS admins CASCADE;

-- 1. ADMINS (Firebase UID is 28-char string, so TEXT is required)
CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. EMPLOYEES (Firebase UID is 28-char string, so TEXT is required)
CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  emp_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. QUESTIONS
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. DAILY ANSWERS
CREATE TABLE daily_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_date DATE NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('plan', 'ach')),
  value INTEGER NOT NULL DEFAULT 0,
  input_method TEXT CHECK (input_method IN ('voice', 'typed', 'auto_zero')),
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, question_id, answer_date, phase)
);

-- 5. DAILY STATUS
CREATE TABLE daily_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status_date DATE NOT NULL,
  is_leave BOOLEAN DEFAULT FALSE,
  plan_started_at TIMESTAMPTZ,
  plan_completed_at TIMESTAMPTZ,
  ach_started_at TIMESTAMPTZ,
  ach_completed_at TIMESTAMPTZ,
  UNIQUE(employee_id, status_date)
);

-- 6. NOTIFICATION CONFIG
CREATE TABLE notification_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_key TEXT UNIQUE NOT NULL,
  fire_time TIME NOT NULL,
  label TEXT
);

-- 7. Seed Default Question Categories
INSERT INTO questions (label, sort_order) VALUES
  ('Savings', 1),
  ('Current', 2),
  ('Fixed Deposit', 3),
  ('Recurring Deposit', 4),
  ('Home Loan', 5),
  ('Personal Loan', 6),
  ('Gold Loan', 7);

-- 8. Seed Default Notification Schedule
INSERT INTO notification_config (slot_key, fire_time, label) VALUES
  ('am_reminder_1', '09:00:00', 'Morning Reminder 1 — Time to fill your daily plan'),
  ('am_reminder_2', '09:15:00', 'Morning Reminder 2 — Plan submission pending'),
  ('am_deadline',   '09:30:00', 'Morning Deadline — Last chance to submit plan (auto-zero after this)'),
  ('pm_reminder_1', '17:00:00', 'Evening Reminder 1 — Time to fill your daily achievement'),
  ('pm_reminder_2', '17:15:00', 'Evening Reminder 2 — Achievement submission pending'),
  ('pm_deadline',   '17:30:00', 'Evening Deadline — Last chance to submit achievement (auto-zero after this)'),
  ('pm_final',      '17:45:00', 'Final Compilation — Admin: all reports compiled');

-- 9. Row Level Security Policies
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access" ON admins FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Employees full access" ON employees FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Questions full access" ON questions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Daily answers full access" ON daily_answers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Daily status full access" ON daily_status FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Notification config full access" ON notification_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 10. Insert Admin & Employee
INSERT INTO admins (id, name, email) VALUES
  ('6nTLKODMowba3gFUe3aJ21jTgGp1', 'Srinivas', 'mariyalasrinivas75@gmail.com');

INSERT INTO employees (id, emp_code, name, email, active) VALUES
  ('vrmLxk3o0dasm2VaSEqTtVFASdf1', 'EMP001', 'Test Employee', 'employee@gmail.com', true);
