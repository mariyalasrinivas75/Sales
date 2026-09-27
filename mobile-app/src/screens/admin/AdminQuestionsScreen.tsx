import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getQuestions, createQuestion, updateQuestion, type Question } from "../../lib/supabase";
import { colors } from "../../lib/theme";

export default function AdminQuestionsScreen() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setQuestions(await getQuestions());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setBusy(true);
    try {
      const nextOrder = questions.reduce((max, q) => Math.max(max, q.sort_order), 0) + 1;
      await createQuestion({ label: newLabel.trim(), sort_order: nextOrder });
      setNewLabel("");
      await load();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to add question.");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!editingLabel.trim()) return;
    setBusy(true);
    try {
      await updateQuestion(id, { label: editingLabel.trim() });
      setEditingId(null);
      await load();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to rename.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (q: Question) => {
    try {
      await updateQuestion(q.id, { active: !q.active });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const a = questions[index];
    const b = questions[target];
    setBusy(true);
    try {
      await Promise.all([
        updateQuestion(a.id, { sort_order: b.sort_order }),
        updateQuestion(b.id, { sort_order: a.sort_order }),
      ]);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const renderItem = ({ item, index }: { item: Question; index: number }) => (
    <View style={styles.card}>
      {editingId === item.id ? (
        <TextInput
          style={styles.editInput}
          value={editingLabel}
          onChangeText={setEditingLabel}
          onSubmitEditing={() => handleRename(item.id)}
          autoFocus
        />
      ) : (
        <Text style={[styles.label, !item.active && styles.labelInactive]}>{item.label}</Text>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => handleMove(index, -1)} disabled={busy || index === 0}>
          <Ionicons name="arrow-up-outline" size={16} color={index === 0 ? colors.textMuted : colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => handleMove(index, 1)}
          disabled={busy || index === questions.length - 1}
        >
          <Ionicons
            name="arrow-down-outline"
            size={16}
            color={index === questions.length - 1 ? colors.textMuted : colors.textSecondary}
          />
        </TouchableOpacity>
        {editingId === item.id ? (
          <TouchableOpacity style={styles.iconBtn} onPress={() => handleRename(item.id)}>
            <Ionicons name="checkmark-outline" size={18} color={colors.success} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              setEditingId(item.id);
              setEditingLabel(item.label);
            }}
          >
            <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.badge, { backgroundColor: item.active ? colors.success + "22" : colors.textMuted + "22" }]}
          onPress={() => handleToggleActive(item)}
        >
          <Text style={{ color: item.active ? colors.success : colors.textMuted, fontSize: 11, fontWeight: "600" }}>
            {item.active ? "Active" : "Inactive"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="New question label"
          placeholderTextColor={colors.textMuted}
          value={newLabel}
          onChangeText={setNewLabel}
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd} disabled={busy}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={questions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{loading ? "Loading..." : "No questions yet."}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  addRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  addInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 14,
  },
  addBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 18, justifyContent: "center" },
  addBtnText: { color: "white", fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  label: { fontSize: 14, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  labelInactive: { color: colors.textMuted, textDecorationLine: "line-through" },
  editInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 6,
    padding: 8,
    color: colors.textPrimary,
    fontSize: 14,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: { padding: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: colors.textMuted, textAlign: "center" },
});
