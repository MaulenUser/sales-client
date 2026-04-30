import React from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import { formatNumber, formatPercent } from "../utils/format.js";
import { ensureArray, clampRate, rate, average, sum, metricRate, isTrueLike } from "../utils/index.js";
import MetricCard from "../components/shared/MetricCard.jsx";
import MetricBarCard from "../components/shared/MetricBarCard.jsx";
import Badge from "../components/shared/Badge.jsx";
import PlaceholderCards from "../components/shared/PlaceholderCards.jsx";

function getManagerName(id) {
  if (id === undefined || id === null || id === "") return "Менеджер не указан";
  return `Менеджер #${id}`;
}

function getSortedManagers(summary) {
  return [...ensureArray(summary?.managers)]
    .map((m) => ({ ...m, top_topics: ensureArray(m?.top_topics) }))
    .sort(
      (a, b) =>
        Number(b.interactions || 0) - Number(a.interactions || 0) ||
        Number(b.actionable_rate || 0) - Number(a.actionable_rate || 0)
    );
}

const HEATMAP_COLUMNS = [
  ["manager_introduced_self", "Представился"],
  ["manager_asked_questions", "Задавал вопросы"],
  ["need_identified", "Выявил потребность"],
  ["manager_presented_service", "Презентовал услугу"],
  ["manager_agreed_next_step", "Согласовал следующий шаг"],
];

function heatmapCellStyle(rate) {
  const alpha = (clampRate(rate) / 100) * 0.8 + 0.08;
  if (rate >= 70) return { backgroundColor: `rgba(88,255,191,${alpha})` };
  if (rate >= 40) return { backgroundColor: `rgba(255,215,102,${alpha})` };
  return { backgroundColor: `rgba(255,107,134,${alpha})` };
}

function getWeakZonesForManager(managerId, interactions) {
  const rows = interactions.filter((r) => String(r.manager_id) === String(managerId));
  if (rows.length < 2) return [];
  const zones = [];
  if (metricRate(rows, "manager_introduced_self").rate < 40) zones.push("intro");
  if (metricRate(rows, "manager_asked_questions").rate < 50) zones.push("qualification");
  if (metricRate(rows, "need_identified").rate < 50) zones.push("need");
  if (metricRate(rows, "manager_agreed_next_step").rate < 35) zones.push("следующий шаг");
  if (rows.filter((r) => isTrueLike(r.short_or_low_content)).length >= Math.ceil(rows.length / 2))
    zones.push("signal quality");
  return zones.slice(0, 3);
}

