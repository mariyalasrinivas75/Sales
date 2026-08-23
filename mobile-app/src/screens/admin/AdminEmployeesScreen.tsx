import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  toggleLeave,
  type Employee,
} from "../../lib/supabase";
import { todayIST } from "../../lib/utils";
import { colors } from "../../lib/theme";

export default function AdminEmployeesScreen() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [form, setForm] = useState({ id: "", emp_code: "", name: "", email: "", phone: "" });

  const load = useCallback(async () => {
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditingEmp(null);
    setForm({ id: "", emp_code: "", name: "", email: "", phone: "" });
    setShowModal(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingEmp(emp);
    setForm({ id: emp.id, emp_code: emp.emp_code, name: emp.name, email: emp.email || "", phone: emp.phone || "" });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.emp_code.trim()) {
      Alert.alert("Error", "Name and employee code are required.");
      return;
    }
    try {
      if (editingEmp) {
        await updateEmployee(editingEmp.id, {
          emp_code: form.emp_code,
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
        });
      } else {
        if (!form.id.trim()) {
          Alert.alert("Error", "Firebase UID is required for new employees.");
          return;
        }
        await createEmployee({
          id: form.id,
          emp_code: form.emp_code,
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          active: true,
        });
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save.");
    }
  };

  const handleToggleActive = async (emp: Employee) => {
    try {
      await updateEmployee(emp.id, { active: !emp.active });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleLeave = async (emp: Employee) => {
    Alert.alert(
      "Mark Leave",
      `Mark ${emp.name} as on leave for today?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes",
          onPress: async () => {
            try {
              await toggleLeave(emp.id, todayIST(), true);
              Alert.alert("Done", `${emp.name} is on leave today.`);
            } catch (err) {
              console.error(err);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Employee }) => (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.empName}>{item.name}</Text>
        <Text style={styles.empMeta}>{item.emp_code} · {item.email || "No email"}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.badge, { backgroundColor: item.active ? colors.success + "22" : colors.textMuted + "22" }]}
          onPress={() => handleToggleActive(item)}
        >
          <Text style={{ color: item.active ? colors.success : colors.textMuted, fontSize: 11, fontWeight: "600" }}>
            {item.active ? "Active" : "Inactive"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)}>
          <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => handleLeave(item)}>
          <Ionicons name="airplane-outline" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
        <Text style={styles.addBtnText}>+ Add Employee</Text>
      </TouchableOpacity>

      <FlatList
        data={employees}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editingEmp ? "Edit Employee" : "Add Employee"}</Text>

            {!editingEmp && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Firebase UID *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Paste Firebase UID"
                  placeholderTextColor="#64748b"
                  value={form.id}
                  onChangeText={(t) => setForm({ ...form, id: t })}
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Employee Code *</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="EMP001"
                placeholderTextColor="#64748b"
                value={form.emp_code}
                onChangeText={(t) => setForm({ ...form, emp_code: t })}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Full Name *</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="John Doe"
                placeholderTextColor="#64748b"
                value={form.name}
                onChangeText={(t) => setForm({ ...form, name: t })}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="john@company.com"
                placeholderTextColor="#64748b"
                value={form.email}
                onChangeText={(t) => setForm({ ...form, email: t })}
                keyboardType="email-address"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="+91 98765 43210"
                placeholderTextColor="#64748b"
                value={form.phone}
                onChangeText={(t) => setForm({ ...form, phone: t })}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: "500" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={{ color: "white", fontWeight: "600" }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  addBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  addBtnText: { color: "white", fontWeight: "600", fontSize: 15 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  empName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  empMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  iconBtn: { padding: 6 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: colors.surfaceSolid,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 20 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: "500", color: colors.textSecondary, marginBottom: 6 },
  fieldInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 15,
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  saveBtn: {
    flex: 1,
    padding: 14,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
});
