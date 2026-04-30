import React from "react";

const TONES = {
  ok:      { bg: "rgba(52,168,90,0.12)",  border: "rgba(52,168,90,0.25)",  text: "rgb(74,222,128)" },
  neutral: { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", text: "rgba(255,255,255,0.5)" },
  warning: { bg: "rgba(246,192,60,0.1)",  border: "rgba(246,192,60,0.22)", text: "rgb(246,192,60)" },
  danger:  { bg: "rgba(240,86,86,0.1)",   border: "rgba(240,86,86,0.22)",  text: "rgb(240,86,86)" },
};

export default function Badge({ text, tone = "neutral" }) {
  const c = TONES[tone] ?? TONES.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 10px", borderRadius: 6,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
      fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase",
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      marginRight: 4, marginBottom: 2,
    }}>
      {text}
    </span>
  );
}
