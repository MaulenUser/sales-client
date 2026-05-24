import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import useStore from "./store/index.js";
import Sidebar from "./components/layout/Sidebar.jsx";
import Header from "./components/layout/Header.jsx";

import LoginScreen from "./screens/LoginScreen.jsx";
import BusinessScreen from "./screens/BusinessScreen.jsx";
import LaunchScreen from "./screens/LaunchScreen.jsx";
import OverviewScreen from "./screens/OverviewScreen.jsx";
import ManagersScreen from "./screens/ManagersScreen.jsx";
import CallsScreen from "./screens/CallsScreen.jsx";
import WhatsAppScreen from "./screens/WhatsAppScreen.jsx";
import ExplorerScreen from "./screens/ExplorerScreen.jsx";
import ReportScreen from "./screens/ReportScreen.jsx";
import HistoryScreen from "./screens/HistoryScreen.jsx";
import UsageScreen from "./screens/UsageScreen.jsx";

const THEME_STORAGE_KEY = "ai-auditor-theme";
const DEFAULT_THEME = "dark";

function getInitialTheme() {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : DEFAULT_THEME;
}

function useThemeMode() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}

const ambientStyle = {
  position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
  background: "var(--app-ambient)",
};

function AppShell() {
  const { init, isLoading, error, authRequired, currentUser } = useStore();
  const [theme, setTheme] = useThemeMode();

  useEffect(() => { init(); }, []);

  if (error) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
        <div style={{
          maxWidth: 520, width: "100%",
          background: "var(--surface-glass)",
          border: "1px solid rgba(240,86,86,0.18)",
          borderRadius: 20, padding: "32px 36px",
          boxShadow: "var(--shadow-soft)",
        }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.2em", color: "rgb(240,86,86)", textTransform: "uppercase", marginBottom: 16, fontFamily: "'JetBrains Mono', monospace" }}>
            Ошибка дэшборда
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", marginBottom: 12, color: "var(--text-strong)" }}>
            Не удалось инициализировать дэшборд
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>{error}</p>
          <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--surface-border)" }}>
            Проверьте локальный сервер и наличие файлов в export/.
          </p>
        </div>
      </main>
    );
  }

  if (authRequired && !currentUser) {
    return <LoginScreen theme={theme} onThemeChange={setTheme} />;
  }

  return (
    <div className="bg-background text-foreground font-sans antialiased h-screen overflow-hidden flex" style={{ position: "relative" }}>
      <div style={ambientStyle} />
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0" style={{ position: "relative", zIndex: 1 }}>
        <Header theme={theme} onThemeChange={setTheme} />
        <div
          className="flex-1 overflow-y-auto custom-scrollbar"
          style={{ padding: "32px 40px", containerType: "inline-size", containerName: "canvas" }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.2em", color: "var(--text-faint)", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>
                Загрузка данных...
              </div>
            </div>
          ) : (
            <Routes>
              <Route path="/" element={<Navigate to="/business" replace />} />
              <Route path="/business" element={<BusinessScreen />} />
              <Route path="/launch" element={<LaunchScreen />} />
              <Route path="/overview" element={<OverviewScreen />} />
              <Route path="/managers" element={<ManagersScreen />} />
              <Route path="/calls" element={<CallsScreen />} />
              <Route path="/whatsapp" element={<WhatsAppScreen />} />
              <Route path="/explorer" element={<ExplorerScreen />} />
              <Route path="/report" element={<ReportScreen />} />
              <Route path="/history" element={<HistoryScreen />} />
              <Route path="/usage" element={<UsageScreen />} />
            </Routes>
          )}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
