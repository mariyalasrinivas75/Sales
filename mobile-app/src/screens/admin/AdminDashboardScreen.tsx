import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import {
  getEmployees,
  getDailyAnswers,
  getDailyStatuses,
  type Employee,
} from "../../lib/supabase";
import { todayIST } from "../../lib/utils";
import { colors } from "../../lib/theme";

interface EmployeeStatus {
  employee: Employee;
  status: string;
  planTotal: number;
  achTotal: number;
}

export default function AdminDashboardScreen() {
  const [statuses, setStatuses] = useState<EmployeeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const date = todayIST();

  const loadData = useCallback(async () => {
    try {
      const [emps, answers, dailyStatuses] = await Promise.all([
        getEmployees(),
        getDailyAnswers(date),
        getDailyStatuses(date),
      ]);

      const statusList: EmployeeStatus[] = emps
        .filter((e) => e.active)
        .map((emp) => {
          const ds = dailyStatuses.find((s: any) => s.employee_id === emp.id);
          const empAnswers = answers.filter((a: any) => a.employee_id === emp.id);

          if (ds?.is_leave) {
            return { employee: emp, status: "On Leave", planTotal: 0, achTotal: 0 };
          }

          const planAnswers = empAnswers.filter((a: any) => a.phase === "plan");
          const achAnswers = empAnswers.filter((a: any) => a.phase === "ach");
          const planTotal = planAnswers.reduce((s: number, a: any) => s + a.value, 0);
          const achTotal = achAnswers.reduce((s: number, a: any) => s + a.value, 0);

          let status = "Not Started";
          if (planAnswers.length > 0 && achAnswers.length > 0) status = "Completed";
          else if (planAnswers.length > 0) status = "Plan Done";
          else if (empAnswers.some((a: any) => a.input_method === "auto_zero")) status = "Defaulted";

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
    completed: statuses.filter((s) => s.status === "Completed").length,
    pending: statuses.filter((s) => ["Not Started", "Plan Done"].includes(s.status)).length,
    onLeave: statuses.filter((s) => s.status === "On Leave").length,
  };

  const statusColor: Record<string, string> = {
    Completed: colors.success,
    "Plan Done": colors.accentLight,
    "Not Started": colors.textMuted,
    Defaulted: colors.danger,
    "On Leave": colors.textSecondary,
  };

  const renderItem = ({ item }: { item: EmployeeStatus }) => {
    const progress = item.planTotal > 0 ? Math.min(100, Math.round((item.achTotal / item.planTotal) * 100)) : 0;

    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.empName}>{item.employee.name}</Text>
            <Text style={styles.empCode}>{item.employee.emp_code}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: (statusColor[item.status] || "#64748b") + "22" }]}>
            <Text style={[styles.badgeText, { color: statusColor[item.status] || "#64748b" }]}>
              {item.status}
            </Text>
          </View>
        </View>

        {item.status !== "On Leave" && (
          <View style={styles.progressSection}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Plan: {item.planTotal}</Text>
              <Text style={styles.progressLabel}>Ach: {item.achTotal}</Text>
              <Text style={styles.progressPercent}>{progress}%</Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progress}%`,
                    backgroundColor: progress >= 80 ? colors.success : progress >= 50 ? colors.warning : colors.danger,
                  },
                ]}
              />
            </View>
          </View>
        )}
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
          <Text style={styles.statValue}>{stats.completed}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
        <View style={[styles.statBox, { borderTopColor: colors.warning }]}>
          <Text style={styles.statValue}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={[styles.statBox, { borderTopColor: colors.textSecondary }]}>
          <Text style={styles.statValue}>{stats.onLeave}</Text>
          <Text style={styles.statLabel}>Leave</Text>
        </View>
      </View>

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
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  empName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  empCode: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  progressSection: { marginTop: 4 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  progressLabel: { fontSize: 12, color: colors.textSecondary },
  progressPercent: { fontSize: 12, fontWeight: "700", color: colors.accentLight },
  progressBar: { height: 4, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: colors.textMuted, textAlign: "center" },
});
