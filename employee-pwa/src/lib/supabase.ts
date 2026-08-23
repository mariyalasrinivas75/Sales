import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config";

export const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

// ── Types ──

export interface Employee {
  id: string;
  emp_code: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
}

export interface Question {
  id: string;
  label: string;
  sort_order: number;
  active: boolean;
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
  const { data: admin } = await supabase
    .from("admins")
    .select("id")
    .eq("id", uid)
    .single();
  if (admin) return "admin";

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("id", uid)
    .eq("active", true)
    .single();
  if (employee) return "employee";

  return "unknown";
}

export async function getEmployeeProfile(uid: string): Promise<Employee | null> {
  const { data } = await supabase
    .from("employees")
    .select("*")
    .eq("id", uid)
    .single();
  return data;
}

// ── Questions ──

export async function getActiveQuestions(): Promise<Question[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return data;
}

// ── Daily Answers ──

export async function getTodaysAnswers(employeeId: string, date: string): Promise<DailyAnswer[]> {
  const { data, error } = await supabase
    .from("daily_answers")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("answer_date", date);
  if (error) throw error;
  return data;
}

export async function submitAnswer(
  employeeId: string,
  questionId: string,
  date: string,
  phase: "plan" | "ach",
  value: number,
  inputMethod: "voice" | "typed"
): Promise<void> {
  const { error } = await supabase
    .from("daily_answers")
    .upsert(
      {
        employee_id: employeeId,
        question_id: questionId,
        answer_date: date,
        phase,
        value,
        input_method: inputMethod,
        answered_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,question_id,answer_date,phase" }
    );
  if (error) throw error;
}

// ── Daily Status ──

export async function getDailyStatus(employeeId: string, date: string): Promise<DailyStatus | null> {
  const { data } = await supabase
    .from("daily_status")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("status_date", date)
    .single();
  return data;
}

export async function updateDailyStatus(
  employeeId: string,
  date: string,
  updates: Partial<DailyStatus>
): Promise<void> {
  const { error } = await supabase
    .from("daily_status")
    .upsert(
      {
        employee_id: employeeId,
        status_date: date,
        ...updates,
      },
      { onConflict: "employee_id,status_date" }
    );
  if (error) throw error;
}

// ── Notification Config ──

export async function getNotificationConfig(): Promise<NotificationConfig[]> {
  const { data, error } = await supabase
    .from("notification_config")
    .select("*")
    .order("fire_time");
  if (error) throw error;
  return data;
}

// ── History ──

export async function getEmployeeHistory(
  employeeId: string,
  limit = 30
): Promise<DailyAnswer[]> {
  const { data, error } = await supabase
    .from("daily_answers")
    .select("*, questions(label, sort_order)")
    .eq("employee_id", employeeId)
    .order("answer_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
