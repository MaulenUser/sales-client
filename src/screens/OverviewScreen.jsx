import React from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import { formatNumber, formatPercent, humanizeToken } from "../utils/format.js";
import { ensureArray, clampRate, rate, mapDistribution, isTrueLike } from "../utils/index.js";
import MetricCard from "../components/shared/MetricCard.jsx";
import MiniCard from "../components/shared/MiniCard.jsx";
import MetricBarCard from "../components/shared/MetricBarCard.jsx";
import Badge from "../components/shared/Badge.jsx";
import DistributionPanel from "../components/shared/DistributionPanel.jsx";
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

function buildOverviewInsight(summary) {
  const overall = summary?.overall || {};
  const channelRows = ensureArray(overall.channel_distribution);
  const mainChannel = channelRows
    .slice()
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))[0];
  const topTopic = ensureArray(summary?.distributions?.primary_topics_top)[0];
  const weakNextStep = summary?.sales_process?.manager_agreed_next_step?.yes_rate ?? 0;
  const nonSales = summary?.quality_flags?.non_sales_interaction?.true_rate ?? 0;
  return [
    `В текущем срезе ${formatNumber(overall.total_interactions)} обращений, и основная нагрузка идет через ${mainChannel ? `${humanizeToken(mainChannel.name)} (${formatPercent(mainChannel.rate)})` : "канал пока не определен"}.`,
    topTopic ? `Самая частая тема спроса: ${topTopic.name}.` : "Топ-тема спроса пока не определена.",
    `Самый слабый управленческий сигнал сейчас — фиксация следующего шага: ${formatPercent(weakNextStep)}.`,
    `Непродажный шум держится на уровне ${formatPercent(nonSales)}, поэтому руководителю важно разделять качество лида и качество работы менеджера.`,
  ].join(" ");
}

function buildRiskCards(summary) {
  const salesProcess = summary?.sales_process || {};
  const quality = summary?.quality_flags || {};
  return [
    {
      title: "Проседает следующий шаг",
      body: `Следующий шаг зафиксирован только в ${formatPercent(salesProcess.manager_agreed_next_step?.yes_rate)} случаев.`,
      severity: "danger",
    },
    {
      title: "Менеджеры редко представляются",
      body: `Самопрезентация есть только в ${formatPercent(salesProcess.manager_introduced_self?.yes_rate)} взаимодействий.`,
      severity: "warning",
    },
    {
      title: "Шум в каналах",
      body: `Непродажных взаимодействий ${formatPercent(quality.non_sales_interaction?.true_rate)}. Этот слой нужно отсекать от coaching-аналитики.`,
      severity: "danger",
    },
    {
      title: "Фрагментированные кейсы",
      body: `Разговоры и чаты с низкой аналитической ценностью составляют ${formatPercent(quality.fragmented_or_unclear?.true_rate)}.`,
      severity: "warning",
    },
  ];
}

