import React, { useState, useEffect } from "react";

const GLOW = {
  cyan:   "rgba(0,210,255,0.45)",
  green:  "rgba(52,168,90,0.45)",
  violet: "rgba(74,222,128,0.4)",
  yellow: "rgba(246,192,60,0.45)",
  red:    "rgba(240,86,86,0.45)",
};

const NOTE_COLOR = {
  cyan:   "rgba(0,210,255,0.85)",
  green:  "rgba(52,168,90,0.9)",
  violet: "rgba(74,222,128,0.85)",
  yellow: "rgba(246,192,60,0.9)",
  red:    "rgba(240,86,86,0.9)",
};

export default function MetricCard({
  label,
  value,
  note,
  tone = "cyan",
  delay = 0,
  compact = false,
  spanClass = "col-span-12 md:col-span-3",
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay || 150);
    return () => clearTimeout(t);
  }, [delay]);

  const str = String(value ?? "");
  const isNumericish = /^[\d\s\/.,+%ТŢ₸$€£¥\-]+$/.test(str.trim()) && str.length < 14;
  const baseFontSize = isNumericish && str.length <= 4 ? 52 : isNumericish && str.length <= 7 ? 40 : isNumericish ? 30 : 18;
  const fontSize = compact ? Math.round(baseFontSize * 0.82) : baseFontSize;
  const fontWeight = isNumericish ? 300 : 400;

  const glowColor = GLOW[tone] ?? "rgba(255,255,255,0.02)";
  const noteColor = NOTE_COLOR[tone] ?? "rgba(255,255,255,0.4)";

  return (
    <article
      className={spanClass}
      style={{
        flex: "1 1 0", minWidth: 160,
        background: "linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: compact ? 14 : 16,
        padding: compact ? "18px 20px" : "24px 28px",
        position: "relative",
        overflow: "hidden",
        transform: show ? "translateY(0)" : "translateY(12px)",
        opacity: show ? 1 : 0,
        transition: "all 0.6s cubic-bezier(0.16,1,0.3,1)",
        cursor: "default",
      }}
    >
      <div style={{
        position: "absolute", top: -20, right: -20,
        width: 80, height: 80,
        background: glowColor,
        borderRadius: "50%",
        filter: "blur(30px)",
        opacity: 0.5,
        pointerEvents: "none",
      }} />

      <div style={{
        fontSize: compact ? 10 : 11, fontWeight: 600, letterSpacing: "0.08em",
        color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
        fontFamily: "'JetBrains Mono', monospace",
        marginBottom: compact ? 10 : 16,
      }}>
        {label}
      </div>

      <div style={{
        fontSize, fontWeight, color: "#fff",
        lineHeight: 1.1, marginBottom: 8,
        letterSpacing: isNumericish ? "-0.02em" : "-0.01em",
        wordBreak: "break-word",
      }}>
        {value}
      </div>

      {note && (
        <div style={{
          fontSize: compact ? 11 : 12, color: noteColor,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 400,
          lineHeight: compact ? 1.35 : 1.4,
        }}>
          {note}
        </div>
      )}
    </article>
  );
}
