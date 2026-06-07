import React, { useMemo } from "react";
import useStore from "../store/index.js";
import { formatDate, formatMinutes, formatNumber } from "../utils/format.js";
import { ensureArray, isPlainObject, isTrueLike, sortRowsByDateDesc } from "../utils/index.js";

const RESPONSE_SLA_MINUTES = 30;

const TRIGGER_META = {
  response_sla: {
    label: "Ответ > 30 минут",
    icon: "schedule",
    severity: 5,
    action: "Ответить клиенту сейчас, признать задержку, дать конкретный ответ и сразу поставить задачу на следующий контакт.",
  },
  missed_call: {
    label: "Пропущенный звонок",
    icon: "phone_missed",
    severity: 5,
    action: "Перезвонить клиенту. Если не дозвонились, отправить короткое сообщение с временем повторного звонка.",
  },
  no_next_step: {
    label: "Нет следующего шага",
    icon: "event_busy",
    severity: 4,
    action: "Зафиксировать следующий шаг в CRM: встреча, Zoom, замер, расчет, оплата или контрольный звонок с датой и ответственным.",
  },
  no_active_task: {
    label: "Нет активной задачи",
    icon: "assignment_late",
    severity: 4,
    action: "Поставить активную задачу по сделке с ближайшим дедлайном и понятным результатом.",
  },
  overdue_task: {
    label: "Просроченная задача",
    icon: "alarm",
    severity: 4,
    action: "Разобрать просроченную задачу, обновить дедлайн и связаться с клиентом до конца рабочего дня.",
  },
  no_need_identified: {
    label: "Продажа в лоб",
    icon: "psychology_alt",
    severity: 3,
    action: "Вернуться к квалификации: уточнить задачу клиента, сроки, объем, бюджет и критерии выбора до повторной презентации.",
  },
};

const RESPONSE_WAIT_PATHS = [
  "response_wait_minutes",
  "response_delay_minutes",
  "manager_response_minutes",
  "first_response_minutes",
  "reply_wait_minutes",
  "client_wait_minutes",
  "unanswered_minutes",
  "minutes_without_answer",
  "minutes_since_client_message",
  "last_customer_message_wait_minutes",
  "response_speed.wait_minutes",
  "response_speed.first_response_minutes",
  "deal.response_wait_minutes",
  "source.response_wait_minutes",
  "feature.source.response_wait_minutes",
];

const ACTIVE_TASK_PATHS = [
  "active_task_count",
  "open_task_count",
  "tasks.active",
  "tasks.open",
  "deal.active_task_count",
  "source.active_task_count",
  "feature.source.active_task_count",
];

const OVERDUE_TASK_PATHS = [
  "overdue_task_count",
  "overdue_tasks",
  "tasks.overdue",
  "deal.overdue_task_count",
  "source.overdue_task_count",
  "feature.source.overdue_task_count",
];