function Donut({ channels, total }) {
  const callRate = clampRate(channels.call?.rate ?? 0);
  const waRate = clampRate(channels.whatsapp?.rate ?? Math.max(0, 100 - callRate));
  const fill = Math.min(callRate + waRate, 100);
  const restRate = Math.max(0, 100 - fill);
  const chart = `conic-gradient(rgba(0,210,255,0.85) 0 ${callRate}%, rgba(52,168,90,0.85) ${callRate}% ${fill}%, rgba(255,255,255,0.08) ${fill}% 100%)`;
  const segments = [
    { label: "Звонки", pct: callRate, color: "rgba(0,210,255,0.85)" },
    { label: "WhatsApp", pct: waRate, color: "rgba(52,168,90,0.85)" },
    { label: "Прочее", pct: restRate, color: "rgba(255,255,255,0.15)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      <div style={{ position: "relative", width: 128, height: 128, flexShrink: 0 }}>
        <div style={{
          width: "100%", height: "100%", borderRadius: "50%",
          background: chart,
          filter: "drop-shadow(0 0 12px rgba(52,168,90,0.2))",
        }} />
        <div style={{
          position: "absolute", inset: "24px",
          borderRadius: "50%",
          background: "rgba(8,11,18,0.95)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)",
        }}>
          <span style={{ fontSize: 16, fontWeight: 300, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {formatNumber(total)}
          </span>
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>
            всего
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontFamily: "'JetBrains Mono', monospace" }}>
              {seg.label}
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, marginLeft: "auto", paddingLeft: 16, fontVariantNumeric: "tabular-nums" }}>
              {formatPercent(seg.pct)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeaderCard({ manager, summary }) {
  const navigate = useNavigate();
  const sorted = getSortedManagers(summary);
  const maxInteractions = Math.max(...sorted.map((m) => Number(m.interactions || 0)), 1);
  const width = (Number(manager.interactions || 0) / maxInteractions) * 100;
  const topics = ensureArray(manager.top_topics)
    .map((t) => t.name)
    .filter(Boolean)
    .slice(0, 2)
    .join(", ") || "Темы не собраны";

  return (
    <div
      onClick={() => navigate("/managers")}
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
        border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 20px",
        cursor: "pointer", transition: "border-color 0.2s ease",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(52,168,90,0.25)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>
          {getManagerName(manager.manager_id)}
        </span>
        <Badge
          text={`${formatPercent(manager.actionable_rate)} целевых`}
          tone={Number(manager.actionable_rate || 0) >= 50 ? "ok" : "warning"}
        />
      </div>
      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 12, lineHeight: 1.5 }}>{topics}</p>
      <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, background: "linear-gradient(90deg, rgba(0,210,255,0.7), rgba(0,210,255,0.3))", width: `${clampRate(width)}%`, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", marginTop: 6 }}>
        <span>{formatNumber(manager.interactions)} обращений</span>
        <span>{formatPercent(manager.qualified_rate || 0)} квал.</span>
      </div>
    </div>
  );
}

