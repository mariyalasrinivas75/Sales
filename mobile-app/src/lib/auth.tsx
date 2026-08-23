import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthChange, signIn, signOut, type User } from "./firebase";
import { getUserRole, getEmployeeProfile, getNotificationConfig, type Employee, type UserRole } from "./supabase";
import { scheduleAllAlarms, cancelAllAlarms } from "./alarms";

interface AuthContextType {
  user: User | null;
  employee: Employee | null;
  role: UserRole | null;
  loading: boolean;
  error: string | null;
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
            // Schedule daily alarms for this employee
            try {
              const config = await getNotificationConfig();
              await scheduleAllAlarms(config);
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

  return (
    <AuthContext.Provider value={{ user, employee, role, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
