import React from "react";
import useStore from "../store/index.js";
import MetricCard from "../components/shared/MetricCard.jsx";
import PlaceholderCards from "../components/shared/PlaceholderCards.jsx";
import { formatNumber, formatPercent, formatDate, formatTime, humanizeToken } from "../utils/format.js";
import { ensureArray, rate, clampRate, toTimestamp } from "../utils/index.js";

const PLACEHOLDER_ITEMS = [
  ["Оценка и факт", "Теперь можно хранить оценку запуска отдельно от фактического OpenAI billing по Costs API."],
  ["Бюджеты по клиентам", "Понадобятся после перехода к многоклиентской SaaS-архитектуре."],
  ["Онлайн-контроль расхода", "Появится после перехода от пакетных скриптов к фоновым задачам."],
];

function UsageDistributionCard({ row, totalTokens }) {
  const share = rate(row.total_tokens, totalTokens || 1);
  const pct = clampRate(share);
  return (
    <article style={{
      background: "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
      border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "18px 20px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
        <div>
          <strong style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", display: "block", marginBottom: 3, fontWeight: 500 }}>
            {humanizeToken(row.name || "не указано")}
          </strong>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {formatNumber(row.requests)} запросов
          </span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 300, color: "rgba(52,168,90,0.9)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {formatPercent(share)}
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", borderRadius: 2, background: "linear-gradient(90deg, rgba(52,168,90,0.7), rgba(52,168,90,0.3))", width: `${pct}%`, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>Total</div>
          <div style={{ fontSize: 13, fontWeight: 300, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{formatNumber(row.total_tokens)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>In / Out</div>
          <div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.65)", fontVariantNumeric: "tabular-nums" }}>
            {formatNumber(row.input_tokens)} / {formatNumber(row.output_tokens)}
          </div>
        </div>
      </div>
    </article>
  );
}

function UsageTimeline({ events }) {
  const rows = [...ensureArray(events)]
    .sort(
      (a, b) =>
        toTimestamp(a.event_at || a.generated_at) -
        toTimestamp(b.event_at || b.generated_at)
    )
    .slice(-12);

  if (!rows.length) {
    return (
      <div className="empty-state">
        <p>Пока нет событий по расходам ИИ.</p>
      </div>
    );
  }

  const maxTokens = Math.max(...rows.map((r) => Number(r.total_tokens || 0)), 1);

  return (
    <div style={{
      background: "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
      border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "24px 28px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 180 }}>
        {rows.map((row, i) => {
          const height = Math.max(6, (Number(row.total_tokens || 0) / maxTokens) * 100);
          const isMax = Number(row.total_tokens || 0) === maxTokens;
          return (
            <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", height: 130 }}>
                <div
                  style={{
                    width: "100%", maxWidth: 40, borderRadius: "4px 4px 0 0",
                    background: isMax
                      ? "linear-gradient(180deg, rgba(52,168,90,0.9) 0%, rgba(52,168,90,0.4) 100%)"
                      : "linear-gradient(180deg, rgba(52,168,90,0.55) 0%, rgba(52,168,90,0.2) 100%)",
                    height: `${height}%`,
                    transition: `height 0.8s ${i * 0.04}s cubic-bezier(0.16,1,0.3,1)`,
                    boxShadow: isMax ? "0 0 12px rgba(52,168,90,0.3)" : "none",
                  }}
                />
              </div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                {formatTime(row.event_at || row.generated_at)}
              </div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", fontFamily: "'JetBrains Mono', monospace", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                {formatNumber(row.total_tokens)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function UsageScreen() {
  const usageSummary = useStore((s) => s.usageSummary) || {};
  const usageEvents = useStore((s) => s.usageEvents);
  const appState = useStore((s) => s.appState);

  const latestProjectCost = appState?.openai_billing?.latest_project_cost || {};
  const totals = usageSummary.totals || {};
  const requests = Number(totals.requests || 0);
  const avgTokens = requests ? Number(totals.total_tokens || 0) / requests : 0;
  const totalTokens = Number(totals.total_tokens || 0);

  const sortedEvents = [...ensureArray(usageEvents)]
    .sort(
      (a, b) =>
        toTimestamp(b.event_at || b.generated_at) -
        toTimestamp(a.event_at || a.generated_at)
    )
    .slice(0, 12);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-12 gap-4">
        <MetricCard
          label="Запросы к ИИ"
          value={formatNumber(totals.requests)}
          note="Все обращения к OpenAI"
          tone="cyan"
        />
        <MetricCard
          label="Все токены"
          value={formatNumber(totals.total_tokens)}
          note={`${formatNumber(totals.input_tokens)} вход | ${formatNumber(totals.output_tokens)} выход`}
          tone="green"
        />
        <MetricCard
          label="Токены аудио"
          value={formatNumber(totals.audio_input_tokens)}
          note="Слой расшифровки звонков"
          tone="yellow"
        />
        <MetricCard
          label="Среднее на запрос"
          value={formatNumber(Math.round(avgTokens))}
          note="Средний расход токенов на один вызов"
          tone="violet"
        />
        <MetricCard
          label="Факт OpenAI"
          value={
            latestProjectCost?.status === "synced"
              ? `${formatNumber(latestProjectCost.amount_kzt || 0)} ₸`
              : "не синхронизирован"
          }
          note={
            latestProjectCost?.status === "synced"
              ? `Проект ${latestProjectCost.project_id || "не указан"}`
              : "Нужен OPENAI_ADMIN_KEY и project_id"
          }
          tone="cyan"
        />
      </div>

      {ensureArray(usageSummary.by_stage).length > 0 && (
        <div>
          <h2 className="kpi-section-label">
            По этапам
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ensureArray(usageSummary.by_stage).map((row, i) => (
              <UsageDistributionCard key={i} row={row} totalTokens={totalTokens} />
            ))}
          </div>
        </div>
      )}

      {ensureArray(usageSummary.by_model).length > 0 && (
        <div>
          <h2 className="kpi-section-label">
            По моделям
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ensureArray(usageSummary.by_model).map((row, i) => (
              <UsageDistributionCard key={i} row={row} totalTokens={totalTokens} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-4">
          Timeline
        </h2>
        <UsageTimeline events={usageEvents} />
      </div>

      {sortedEvents.length > 0 && (
        <div>
          <h2 className="kpi-section-label">
            Последние события
          </h2>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Этап</th>
                  <th>Модель</th>
                  <th style={{ textAlign: "right" }}>Input</th>
                  <th style={{ textAlign: "right" }}>Output</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map((row, i) => (
                  <tr key={i}>
                    <td style={{ color: "rgba(255,255,255,0.35)" }}>
                      {formatDate(row.event_at || row.generated_at)}
                    </td>
                    <td>{row.stage || "не указано"}</td>
                    <td style={{ color: "rgba(255,255,255,0.45)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{row.model || "не указано"}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {formatNumber(row.input_tokens)}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {formatNumber(row.output_tokens)}
                    </td>
                    <td style={{ textAlign: "right", color: "rgba(255,255,255,0.9)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                      {formatNumber(row.total_tokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-4">
          В разработке
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PlaceholderCards items={PLACEHOLDER_ITEMS} />
        </div>
      </div>
    </div>
  );
}
