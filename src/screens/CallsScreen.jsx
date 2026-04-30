import React from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import { formatNumber, formatPercent, formatDate } from "../utils/format.js";
import {
  ensureArray,
  rate,
  isTrueLike,
  sortRowsByDateDesc,
  topCounts,
} from "../utils/index.js";
import MetricCard from "../components/shared/MetricCard.jsx";
import MetricBarCard from "../components/shared/MetricBarCard.jsx";
import Badge from "../components/shared/Badge.jsx";
import DistributionPanel from "../components/shared/DistributionPanel.jsx";
import PlaceholderCards from "../components/shared/PlaceholderCards.jsx";

function getManagerName(id) {
  if (id === undefined || id === null || id === "") return "Менеджер не указан";
  return `Менеджер #${id}`;
}

function buildCallTip(rows, noNextStepRows) {
  if (!rows.length) return "В звонках пока недостаточно данных для вывода.";
  const introRate = rate(
    rows.filter((r) => r.manager_introduced_self === "yes").length,
    rows.length
  );
  const questionRate = rate(
    rows.filter((r) => r.manager_asked_questions === "yes").length,
    rows.length
  );
  return `В звонках критичнее всего разобрать ${formatNumber(noNextStepRows.length)} целевых разговоров без следующего шага. Параллельно проседают базовые дисциплины продаж: представление менеджера ${formatPercent(introRate)}, задавание вопросов ${formatPercent(questionRate)}.`;
}

function renderIssueTags(row) {
  const tags = [];
  if (row.relevance === "target_client") {
    tags.push(<Badge key="target" text="целевое" tone="ok" />);
  }
  if (isTrueLike(row.short_or_low_content)) {
    tags.push(<Badge key="short" text="short" tone="warning" />);
  }
  if (isTrueLike(row.non_sales_interaction)) {
    tags.push(<Badge key="nonsales" text="non-sales" tone="danger" />);
  }
  if (row.manager_agreed_next_step === "yes") {
    tags.push(<Badge key="nextstep" text="следующий шаг" tone="ok" />);
  }
  if (isTrueLike(row.fragmented_or_unclear)) {
    tags.push(<Badge key="unclear" text="unclear" tone="warning" />);
  }
  if (tags.length === 0) {
    tags.push(<Badge key="clean" text="clean" tone="neutral" />);
  }
  return tags;
}

const CALL_FUTURE = [
  [
    "Speaker-level voice analytics",
    "Понадобится отдельный voice-signal pipeline поверх аудио.",
  ],
  [
    "Call direction и silence ratio",
    "Нужно дообогащение телефонией и raw voice telemetry.",
  ],
  [
    "Interruption analytics",
    "Появится после диаризации и аудиометрик поверх mp3.",
  ],
];

