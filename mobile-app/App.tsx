import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, AppState } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AuthProvider, useAuth } from "./src/lib/auth";
import { colors } from "./src/lib/theme";

// Screens
import LoginScreen from "./src/screens/LoginScreen";
import AdminDashboardScreen from "./src/screens/admin/AdminDashboardScreen";
import AdminEmployeesScreen from "./src/screens/admin/AdminEmployeesScreen";
import AdminQuestionsScreen from "./src/screens/admin/AdminQuestionsScreen";
import AdminScheduleScreen from "./src/screens/admin/AdminScheduleScreen";
import AdminRecordsScreen from "./src/screens/admin/AdminRecordsScreen";
import EmployeeQuestionFlowScreen from "./src/screens/employee/EmployeeQuestionFlowScreen";
import EmployeeHistoryScreen from "./src/screens/employee/EmployeeHistoryScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ── Admin Tab Navigator ──
function AdminTabs() {
  const { logout, user } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.surfaceSolid,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accentLight,
        tabBarInactiveTintColor: colors.textMuted,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: "700" },
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
            <Text style={{ color: colors.danger, fontWeight: "500" }}>Sign Out</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={AdminDashboardScreen}
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Employees"
        component={AdminEmployeesScreen}
        options={{
          title: "Employees",
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Questions"
        component={AdminQuestionsScreen}
        options={{
          title: "Questions",
          tabBarIcon: ({ color, size }) => <Ionicons name="help-circle-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={AdminScheduleScreen}
        options={{
          title: "Schedule",
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Records"
        component={AdminRecordsScreen}
        options={{
          title: "Records",
          tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ── Employee Tab Navigator ──
function EmployeeTabs() {
  const { employee, logout } = useAuth();

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.surfaceSolid,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accentLight,
        tabBarInactiveTintColor: colors.textMuted,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: "700" },
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
            <Text style={{ color: colors.danger, fontWeight: "500" }}>Sign Out</Text>
          </TouchableOpacity>
        ),
        headerSubtitle: employee?.name,
      }}
    >
      <Tab.Screen
        name="Today"
        component={EmployeeQuestionFlowScreen}
        options={{
          title: "Today",
          headerTitle: "Sales Tracker",
          tabBarIcon: ({ color, size }) => <Ionicons name="checkbox-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={EmployeeHistoryScreen}
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      </Tab.Navigator>
    </View>
  );
}

// ── Employee-only blocking gate ──
// Employees cannot disable reminders: shown on login and whenever the exact-alarm
// or notification permission is missing. Admins never see this (checked only for
// role === "employee" in AppContent). Battery optimization is reported to admin
// as a badge instead of gated here — some OEMs don't offer the toggle at all.
function AlarmBlockingGate() {
  const insets = useSafeAreaInsets();
  const { grantAlarmPermissions } = useAuth();
  const [requesting, setRequesting] = useState(false);

  const handleAllow = async () => {
    setRequesting(true);
    try {
      await grantAlarmPermissions();
    } finally {
      setRequesting(false);
    }
  };

  return (
    <View style={[styles.center, { paddingTop: insets.top + 32 }]}>
      <Ionicons name="alarm-outline" size={48} color={colors.accent} style={{ marginBottom: 16 }} />
      <Text style={styles.errorTitle}>Reminders Required</Text>
      <Text style={styles.errorText}>
        Sales Tracker needs alarm and notification permission to remind you about your daily
        plan and achievement deadlines. This can't be skipped.{"\n\n"}
        On some phones (Vivo, Xiaomi, Oppo, Realme, OnePlus) you'll also need to manually
        allow "Autostart" / disable battery optimization for this app in your phone's own
        Settings — Android's own permission alone isn't enough on those brands.
      </Text>
      <TouchableOpacity style={styles.signOutBtn} onPress={handleAllow} disabled={requesting}>
        <Text style={styles.signOutBtnText}>{requesting ? "Requesting..." : "Allow reminders"}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── App Shell ──
function AppContent() {
  const { user, role, loading, logout, alarmOk, recheckAlarms } = useAuth();

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") recheckAlarms();
    });
    return () => sub.remove();
  }, [recheckAlarms]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  if (role === "admin") {
    return <AdminTabs />;
  }

  if (role === "employee") {
    if (!alarmOk) return <AlarmBlockingGate />;
    return <EmployeeTabs />;
  }

  // Unknown role — show error
  return (
    <View style={styles.center}>
      <Ionicons name="alert-circle-outline" size={48} color={colors.danger} style={{ marginBottom: 12 }} />
      <Text style={styles.errorTitle}>Account Not Found</Text>
      <Text style={styles.errorText}>
        Your account is not registered in the system. Please contact your admin.
      </Text>
      <TouchableOpacity style={styles.signOutBtn} onPress={logout}>
        <Text style={styles.signOutBtnText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: colors.accent,
            background: colors.background,
            card: colors.surfaceSolid,
            text: colors.textPrimary,
            border: colors.border,
            notification: colors.accent,
          },
          fonts: {
            regular: { fontFamily: "System", fontWeight: "400" },
            medium: { fontFamily: "System", fontWeight: "500" },
            bold: { fontFamily: "System", fontWeight: "700" },
            heavy: { fontFamily: "System", fontWeight: "900" },
          },
        }}
      >
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    color: colors.textMuted,
    marginTop: 16,
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  signOutBtn: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  signOutBtnText: {
    color: "white",
    fontWeight: "600",
    fontSize: 15,
  },
});
