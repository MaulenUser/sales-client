import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import { formatDate, formatMinutes, formatMoney, formatNumber, formatPercent, humanizeToken } from "../utils/format.js";
import { clampRate, ensureArray, isTrueLike, rate, sum } from "../utils/index.js";

const SOURCE_COLORS = [
  "rgba(65,160,235,0.95)",
  "rgba(52,168,90,0.92)",
  "rgba(246,192,60,0.9)",
  "rgba(142,116,255,0.9)",
  "rgba(240,86,86,0.88)",
];

const RESPONSE_HOURS = ["0:00", "3:00", "6:00", "9:00", "12:00", "15:00", "18:00", "21:00", "24:00"];

function getManagerName(value) {
  if (!value && value !== 0) return "Менеджер не указан";
  if (typeof value === "object") {
    return (
      value.manager_name ||
      value.manager_label ||
      value.source?.manager_name ||
      getManagerName(value.manager_id ?? value.source?.manager_id)
    );
  }
  return `Менеджер #${value}`;
}

function getSnapshot(summary) {
  return summary?.report_snapshot || summary?.executive_report_snapshot || {};
}

function getDashboardRows(summary) {
  const snapshotRows = ensureArray(getSnapshot(summary)?.dashboard?.by_manager);
  if (snapshotRows.length) return snapshotRows;
  return ensureArray(summary?.managers);
}

function getDepartmentDashboard(summary) {
  const snapshot = getSnapshot(summary);
  return snapshot?.dashboard?.department || {};
}

function getTaskDiscipline(summary) {
  return getSnapshot(summary)?.task_discipline || {};
}

function getResponseSpeed(summary) {
  return getSnapshot(summary)?.response_speed || {};
}

function metricCount(summary, path, fallback = 0) {
  const value = path.reduce((acc, key) => acc?.[key], summary);
  return Number(value || fallback || 0);
}

function safeMoney(value, fallback = 0) {
  const n = Number(value || fallback || 0);
  return Number.isFinite(n) ? n : 0;
}

function getTodayLabel(summary) {
  const generatedAt = summary?.generated_at;
  if (!generatedAt) return "за сегодня";
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return "за сегодня";
  return "за сегодня";
}

function groupRowsByManager(rows) {
  return ensureArray(rows).reduce((acc, row) => {
    const managerId = row?.manager_id ?? row?.source?.manager_id ?? "";
    const key = String(managerId || "unknown");
    if (!acc.has(key)) {
      acc.set(key, {
        manager_id: managerId,
        manager_label: getManagerName(row),
        rows: [],
        calls: 0,
        messages: 0,
        messageRows: 0,
        actionable: 0,
      });
    }
    const item = acc.get(key);
    item.rows.push(row);
    if (String(row?.channel || "").toLowerCase() === "call") item.calls += 1;
    if (String(row?.channel || "").toLowerCase() === "whatsapp") {
      item.messageRows += 1;
      item.messages += Number(row?.message_count || 1);
    }
    if (["follow_up", "qualified_interest", "callback_requested", "closed_won"].includes(String(row?.outcome_status || ""))) {
      item.actionable += 1;
    }
    return acc;
  }, new Map());
}

function buildManagerDealRows(summary, interactions) {
  const rowsByManager = groupRowsByManager(interactions);
  const dashboardRows = getDashboardRows(summary);
  const averageTicket = Number(summary?.business_profile?.average_ticket_kzt || 0);
  const maxDeals = Math.max(...dashboardRows.map((row) => Number(row.total_deals || row.interactions || 0)), 1);

  return dashboardRows
    .map((row) => {
      const id = String(row.manager_id || "");
      const interactionStats = rowsByManager.get(id);
      const deals = Number(row.total_deals || row.in_work_deals || row.interactions || interactionStats?.rows.length || 0);
      const amount =
        safeMoney(row.total_amount_kzt) ||
        safeMoney(row.in_work_amount_kzt) ||
        safeMoney(row.won_amount_kzt) ||
        (averageTicket ? deals * averageTicket : 0);
      const growth = Number(row.won_deals || row.active_task_count || interactionStats?.actionable || 0);
      return {
        id,
        label: row.manager_label || interactionStats?.manager_label || getManagerName(id),
        value: deals,
        amount,
        progress: maxDeals ? (deals / maxDeals) * 100 : 0,
        growth,
      };
    })
    .sort((a, b) => b.value - a.value || b.amount - a.amount);
}

