import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthChange, signIn, signOut, type User } from "./firebase";
import { getUserRole, getEmployeeProfile, getNotificationConfig, reportAlarmStatus, type Employee, type UserRole } from "./supabase";
import { scheduleAllAlarms, cancelAllAlarms, getAlarmPermissionState, requestAlarmPermissions } from "./alarms";

interface AuthContextType {
  user: User | null;
  employee: Employee | null;
  role: UserRole | null;
  loading: boolean;
  error: string | null;
  alarmOk: boolean;
  recheckAlarms: () => Promise<void>;
  grantAlarmPermissions: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alarmOk, setAlarmOk] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const recheckAlarms = async () => {
    const { alarmOk: ok, batteryOk } = await getAlarmPermissionState();
    setAlarmOk(ok);
    if (employeeId) {
      try {
        await reportAlarmStatus(employeeId, ok, batteryOk);
      } catch {
        console.warn("[Auth] Failed to report alarm status");
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const userRole = await getUserRole(firebaseUser.uid);
          setRole(userRole);

          if (userRole === "employee") {
            const profile = await getEmployeeProfile(firebaseUser.uid);
            setEmployee(profile);
            setEmployeeId(firebaseUser.uid);
            // Schedule daily alarms for this employee
            try {
              const config = await getNotificationConfig();
              await scheduleAllAlarms(config);
              const { alarmOk: ok, batteryOk } = await getAlarmPermissionState();
              setAlarmOk(ok);
              try {
                await reportAlarmStatus(firebaseUser.uid, ok, batteryOk);
              } catch {
                console.warn("[Auth] Failed to report alarm status");
              }
            } catch {
              console.warn("[Auth] Failed to schedule alarms");
            }
          }

          setError(null);
        } catch {
          setError("Failed to verify account. Please try again.");
          setRole(null);
        }
      } else {
        setUser(null);
        setEmployee(null);
        setRole(null);
        setEmployeeId(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      // onAuthChange callback handles the rest
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      setLoading(false);
    }
  };

  const logout = async () => {
    await cancelAllAlarms();
    await signOut();
    setUser(null);
    setEmployee(null);
    setRole(null);
  };

  const grantAlarmPermissions = async () => {
    await requestAlarmPermissions();
    const config = await getNotificationConfig();
    await scheduleAllAlarms(config);
    await recheckAlarms();
  };

  return (
    <AuthContext.Provider
      value={{ user, employee, role, loading, error, alarmOk, recheckAlarms, grantAlarmPermissions, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
