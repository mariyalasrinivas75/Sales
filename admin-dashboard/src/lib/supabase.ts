import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config";

export const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

// ── Types derived from the database schema ──

export interface Employee {
  id: string;
  emp_code: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
  // Added by migration 003 — optional so older rows / forms without them still typecheck.
  alarm_ok?: boolean | null;
  battery_ok?: boolean | null;
  alarm_checked_at?: string | null;
  platform?: "android" | "ios-pwa" | null;
}

export interface Admin {
  id: string;
  name: string | null;
  email: string | null;
}

export interface Question {
  id: string;
  label: string;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface DailyAnswer {
  id: string;
  employee_id: string;
  question_id: string;
  answer_date: string;
  phase: "plan" | "ach";
  value: number;
  input_method: "voice" | "typed" | "auto_zero" | null;
  answered_at: string | null;
}

export interface DailyStatus {
  id: string;
  employee_id: string;
  status_date: string;
  is_leave: boolean;
  plan_started_at: string | null;
  plan_completed_at: string | null;
  ach_started_at: string | null;
  ach_completed_at: string | null;
}

export interface NotificationConfig {
  id: string;
  slot_key: string;
  fire_time: string;
  label: string | null;
}

// ── Role lookup ──

export type UserRole = "admin" | "employee" | "unknown";

export async function getUserRole(uid: string): Promise<UserRole> {
  // Check admins table first
  const { data: admin } = await supabase
    .from("admins")
    .select("id")
    .eq("id", uid)
    .single();

  if (admin) return "admin";

  // Check employees table
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("id", uid)
    .eq("active", true)
    .single();

  if (employee) return "employee";

  return "unknown";
}

// ── Employee CRUD ──

export async function getEmployees() {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .order("name");
  if (error) throw error;
  return data as Employee[];
}

export async function createEmployee(employee: Omit<Employee, "id" | "created_at">) {
  const { data, error } = await supabase
    .from("employees")
    .insert(employee)
    .select()
    .single();
  if (error) throw error;
  return data as Employee;
}

export async function updateEmployee(id: string, updates: Partial<Employee>) {
  const { data, error } = await supabase
    .from("employees")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Employee;
}

export async function deleteEmployee(id: string) {
  const { error } = await supabase
    .from("employees")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ── Question CRUD ──

export async function getQuestions(activeOnly = false) {
  let query = supabase.from("questions").select("*").order("sort_order");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data as Question[];
}

export async function createQuestion(question: Pick<Question, "label" | "sort_order">) {
  const { data, error } = await supabase
    .from("questions")
    .insert({ ...question, active: true })
    .select()
    .single();
  if (error) throw error;
  return data as Question;
}

export async function updateQuestion(id: string, updates: Partial<Question>) {
  const { data, error } = await supabase
    .from("questions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Question;
}

export async function reorderQuestions(orderedIds: string[]) {
  const updates = orderedIds.map((id, index) => ({
    id,
    sort_order: index + 1,
  }));

  for (const update of updates) {
    const { error } = await supabase
      .from("questions")
      .update({ sort_order: update.sort_order })
      .eq("id", update.id);
    if (error) throw error;
  }
}

// ── Daily Status ──

export async function getDailyStatuses(date: string) {
  const { data, error } = await supabase
    .from("daily_status")
    .select("*, employees(name, emp_code)")
    .eq("status_date", date);
  if (error) throw error;
  return data;
}

export async function toggleLeave(employeeId: string, date: string, isLeave: boolean) {
  const { data, error } = await supabase
    .from("daily_status")
    .upsert(
      {
        employee_id: employeeId,
        status_date: date,
        is_leave: isLeave,
      },
      { onConflict: "employee_id,status_date" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as DailyStatus;
}

// ── Daily Answers ──

export async function getDailyAnswers(date: string, employeeId?: string) {
  let query = supabase
    .from("daily_answers")
    .select("*, employees(name, emp_code), questions(label, sort_order)")
    .eq("answer_date", date);

  if (employeeId) query = query.eq("employee_id", employeeId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getDailyAnswersRange(startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from("daily_answers")
    .select("*, employees(name, emp_code), questions(label, sort_order)")
    .gte("answer_date", startDate)
    .lte("answer_date", endDate)
    .order("answer_date");
  if (error) throw error;
  return data;
}

// ── Notification Config ──

export async function getNotificationConfig() {
  const { data, error } = await supabase
    .from("notification_config")
    .select("*")
    .order("fire_time");
  if (error) throw error;
  return data as NotificationConfig[];
}

export async function updateNotificationConfig(id: string, updates: Partial<NotificationConfig>) {
  const { data, error } = await supabase
    .from("notification_config")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as NotificationConfig;
}