function buildOutgoingMessageRows(summary, interactions) {
  const rowsByManager = [...groupRowsByManager(interactions).values()];
  const summaryManagers = ensureArray(summary?.managers);
  const managerFallback = summaryManagers.map((manager) => ({
    id: String(manager.manager_id || ""),
    label: manager.manager_label || getManagerName(manager.manager_id),
    value: Number(manager.whatsapp_count || 0),
    amount: 0,
    growth: Number(manager.actionable_count || 0),
  }));
  const rows = rowsByManager.length
    ? rowsByManager.map((manager) => ({
        id: String(manager.manager_id || ""),
        label: manager.manager_label || getManagerName(manager.manager_id),
        value: manager.messages || manager.messageRows,
        amount: 0,
        growth: manager.actionable,
      }))
    : managerFallback;
  const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1);
  return rows
    .map((row) => ({ ...row, progress: (Number(row.value || 0) / max) * 100 }))
    .sort((a, b) => b.value - a.value);
}

function buildIncomingChannels(summary, interactions) {
  const whatsapp = ensureArray(interactions).filter((row) => String(row?.channel || "").toLowerCase() === "whatsapp");
  const call = ensureArray(interactions).filter((row) => String(row?.channel || "").toLowerCase() === "call");
  const other = ensureArray(interactions).length - whatsapp.length - call.length;
  const rows = [
    { label: "Instagram", value: Number(summary?.channels?.instagram?.total_interactions || 0), icon: "photo_camera" },
    { label: "Wazzup", value: Number(summary?.channels?.whatsapp?.total_interactions || whatsapp.length || 0), icon: "send" },
    { label: "Другие", value: Math.max(0, other), icon: "more_horiz" },
  ];
  const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1);
  return rows.map((row) => ({ ...row, progress: (row.value / max) * 100 }));
}

function buildSourceRows(summary) {
  const crmSources = ensureArray(summary?.crm_context?.deal_source_distribution);
  const channelSources = ensureArray(summary?.overall?.channel_distribution);
  const rows = crmSources.length ? crmSources : channelSources;
  const total = sum(rows.map((row) => row.count));
  return rows.length
    ? rows.slice(0, 5).map((row, index) => ({
        label: humanizeToken(row.name),
        value: Number(row.count || 0),
        rate: Number(row.rate || rate(row.count, total)),
        color: SOURCE_COLORS[index % SOURCE_COLORS.length],
      }))
    : [{ label: "Нет данных", value: 0, rate: 100, color: "rgba(255,255,255,0.12)" }];
}

function buildGoalData(summary, appState) {
  const department = getDepartmentDashboard(summary);
  const revenue = summary?.revenue_summary?.department || {};
  const businessProfile = appState?.setup?.business_profile || summary?.business_profile || {};
  const current = safeMoney(
    revenue.paid_amount ||
      department.won_amount_kzt ||
      summary?.crm_context?.won_amount_kzt ||
      0
  );
  const target = safeMoney(businessProfile.monthly_sales_plan_kzt);
  return {
    current,
    target,
    rate: target ? (current / target) * 100 : 0,
    hasTarget: target > 0,
  };
}

function buildNps(summary) {
  const rating = getSnapshot(summary)?.department_rating;
  const score = Number(rating?.score_100 || 0);
  if (!score) return { score: 0, label: "-/-", detractors: "-/-", promoters: "-/-", passive: "-/-" };
  const normalized = Math.round(score);
  return {
    score: normalized,
    label: `${normalized}`,
    detractors: `${Math.max(0, 100 - normalized)}%`,
    promoters: `${normalized}%`,
    passive: `${Math.max(0, 100 - Math.abs(50 - normalized) * 2)}%`,
  };
}

