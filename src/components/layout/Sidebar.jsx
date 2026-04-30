import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";

const NAV = [
  {
    section: "ПОДГОТОВКА",
    links: [
      { to: "/business", icon: "business_center", label: "Настройка бизнеса" },
      { to: "/launch",   icon: "rocket_launch",   label: "Запуск AI аудита", primary: true },
    ],
  },
  {
    section: "РЕЗУЛЬТАТЫ",
    links: [
      { to: "/report",  icon: "description", label: "Итоговый отчет" },
      { to: "/history", icon: "history",     label: "История анализов" },
    ],
  },
];

function Logo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect x="1" y="1" width="34" height="34" rx="9" stroke="rgb(52,168,90)" strokeWidth="1.5" fill="rgba(52,168,90,0.08)" />
      <path d="M5 19 L9 19 L12 11 L16 28 L20 15 L23 19 L31 19"
        stroke="url(#lg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="31" cy="19" r="2.2" fill="rgb(52,168,90)" />
      <defs>
        <linearGradient id="lg" x1="5" y1="19" x2="31" y2="19">
          <stop offset="0%" stopColor="rgba(52,168,90,0.6)" />
          <stop offset="100%" stopColor="rgb(52,168,90)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Sidebar() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);

  return (
    <aside
      style={{
        width: 240, flexShrink: 0, padding: "24px 16px",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        display: "flex", flexDirection: "column", gap: 4,
        position: "relative", zIndex: 1,
        background: "rgba(255,255,255,0.01)",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateX(0)" : "translateX(-20px)",
        transition: "all 0.8s cubic-bezier(0.16,1,0.3,1)",
        height: "100%",
        overflowY: "auto",
      }}
      className="custom-scrollbar"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", marginBottom: 24 }}>
        <Logo />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.02em", color: "#fff" }}>
            AISales Auditor
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(({ section, links }) => (
          <div key={section} style={{ marginBottom: 8 }}>
            <div style={{
              fontSize: 9, fontWeight: 600, letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.2)", padding: "12px 12px 6px",
              fontFamily: "'JetBrains Mono', monospace",
              textTransform: "uppercase",
            }}>
              {section}
            </div>
            {links.map(({ to, icon, label, primary }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `nav-link${primary ? " nav-link--primary" : ""}${isActive ? " active" : ""}`
                }
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, width: 20, textAlign: "center" }}>
                  {icon}
                </span>
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
