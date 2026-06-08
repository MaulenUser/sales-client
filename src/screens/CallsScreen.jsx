import React, { useMemo, useState } from "react";
import useStore from "../store/index.js";
import { formatDate } from "../utils/format.js";
import {
  ensureArray,
  isTrueLike,
  normalizeRepoPath,
  sortRowsByDateDesc,
} from "../utils/index.js";

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

function getManagerName(rowOrId) {
  const isRow = rowOrId && typeof rowOrId === "object";
  const name = isRow ? String(rowOrId.manager_name || rowOrId.source?.manager_name || "").trim() : "";
  if (name) return name;
  const id = isRow ? rowOrId.manager_id : rowOrId;
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

function getCallStatus(row) {
  const outcome = String(row?.outcome_status || "").toLowerCase();
  const summary = String(row?.summary || "").toLowerCase();
  const request = String(row?.client_request || "").toLowerCase();
  const noNextStep = !isTrueLike(row?.manager_agreed_next_step);
  const clientSilent =
    outcome === "no_answer" ||
    summary.includes("клиент не ответил") ||
    summary.includes("нет ответа") ||
    summary.includes("не дозвони") ||
    summary.includes("не отвечает") ||
    request.includes("не ответил");

  if (clientSilent) return "client_silent";

  const needsManagerFollowUp =
    outcome === "awaiting_response" ||
    outcome === "callback_requested" ||
    outcome === "follow_up" ||
    summary.includes("перезвон") ||
    summary.includes("обещал") ||
    summary.includes("ждёт") ||
    summary.includes("ждет");

  if (noNextStep && needsManagerFollowUp) return "no_manager_answer";

  if (
    outcome === "not_interested" ||
    isTrueLike(row?.fragmented_or_unclear) ||
    isTrueLike(row?.short_or_low_content) ||
    isTrueLike(row?.non_sales_interaction) ||
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
  if (topic) parts.push(`Тема звонка: ${topic}.`);

  const contact = isTrueLike(row?.manager_introduced_self)
    ? "Контакт открыт корректно: менеджер представился."
    : "В начале звонка не видно уверенного представления менеджера.";
  const questions = isTrueLike(row?.manager_asked_questions)
    ? "Менеджер задавал вопросы и собирал контекст."
    : "Квалифицирующих вопросов мало, потребность раскрыта слабо.";
  const needs = isTrueLike(row?.need_identified)
    ? "Потребность клиента зафиксирована."
    : "Потребность клиента не подтверждена или описана поверхностно.";
  const objections = String(row?.outcome_status || "").toLowerCase() === "not_interested"
    ? "Есть признак возражения или отказа, нужен точный повторный аргумент."
    : "Критичных возражений по звонку не выделено.";
  const nextStep = isTrueLike(row?.manager_agreed_next_step)
    ? "Следующий шаг согласован."
    : "Следующий шаг не закреплен: сделка может зависнуть без контроля.";
  const quality = isTrueLike(row?.fragmented_or_unclear) || isTrueLike(row?.short_or_low_content)
    ? "Запись выглядит короткой или фрагментированной, вывод AI стоит проверить вручную."
    : "Признаков конфликта или потери контекста в разговоре не видно.";

  parts.push(`${contact} ${questions} ${needs} ${objections} ${nextStep} ${quality}`);
  return parts.join(" ");
}

function getDealHref(row) {
  return (
    row?.deal_url ||
    row?.crm_url ||
    row?.source?.deal_url ||
    row?.source?.crm_url ||
    row?.feature?.source?.deal_url ||
    row?.feature?.source?.crm_url ||
    ""
  );
}

function getRecordingHref(row) {
  const direct =
    row?.recording_url ||
    row?.record_url ||
    row?.audio_url ||
    row?.call_record_url ||
    row?.source?.recording_url ||
    row?.source?.record_url ||
    row?.source?.audio_url ||
    row?.feature?.source?.recording_url ||
    row?.feature?.source?.record_url ||
    row?.feature?.source?.audio_url ||
    "";

  if (direct) {
    const raw = String(direct);
    if (/^(https?:|data:|blob:|\.{1,2}\/|\/)/i.test(raw)) return raw;
    return normalizeRepoPath(raw);
  }

  const transcriptPath =
    row?.transcript_file_path ||
    row?.source?.transcript_file_path ||
    row?.feature?.source?.transcript_file_path ||
    "";

  if (!transcriptPath) return "";

  return normalizeRepoPath(transcriptPath)
    .replace("/transcripts/text/", "/recordings/")
    .replace(/\.txt$/i, ".mp3");
}

function buildRows(interactions) {
  return sortRowsByDateDesc(
    ensureArray(interactions)
      .filter((row) => String(row?.channel || "").toLowerCase() === "call")
      .map((row, index) => ({
        ...row,
        dialogue_row_id: row?.interaction_id || row?.id || `${row?.created_at || "call"}-${row?.manager_id || "unknown"}-${index}`,
        dialogue_status: getCallStatus(row),
        ai_analysis: buildAiAnalysis(row),
        deal_href: getDealHref(row),
        recording_href: getRecordingHref(row),
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
          name: getManagerName(row),
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

export default function CallsScreen() {
  const { interactions } = useStore();
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

  return (
    <div className="dialog-page">
      <section className="dialog-toolbar">
        <div className="dialog-toolbar__copy">
          <span>AI-анализ звонков</span>
          <strong>{filteredRows.length} из {rows.length} звонков</strong>
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
            <span>Статус звонка</span>
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
            <strong>Хронология AI-вердиктов по звонкам</strong>
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
                <th>Ссылка на сделку</th>
                <th>Запись звонка</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const rowId = row.dialogue_row_id;
                return (
                  <tr key={rowId}>
                    <td className="dialog-table__date">
                      <time dateTime={row.created_at || ""}>{formatTableDate(row.created_at)}</time>
                      <small>{formatDate(row.created_at)}</small>
                    </td>
                    <td className="dialog-table__manager">{getManagerName(row)}</td>
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
                      </div>
                    </td>
                    <td>
                      <div className="dialog-links">
                        {row.recording_href ? (
                          <a href={row.recording_href} target="_blank" rel="noreferrer">
                            <span className="material-symbols-outlined">call</span>
                            Запись
                          </a>
                        ) : (
                          <button type="button" disabled>
                            <span className="material-symbols-outlined">call</span>
                            Запись
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredRows.length && (
                <tr>
                  <td colSpan={6}>
                    <div className="dialog-empty">
                      Нет звонков под выбранные фильтры.
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