function buildResponseSeries(interactions) {
  const buckets = Array.from({ length: 25 }, (_, hour) => ({ hour, value: 0 }));
  ensureArray(interactions).forEach((row) => {
    const ts = Date.parse(row?.created_at || "");
    if (!Number.isFinite(ts)) return;
    const hour = new Date(ts).getHours();
    buckets[hour].value += Number(row?.message_count || 1);
  });
  if (!buckets.some((bucket) => bucket.value > 0)) {
    return buckets.map((bucket) => ({ ...bucket, value: bucket.hour === 20 ? 9 : 0 }));
  }
  return buckets;
}

function buildTaskRows(interactions, summary) {
  const taskCandidates = ensureArray(interactions).filter((row) => {
    const outcome = String(row?.outcome_status || "");
    return outcome === "awaiting_response" || outcome === "follow_up" || !isTrueLike(row?.manager_agreed_next_step);
  });
  const fallback = ensureArray(getSnapshot(summary)?.failed_deal_analysis?.recovery_candidates);
  const rows = taskCandidates.length
    ? taskCandidates.map((row, index) => ({
        id: row.interaction_id || `task-${index}`,
        date: row.created_at,
        responsible: getManagerName(row),
        object: row.primary_topic || row.client_request || row.interaction_id || "Обращение",
        type: String(row.channel || "").toLowerCase() === "call" ? "Связаться" : "Написать",
        icon: String(row.channel || "").toLowerCase() === "call" ? "call" : "chat",
        text: row.client_request || row.summary || "Уточнить следующий шаг",
        result: isTrueLike(row.manager_agreed_next_step) ? "Есть следующий шаг" : "Не заполнен",
        interactionId: row.interaction_id,
      }))
    : fallback.map((row, index) => ({
        id: row.deal_id || `deal-${index}`,
        date: row.created_at || summary?.generated_at,
        responsible: getManagerName(row),
        object: row.deal_title || `Сделка #${row.deal_id}`,
        type: "Связаться",
        icon: "call",
        text: row.reason || row.comment || "Вернуть сделку в работу",
        result: row.amount_kzt ? formatMoney(row.amount_kzt) : "В работе",
        interactionId: row.interaction_id,
      }));
  return rows.slice(0, 8);
}

function buildFiles(interactions) {
  const rows = ensureArray(interactions)
    .filter((row) => Number(row?.messages_with_files || 0) > 0)
    .slice(0, 5)
    .map((row, index) => ({
      id: row.interaction_id || index,
      name: `${String(row.primary_topic || "Файл клиента").slice(0, 36)}.${index % 2 ? "xlsx" : "pdf"}`,
      owner: getManagerName(row),
      date: row.created_at,
    }));
  if (rows.length) return rows;
  return [
    { id: "empty-1", name: "Недостаточно данных для отображения", owner: "", date: "" },
    { id: "empty-2", name: "Файлы появятся после анализа переписок", owner: "", date: "" },
  ];
}

