-- ============================================================================
-- Seed Data — Question Categories + Notification Schedule
-- ============================================================================

-- 7 question categories from the source Excel sheet (Book1.xlsx)
-- These are defaults; admin can add/edit/remove at any time.
INSERT INTO questions (label, sort_order, active) VALUES
  ('Savings',           1, TRUE),
  ('Current',           2, TRUE),
  ('Fixed Deposit',     3, TRUE),
  ('Life Insurance',    4, TRUE),
  ('Value',             5, TRUE),
  ('Assets',            6, TRUE),
  ('Other Products',    7, TRUE);

-- 7 notification schedule slots (admin-editable)
-- AM reminders for Plan phase, PM reminders for Achievement phase
INSERT INTO notification_config (slot_key, fire_time, label) VALUES
  ('am_reminder_1',  '09:00:00', 'Morning Reminder 1 — Time to fill your daily plan'),
  ('am_reminder_2',  '09:15:00', 'Morning Reminder 2 — Plan submission pending'),
  ('am_deadline',    '09:30:00', 'Morning Deadline — Last chance to submit plan (auto-zero after this)'),
  ('pm_reminder_1',  '17:00:00', 'Evening Reminder 1 — Time to fill your daily achievement'),
  ('pm_reminder_2',  '17:15:00', 'Evening Reminder 2 — Achievement submission pending'),
  ('pm_deadline',    '17:30:00', 'Evening Deadline — Last chance to submit achievement (auto-zero after this)'),
  ('pm_final',       '17:45:00', 'Final Compilation — Admin: all reports compiled');
