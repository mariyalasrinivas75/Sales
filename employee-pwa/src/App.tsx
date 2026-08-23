import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import QuestionFlowPage from "./pages/QuestionFlowPage";
import HistoryPage from "./pages/HistoryPage";
import { ClipboardList, History, LogOut } from "lucide-react";

function AppContent() {
  const { user, employee, role, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="screen-center">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!user || role !== "employee" || !employee) {
    return <LoginPage />;
  }

  return (
    <div className="app-shell">
      {/* Top bar */}
      <header className="top-bar">
        <div className="top-bar-left">
          <span className="top-bar-logo">📊</span>
          <div>
            <div className="top-bar-title">Sales Tracker</div>
            <div className="top-bar-subtitle">{employee.name}</div>
          </div>
        </div>
        <button className="top-bar-action" onClick={logout} title="Sign Out">
          <LogOut size={18} />
        </button>
      </header>

      {/* Content */}
      <main className="app-content">
        <Routes>
          <Route path="/" element={<QuestionFlowPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Bottom navigation */}
      <nav className="bottom-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `bottom-nav-item ${isActive ? "active" : ""}`}
        >
          <ClipboardList size={20} />
          <span>Today</span>
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) => `bottom-nav-item ${isActive ? "active" : ""}`}
        >
          <History size={20} />
          <span>History</span>
        </NavLink>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