function buildCounterWidgets(summary, interactions) {
  const snapshot = getSnapshot(summary);
  const taskDiscipline = getTaskDiscipline(summary)?.department || {};
  const department = getDepartmentDashboard(summary);
  const callRows = ensureArray(interactions).filter((row) => String(row?.channel || "").toLowerCase() === "call");
  const outgoingCalls = callRows.filter((row) => String(row?.outcome_status || "").includes("no_answer")).length;
  const tasksToDo =
    Number(taskDiscipline.active_task_count || 0) ||
    ensureArray(interactions).filter((row) => ["awaiting_response", "follow_up"].includes(String(row?.outcome_status || ""))).length;
  const notes = ensureArray(interactions).filter((row) => String(row?.summary || "").trim()).length;
  const todayLabel = getTodayLabel(summary);

  return [
    {
      label: "ПРОСРОЧЕННЫЕ ЗАДАЧИ",
      value: Number(taskDiscipline.deals_with_overdue_tasks || 0),
      change: `+${formatNumber(Number(taskDiscipline.deals_with_overdue_tasks || 0))}`,
      note: todayLabel,
      tone: "violet",
    },
    {
      label: "ЗАДАЧИ К ВЫПОЛНЕНИЮ",
      value: tasksToDo,
      change: `+${formatNumber(tasksToDo)}`,
      note: todayLabel,
      tone: "violet",
    },
    {
      label: "СДЕЛОК БЕЗ ЗАДАЧ",
      value: Number(taskDiscipline.deals_without_tasks || summary?.crm_context?.open_deals || 0),
      amount: formatMoney(department.in_work_amount_kzt || snapshot?.missed_revenue?.estimated_missed_revenue_kzt || 0),
      change: `+${formatNumber(Number(taskDiscipline.deals_without_tasks || 0))}`,
      note: todayLabel,
      tone: "violet",
    },
    {
      label: "ВХОДЯЩИЕ ЗВОНКИ",
      value: callRows.length,
      note: todayLabel,
      tone: "green",
    },
    {
      label: "ИСХОДЯЩИЕ ЗВОНКИ",
      value: outgoingCalls || Math.max(0, Math.round(callRows.length * 0.35)),
      note: todayLabel,
      tone: "green",
    },
    {
      label: "ПРИМЕЧАНИЯ",
      value: notes,
      note: todayLabel,
      tone: "green",
    },
    {
      label: "УСПЕШНЫЕ СДЕЛКИ",
      value: Number(department.won_deals || summary?.crm_context?.won_deals || 0),
      amount: formatMoney(department.won_amount_kzt || summary?.crm_context?.won_amount_kzt || 0),
      change: `+${formatNumber(Number(department.won_deals || summary?.crm_context?.won_deals || 0))}`,
      note: todayLabel,
      tone: "violet",
    },
  ];
}

function CounterCard({ widget, compact = false }) {
  return (
    <article className={`amo-widget amo-counter${compact ? " amo-counter--compact" : ""}`}>
      <div className="amo-widget__title">{widget.label}</div>
      <div className={`amo-counter__value amo-counter__value--${widget.tone || "violet"}`}>
        {formatNumber(widget.value)}
      </div>
      {widget.amount && <div className="amo-counter__amount">{widget.amount}</div>}
      <div className="amo-counter__divider" />
      <div className="amo-counter__footer">
        {widget.change && <span className="amo-counter__change">{widget.change}</span>}
        <span>{widget.note}</span>
      </div>
    </article>
  );
}

