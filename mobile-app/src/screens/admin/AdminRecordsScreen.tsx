import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from "react-native";
import { getDailyAnswers, getEmployees, getQuestions, type Employee, type Question } from "../../lib/supabase";
import { todayIST } from "../../lib/utils";
import { colors } from "../../lib/theme";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function AdminRecordsScreen() {
  const [date, setDate] = useState(todayIST());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    Promise.all([getEmployees(), getQuestions()]).then(([emps, qs]) => {
      setEmployees(emps);
      setQuestions(qs);
    }).catch((err) => console.error(err));
  }, []);

  const loadAnswers = useCallback(async () => {
    if (!DATE_RE.test(date)) {
      Alert.alert("Invalid date", "Enter date as YYYY-MM-DD.");
      return;
    }
    setLoading(true);
    try {
      setAnswers(await getDailyAnswers(date, employeeId || undefined));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [date, employeeId]);

  useEffect(() => { loadAnswers(); }, [loadAnswers]);

  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const visibleEmployees = employeeId ? employees.filter((e) => e.id === employeeId) : employees;

  const valueFor = (empId: string, questionId: string, phase: "plan" | "ach") => {
    const a = answers.find(
      (row) => row.employee_id === empId && row.question_id === questionId && row.phase === phase
    );
    return a ? a.value : "-";
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <TextInput
          style={styles.dateInput}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={loadAnswers}
        />
        <TouchableOpacity style={styles.empFilterBtn} onPress={() => setPickerOpen((v) => !v)}>
          <Text style={styles.empFilterText} numberOfLines={1}>
            {selectedEmployee ? selectedEmployee.name : "All employees"}
          </Text>
        </TouchableOpacity>
      </View>

      {pickerOpen && (
        <ScrollView style={styles.pickerBox} nestedScrollEnabled>
          <TouchableOpacity
            style={styles.pickerRow}
            onPress={() => { setEmployeeId(null); setPickerOpen(false); }}
          >
            <Text style={styles.pickerRowText}>All employees</Text>
          </TouchableOpacity>
          {employees.map((e) => (
            <TouchableOpacity
              key={e.id}
              style={styles.pickerRow}
              onPress={() => { setEmployeeId(e.id); setPickerOpen(false); }}
            >
              <Text style={styles.pickerRowText}>{e.name} ({e.emp_code})</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
        <View>
          {/* Header */}
          <View style={styles.row}>
            <Text style={[styles.cell, styles.headerCell, styles.nameCell]}>Employee</Text>
            {questions.map((q) => (
              <View key={q.id} style={[styles.cell, styles.qCell]}>
                <Text style={[styles.headerCellText]} numberOfLines={2}>{q.label}</Text>
                <View style={styles.subHeaderRow}>
                  <Text style={styles.subHeaderText}>Plan</Text>
                  <Text style={styles.subHeaderText}>Ach</Text>
                </View>
              </View>
            ))}
          </View>

          <ScrollView style={{ maxHeight: 500 }}>
            {visibleEmployees.filter((e) => e.active).map((emp) => (
              <View key={emp.id} style={styles.row}>
                <Text style={[styles.cell, styles.nameCell]} numberOfLines={1}>{emp.name}</Text>
                {questions.map((q) => (
                  <View key={q.id} style={[styles.cell, styles.qCell, styles.subHeaderRow]}>
                    <Text style={styles.valueText}>{valueFor(emp.id, q.id, "plan")}</Text>
                    <Text style={styles.valueText}>{valueFor(emp.id, q.id, "ach")}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {loading && <Text style={styles.loadingText}>Loading...</Text>}
      {!loading && visibleEmployees.length === 0 && (
        <Text style={styles.emptyText}>No employees.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  dateInput: {
    width: 130,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    padding: 10,
    color: colors.textPrimary,
    fontSize: 14,
  },
  empFilterBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    padding: 10,
    justifyContent: "center",
  },
  empFilterText: { color: colors.textPrimary, fontSize: 14 },
  pickerBox: {
    maxHeight: 200,
    backgroundColor: colors.surfaceSolid,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: 8,
  },
  pickerRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerRowText: { color: colors.textPrimary, fontSize: 14 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  cell: { padding: 8, justifyContent: "center" },
  nameCell: { width: 120 },
  qCell: { width: 100, alignItems: "center" },
  headerCell: { backgroundColor: colors.surface },
  headerCellText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600", textAlign: "center" },
  subHeaderRow: { flexDirection: "row", justifyContent: "space-around", width: "100%" },
  subHeaderText: { color: colors.textMuted, fontSize: 10 },
  valueText: { color: colors.textPrimary, fontSize: 13, width: 40, textAlign: "center" },
  loadingText: { color: colors.textMuted, textAlign: "center", marginTop: 12 },
  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 12 },
});