function EvidenceCard({ title, rows, tone }) {
  const navigate = useNavigate();
  const { setSelectedId } = useStore();

  const borderColor = tone === "danger" ? "rgba(240,86,86,0.2)" : "rgba(52,168,90,0.2)";
  const labelColor = tone === "danger" ? "rgba(240,86,86,0.9)" : "rgba(52,168,90,0.9)";

  return (
    <article style={{
      background: "linear-gradient(145deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)",
      border: `1px solid ${borderColor}`, borderRadius: 12, padding: "16px 20px",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", fontFamily: "'JetBrains Mono', monospace", color: labelColor, margin: 0 }}>{title}</p>
      {ensureArray(rows).slice(0, 2).map((item, i) => (
        <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {item.channel && <Badge text={item.channel} tone="neutral" />}
            {item.outcome_status && <Badge text={item.outcome_status} tone="neutral" />}
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, marginBottom: 8 }}>{item.summary}</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace" }}>{getManagerName(item.manager_id)}</span>
            {item.interaction_id && (
              <button
                style={{ fontSize: 9, color: "rgba(0,210,255,0.7)", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.1em", background: "none", border: "none", cursor: "pointer" }}
                onClick={() => {
                  setSelectedId(item.interaction_id);
                  navigate("/explorer");
                }}
              >
                {item.primary_topic || "подробнее"} →
              </button>
            )}
          </div>
        </div>
      ))}
    </article>
  );
}

const PIPELINE_STEPS = [
  { label: "Обращения", key: "total_interactions", note: "всего" },
  { label: "Целевые", key: "actionable_count", note: "целевые" },
  { label: "Есть движение", key: "qualified_count", note: "квалифицированные" },
  { label: "Выигранные сделки", key: "won_deals", crm: true, note: "сделки" },
];

export default function OverviewScreen() {
  const { summary } = useStore();
  const s = summary || {};
  const overall = s.overall || {};
  const crm = s.crm_context || {};
  const salesProcess = s.sales_process || {};
  const quality = s.quality_flags || {};
  const channels = mapDistribution(overall.channel_distribution);

  const wonRate = rate(crm.won_deals, crm.total_deals);
  const whatsappShare = rate(crm.whatsapp_deals, crm.total_deals);
  const sortedManagers = getSortedManagers(s);
  const insight = buildOverviewInsight(s);
  const risks = buildRiskCards(s);

  const channelRows = ensureArray(overall.channel_distribution);
  const activeChannels = channelRows.filter((c) => Number(c.count || 0) > 0).length;

  const topicsDistribution = ensureArray(s.distributions?.primary_topics_top);
  const outcomesDistribution = ensureArray(s.distributions?.outcome_distribution);

  const examples = ensureArray(s.examples);
  const positiveExamples = examples.filter((e) => isTrueLike(e.positive));
  const negativeExamples = examples.filter((e) => !isTrueLike(e.positive));

  const placeholderFuture = [
    ["Прогноз по периодам", "Нужна накопленная динамика по этапам CRM и регулярное обновление данных."],
    ["Имена менеджеров вместо ID", "Нужно расширить user sync или права webhook."],
    ["Фильтры по воронкам и сегментам", "Требуются pipeline ids, справочники и нормализация CRM-источников."],
  ];

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="kpi-section-label">
          Ключевые показатели
        </h2>
        <div className="grid grid-cols-12 gap-4">
          <MetricCard
            label="Всего обращений"
            value={formatNumber(overall.total_interactions)}
            note={`${formatPercent(overall.actionable_rate)} целевых`}
            tone="cyan"
          />
          <MetricCard
            label="Целевые"
            value={formatNumber(overall.actionable_count)}
            note={`из ${formatNumber(overall.total_interactions)} обращений`}
            tone="green"
          />
          <MetricCard
            label="Квалифицированные"
            value={formatNumber(overall.qualified_count)}
            note={`${formatPercent(overall.qualified_rate)} от целевых`}
            tone="violet"
          />
          <MetricCard
            label="Менеджеров"
            value={formatNumber(sortedManagers.length)}
            note="активных в периоде"
            tone="yellow"
          />
        </div>
      </section>

      <section>
        <h2 className="kpi-section-label">
          KPI среза
        </h2>
        <div className="grid grid-cols-12 gap-4">
          <MetricCard
            label="Доля WhatsApp"
            value={formatPercent(whatsappShare)}
            note={`${formatNumber(crm.whatsapp_deals)} из ${formatNumber(crm.total_deals)} сделок`}
            tone="cyan"
          />
          <MetricCard
            label="Потерянные сделки"
            value={formatNumber(crm.lost_deals)}
            note={`${formatPercent(rate(crm.lost_deals, crm.total_deals))} от всех сделок`}
            tone="red"
          />
          <MetricCard
            label="Высокий сигнал"
            value={formatPercent(overall.actionable_rate)}
            note="целевые обращения"
            tone="green"
          />
          <MetricCard
            label="Активные каналы"
            value={formatNumber(activeChannels)}
            note="каналов с трафиком"
            tone="violet"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div style={{
          gridColumn: "span 2",
          background: "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
          border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "24px 28px",
        }}>
          <p className="kpi-section-label">Общий срез</p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>{insight}</p>
        </div>
        <div style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
          border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "24px 28px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Donut channels={channels} total={Number(overall.total_interactions || 0)} />
        </div>
      </section>

      <section>
        <h2 className="kpi-section-label">
          Каналы
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {channelRows.slice(0, 4).map((ch, i) => (
            <MiniCard
              key={i}
              label={humanizeToken(ch.name)}
              value={formatNumber(ch.count)}
              note={formatPercent(ch.rate)}
              tone="cyan"
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="kpi-section-label">
          Топ менеджеры
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {sortedManagers.slice(0, 4).map((m, i) => (
            <LeaderCard key={i} manager={m} summary={s} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="kpi-section-label">
          Воронка
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
          {PIPELINE_STEPS.map((step, i) => {
            const val = step.crm
              ? Number(crm[step.key] || 0)
              : Number(overall[step.key] || 0);
            const totalVal = Number(overall.total_interactions || 1);
            const pct = Math.min(100, (val / totalVal) * 100);
            return (
              <div key={i} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "20px 16px", background: "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, margin: "0 4px" }}>
                <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.14em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 10 }}>
                  {step.label}
                </span>
                <span style={{ fontSize: 26, fontWeight: 300, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{formatNumber(val)}</span>
                <span style={{ fontSize: 9, color: "rgba(0,210,255,0.7)", fontFamily: "'JetBrains Mono', monospace", marginTop: 6 }}>{step.note}</span>
                <div style={{ height: 2, borderRadius: 1, background: "rgba(255,255,255,0.04)", width: "100%", marginTop: 12, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "linear-gradient(90deg, rgba(52,168,90,0.6), rgba(52,168,90,0.2))", width: `${pct}%`, transition: "width 1s cubic-bezier(0.16,1,0.3,1)" }} />
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <span style={{ position: "absolute", right: -8, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "rgba(255,255,255,0.1)", zIndex: 10 }}>
                    ›
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="kpi-section-label">
          Качество процесса продаж
        </h2>
        <div className="flex flex-col gap-4">
          <MetricBarCard
            title="Представился"
            rate={salesProcess.manager_introduced_self?.yes_rate ?? 0}
            note="менеджер"
            tone={Number(salesProcess.manager_introduced_self?.yes_rate ?? 0) >= 50 ? "success" : "danger"}
          />
          <MetricBarCard
            title="Задавал вопросы"
            rate={salesProcess.manager_asked_questions?.yes_rate ?? 0}
            note="квалификация"
            tone={Number(salesProcess.manager_asked_questions?.yes_rate ?? 0) >= 50 ? "success" : "danger"}
          />
          <MetricBarCard
            title="Выявил потребность"
            rate={salesProcess.need_identified?.yes_rate ?? 0}
            note="выявление"
            tone={Number(salesProcess.need_identified?.yes_rate ?? 0) >= 50 ? "success" : "danger"}
          />
          <MetricBarCard
            title="Презентовал услугу"
            rate={salesProcess.manager_presented_service?.yes_rate ?? 0}
            note="презентация"
            tone={Number(salesProcess.manager_presented_service?.yes_rate ?? 0) >= 50 ? "success" : "danger"}
          />
          <MetricBarCard
            title="Согласовал следующий шаг"
            rate={salesProcess.manager_agreed_next_step?.yes_rate ?? 0}
            note="закрытие"
            tone={Number(salesProcess.manager_agreed_next_step?.yes_rate ?? 0) >= 35 ? "success" : "danger"}
          />
          <MetricBarCard
            title="Непродажные взаимодействия"
            rate={quality.non_sales_interaction?.true_rate ?? 0}
            note="шум"
            tone="danger"
          />
        </div>
      </section>

      <section>
        <h2 className="kpi-section-label">
          Риски
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {risks.map((r, i) => (
            <article
              key={i}
              style={{
                padding: "16px 20px", borderRadius: 12,
                background: r.severity === "danger"
                  ? "linear-gradient(145deg, rgba(240,86,86,0.06) 0%, rgba(240,86,86,0.02) 100%)"
                  : "linear-gradient(145deg, rgba(246,192,60,0.06) 0%, rgba(246,192,60,0.02) 100%)",
                border: r.severity === "danger"
                  ? "1px solid rgba(240,86,86,0.2)"
                  : "1px solid rgba(246,192,60,0.18)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Badge text={r.severity === "danger" ? "критично" : "внимание"} tone={r.severity === "danger" ? "danger" : "warning"} />
                <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{r.title}</span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.7, margin: 0 }}>{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="kpi-section-label">
          CRM-контекст
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniCard
            label="Всего сделок"
            value={formatNumber(crm.total_deals)}
            note="в периоде"
            tone="cyan"
          />
          <MiniCard
            label="Выигранные"
            value={formatNumber(crm.won_deals)}
            note={formatPercent(wonRate)}
            tone="green"
          />
          <MiniCard
            label="Потерянные"
            value={formatNumber(crm.lost_deals)}
            note={formatPercent(rate(crm.lost_deals, crm.total_deals))}
            tone="red"
          />
          <MiniCard
            label="WhatsApp-сделки"
            value={formatNumber(crm.whatsapp_deals)}
            note={formatPercent(whatsappShare)}
            tone="violet"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DistributionPanel
          title="Темы спроса"
          rows={topicsDistribution}
        />
        <DistributionPanel
          title="Распределение исходов"
          rows={outcomesDistribution}
        />
      </section>

      {examples.length > 0 && (
        <section>
          <h2 className="kpi-section-label">
            Примеры взаимодействий
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {positiveExamples.length > 0 && (
              <EvidenceCard
                title="Сильные примеры"
                rows={positiveExamples.slice(0, 2)}
                tone="success"
              />
            )}
            {negativeExamples.length > 0 && (
              <EvidenceCard
                title="Зоны роста"
                rows={negativeExamples.slice(0, 2)}
                tone="danger"
              />
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="kpi-section-label">
          В разработке
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PlaceholderCards items={placeholderFuture} />
        </div>
      </section>
    </div>
  );
}