function RankingWidget({ title, rows, total, totalNote, valueKind = "number" }) {
  const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1);
  return (
    <article className="amo-widget amo-widget--list">
      <div className="amo-widget__head">
        <div className="amo-widget__title">{title}</div>
        {total !== undefined && (
          <div className="amo-widget__total">
            <strong>{formatNumber(total)}</strong>
            {totalNote && <span>{totalNote}</span>}
          </div>
        )}
      </div>
      <div className="amo-ranking">
        {rows.slice(0, 5).map((row) => (
          <div className="amo-ranking__row" key={`${title}-${row.id || row.label}`}>
            <div className="amo-ranking__line">
              <span className="amo-ranking__label">{row.label}</span>
              <span className="amo-ranking__value">
                {valueKind === "money" ? formatMoney(row.amount || row.value) : formatNumber(row.value)}
              </span>
              <span className="amo-ranking__growth">+{formatNumber(row.growth || 0)}</span>
            </div>
            <div className="amo-ranking__bar">
              <span style={{ width: `${clampRate(row.progress || rate(row.value, max))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function DonutChart({ rows }) {
  const total = sum(rows.map((row) => row.value)) || 1;
  let cursor = 0;
  const gradient = rows
    .map((row) => {
      const start = cursor;
      const end = cursor + rate(row.value, total);
      cursor = end;
      return `${row.color} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <article className="amo-widget amo-widget--chart">
      <div className="amo-widget__title">ИСТОЧНИКИ СДЕЛОК</div>
      <div className="amo-donut-layout">
        <div className="amo-donut" style={{ background: `conic-gradient(${gradient || "rgba(255,255,255,0.12) 0 100%"})` }}>
          <div className="amo-donut__inner">
            <strong>{formatNumber(total)}</strong>
            <span>сделок</span>
          </div>
        </div>
        <div className="amo-chart-legend">
          {rows.map((row) => (
            <div key={row.label} className="amo-chart-legend__row">
              <i style={{ background: row.color }} />
              <span>{row.label}</span>
              <strong>{formatPercent(row.rate)}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function GaugeWidget({ goal }) {
  const pct = clampRate(goal.rate);
  const needleAngle = -180 + (pct / 100) * 180;
  const missing = goal.hasTarget ? Math.max(0, Number(goal.target || 0) - Number(goal.current || 0)) : 0;
  const fillPct = pct > 0 ? Math.max(3, pct) : 0;

  return (
    <article className="amo-widget amo-widget--gauge">
      <div className="amo-widget__title">ЦЕЛИ</div>
      <div className="amo-goal-head">
        <div className="amo-tabs">
          <button type="button" className="active">По бюджету</button>
          {/* <button type="button">По количеству</button> */}
        </div>
        <span className="amo-goal-chip">{formatPercent(pct)}</span>
      </div>
      <div className="amo-gauge">
        <svg viewBox="0 0 240 152" aria-hidden="true">
          <defs>
            <linearGradient id="goalGaugeGradient" x1="28" x2="212" y1="118" y2="118" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgb(246,142,22)" />
              <stop offset="48%" stopColor="rgb(246,192,60)" />
              <stop offset="100%" stopColor="rgb(22,220,126)" />
            </linearGradient>
            <filter id="goalGaugeGlow" x="-25%" y="-35%" width="150%" height="170%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path d="M28 118 A92 92 0 0 1 212 118" className="amo-gauge__track" pathLength="100" />
          <path
            d="M28 118 A92 92 0 0 1 212 118"
            className="amo-gauge__fill"
            pathLength="100"
            strokeDasharray={`${fillPct} ${100 - fillPct}`}
          />
          <path d="M28 118 A92 92 0 0 1 212 118" className="amo-gauge__shine" pathLength="100" />
          <g className="amo-gauge__ticks">
            <line x1="28" y1="118" x2="28" y2="108" />
            <line x1="120" y1="26" x2="120" y2="38" />
            <line x1="212" y1="118" x2="212" y2="108" />
          </g>
          <g style={{ transform: `rotate(${needleAngle}deg)`, transformOrigin: "120px 118px" }}>
            <line x1="120" y1="118" x2="198" y2="118" className="amo-gauge__needle" />
          </g>
          <circle cx="120" cy="118" r="8" className="amo-gauge__pin-outer" />
          <circle cx="120" cy="118" r="4" className="amo-gauge__pin" />
          <text x="28" y="139">0</text>
          <text x="120" y="20" textAnchor="middle">50%</text>
          <text x="212" y="139" textAnchor="middle">100%</text>
        </svg>
        <div className="amo-gauge__center">
          <strong>{formatPercent(pct)}</strong>
          <span>выполнено</span>
        </div>
      </div>
      <div className="amo-goal-value">
        <strong>{formatMoney(goal.current)}</strong>
        <span>{goal.hasTarget ? `из ${formatMoney(goal.target)}` : "план не задан"}</span>
      </div>
      <div className="amo-goal-stats">
        <div>
          <span>Осталось</span>
          <strong>{formatMoney(missing)}</strong>
        </div>
        <div>
          <span>Пред. месяц</span>
          <strong>0</strong>
        </div>
      </div>
    </article>
  );
}

function NpsWidget({ nps }) {
  const pct = clampRate(nps.score);
  return (
    <article className="amo-widget amo-widget--nps">
      <div className="amo-widget__title">ИНДЕКС ПОТРЕБИТЕЛЬСКОЙ ЛОЯЛЬНОСТИ (NPS)</div>
      <div className="amo-ribbon">ПРОФЕССИОНАЛЬНЫЙ ТАРИФ</div>
      <div className="amo-nps">
        <div
          className="amo-nps__donut"
          style={{ background: `conic-gradient(rgba(52,168,90,0.72) 0 ${pct}%, rgba(240,86,86,0.34) ${pct}% 100%)` }}
        >
          <div>
            <span>NPS</span>
            <strong>{nps.label}</strong>
          </div>
        </div>
        <div className="amo-nps__stats">
          <span>{nps.promoters}</span>
          <span>{nps.passive}</span>
          <span>{nps.detractors}</span>
        </div>
      </div>
      <p className="amo-muted">NPS показывает уровень удовлетворенности клиентов.</p>
    </article>
  );
}

function AreaChartWidget({ series, responseSpeed }) {
  const width = 720;
  const height = 230;
  const padding = { left: 16, right: 16, top: 18, bottom: 34 };
  const max = Math.max(...series.map((point) => Number(point.value || 0)), 1);
  const xStep = (width - padding.left - padding.right) / (series.length - 1);
  const yFor = (value) => padding.top + (1 - value / max) * (height - padding.top - padding.bottom);
  const points = series.map((point, index) => ({
    x: padding.left + index * xStep,
    y: yFor(point.value),
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding.left},${height - padding.bottom} ${line} ${width - padding.right},${height - padding.bottom}`;

  return (
    <article className="amo-widget amo-widget--wide-chart">
      <div className="amo-widget__head">
        <div className="amo-widget__title">СРЕДНЕЕ ВРЕМЯ ОТВЕТА</div>
        <div className="amo-widget__total amo-widget__total--small">
          <strong>{formatMinutes(responseSpeed?.average_minutes || 0)}</strong>
          <span>среднее</span>
        </div>
      </div>
      <svg className="amo-area-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="responseArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(65,160,235,0.34)" />
            <stop offset="100%" stopColor="rgba(142,116,255,0.03)" />
          </linearGradient>
        </defs>
        {series.map((_, index) => (
          <line
            key={index}
            x1={padding.left + index * xStep}
            x2={padding.left + index * xStep}
            y1={padding.top}
            y2={height - padding.bottom}
            className={index % 3 === 0 ? "amo-area-chart__grid-strong" : "amo-area-chart__grid"}
          />
        ))}
        <polygon points={area} className="amo-area-chart__area" />
        <polyline points={line} className="amo-area-chart__line" />
        <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} className="amo-area-chart__axis" />
        {RESPONSE_HOURS.map((label, index) => {
          const x = padding.left + (index / (RESPONSE_HOURS.length - 1)) * (width - padding.left - padding.right);
          return (
            <text key={label} x={x} y={height - 10} textAnchor={index === 0 ? "start" : index === RESPONSE_HOURS.length - 1 ? "end" : "middle"}>
              {label}
            </text>
          );
        })}
      </svg>
    </article>
  );
}

function ChannelListWidget({ rows }) {
  return (
    <article className="amo-widget amo-widget--list">
      <div className="amo-widget__head">
        <div className="amo-widget__title">ВХОДЯЩИЕ СООБЩЕНИЯ</div>
        <div className="amo-widget__total">
          <strong>{formatNumber(sum(rows.map((row) => row.value)))}</strong>
          <span>за сегодня</span>
        </div>
      </div>
      <div className="amo-channel-list">
        {rows.map((row) => (
          <div key={row.label} className="amo-channel-list__row">
            <span className="material-symbols-outlined">{row.icon}</span>
            <strong>{row.label}</strong>
            <i><b style={{ width: `${clampRate(row.progress)}%` }} /></i>
            <em>{formatNumber(row.value)}</em>
          </div>
        ))}
      </div>
    </article>
  );
}

function FilesWidget({ files }) {
  return (
    <article className="amo-widget amo-widget--files">
      <div className="amo-widget__title">ПОСЛЕДНИЕ ФАЙЛЫ</div>
      <div className="amo-files">
        {files.map((file) => (
          <div className="amo-file-row" key={file.id}>
            <span className="material-symbols-outlined">description</span>
            <div>
              <strong>{file.name}</strong>
              <small>{file.owner}{file.date ? ` · ${formatDate(file.date)}` : ""}</small>
            </div>
            <i className="material-symbols-outlined">download</i>
          </div>
        ))}
      </div>
    </article>
  );
}

function ForecastWidget({ summary }) {
  const department = getDepartmentDashboard(summary);
  const inWork = Number(department.in_work_deals || summary?.crm_context?.open_deals || 0);
  const closed = Number(department.closed_deals || summary?.crm_context?.won_deals || 0);
  const amount = safeMoney(department.in_work_amount_kzt || department.won_amount_kzt || 0);
  const wonAmount = safeMoney(department.won_amount_kzt || summary?.crm_context?.won_amount_kzt || 0);
  const projectedDeals = Math.max(closed, inWork ? Math.ceil(inWork * 0.18) + closed : 0);
  const projectedAmount = Math.max(wonAmount, amount ? Math.round(amount * 0.18) + wonAmount : 0);
  const middleDeals = Math.round((inWork + projectedDeals) / 2);
  const middleAmount = Math.round((amount + projectedAmount) / 2);
  const conversionPct = rate(closed, inWork + closed);

  return (
    <article className="amo-widget amo-widget--forecast">
      <div className="amo-widget__title">ПРОГНОЗ ПРОДАЖ</div>
      <div className="amo-forecast__summary">
        <div>
          <span>В работе</span>
          <strong>{formatNumber(inWork)}</strong>
          <em>{formatMoney(amount)}</em>
        </div>
        <div>
          <span>Прогноз</span>
          <strong>{formatNumber(projectedDeals)}</strong>
          <em>{formatMoney(projectedAmount)}</em>
        </div>
        <div>
          <span>Конверсия</span>
          <strong>{formatPercent(conversionPct)}</strong>
          <em>5 дней</em>
        </div>
      </div>
      <div className="amo-forecast">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="forecastArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(22,220,126,0.22)" />
              <stop offset="70%" stopColor="rgba(22,220,126,0.06)" />
              <stop offset="100%" stopColor="rgba(22,220,126,0)" />
            </linearGradient>
            <filter id="forecastGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <line x1="5" x2="95" y1="26" y2="26" className="amo-forecast__grid" />
          <line x1="5" x2="95" y1="56" y2="56" className="amo-forecast__grid" />
          <line x1="5" x2="95" y1="86" y2="86" className="amo-forecast__axis-line" />
          <line x1="5" x2="5" y1="18" y2="86" className="amo-forecast__limit amo-forecast__limit--start" />
          <line x1="95" x2="95" y1="18" y2="86" className="amo-forecast__limit amo-forecast__limit--end" />
          <path d="M5 78 C28 71 36 62 50 56 S76 45 95 38 L95 86 L5 86 Z" className="amo-forecast__area" />
          <path d="M5 78 C28 71 36 62 50 56 S76 45 95 38" className="amo-forecast__line-shadow" />
          <path d="M5 78 C28 71 36 62 50 56 S76 45 95 38" className="amo-forecast__line" />
          <path d="M50 56 C65 52 79 45 95 38" className="amo-forecast__line-plan" />
          <circle cx="5" cy="78" r="1.6" className="amo-forecast__dot amo-forecast__dot--start" />
          <circle cx="50" cy="56" r="1.9" className="amo-forecast__dot amo-forecast__dot--mid" />
          <circle cx="95" cy="38" r="2.2" className="amo-forecast__dot amo-forecast__dot--end" />
        </svg>
        <div className="amo-forecast__point amo-forecast__point--left">
          <strong>{formatNumber(inWork)}</strong>
          <span>сделок</span>
          <b>{formatMoney(amount)}</b>
        </div>
        <div className="amo-forecast__point amo-forecast__point--middle">
          <strong>{formatNumber(middleDeals)}</strong>
          <span>сделки</span>
          <b>{formatMoney(middleAmount)}</b>
        </div>
        <div className="amo-forecast__point amo-forecast__point--right">
          <strong>{formatNumber(projectedDeals)}</strong>
          <span>прогноз</span>
          <b>{formatMoney(projectedAmount)}</b>
        </div>
      </div>
      <div className="amo-forecast__footer">
        <span>Сделок в работе<br /><strong>сейчас</strong></span>
        <span>По прошествии<br /><strong>5 дней</strong></span>
      </div>
    </article>
  );
}

function TasksTable({ rows, onOpen }) {
  return (
    <article className="amo-widget amo-widget--tasks">
      <div className="amo-widget__title">ЗАДАЧИ</div>
      <div className="amo-table-wrap">
        <table className="amo-tasks-table">
          <thead>
            <tr>
              <th>Дата исполнения</th>
              <th>Ответственный</th>
              <th>Объект</th>
              <th>Тип задачи</th>
              <th>Текст задачи</th>
              <th>Результат</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.date)}</td>
                <td>{row.responsible}</td>
                <td>
                  <button type="button" onClick={() => onOpen(row.interactionId)} className="amo-link-button">
                    {row.object}
                  </button>
                </td>
                <td>
                  <span className="amo-task-type">
                    <i className="material-symbols-outlined">{row.icon}</i>
                    {row.type}
                  </span>
                </td>
                <td>{row.text}</td>
                <td>{row.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default function OverviewScreen() {
  const navigate = useNavigate();
  const { appState, summary, interactions, usageSummary, setSelectedId } = useStore();
  const s = summary || {};
  const rows = ensureArray(interactions);

  const data = useMemo(() => {
    const counterWidgets = buildCounterWidgets(s, rows);
    const sourceRows = buildSourceRows(s);
    const goal = buildGoalData(s, appState);
    const nps = buildNps(s);
    const responseSpeed = getResponseSpeed(s)?.department || {};
    const files = buildFiles(rows);
    const taskRows = buildTaskRows(rows, s);
    const managerDeals = buildManagerDealRows(s, rows);
    const outgoingMessages = buildOutgoingMessageRows(s, rows);
    const incomingChannels = buildIncomingChannels(s, rows);
    const series = buildResponseSeries(rows);
    return {
      counterWidgets,
      sourceRows,
      goal,
      nps,
      responseSpeed,
      files,
      taskRows,
      managerDeals,
      outgoingMessages,
      incomingChannels,
      series,
    };
  }, [appState, s, rows]);

  const openInteraction = (interactionId) => {
    if (interactionId) setSelectedId(interactionId);
    navigate("/explorer");
  };

  return (
    <div className="amo-dashboard">
      <div className="amo-dashboard__toolbar">
        <div>
          <span>Рабочий стол</span>
          <strong>{s?.analysis_scope?.label || "Все сотрудники / текущий срез"}</strong>
        </div>
        <div>
          <span>Обновлено</span>
          <strong>{formatDate(s.generated_at || usageSummary?.generated_at)}</strong>
        </div>
      </div>

      <section className="amo-dashboard-grid">
        <div className="amo-counter-cluster">
          {data.counterWidgets.slice(0, 4).map((widget) => (
            <CounterCard widget={widget} key={widget.label} />
          ))}
        </div>

        <DonutChart rows={data.sourceRows} />

        <GaugeWidget goal={data.goal} />

        <ForecastWidget summary={s} />

        <div className="amo-counter-cluster">
          {data.counterWidgets.slice(4).map((widget) => (
            <CounterCard widget={widget} compact key={widget.label} />
          ))}
        </div>

        <ChannelListWidget rows={data.incomingChannels} />

        <AreaChartWidget series={data.series} responseSpeed={data.responseSpeed} />

        {/* <TasksTable rows={data.taskRows} onOpen={openInteraction} /> */}
      </section>
    </div>
  );
}
