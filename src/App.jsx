import React, { useEffect } from "react";
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

const ambientStyle = {
  position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
  background: [
    "radial-gradient(ellipse 70% 50% at 10% 5%, rgba(52,168,90,0.055) 0%, transparent 70%)",
    "radial-gradient(ellipse 50% 50% at 85% 85%, rgba(52,168,90,0.035) 0%, transparent 65%)",
  ].join(", "),
};

function AppShell() {
  const { init, isLoading, error, authRequired, currentUser } = useStore();

  useEffect(() => { init(); }, []);

  if (error) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
        <div style={{
          maxWidth: 520, width: "100%",
          background: "linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
          border: "1px solid rgba(240,86,86,0.18)",
          borderRadius: 20, padding: "32px 36px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.2em", color: "rgb(240,86,86)", textTransform: "uppercase", marginBottom: 16, fontFamily: "'JetBrains Mono', monospace" }}>
            Ошибка дэшборда
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", marginBottom: 12, color: "#fff" }}>
            Не удалось инициализировать дэшборд
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>{error}</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            Проверьте локальный сервер и наличие файлов в export/.
          </p>
        </div>
      </main>
    );
  }

  if (authRequired && !currentUser) {
    return <LoginScreen />;
  }

  return (
    <div className="bg-background text-foreground font-sans antialiased h-screen overflow-hidden flex" style={{ position: "relative" }}>
      <div style={ambientStyle} />
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0" style={{ position: "relative", zIndex: 1 }}>
        <Header />
        <div
          className="flex-1 overflow-y-auto custom-scrollbar"
          style={{ padding: "32px 40px", containerType: "inline-size", containerName: "canvas" }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.2em", color: "rgba(255,255,255,0.2)", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>
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
