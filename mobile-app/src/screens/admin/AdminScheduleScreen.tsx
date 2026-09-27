import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert, RefreshControl } from "react-native";
import { getNotificationConfig, updateNotificationConfig, type NotificationConfig } from "../../lib/supabase";
import { colors } from "../../lib/theme";

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default function AdminScheduleScreen() {
  const [slots, setSlots] = useState<NotificationConfig[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getNotificationConfig();
      setSlots(data);
      setDrafts(Object.fromEntries(data.map((s) => [s.id, s.fire_time.slice(0, 5)])));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (slot: NotificationConfig) => {
    const value = (drafts[slot.id] || "").trim();
    if (!HHMM_RE.test(value)) {
      Alert.alert("Invalid time", "Enter time as HH:MM (24-hour), e.g. 09:30.");
      return;
    }
    setSavingId(slot.id);
    try {
      await updateNotificationConfig(slot.id, { fire_time: `${value}:00` });
      await load();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save.");
    } finally {
      setSavingId(null);
    }
  };

  const renderItem = ({ item }: { item: NotificationConfig }) => {
    const dirty = drafts[item.id] !== item.fire_time.slice(0, 5);
    return (
      <View style={styles.card}>
        <View style={{ flex: 1 }}>
          <Text style={styles.slotKey}>{item.slot_key}</Text>
          {!!item.label && <Text style={styles.slotLabel}>{item.label}</Text>}
        </View>
        <TextInput
          style={styles.timeInput}
          value={drafts[item.id] ?? ""}
          onChangeText={(t) => setDrafts((d) => ({ ...d, [item.id]: t }))}
          placeholder="HH:MM"
          placeholderTextColor={colors.textMuted}
          maxLength={5}
          keyboardType="numbers-and-punctuation"
        />
        <TouchableOpacity
          style={[styles.saveBtn, !dirty && styles.saveBtnDisabled]}
          onPress={() => handleSave(item)}
          disabled={!dirty || savingId === item.id}
        >
          <Text style={styles.saveBtnText}>{savingId === item.id ? "..." : "Save"}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.note}>Phones update at next alarm or app open.</Text>
      <FlatList
        data={slots}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{loading ? "Loading..." : "No schedule found."}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  note: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  slotKey: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  slotLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  timeInput: {
    width: 70,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    padding: 8,
    color: colors.textPrimary,
    fontSize: 14,
    textAlign: "center",
  },
  saveBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  saveBtnDisabled: { backgroundColor: colors.textMuted + "33" },
  saveBtnText: { color: "white", fontWeight: "600", fontSize: 12 },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: colors.textMuted, textAlign: "center" },
});
