import React from "react";

const NOTE_COLOR = {
  cyan:   "rgba(0,210,255,0.8)",
  green:  "rgba(52,168,90,0.9)",
  violet: "rgba(74,222,128,0.8)",
  yellow: "rgba(246,192,60,0.9)",
  red:    "rgba(240,86,86,0.9)",
};

export default function MiniCard({ label, value, note, tone = "cyan" }) {
  return (
    <article style={{
      padding: "16px 20px",
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12,
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <p style={{
        fontSize: 9, fontWeight: 600, letterSpacing: "0.16em",
        color: "rgba(255,255,255,0.35)", textTransform: "uppercase",
        fontFamily: "'JetBrains Mono', monospace", margin: 0,
      }}>
        {label}
      </p>
      <p style={{
        fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em",
        color: "#fff", lineHeight: 1, margin: 0,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </p>
      {note && (
        <p style={{
          fontSize: 11, color: NOTE_COLOR[tone] ?? "rgba(255,255,255,0.35)",
          fontFamily: "'JetBrains Mono', monospace", margin: 0, lineHeight: 1.4,
        }}>
          {note}
        </p>
      )}
    </article>
  );
}
