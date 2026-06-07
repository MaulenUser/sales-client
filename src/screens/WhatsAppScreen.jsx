import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import { formatDate } from "../utils/format.js";
import { ensureArray, isTrueLike, sortRowsByDateDesc } from "../utils/index.js";

const STATUS_FILTERS = [
  { value: "all", label: "Все статусы" },
  { value: "no_manager_answer", label: "Клиент не получил ответа" },
  { value: "attention", label: "Обратите внимание" },
  { value: "normal", label: "Нормальный диалог" },
  { value: "client_silent", label: "Клиент не отвечает" },
];

const STATUS_META = {
  no_manager_answer: {
    label: "Клиент не получил ответа",
    className: "dialog-status dialog-status--danger",
  },
  attention: {
    label: "Обратите внимание",
    className: "dialog-status dialog-status--warning",
  },
  normal: {
    label: "Нормальный диалог",
    className: "dialog-status dialog-status--ok",
  },
  client_silent: {
    label: "Клиент не отвечает",
    className: "dialog-status dialog-status--neutral",
  },
};

function getManagerName(id) {
  if (id === undefined || id === null || id === "") return "Менеджер не указан";
  return `Менеджер #${id}`;
}

function formatTableDate(value) {
  const ts = Date.parse(value || "");
  if (!Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getDialogueStatus(row) {
  const outcome = String(row?.outcome_status || "").toLowerCase();
  const summary = String(row?.summary || "").toLowerCase();
  const noNextStep = !isTrueLike(row?.manager_agreed_next_step);

  if (
    outcome === "awaiting_response" &&
    (summary.includes("клиент не ответил") || summary.includes("нет ответа") || summary.includes("диалог прервался"))
  ) {
    return "client_silent";
  }

  if (
    outcome === "awaiting_response" ||
    (noNextStep && summary.includes("ждёт ответа")) ||
    (noNextStep && summary.includes("обещал"))
  ) {
    return "no_manager_answer";
  }

  if (
    outcome === "not_interested" ||
    row?.fragmented_or_unclear ||
    row?.short_or_low_content ||
    !isTrueLike(row?.need_identified) ||
    !isTrueLike(row?.manager_asked_questions)
  ) {
    return "attention";
  }

  return "normal";
}

function buildAiAnalysis(row) {
  const parts = [];
  const summary = String(row?.summary || "").trim();
  const request = String(row?.client_request || "").trim();
  const topic = String(row?.primary_topic || "").trim();

  if (summary) parts.push(summary);
  if (request) parts.push(`Запрос клиента: ${request}.`);
  if (topic) parts.push(`Тема: ${topic}.`);

  const needs = isTrueLike(row?.need_identified)
    ? "Потребность выявлена."
    : "Потребность не раскрыта или зафиксирована слабо.";
  const objections = row?.outcome_status === "not_interested"
    ? "Есть признак возражения или отказа, нужен повторный контакт с конкретным аргументом."
    : "Критичных возражений в данных не выделено.";
  const nextStep = isTrueLike(row?.manager_agreed_next_step)
    ? "Следующий шаг зафиксирован."
    : "Следующий шаг не закреплен, диалог может потеряться.";
  const conflict = row?.fragmented_or_unclear || row?.short_or_low_content
    ? "Диалог выглядит неполным: возможна потеря контекста или слабая коммуникация."
    : "Признаков конфликта в переписке не видно.";

  parts.push(`${needs} ${objections} ${nextStep} ${conflict}`);
  return parts.join(" ");
}

function getDealHref(row) {
  return (
    row?.deal_url ||
    row?.crm_url ||
    row?.source?.deal_url ||
    row?.feature?.source?.deal_url ||
    ""
  );
}

function buildRows(interactions) {
  return sortRowsByDateDesc(
    ensureArray(interactions)
      .filter((row) => String(row?.channel || "").toLowerCase() === "whatsapp")
      .map((row) => ({
        ...row,
        dialogue_status: getDialogueStatus(row),
        ai_analysis: buildAiAnalysis(row),
        deal_href: getDealHref(row),
      }))
  );
}

function buildManagers(rows) {
  return [
    ...new Map(
      rows.map((row) => [
        String(row.manager_id || ""),
        {
          id: String(row.manager_id || ""),
          name: getManagerName(row.manager_id),
        },
      ])
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.attention;
  return <span className={meta.className}>{meta.label}</span>;
}

function AnalysisCell({ text, rowId, expanded, onToggle }) {
  return (
    <div className="dialog-analysis-cell">
      <p className={expanded ? "dialog-analysis-cell__text expanded" : "dialog-analysis-cell__text"}>
        {text}
      </p>
      <button type="button" onClick={() => onToggle(rowId)}>
        {expanded ? "Свернуть" : "Развернуть"}
      </button>
    </div>
  );
}

export default function WhatsAppScreen() {
  const navigate = useNavigate();
  const { interactions, setSelectedId } = useStore();
  const [managerFilter, setManagerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedRows, setExpandedRows] = useState(() => new Set());

  const rows = useMemo(() => buildRows(interactions), [interactions]);
  const managers = useMemo(() => buildManagers(rows), [rows]);
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (managerFilter !== "all" && String(row.manager_id || "") !== managerFilter) return false;
      if (statusFilter !== "all" && row.dialogue_status !== statusFilter) return false;
      return true;
    });
  }, [rows, managerFilter, statusFilter]);

  const statusCounts = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc[row.dialogue_status] = (acc[row.dialogue_status] || 0) + 1;
      return acc;
    }, {});
  }, [rows]);

  const toggleRow = (rowId) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const openChat = (row) => {
    setSelectedId(row.interaction_id);
    navigate("/explorer");
  };

  return (
    <div className="dialog-page">
      <section className="dialog-toolbar">
        <div className="dialog-toolbar__copy">
          <span>AI-анализ переписок</span>
          <strong>{filteredRows.length} из {rows.length} диалогов</strong>
        </div>
        <div className="dialog-filters">
          <label>
            <span>Ответственный менеджер</span>
            <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
              <option value="all">Все менеджеры</option>
              {managers.map((manager) => (
                <option key={manager.id || "unknown"} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Статус диалога</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="dialog-status-strip">
        {STATUS_FILTERS.filter((item) => item.value !== "all").map((item) => (
          <button
            type="button"
            key={item.value}
            className={statusFilter === item.value ? "active" : ""}
            onClick={() => setStatusFilter(statusFilter === item.value ? "all" : item.value)}
          >
            <StatusBadge status={item.value} />
            <span>{statusCounts[item.value] || 0}</span>
          </button>
        ))}
      </section>

      <section className="dialog-table-card">
        <div className="dialog-table-card__head">
          <div>
            <span>Свежие сверху</span>
            <strong>Хронология AI-вердиктов</strong>
          </div>
          <button
            type="button"
            onClick={() => {
              setManagerFilter("all");
              setStatusFilter("all");
            }}
          >
            Сбросить фильтры
          </button>
        </div>

        <div className="dialog-table-wrap">
          <table className="dialog-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Менеджер</th>
                <th>Статус</th>
                <th>AI-Анализ</th>
                <th>Ссылки</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const rowId = row.interaction_id || `${row.created_at}-${row.manager_id}`;
                return (
                  <tr key={rowId}>
                    <td className="dialog-table__date">
                      <time dateTime={row.created_at || ""}>{formatTableDate(row.created_at)}</time>
                      <small>{formatDate(row.created_at)}</small>
                    </td>
                    <td className="dialog-table__manager">{getManagerName(row.manager_id)}</td>
                    <td><StatusBadge status={row.dialogue_status} /></td>
                    <td>
                      <AnalysisCell
                        text={row.ai_analysis}
                        rowId={rowId}
                        expanded={expandedRows.has(rowId)}
                        onToggle={toggleRow}
                      />
                    </td>
                    <td>
                      <div className="dialog-links">
                        {row.deal_href ? (
                          <a href={row.deal_href} target="_blank" rel="noreferrer">
                            <span className="material-symbols-outlined">open_in_new</span>
                            Сделка
                          </a>
                        ) : (
                          <button type="button" disabled>
                            <span className="material-symbols-outlined">open_in_new</span>
                            Сделка
                          </button>
                        )}
                        <button type="button" onClick={() => openChat(row)}>
                          <span className="material-symbols-outlined">forum</span>
                          Чат
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredRows.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="dialog-empty">
                      Нет переписок под выбранные фильтры.
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