function getByPath(obj, path) {
  return String(path || "").split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function textOf(value) {
  if (Array.isArray(value)) return value.join(" ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function isNoLike(value) {
  if (value === false) return true;
  if (typeof value === "number") return value === 0;
  const normalized = String(value || "").trim().toLowerCase();
  return ["false", "0", "no", "нет", "n"].includes(normalized);
}

function hasExplicitValue(value) {
  return value !== undefined && value !== null && value !== "" && String(value).toLowerCase() !== "unknown";
}

function numberFromPaths(row, paths) {
  const nums = paths
    .map((path) => getByPath(row, path))
    .filter(hasExplicitValue)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return nums.length ? Math.max(...nums) : null;
}

function isWorkingTime(value) {
  const ts = Date.parse(value || "");
  if (!Number.isFinite(ts)) return true;
  const d = new Date(ts);
  const day = d.getDay();
  const hour = d.getHours();
  return day !== 0 && day !== 6 && hour >= 10 && hour < 19;
}

function getManagerName(id) {
  if (id === undefined || id === null || id === "") return "Менеджер не указан";
  return `Менеджер #${id}`;
}

function getDealId(row) {
  return (
    row?.deal_id ||
    row?.crm_deal_id ||
    row?.dealId ||
    row?.source?.deal_id ||
    row?.source?.crm_deal_id ||
    row?.feature?.source?.deal_id ||
    ""
  );
}

function getDealTitle(row) {
  const title =
    row?.deal_title ||
    row?.deal_name ||
    row?.title ||
    row?.source?.deal_title ||
    row?.source?.deal_name ||
    row?.feature?.source?.deal_title ||
    row?.primary_topic ||
    row?.client_request ||
    "";

  if (String(title || "").trim()) return String(title).trim();
  const dealId = getDealId(row);
  return dealId ? `Сделка #${dealId}` : `Обращение ${row?.interaction_id || ""}`.trim();
}

function getDealHref(row) {
  return (
    row?.deal_url ||
    row?.crm_url ||
    row?.url ||
    row?.source?.deal_url ||
    row?.source?.crm_url ||
    row?.feature?.source?.deal_url ||
    row?.feature?.source?.crm_url ||
    ""
  );
}

function isActiveDeal(row) {
  const explicitActive =
    row?.is_active ??
    row?.deal_is_active ??
    row?.active ??
    row?.source?.is_active ??
    row?.feature?.source?.is_active;

  if (hasExplicitValue(explicitActive) && isNoLike(explicitActive)) return false;
  if (isTrueLike(row?.non_sales_interaction)) return false;

  const stageHaystack = [
    row?.deal_stage,
    row?.deal_stage_name,
    row?.stage_name,
    row?.stage_semantic_id,
    row?.status,
    row?.deal_status,
    row?.source?.deal_stage,
    row?.feature?.source?.deal_stage,
  ].map(textOf).join(" ").toLowerCase();

  return !/(won|success|lost|fail|closed|закрыт|успеш|проигр|отказ)/i.test(stageHaystack);
}

function isMissedCall(row) {
  if (String(row?.channel || "").toLowerCase() !== "call") return false;
  const haystack = [
    row?.call_status,
    row?.activity_status,
    row?.outcome_status,
    row?.summary,
    row?.client_request,
    row?.labels,
    row?.tags,
  ].map(textOf).join(" ").toLowerCase();
  return /(missed|missed_call|пропущ|не дозвони|no_answer)/i.test(haystack);
}

function hasNoNextStep(row) {
  if (hasExplicitValue(row?.manager_agreed_next_step) && !isTrueLike(row?.manager_agreed_next_step)) return true;
  const outcome = String(row?.outcome_status || "").toLowerCase();
  return ["awaiting_response", "follow_up", "callback_requested"].includes(outcome) && !isTrueLike(row?.manager_agreed_next_step);
}

function hasNoActiveTask(row) {
  const count = numberFromPaths(row, ACTIVE_TASK_PATHS);
  if (count !== null) return count <= 0;

  const explicit =
    row?.has_active_task ??
    row?.has_open_task ??
    row?.deal_has_active_tasks ??
    row?.source?.has_active_task ??
    row?.feature?.source?.has_active_task;

  return hasExplicitValue(explicit) && isNoLike(explicit);
}

function hasOverdueTask(row) {
  const count = numberFromPaths(row, OVERDUE_TASK_PATHS);
  if (count !== null) return count > 0;

  const explicit =
    row?.has_overdue_task ??
    row?.has_overdue_tasks ??
    row?.deal_has_overdue_tasks ??
    row?.source?.has_overdue_task ??
    row?.feature?.source?.has_overdue_task;

  return hasExplicitValue(explicit) && isTrueLike(explicit);
}

function hasNeedNotIdentified(row) {
  const needIsNo = hasExplicitValue(row?.need_identified) && !isTrueLike(row?.need_identified);
  return needIsNo && isTrueLike(row?.manager_presented_service);
}

function makeTrigger(type, reason) {
  const meta = TRIGGER_META[type];
  return {
    type,
    label: meta.label,
    icon: meta.icon,
    severity: meta.severity,
    reason,
    action: meta.action,
  };
}

function buildTriggers(row) {
  const triggers = [];
  const waitMinutes = numberFromPaths(row, RESPONSE_WAIT_PATHS);

  if (waitMinutes > RESPONSE_SLA_MINUTES && isWorkingTime(row?.last_client_message_at || row?.created_at)) {
    triggers.push(makeTrigger(
      "response_sla",
      `Клиент ждет ответа ${formatMinutes(waitMinutes)} в рабочее время.`
    ));
  }

  if (isMissedCall(row)) {
    triggers.push(makeTrigger("missed_call", "В сделке есть пропущенный звонок или неуспешная попытка связи."));
  }

  if (hasNoNextStep(row)) {
    triggers.push(makeTrigger(
      "no_next_step",
      "Диалог завершился без назначенного следующего шага: нет встречи, Zoom, замера, расчета, оплаты или контрольного контакта."
    ));
  }

  if (hasNoActiveTask(row)) {
    triggers.push(makeTrigger("no_active_task", "По сделке не найдена активная задача для контроля следующего действия."));
  }

  if (hasOverdueTask(row)) {
    triggers.push(makeTrigger("overdue_task", "В сделке есть просроченная задача, клиент остается без управляемого follow-up."));
  }

  if (hasNeedNotIdentified(row)) {
    triggers.push(makeTrigger(
      "no_need_identified",
      "Потребность клиента не выявлена, но менеджер уже перешел к презентации или продаже."
    ));
  }

  return triggers;
}

function uniqByType(items) {
  return [...new Map(items.map((item) => [item.type, item])).values()]
    .sort((a, b) => b.severity - a.severity || a.label.localeCompare(b.label, "ru"));
}

function buildDerivedAlerts(interactions) {
  const groups = new Map();

  sortRowsByDateDesc(ensureArray(interactions)).forEach((row, index) => {
    if (!isActiveDeal(row)) return;
    const triggers = buildTriggers(row);
    if (!triggers.length) return;

    const dealId = getDealId(row);
    const key = dealId || row?.interaction_id || `urgent-${index}`;
    const current = groups.get(key) || {
      id: key,
      title: getDealTitle(row),
      href: getDealHref(row),
      manager: getManagerName(row?.manager_id),
      date: row?.created_at || "",
      triggers: [],
    };

    current.triggers = uniqByType([...current.triggers, ...triggers]);
    current.href = current.href || getDealHref(row);
    current.title = current.title || getDealTitle(row);
    current.date = current.date || row?.created_at || "";
    groups.set(key, current);
  });

  return [...groups.values()]
    .map((row) => ({
      ...row,
      severity: row.triggers.reduce((sum, trigger) => sum + trigger.severity, 0),
    }))
    .sort((a, b) => b.severity - a.severity || Date.parse(b.date || "") - Date.parse(a.date || ""));
}

function normalizeExplicitAlert(row, index) {
  const reason = row?.reason || row?.what_wrong || row?.problem || row?.comment || "Сделка отмечена системой как риск потери клиента.";
  const action = row?.recommendation || row?.what_to_do || row?.action || "Связаться с клиентом и зафиксировать следующий шаг в CRM.";
  const explicitType = row?.trigger_type || row?.trigger || row?.type;
  const type = TRIGGER_META[explicitType] ? explicitType : "response_sla";
  const trigger = makeTrigger(type, reason);
  return {
    id: row?.deal_id || row?.id || `explicit-alert-${index}`,
    title: row?.deal_title || row?.title || getDealTitle(row),
    href: getDealHref(row),
    manager: row?.manager_label || getManagerName(row?.manager_id),
    date: row?.created_at || row?.updated_at || "",
    severity: Number(row?.score || row?.severity || trigger.severity),
    triggers: [{ ...trigger, reason, action }],
  };
}

function getExplicitAlertRows(summary, executiveReport) {
  const candidates = [
    summary?.urgent_alerts,
    summary?.alerts,
    summary?.report_snapshot?.urgent_alerts,
    summary?.report_snapshot?.alerts,
    summary?.report_snapshot?.alerts_dashboard,
    executiveReport?.urgent_alerts,
    executiveReport?.alerts,
    executiveReport?.alerts_dashboard,
    executiveReport?.high_risk_deals,
  ];

  return candidates
    .flatMap((value) => {
      if (Array.isArray(value)) return value;
      if (isPlainObject(value)) return ensureArray(value.rows || value.deals || value.items || value.alerts);
      return [];
    })
    .filter(isPlainObject)
    .map(normalizeExplicitAlert);
}

function buildAlerts(summary, executiveReport, interactions) {
  const explicitRows = getExplicitAlertRows(summary, executiveReport);
  const derivedRows = buildDerivedAlerts(interactions);
  const merged = new Map();

  [...explicitRows, ...derivedRows].forEach((row) => {
    const key = row.href || row.id;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, row);
      return;
    }
    merged.set(key, {
      ...current,
      title: current.title || row.title,
      href: current.href || row.href,
      manager: current.manager || row.manager,
      date: current.date || row.date,
      triggers: uniqByType([...current.triggers, ...row.triggers]),
      severity: Math.max(current.severity || 0, row.severity || 0),
    });
  });

  return [...merged.values()].sort((a, b) => b.severity - a.severity || Date.parse(b.date || "") - Date.parse(a.date || ""));
}

