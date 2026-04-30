import React from "react";
import { clampRate } from "../../utils/index.js";
import { formatPercent } from "../../utils/format.js";

export default function MetricBarCard({ title, rate: rateValue, note, tone = "success" }) {
  const pct = clampRate(rateValue);
  const isDanger = tone === "danger";
  const barColor = isDanger ? "rgba(240,86,86,0.8)" : "rgba(52,168,90,0.8)";
  const pctColor = isDanger ? "rgba(240,86,86,0.9)" : "#fff";

  return (
    <article style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
          color: "rgba(255,255,255,0.35)", textTransform: "uppercase",
          fontFamily: "'JetBrains Mono', monospace",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "65%",
        }}>
          {title}
        </span>
        <span style={{
          fontSize: 16, fontWeight: 300, letterSpacing: "-0.02em",
          color: pctColor, flexShrink: 0, paddingLeft: 8,
          fontVariantNumeric: "tabular-nums",
        }}>
          {formatPercent(pct)}
        </span>
      </div>
      <div style={{
        height: 4, borderRadius: 2,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden", marginBottom: 6,
      }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: barColor, borderRadius: 2,
          transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
        }} />
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 9, color: "rgba(255,255,255,0.25)",
        fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}>
        <span>{note}</span>
        <span>{isDanger ? "зона риска" : "сильный сигнал"}</span>
      </div>
    </article>
  );
}
