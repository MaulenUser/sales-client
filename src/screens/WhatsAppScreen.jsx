import React from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import { formatNumber, formatPercent } from "../utils/format.js";
import {
  ensureArray,
  rate,
  average,
  isTrueLike,
  isActionableOutcome,
  topCounts,
} from "../utils/index.js";
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

function buildWhatsAppInsight(rows, targetRows, awaitingRows) {
  if (!rows.length) return "WhatsApp-слой пока пустой.";
  const withFiles = rows.filter(
    (r) => Number(r.messages_with_files || 0) > 0
  ).length;
  return `WhatsApp уже является главным рабочим каналом: ${formatNumber(rows.length)} чатов, из них ${formatNumber(targetRows.length)} целевые, ${formatNumber(awaitingRows.length)} зависли в ожидании ответа, а ${formatNumber(withFiles)} содержат вложения и потребуют отдельного разбора файлов в следующих релизах.`;
}

function FlowStage({ label, count, note }) {
  return (
    <article className="flex flex-col items-center text-center p-4 bg-card border border-border rounded">
      <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-2">
        {label}
      </div>
      <strong className="text-2xl font-headline font-bold text-foreground mb-1">
        {formatNumber(count)}
      </strong>
      <div className="text-[9px] text-muted-foreground leading-tight flex-1">{note}</div>
    </article>
  );
}

const WA_FUTURE = [
  [
    "First response / median response",
    "Нужен message-level SLA parser по timestamps.",
  ],
  [
    "Real-time stalled chat alerts",
    "Появится после event-driven sync и background jobs.",
  ],
  [
    "Разбор вложений",
    "Нужна обработка файлов и мультимодальный разбор вложений.",
  ],
];

export default function WhatsAppScreen() {
  const navigate = useNavigate();
  const { summary, interactions, setSelectedId } = useStore();

  const rows = ensureArray(interactions).filter(
    (r) => r.channel === "whatsapp"
  );
  const targetRows = rows.filter((r) => r.relevance === "target_client");
  const awaitingRows = rows.filter((r) => r.outcome_status === "awaiting_response");
  const followRows = rows.filter((r) =>
    ["follow_up", "qualified_interest", "callback_requested"].includes(
      r.outcome_status
    )
  );
  const actionableRows = rows.filter((r) => isActionableOutcome(r.outcome_status));
  const withFiles = rows.filter((r) => Number(r.messages_with_files || 0) > 0);

  const allManagers = getSortedManagers(summary);
  const managers = allManagers.filter(
    (m) => Number(m.whatsapp_count || 0) > 0
  );

  const insight = buildWhatsAppInsight(rows, targetRows, awaitingRows);

  const topicsRows = topCounts(rows.map((r) => r.primary_topic), 6);
  const clientRequestRows = topCounts(rows.map((r) => r.client_request), 6);
  const filesDistribution = [
    {
      name: "С файлами",
      count: withFiles.length,
      rate: rate(withFiles.length, rows.length),
    },
    {
      name: "Без файлов",
      count: rows.length - withFiles.length,
      rate: rate(rows.length - withFiles.length, rows.length),
    },
  ];

  function openInteraction(id) {
    setSelectedId(id);
    navigate("/explorer");
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
          Воронка WhatsApp
        </h2>
        <div className="flow-grid grid grid-cols-2 md:grid-cols-4 gap-3">
          <FlowStage
            label="Все чаты"
            count={rows.length}
            note="Общий объем переписки"
          />
          <FlowStage
            label="Целевые"
            count={targetRows.length}
            note={`${formatPercent(rate(targetRows.length, rows.length))} от всех`}
          />
          <FlowStage
            label="Есть движение"
            count={actionableRows.length}
            note="Есть следующее действие"
          />
          <FlowStage
            label="Нужно дожать"
            count={followRows.length}
            note="Продвижение к следующему шагу"
          />
        </div>
      </section>

      {managers.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
            Менеджеры
          </h2>
          <div className="flex flex-col gap-4">
            {managers.map((manager, i) => {
              const managerRows = rows.filter(
                (r) => String(r.manager_id) === String(manager.manager_id)
              );
              const avgMsgs = average(managerRows.map((r) => r.message_count));
              return (
                <article
                  key={manager.manager_id || i}
                  className="leader-card bg-card border border-border rounded p-4"
                >
                  <div className="leader-card__head flex justify-between items-start mb-3">
                    <div className="flex flex-col gap-1">
                      <strong className="text-foreground text-[12px] font-bold">
                        {getManagerName(manager.manager_id)}
                      </strong>
                      <span className="leader-card__hint text-[9px] text-muted-foreground">
                        Позже добавим скорость ответа; пока показываем нагрузку
                        и качество результата.
                      </span>
                    </div>
                    <div className="text-right ml-4 shrink-0">
                      <div className="leader-card__value text-2xl font-bold text-foreground">
                        {formatNumber(manager.whatsapp_count)}
                      </div>
                      <span className="leader-card__rate text-[9px] text-muted-foreground">
                        {formatPercent(manager.actionable_rate)} есть движение
                      </span>
                    </div>
                  </div>
                  <div className="leader-card__stats flex gap-4 text-[10px] text-muted-foreground">
                    <span>
                      Целевые{" "}
                      <strong className="text-foreground">
                        {formatPercent(manager.target_rate)}
                      </strong>
                    </span>
                    <span>
                      Avg msgs{" "}
                      <strong className="text-foreground">
                        {formatNumber(avgMsgs.toFixed(1))}
                      </strong>
                    </span>
                    <span>
                      Short{" "}
                      <strong className="text-foreground">
                        {formatNumber(manager.short_count)}
                      </strong>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {awaitingRows.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
            Зависшие чаты
          </h2>
          <div className="flex flex-col gap-4">
            {awaitingRows.slice(0, 5).map((row, i) => (
              <article
                key={row.interaction_id || i}
                className="risk-card risk-card--danger bg-destructive/5 border border-destructive/30 rounded p-4 flex flex-col gap-2"
              >
                <div className="risk-card__head flex justify-between items-center">
                  <strong className="text-foreground text-[12px]">
                    {row.primary_topic || "Без темы"}
                  </strong>
                  <span className="severity severity--danger text-[9px] font-bold uppercase tracking-widest text-destructive bg-destructive/10 border border-destructive/25 px-2 py-0.5 rounded">
                    awaiting
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {row.summary || "Нет summary"}
                </p>
                <div className="detail-meta text-[9px] text-muted-foreground">
                  {getManagerName(row.manager_id)} |{" "}
                  {formatNumber(row.message_count)} messages
                </div>
                <button
                  className="cta-button self-start mt-1 px-3 py-1.5 bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-widest rounded hover:bg-primary/80 transition-colors"
                  onClick={() => openInteraction(row.interaction_id)}
                >
                  Открыть чат
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="insight-banner bg-card border border-border rounded p-6">
          <div className="insight-banner__copy flex flex-col gap-2">
            <div className="text-[9px] uppercase tracking-widest font-bold text-primary mb-1">
              Подсказка
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{insight}</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DistributionPanel title="Частые темы" rows={topicsRows} />
        <DistributionPanel title="Запросы клиентов" rows={clientRequestRows} />
        <DistributionPanel title="Файлы в чатах" rows={filesDistribution} />
      </section>

      <section>
        <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
          В разработке
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PlaceholderCards items={WA_FUTURE} />
        </div>
      </section>
    </div>
  );
}
