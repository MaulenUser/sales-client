import React from "react";
import { ensureArray, clampRate } from "../../utils/index.js";
import { formatNumber, formatPercent } from "../../utils/format.js";

export default function DistributionPanel({ title, rows }) {
  const items = ensureArray(rows).slice(0, 6);
  return (
    <article style={{
      background: "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16, padding: "20px 24px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
          color: "rgba(255,255,255,0.3)", textTransform: "uppercase",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {title}
        </span>
        <span style={{
          fontSize: 10, color: "rgba(255,255,255,0.2)",
          fontFamily: "'JetBrains Mono', monospace",
          fontVariantNumeric: "tabular-nums",
        }}>
          {formatNumber(items.length)} строк
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map((item, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{
                  fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.2)",
                  fontFamily: "'JetBrains Mono', monospace", width: 12, flexShrink: 0,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.name || "не указано"}
                </span>
              </div>
              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, paddingLeft: 8, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: "rgba(255,255,255,0.35)" }}>{formatNumber(item.count)} </span>
                <span style={{ color: "rgba(52,168,90,0.9)", fontWeight: 600 }}>{formatPercent(item.rate)}</span>
              </span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginLeft: 20 }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: "linear-gradient(90deg, rgba(52,168,90,0.6), rgba(52,168,90,0.3))",
                width: `${clampRate(item.rate)}%`,
                transition: `width 0.6s ${i * 0.05}s cubic-bezier(0.16,1,0.3,1)`,
              }} />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
