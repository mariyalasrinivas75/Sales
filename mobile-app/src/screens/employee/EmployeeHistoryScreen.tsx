import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl } from "react-native";
import { useAuth } from "../../lib/auth";
import { getEmployeeHistory, type DailyAnswer } from "../../lib/supabase";
import { colors } from "../../lib/theme";

export default function EmployeeHistoryScreen() {
  const { employee } = useAuth();
  const [answers, setAnswers] = useState<DailyAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!employee) return;
    try {
      const data = await getEmployeeHistory(employee.id, 100);
      setAnswers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [employee]);

  // Group by date
  const byDate = new Map<string, DailyAnswer[]>();
  for (const a of answers) {
    const existing = byDate.get(a.answer_date) || [];
    existing.push(a);
    byDate.set(a.answer_date, existing);
  }

  const sortedDates = [...byDate.keys()].sort().reverse();

  // Streak
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    if (byDate.has(dateStr)) streak++;
    else if (i > 0) break;
  }

  const todayStr = today.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const todayAnswers = byDate.get(todayStr) || [];
  const todayPlan = todayAnswers.filter((a) => a.phase === "plan").reduce((s, a) => s + a.value, 0);
  const todayAch = todayAnswers.filter((a) => a.phase === "ach").reduce((s, a) => s + a.value, 0);

  const renderDate = ({ item: dateStr }: { item: string }) => {
    const dayAnswers = byDate.get(dateStr)!;
    const planTotal = dayAnswers.filter((a) => a.phase === "plan").reduce((s, a) => s + a.value, 0);
    const achTotal = dayAnswers.filter((a) => a.phase === "ach").reduce((s, a) => s + a.value, 0);
    const rate = planTotal > 0 ? Math.round((achTotal / planTotal) * 100) : 0;

    return (
      <View style={styles.historyItem}>
        <Text style={styles.historyDate}>
          {new Date(dateStr).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })}
        </Text>
        <View style={{ flex: 1 }}>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Plan: {planTotal}</Text>
            <Text style={styles.historyLabel}>Ach: {achTotal}</Text>
          </View>
          <View style={styles.bar}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.min(100, rate)}%`,
                  backgroundColor: rate >= 80 ? colors.success : rate >= 50 ? colors.warning : colors.danger,
                },
              ]}
            />
          </View>
        </View>
        <Text style={styles.historyRate}>{rate}%</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{streak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{todayPlan}</Text>
          <Text style={styles.statLabel}>Plan</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{todayAch}</Text>
          <Text style={styles.statLabel}>Ach</Text>
        </View>
      </View>

      <FlatList
        data={sortedDates}
        keyExtractor={(item) => item}
        renderItem={renderDate}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: "#64748b", textAlign: "center" }}>
              {loading ? "Loading..." : "No entries yet. Submit your first daily plan!"}
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
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  statNum: { fontSize: 24, fontWeight: "800", color: colors.accentLight },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  historyDate: { fontSize: 11, fontWeight: "600", color: colors.textSecondary, width: 55, textAlign: "center" },
  historyRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  historyLabel: { fontSize: 11, color: colors.textMuted },
  bar: { height: 4, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 2 },
  historyRate: { fontSize: 14, fontWeight: "700", color: colors.accentLight, width: 40, textAlign: "right" },
});
