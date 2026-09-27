import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from "react-native";
import {
  getEmployees,
  getDailyAnswers,
  getDailyStatuses,
  getNotificationConfig,
  type Employee,
  type NotificationConfig,
} from "../../lib/supabase";
import { todayIST, isPastDeadline } from "../../lib/utils";
import { colors } from "../../lib/theme";

type TodayStatus = "Not started" | "Goal done" | "Ach done" | "Missed" | "Leave";

interface EmployeeStatus {
  employee: Employee;
  status: TodayStatus;
  planTotal: number;
  achTotal: number;
}

function computeTodayStatus(
  ds: { is_leave?: boolean; plan_completed_at?: string | null; ach_completed_at?: string | null } | undefined,
  _planCount: number,
  _achCount: number,
  config: NotificationConfig[]
): TodayStatus {
  if (ds?.is_leave) return "Leave";
  const fireTime = (key: string) => config.find((c) => c.slot_key === key)?.fire_time;
  const amDeadline = fireTime("am_deadline");
  const pmDeadline = fireTime("pm_deadline");

  if (ds?.ach_completed_at) return "Ach done";
  if (!ds?.plan_completed_at) return amDeadline && isPastDeadline(amDeadline) ? "Missed" : "Not started";
  if (pmDeadline && isPastDeadline(pmDeadline)) return "Missed";
  return "Goal done";
}

function getAlarmBadge(emp: Employee): { label: string; color: string } {
  if (!emp.alarm_checked_at) return { label: "Not seen 24h+", color: colors.textMuted };
  const ageMs = Date.now() - new Date(emp.alarm_checked_at).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) return { label: "Not seen 24h+", color: colors.textMuted };
  if (!emp.alarm_ok) return { label: "Alarms OFF", color: colors.danger };
  if (emp.battery_ok === false) return { label: "Battery restricted", color: colors.warning };
  return { label: "Alarms ON", color: colors.success };
}

export default function AdminDashboardScreen() {
  const [statuses, setStatuses] = useState<EmployeeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const date = todayIST();

  const loadData = useCallback(async () => {
    try {
      const [emps, answers, dailyStatuses, config] = await Promise.all([
        getEmployees(),
        getDailyAnswers(date),
        getDailyStatuses(date),
        getNotificationConfig(),
      ]);

      const statusList: EmployeeStatus[] = emps
        .filter((e) => e.active)
        .map((emp) => {
          const ds = dailyStatuses.find((s: any) => s.employee_id === emp.id);
          const empAnswers = answers.filter((a: any) => a.employee_id === emp.id);
          const planAnswers = empAnswers.filter((a: any) => a.phase === "plan");
          const achAnswers = empAnswers.filter((a: any) => a.phase === "ach");
          const planTotal = planAnswers.reduce((s: number, a: any) => s + a.value, 0);
          const achTotal = achAnswers.reduce((s: number, a: any) => s + a.value, 0);
          const status = computeTodayStatus(ds, planAnswers.length, achAnswers.length, config);

          return { employee: emp, status, planTotal, achTotal };
        });

      setStatuses(statusList);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const stats = {
    total: statuses.length,
    achDone: statuses.filter((s) => s.status === "Ach done").length,
    missed: statuses.filter((s) => s.status === "Missed").length,
    onLeave: statuses.filter((s) => s.status === "Leave").length,
  };

  const defaulters = statuses.filter((s) => s.status === "Missed");

  const statusColor: Record<TodayStatus, string> = {
    "Ach done": colors.success,
    "Goal done": colors.accentLight,
    "Not started": colors.textMuted,
    Missed: colors.danger,
    Leave: colors.textSecondary,
  };

  const renderItem = ({ item }: { item: EmployeeStatus }) => {
    const alarmBadge = getAlarmBadge(item.employee);
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.empName}>{item.employee.name}</Text>
            <Text style={styles.empCode}>{item.employee.emp_code}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: statusColor[item.status] + "22" }]}>
            <Text style={[styles.badgeText, { color: statusColor[item.status] }]}>{item.status}</Text>
          </View>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.progressLabel}>Plan: {item.planTotal} · Ach: {item.achTotal}</Text>
          <View style={[styles.badge, { backgroundColor: alarmBadge.color + "22" }]}>
            <Text style={[styles.badgeText, { color: alarmBadge.color }]}>{alarmBadge.label}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={[styles.statBox, { borderTopColor: colors.accent }]}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={[styles.statBox, { borderTopColor: colors.success }]}>
          <Text style={styles.statValue}>{stats.achDone}</Text>
          <Text style={styles.statLabel}>Ach Done</Text>
        </View>
        <View style={[styles.statBox, { borderTopColor: colors.danger }]}>
          <Text style={styles.statValue}>{stats.missed}</Text>
          <Text style={styles.statLabel}>Missed</Text>
        </View>
        <View style={[styles.statBox, { borderTopColor: colors.textSecondary }]}>
          <Text style={styles.statValue}>{stats.onLeave}</Text>
          <Text style={styles.statLabel}>Leave</Text>
        </View>
      </View>

      {defaulters.length > 0 && (
        <View style={styles.defaultersBox}>
          <Text style={styles.defaultersTitle}>Defaulters today</Text>
          <Text style={styles.defaultersText}>
            {defaulters.map((d) => d.employee.name).join(", ")}
          </Text>
        </View>
      )}

      {/* Employee List */}
      <FlatList
        data={statuses}
        keyExtractor={(item) => item.employee.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            tintColor={colors.accent}
          />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {loading ? "Loading..." : "No employees yet. Add them from the web dashboard."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderTopWidth: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  defaultersBox: {
    backgroundColor: colors.danger + "18",
    borderWidth: 1,
    borderColor: colors.danger + "40",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  defaultersTitle: { fontSize: 13, fontWeight: "700", color: colors.danger, marginBottom: 4 },
  defaultersText: { fontSize: 13, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  empName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  empCode: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  progressLabel: { fontSize: 12, color: colors.textSecondary },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: colors.textMuted, textAlign: "center" },
});
