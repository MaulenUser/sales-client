import React from "react";

const OPTIONS = [
  { value: "dark", label: "Темная" },
  { value: "light", label: "Светлая" },
];

export default function ThemeToggle({ theme = "dark", onChange, compact = false }) {
  return (
    <div
      className={`theme-toggle${compact ? " theme-toggle--compact" : ""}`}
      role="group"
      aria-label="Режим интерфейса"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={theme === option.value}
          className={theme === option.value ? "active" : ""}
          onClick={() => onChange?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
