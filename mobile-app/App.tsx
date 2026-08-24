import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthProvider, useAuth } from "./src/lib/auth";
import { requestAlarmPermissions } from "./src/lib/alarms";
import { colors } from "./src/lib/theme";

const ONBOARDING_KEY = "@sales_tracker/permissions_onboarded";

// Screens
import LoginScreen from "./src/screens/LoginScreen";
import AdminDashboardScreen from "./src/screens/admin/AdminDashboardScreen";
import AdminEmployeesScreen from "./src/screens/admin/AdminEmployeesScreen";
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
    </Tab.Navigator>
  );
}

// ── Employee Tab Navigator ──
function EmployeeTabs() {
  const { employee, logout, alarmPermissionsOk, grantAlarmPermissions } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      {!alarmPermissionsOk && (
        <TouchableOpacity
          style={[styles.permissionBanner, { paddingTop: insets.top + 10 }]}
          onPress={grantAlarmPermissions}
        >
          <Ionicons name="alarm-outline" size={16} color="white" />
          <Text style={styles.permissionBannerText}>
            Reminders are off — tap to allow alarms & notifications
          </Text>
        </TouchableOpacity>
      )}
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

// ── First-run permission gate ──
// Runs once per install, before the Login screen is reachable — the user must
// tap through the prompt (grant, or hit the OS deny) to unlock login.
function OnboardingGate({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [requesting, setRequesting] = useState(false);

  const handleContinue = async () => {
    setRequesting(true);
    try {
      await requestAlarmPermissions();
    } finally {
      await AsyncStorage.setItem(ONBOARDING_KEY, "1");
      onDone();
    }
  };

  return (
    <View style={[styles.center, { paddingTop: insets.top + 32 }]}>
      <Ionicons name="alarm-outline" size={48} color={colors.accent} style={{ marginBottom: 16 }} />
      <Text style={styles.errorTitle}>Enable Reminders</Text>
      <Text style={styles.errorText}>
        Sales Tracker uses alarms and notifications to remind you about your daily plan and
        achievement deadlines. Allow them now so reminders work from day one.
      </Text>
      <TouchableOpacity style={styles.signOutBtn} onPress={handleContinue} disabled={requesting}>
        <Text style={styles.signOutBtnText}>{requesting ? "Requesting..." : "Continue"}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── App Shell ──
function AppContent() {
  const { user, role, loading, logout } = useAuth();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => setOnboarded(v === "1"));
  }, []);

  if (onboarded === null || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!onboarded) {
    return <OnboardingGate onDone={() => setOnboarded(true)} />;
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
  permissionBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.danger,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  permissionBannerText: {
    color: "white",
    fontSize: 13,
    fontWeight: "600",
  },
});