function ManagerHeatmap({ managers, interactions }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", fontSize: 9, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", fontWeight: 600, paddingBottom: 14, paddingRight: 16, minWidth: 130 }}>
            Менеджер
          </th>
          {HEATMAP_COLUMNS.map(([, label]) => (
            <th key={label} style={{ textAlign: "center", fontSize: 9, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", fontWeight: 600, paddingBottom: 14, paddingLeft: 8, paddingRight: 8, minWidth: 90 }}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {managers.map((m, i) => {
          const rows = interactions.filter(
            (r) => String(r.manager_id) === String(m.manager_id)
          );
          return (
            <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ paddingTop: 10, paddingBottom: 10, paddingRight: 16, fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 400, whiteSpace: "nowrap" }}>
                {getManagerName(m.manager_id)}
              </td>
              {HEATMAP_COLUMNS.map(([key]) => {
                const { rate: r } = metricRate(rows, key);
                return (
                  <td key={key} style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 8, paddingBottom: 8, textAlign: "center" }}>
                    <span style={{
                      ...heatmapCellStyle(r),
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      padding: "4px 8px", borderRadius: 6,
                      fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.9)",
                      fontFamily: "'JetBrains Mono', monospace", minWidth: 44,
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {formatPercent(r)}
                    </span>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ManagerComparison({ managers }) {
  if (managers.length === 0) return null;
  const leader = managers[0];
  const avgTarget = average(managers.map((m) => m.target_rate));
  const avgActionable = average(managers.map((m) => m.actionable_rate));
  const avgQualified = average(managers.map((m) => m.qualified_rate));

  const compareRows = [
    {
      label: "Целевые обращения",
      leaderVal: Number(leader.target_rate || 0),
      avgVal: avgTarget,
    },
    {
      label: "Actionable rate",
      leaderVal: Number(leader.actionable_rate || 0),
      avgVal: avgActionable,
    },
    {
      label: "Квалификация",
      leaderVal: Number(leader.qualified_rate || 0),
      avgVal: avgQualified,
    },
  ];

  return (
    <div style={{
      background: "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
      border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "24px 28px",
    }}>
      <p className="kpi-section-label" style={{ marginBottom: 6 }}>Лидер vs среднее по команде</p>
      <p style={{ fontSize: 12, color: "rgba(0,210,255,0.8)", marginBottom: 20, fontFamily: "'JetBrains Mono', monospace" }}>{getManagerName(leader.manager_id)}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {compareRows.map((row, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
              <span>{row.label}</span>
              <span>
                <span style={{ color: "rgba(52,168,90,0.9)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatPercent(row.leaderVal)}</span>
                <span style={{ margin: "0 6px", color: "rgba(255,255,255,0.15)" }}>vs</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatPercent(row.avgVal)} ср.</span>
              </span>
            </div>
            <div style={{ position: "relative", height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", borderRadius: 2, background: "rgba(255,255,255,0.12)", width: `${clampRate(row.avgVal)}%` }} />
              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", borderRadius: 2, background: "linear-gradient(90deg, rgba(52,168,90,0.8), rgba(52,168,90,0.4))", width: `${clampRate(row.leaderVal)}%`, transition: `width 0.8s ${i * 0.1}s cubic-bezier(0.16,1,0.3,1)` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManagerSpotlight({ manager, interactions }) {
  if (!manager) return null;
  const rows = interactions.filter(
    (r) => String(r.manager_id) === String(manager.manager_id)
  );
  const weakZones = getWeakZonesForManager(manager.manager_id, interactions);
  const topics = ensureArray(manager.top_topics)
    .map((t) => t.name)
    .filter(Boolean)
    .slice(0, 3);

  return (
    <div style={{
      background: "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
      border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "24px 28px",
    }}>
      <p className="kpi-section-label" style={{ marginBottom: 4 }}>Лидер команды</p>
      <h3 style={{ fontSize: 18, fontWeight: 300, color: "#fff", marginBottom: 16, letterSpacing: "-0.01em" }}>
        {getManagerName(manager.manager_id)}
      </h3>
      <div className="flex flex-wrap gap-1 mb-4">
        {topics.map((t, i) => (
          <Badge key={i} text={t} tone="neutral" />
        ))}
        {weakZones.map((z, i) => (
          <Badge key={`w${i}`} text={`слабо: ${z}`} tone="warning" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {HEATMAP_COLUMNS.map(([key, label]) => {
          const { rate: r } = metricRate(rows, key);
          return (
            <MetricBarCard
              key={key}
              title={label}
              rate={r}
              note={`${formatNumber(rows.length)} обращений`}
              tone={r >= 50 ? "success" : "danger"}
            />
          );
        })}
      </div>
    </div>
  );
}

const PLACEHOLDER_FUTURE = [
  ["Команды и роли", "Понадобится реальный user directory и оргструктура из CRM."],
  ["Связь качества общения с итогом сделки", "Нужно надежно связать обращения со статусом и итогом сделки."],
  ["Coaching cards per manager", "Нужен больший массив звонков и чатов на каждого менеджера."],
];

export default function ManagersScreen() {
  const navigate = useNavigate();
  const { summary, interactions, setFilters } = useStore();
  const s = summary || {};

  const managers = getSortedManagers(s);
  const avgTarget = average(managers.map((m) => m.target_rate));
  const avgActionable = average(managers.map((m) => m.actionable_rate));
  const totalQualified = sum(managers.map((m) => m.qualified_count));
  const leader = managers[0] || null;

  function focusManager(managerId) {
    setFilters({ manager: String(managerId) });
    navigate("/explorer");
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="kpi-section-label">
          Команда
        </h2>
        <div className="grid grid-cols-12 gap-4">
          <MetricCard
            label="Менеджеров"
            value={formatNumber(managers.length)}
            note="активных в периоде"
            tone="cyan"
          />
          <MetricCard
            label="Ср. целевые"
            value={formatPercent(avgTarget)}
            note="target rate по команде"
            tone="green"
          />
          <MetricCard
            label="Ср. actionable"
            value={formatPercent(avgActionable)}
            note="actionable rate по команде"
            tone="violet"
          />
          <MetricCard
            label="Квал. лидов"
            value={formatNumber(totalQualified)}
            note="квалифицированных всего"
            tone="yellow"
          />
        </div>
      </section>

      <section>
        <h2 className="kpi-section-label">
          Таблица менеджеров
        </h2>
        <div className="data-table-wrapper" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Менеджер</th>
                <th style={{ textAlign: "right" }}>Обращений</th>
                <th style={{ textAlign: "right" }}>Целевые</th>
                <th style={{ textAlign: "right" }}>Actionable</th>
                <th style={{ textAlign: "right" }}>Квал.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {managers.map((m, i) => {
                const isLeader = i === 0;
                return (
                  <tr key={i}>
                    <td>
                      <button
                        style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)", fontWeight: 500, fontSize: 12, display: "flex", alignItems: "center", gap: 6, transition: "color 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.color = "rgba(0,210,255,0.9)"}
                        onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.8)"}
                        onClick={() => focusManager(m.manager_id)}
                      >
                        {getManagerName(m.manager_id)}
                        {isLeader && <Badge text="лидер" tone="ok" />}
                      </button>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                        {ensureArray(m.top_topics)
                          .slice(0, 2)
                          .map((t, ti) => (
                            <Badge key={ti} text={t.name} tone="neutral" />
                          ))}
                      </div>
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>
                      {formatNumber(m.interactions)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ fontWeight: 600, color: Number(m.target_rate || 0) >= 50 ? "rgba(52,168,90,0.9)" : "rgba(246,192,60,0.9)", fontVariantNumeric: "tabular-nums" }}>
                        {formatPercent(m.target_rate)}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ fontWeight: 600, color: Number(m.actionable_rate || 0) >= 50 ? "rgba(52,168,90,0.9)" : "rgba(246,192,60,0.9)", fontVariantNumeric: "tabular-nums" }}>
                        {formatPercent(m.actionable_rate)}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", color: "rgba(255,255,255,0.35)", fontVariantNumeric: "tabular-nums" }}>
                      {formatNumber(m.qualified_count)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(0,210,255,0.7)", background: "none", border: "none", cursor: "pointer", transition: "color 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.color = "#fff"}
                        onMouseLeave={e => e.currentTarget.style.color = "rgba(0,210,255,0.7)"}
                        onClick={() => focusManager(m.manager_id)}
                      >
                        Explorer →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ManagerComparison managers={managers} />
        <ManagerSpotlight manager={leader} interactions={interactions} />
      </section>

      <section>
        <h2 className="kpi-section-label">
          Тепловая карта навыков
        </h2>
        <div style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
          border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "24px 28px", overflowX: "auto",
        }}>
          <ManagerHeatmap managers={managers} interactions={interactions} />
        </div>
      </section>

      <section>
        <h2 className="kpi-section-label">
          В разработке
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PlaceholderCards items={PLACEHOLDER_FUTURE} />
        </div>
      </section>
    </div>
  );
}