export default function CallsScreen() {
  const navigate = useNavigate();
  const { interactions, setSelectedId, setFilters } = useStore();

  const rows = ensureArray(interactions).filter((r) => r.channel === "call");
  const sortedRows = sortRowsByDateDesc(rows);
  const tableRows = sortedRows.slice(0, 50);

  const targetRows = rows.filter((r) => r.relevance === "target_client");
  const noNextStepRows = targetRows.filter(
    (r) => r.manager_agreed_next_step !== "yes"
  );
  const shortRows = rows.filter((r) => isTrueLike(r.short_or_low_content));
  const nonSalesRows = rows.filter((r) => isTrueLike(r.non_sales_interaction));

  const tip = buildCallTip(rows, noNextStepRows);

  const topicsRows = topCounts(rows.map((r) => r.primary_topic), 6);
  const labelsRows = topCounts(
    rows.flatMap((r) => ensureArray(r.labels || r.tags)),
    6
  );
  const outcomesRows = topCounts(rows.map((r) => r.outcome_status), 6);

  const needIdentifiedRate = rate(
    rows.filter((r) => r.need_identified === "yes").length,
    rows.length
  );
  const askedQuestionsRate = rate(
    rows.filter((r) => r.manager_asked_questions === "yes").length,
    rows.length
  );
  const nextStepRate = rate(
    rows.filter((r) => r.manager_agreed_next_step === "yes").length,
    rows.length
  );
  const shortRate = rate(shortRows.length, rows.length);
  const fragmentedRate = rate(
    rows.filter((r) => isTrueLike(r.fragmented_or_unclear)).length,
    rows.length
  );

  function openExplorerCall() {
    setFilters({ channel: "call" });
    navigate("/explorer");
  }

  function openInteraction(id) {
    setSelectedId(id);
    navigate("/explorer");
  }

  return (
    <div className="flex flex-col gap-8">
      {noNextStepRows.length > 0 && (
        <div className="calls-alert flex items-center justify-between gap-4 bg-destructive/5 border border-destructive/30 rounded p-4">
          <div className="calls-alert__copy flex flex-col gap-1">
            <strong className="text-foreground text-sm">
              Целевые звонки без следующего шага: {noNextStepRows.length}
            </strong>
            <span className="muted text-[11px] text-muted-foreground">
              Именно этот сегмент сейчас лучше всего подходит для coaching и
              ручного разбора руководителем.
            </span>
          </div>
          <button
            className="cta-button shrink-0 px-4 py-2 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest rounded hover:bg-primary/80 transition-colors"
            onClick={openExplorerCall}
          >
            Открыть звонки
          </button>
        </div>
      )}

      <section>
        <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
          KPI звонков
        </h2>
        <div className="grid grid-cols-12 gap-4">
          <MetricCard
            label="Всего звонков"
            value={formatNumber(rows.length)}
            note="в периоде"
            tone="cyan"
          />
          <MetricCard
            label="Целевые"
            value={formatNumber(targetRows.length)}
            note={`${formatPercent(rate(targetRows.length, rows.length))} от всех`}
            tone="green"
          />
          <MetricCard
            label="Без следующего шага"
            value={formatNumber(noNextStepRows.length)}
            note="из целевых"
            tone="red"
          />
          <MetricCard
            label="Короткие / слабые"
            value={formatNumber(shortRows.length)}
            note={`${formatPercent(rate(shortRows.length, rows.length))} от всех`}
            tone="yellow"
          />
        </div>
      </section>

      <section>
        <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
          Таблица звонков
        </h2>
        <div className="bg-card border border-border rounded overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-muted-foreground font-bold uppercase tracking-wider">
                  Дата
                </th>
                <th className="text-left p-4 text-muted-foreground font-bold uppercase tracking-wider">
                  Менеджер
                </th>
                <th className="text-left p-4 text-muted-foreground font-bold uppercase tracking-wider">
                  Тип
                </th>
                <th className="text-left p-4 text-muted-foreground font-bold uppercase tracking-wider">
                  Тема
                </th>
                <th className="text-left p-4 text-muted-foreground font-bold uppercase tracking-wider">
                  Теги
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => (
                <tr
                  key={row.interaction_id || i}
                  className="border-t border-foreground/5 hover:bg-foreground/5 transition-colors"
                >
                  <td className="p-4">
                    <button
                      className="text-chart-3 hover:text-foreground transition-colors text-left"
                      onClick={() => openInteraction(row.interaction_id)}
                    >
                      {formatDate(row.created_at)}
                    </button>
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {getManagerName(row.manager_id)}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {row.relevance || "—"}
                  </td>
                  <td className="p-4 text-foreground">
                    {row.primary_topic || "—"}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap">{renderIssueTags(row)}</div>
                  </td>
                </tr>
              ))}
              {tableRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-8 text-center text-muted-foreground text-[11px]"
                  >
                    Нет данных по звонкам
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DistributionPanel title="Частые темы" rows={topicsRows} />
        <DistributionPanel title="Метки / теги" rows={labelsRows} />
        <DistributionPanel title="Исходы звонков" rows={outcomesRows} />
      </section>

      <section>
        <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
          Сигналы качества
        </h2>
        <div className="flex flex-col gap-4">
          <MetricBarCard
            title="Выявлена потребность"
            rate={needIdentifiedRate}
            note="need identified"
            tone={needIdentifiedRate >= 50 ? "success" : "danger"}
          />
          <MetricBarCard
            title="Asked questions"
            rate={askedQuestionsRate}
            note="квалификация"
            tone={askedQuestionsRate >= 50 ? "success" : "danger"}
          />
          <MetricBarCard
            title="Следующий шаг согласован"
            rate={nextStepRate}
            note="закрытие"
            tone={nextStepRate >= 35 ? "success" : "danger"}
          />
          <MetricBarCard
            title="Short / low content"
            rate={shortRate}
            note="качество сигнала"
            tone="danger"
          />
          <MetricBarCard
            title="Fragmented / unclear"
            rate={fragmentedRate}
            note="фрагментация"
            tone="danger"
          />
        </div>
      </section>

      <section>
        <div className="bg-card border border-primary/20 rounded p-6 relative overflow-hidden">
          <div className="insight-kicker text-[9px] uppercase tracking-widest font-bold text-primary mb-3">
            Подсказка
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{tip}</p>
        </div>
      </section>

      <section>
        <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
          В разработке
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PlaceholderCards items={CALL_FUTURE} />
        </div>
      </section>
    </div>
  );
}