function getTriggerCounts(rows) {
  return rows.reduce((acc, row) => {
    row.triggers.forEach((trigger) => {
      acc[trigger.type] = (acc[trigger.type] || 0) + 1;
    });
    return acc;
  }, {});
}

function AlertsSummary({ rows, counts }) {
  const critical = rows.filter((row) => row.severity >= 8).length;
  const items = [
    { label: "Всего в риске", value: rows.length, icon: "warning" },
    { label: "Критичные", value: critical, icon: "priority_high" },
    { label: "Ответ > 30 мин", value: counts.response_sla || 0, icon: "schedule" },
    { label: "Нет следующего шага", value: counts.no_next_step || 0, icon: "event_busy" },
  ];

  return (
    <section className="alerts-summary">
      {items.map((item) => (
        <article className="alerts-summary__item" key={item.label}>
          <span className="material-symbols-outlined">{item.icon}</span>
          <div>
            <strong>{formatNumber(item.value)}</strong>
            <small>{item.label}</small>
          </div>
        </article>
      ))}
    </section>
  );
}

function DealCell({ row }) {
  return (
    <div className="alerts-deal-cell">
      <span className={row.severity >= 8 ? "alerts-risk alerts-risk--critical" : "alerts-risk"}>
        {row.severity >= 8 ? "Критический риск" : "Высокий риск"}
      </span>
      {row.href ? (
        <a className="alerts-deal-title" href={row.href} target="_blank" rel="noreferrer">
          {row.title}
          <span className="material-symbols-outlined">open_in_new</span>
        </a>
      ) : (
        <strong className="alerts-deal-title alerts-deal-title--plain">{row.title}</strong>
      )}
      <small>
        {row.manager}
        {row.date ? ` • ${formatDate(row.date)}` : ""}
      </small>
    </div>
  );
}

function TriggerList({ triggers }) {
  return (
    <div className="alerts-trigger-list">
      {triggers.map((trigger) => (
        <div className="alerts-trigger" key={trigger.type}>
          <span className="material-symbols-outlined">{trigger.icon}</span>
          <div>
            <strong>{trigger.label}</strong>
            <p>{trigger.reason}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionList({ triggers }) {
  return (
    <div className="alerts-action-list">
      {triggers.slice(0, 3).map((trigger) => (
        <div className="alerts-action" key={trigger.type}>
          <span className="material-symbols-outlined">arrow_forward</span>
          <p>{trigger.action}</p>
        </div>
      ))}
    </div>
  );
}

export default function UrgentScreen() {
  const { summary, executiveReport, interactions } = useStore();
  const rows = useMemo(
    () => buildAlerts(summary, executiveReport, interactions),
    [summary, executiveReport, interactions]
  );
  const counts = useMemo(() => getTriggerCounts(rows), [rows]);

  return (
    <div className="dialog-page alerts-page">
      <section className="dialog-toolbar">
        <div className="dialog-toolbar__copy">
          <span>AI Trigger List</span>
          <strong>{rows.length ? `${formatNumber(rows.length)} сделок требуют реакции` : "Критических рисков нет"}</strong>
        </div>
        <div className="alerts-toolbar-note">
          Активные сделки в работе, где AI нашел риск потери клиента по скорости ответа, звонкам, задачам и качеству диалога.
        </div>
      </section>

      <AlertsSummary rows={rows} counts={counts} />

      <section className="dialog-table-card">
        <div className="dialog-table-card__head">
          <div>
            <span>В работе</span>
            <strong>Список срочных сделок</strong>
          </div>
        </div>

        <div className="dialog-table-wrap">
          <table className="dialog-table alerts-table">
            <thead>
              <tr>
                <th>Ссылка на сделку</th>
                <th>Что не так?</th>
                <th>Что делать?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.href || row.id}>
                  <td><DealCell row={row} /></td>
                  <td><TriggerList triggers={row.triggers} /></td>
                  <td><ActionList triggers={row.triggers} /></td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={3}>
                    <div className="dialog-empty">
                      Нет активных сделок с критическими триггерами.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
