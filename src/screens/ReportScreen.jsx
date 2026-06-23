import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import { postJson } from "../api/index.js";
import {
  ensureArray,
  isTrueLike,
  clampRate,
} from "../utils/index.js";
import {
  formatNumber,
  formatPercent,
  formatMoney,
  formatMinutes,
} from "../utils/format.js";
import MiniCard from "../components/shared/MiniCard.jsx";

function getManagerName(id) {
  const s = String(id || "").trim();
  if (!s) return "Менеджер не указан";
  return `Менеджер #${s}`;
}

function getWeakestStageLabel(stageMetrics) {
  const stages = ensureArray(stageMetrics?.stages).filter(Boolean);
  if (!stages.length) return "Нет данных";
  const weakest =
    [...stages].sort(
      (a, b) => Number(a?.yes_rate || 0) - Number(b?.yes_rate || 0)
    )[0] || {};
  return `${weakest.label || "Нет данных"} (${formatPercent(weakest.yes_rate || 0)})`;
}

const GENERATED_SALES_ERRORS = [
  {
    title: "Долгая обработка нового лида",
    detail: "Менеджер отвечает слишком поздно, и клиент успевает остыть или уйти к конкуренту.",
    recommendation: "Поставить контроль первого ответа и отдельный SLA для новых лидов.",
  },
  {
    title: "Не выявлена потребность",
    detail: "В диалоге нет уточняющих вопросов о задаче, бюджете, сроках или критериях выбора.",
    recommendation: "Добавить обязательный блок квалифицирующих вопросов в скрипт.",
  },
  {
    title: "Не зафиксирован следующий шаг",
    detail: "Разговор заканчивается без конкретной договоренности, даты или ответственного действия.",
    recommendation: "Закрывать каждый целевой контакт следующим шагом и задачей в CRM.",
  },
  {
    title: "Нет работы с возражениями",
    detail: "Менеджер принимает отказ без уточнения причины и без альтернативного предложения.",
    recommendation: "Собрать типовые возражения и проверять реакцию менеджера в диалогах.",
  },
  {
    title: "Сделка остается без задачи",
    detail: "В CRM нет активной задачи, хотя клиент еще не отказался и сделка требует follow-up.",
    recommendation: "Подсвечивать сделки без задач и включить их в ежедневный контроль.",
  },
  {
    title: "Сделка провалена без явного отказа",
    detail: "Клиент сказал, что подумает или вернется позже, но менеджер закрыл сделку как проигранную.",
    recommendation: "Проверять текст отказа перед закрытием сделки и возвращать такие заявки в follow-up.",
  },
  {
    title: "Не отправлены обещанные материалы",
    detail: "Менеджер обещает КП, презентацию или расчет, но в данных нет подтверждения отправки.",
    recommendation: "Проверять обещания в диалоге и сверять их с последующими действиями.",
  },
  {
    title: "Не указана причина отказа",
    detail: "Проваленная сделка закрыта без понятной причины, поэтому отдел не видит повторяющийся риск.",
    recommendation: "Сделать причину отказа обязательной и сравнивать ее с текстом общения.",
  },
  {
    title: "Слабый дожим теплой сделки",
    detail: "Клиент проявил интерес, но менеджер не вернулся вовремя и не предложил следующий шаг.",
    recommendation: "Собрать теплые сделки без активности в отдельный список для возврата.",
  },
  {
    title: "Мало персонализации",
    detail: "Ответ выглядит шаблонным и не опирается на контекст клиента или его запрос.",
    recommendation: "Проверять, использует ли менеджер вводные клиента в ответе и предложении.",
  },
  {
    title: "Нет резюме договоренностей",
    detail: "После разговора не фиксируются условия, ожидания клиента и ближайшее действие.",
    recommendation: "Добавить короткое резюме после ключевых разговоров и встреч.",
  },
];

function getInsightTitle(item, index) {
  return (
    item?.title ||
    item?.label ||
    item?.name ||
    item?.problem ||
    item?.growth_point ||
    `Пункт ${index + 1}`
  );
}

function getInsightDetail(item) {
  return (
    item?.detail ||
    item?.description ||
    item?.reason ||
    item?.summary ||
    item?.why ||
    "Описание пока не добавлено."
  );
}

function collectInsightItems(sourceItems, generatedItems, limit = 10) {
  const seen = new Set();
  const result = [];
  [...ensureArray(sourceItems), ...ensureArray(generatedItems)].forEach((item, index) => {
    if (!item || result.length >= limit) return;
    const title = getInsightTitle(item, index).trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) return;
    seen.add(key);
    result.push({ ...item, title });
  });
  return result;
}

function getResponseSpeedStatus(minutes) {
  const value = Number(minutes || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return { label: "Нет данных", tone: "neutral", caption: "Недостаточно замеров" };
  }
  if (value <= 5) {
    return { label: "Зеленая зона", tone: "green", caption: "Норма 3-5 минут" };
  }
  if (value <= 60) {
    return { label: "Желтая зона", tone: "yellow", caption: "Нужен контроль" };
  }
  return { label: "Красная зона", tone: "red", caption: "Критично долго" };
}

function TrafficStatusBadge({ status, compact = false }) {
  const tones = {
    green: "border-primary/30 bg-primary/10 text-primary",
    yellow: "border-chart-4/30 bg-chart-4/10 text-chart-4",
    red: "border-destructive/30 bg-destructive/10 text-destructive",
    neutral: "border-border bg-muted/20 text-muted-foreground",
  };
  const dots = {
    green: "bg-primary",
    yellow: "bg-chart-4",
    red: "bg-destructive",
    neutral: "bg-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[9px] font-semibold uppercase tracking-widest ${
        tones[status?.tone] || tones.neutral
      } ${compact ? "whitespace-nowrap" : ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dots[status?.tone] || dots.neutral}`} />
      {status?.label || "Нет данных"}
    </span>
  );
}

const FAILED_DEAL_REASON_TYPES = {
  non_target: {
    label: "Лид не целевой",
    detail: "Сам лид был не целевой.",
    tone: "neutral",
  },
  price_conditions: {
    label: "Дорого / условия",
    detail: "Клиент слился, потому что дорого или не устроили условия.",
    tone: "yellow",
  },
  manager_closed_interest: {
    label: "Интерес сохраняется",
    detail: "Клиент не дал отказа, но менеджер почему-то провалил сделку.",
    tone: "red",
  },
  unknown: {
    label: "Нужна проверка",
    detail: "AI не смог однозначно отнести сделку к одной из трех причин.",
    tone: "neutral",
  },
};

const FAILED_DEAL_REASON_FILTERS = [
  { value: "all", label: "Все типы" },
  { value: "non_target", label: "Лид не целевой" },
  { value: "price_conditions", label: "Дорого / условия" },
  { value: "manager_closed_interest", label: "Интерес сохраняется" },
  { value: "unknown", label: "Нужна проверка" },
];

function normalizeFailedDealReasonType(item) {
  const explicit = String(
    item?.failure_category ||
      item?.failure_reason_type ||
      item?.reason_type ||
      item?.reason_bucket ||
      item?.category ||
      ""
  ).toLowerCase();

  if (/(non.?target|not.?target|irrelevant|не.?целев|нецелев|не профиль|не подходит|спам|дубл)/i.test(explicit)) {
    return "non_target";
  }
  if (/(price|condition|expensive|budget|дорог|цен|услов|бюджет|скид|оплат|рассроч)/i.test(explicit)) {
    return "price_conditions";
  }
  if (/(manager|interest|no.?reject|reanimation|follow|интерес|нет отказ|не дал отказ|без отказ|дожим|реанимац)/i.test(explicit)) {
    return "manager_closed_interest";
  }

  const text = [
    item?.reason,
    item?.failure_reason,
    item?.failure_comment,
    item?.comment,
    item?.summary,
    item?.priority,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/(не\s*целев|нецелев|не профиль|не подходит|спам|дубл|ошибочн|не наша)/i.test(text)) {
    return "non_target";
  }
  if (/(дорог|цена|цене|стоимост|услов|бюджет|скид|оплат|рассроч|доставк|срок)/i.test(text)) {
    return "price_conditions";
  }
  if (/(интерес|не дал отказ|нет отказ|без отказ|не отказал|сохраня|подума|верн[её]т|дожим|follow|фоллоу|менеджер|следующ|не назнач)/i.test(text)) {
    return "manager_closed_interest";
  }

  return "unknown";
}

function getRecoveryManagerKey(item) {
  return String(item?.manager_id || item?.manager_label || "unknown");
}

function getRecoveryManagerLabel(item) {
  return item?.manager_label || getManagerName(item?.manager_id);
}

function FailedDealReasonBadge({ item }) {
  const type = FAILED_DEAL_REASON_TYPES[normalizeFailedDealReasonType(item)] || FAILED_DEAL_REASON_TYPES.unknown;
  const tones = {
    red: "border-destructive/30 bg-destructive/10 text-destructive",
    yellow: "border-chart-4/30 bg-chart-4/10 text-chart-4",
    neutral: "border-border bg-muted/20 text-muted-foreground",
  };
  return (
    <div className="flex max-w-[360px] flex-col gap-2">
      <span className={`w-fit rounded border px-2 py-1 text-[9px] font-semibold uppercase tracking-widest ${tones[type.tone] || tones.neutral}`}>
        {type.label}
      </span>
      <span className="text-sm font-semibold leading-6 text-foreground">
        {type.detail}
      </span>
      {item?.reason ? (
        <span className="text-[11px] leading-5 text-muted-foreground">
          Сигналы: {item.reason}
        </span>
      ) : null}
    </div>
  );
}

function FailedDealReasonFilterBadge({ type }) {
  const meta = FAILED_DEAL_REASON_TYPES[type] || FAILED_DEAL_REASON_TYPES.unknown;
  const className = {
    non_target: "dialog-status dialog-status--neutral",
    price_conditions: "dialog-status dialog-status--warning",
    manager_closed_interest: "dialog-status dialog-status--danger",
    unknown: "dialog-status dialog-status--neutral",
  }[type] || "dialog-status dialog-status--neutral";

  return <span className={className}>{meta.label}</span>;
}

function inlineMarkdown(v) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /`(.+?)`/g,
      '<code class="px-1.5 py-0.5 rounded bg-foreground/10 text-primary">$1</code>'
    );
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "")
    .replace(/\r/g, "")
    .split("\n");
  const html = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      return;
    }
    if (/^###\s+/.test(trimmed)) {
      closeList();
      html.push(
        `<h3 class="text-lg font-headline font-bold text-foreground mt-6 mb-3">${inlineMarkdown(trimmed.replace(/^###\s+/, ""))}</h3>`
      );
      return;
    }
    if (/^##\s+/.test(trimmed)) {
      closeList();
      html.push(
        `<h2 class="text-2xl font-headline font-bold text-foreground mt-8 mb-4">${inlineMarkdown(trimmed.replace(/^##\s+/, ""))}</h2>`
      );
      return;
    }
    if (/^#\s+/.test(trimmed)) {
      closeList();
      html.push(
        `<h1 class="text-3xl font-headline font-bold text-foreground mt-8 mb-4">${inlineMarkdown(trimmed.replace(/^#\s+/, ""))}</h1>`
      );
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        html.push(
          '<ul class="space-y-2 ml-5 list-disc text-sm text-foreground">'
        );
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      return;
    }
    closeList();
    html.push(
      `<p class="text-sm text-foreground leading-7">${inlineMarkdown(trimmed)}</p>`
    );
  });
  closeList();
  return html.join("");
}

function InlineTable({ columns, rows, emptyText = "Нет данных для отображения.", compact = false }) {
  const items = ensureArray(rows);
  if (!items.length) {
    return <div className="text-xs text-muted-foreground">{emptyText}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className={`${compact ? "w-auto min-w-[760px]" : "min-w-full"} text-xs border-collapse`}>
        <thead>
          <tr>
            {columns.map((col, index) => (
              <th
                key={col.key || (typeof col.label === "string" ? col.label : index)}
                className={`px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border ${col.align === "right" ? "text-right" : ""} ${col.className || ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-b-0">
              {columns.map((col, index) => (
                <td
                  key={col.key || (typeof col.label === "string" ? col.label : index)}
                  className={`px-3 py-2 align-top ${col.align === "right" ? "text-right" : ""} ${col.className || ""}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriorityCards({ items, emptyText, tone = "red", compact = false }) {
  const rows = ensureArray(items).filter(Boolean);
  if (!rows.length) {
    return <div className="text-xs text-muted-foreground">{emptyText}</div>;
  }
  const accent = {
    red: "border-destructive/30 bg-destructive/5",
    green: "border-primary/30 bg-primary/5",
    yellow: "border-chart-4/30 bg-chart-4/5",
  };
  return (
    <div className={`grid grid-cols-1 ${compact ? "gap-2" : "gap-3"}`}>
      {rows.map((item, index) => (
        <article
          key={index}
          className={`rounded border ${accent[tone] || accent.red} ${compact ? "p-3" : "p-4"}`}
        >
          <div className={`flex items-center justify-between gap-3 ${compact ? "mb-1" : "mb-2"}`}>
            <strong className="text-sm text-foreground">
              {item.title || `Пункт ${index + 1}`}
            </strong>
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
              Топ {index + 1}
            </span>
          </div>
          <p className={`text-xs text-muted-foreground ${compact ? "leading-5" : "leading-6"}`}>
            {item.detail || "Нет описания"}
          </p>
        </article>
      ))}
    </div>
  );
}

function StageComplianceBars({ stages }) {
  const rows = ensureArray(stages).filter(Boolean);
  if (!rows.length) {
    return (
      <div className="text-xs text-muted-foreground">
        Нет данных по этапам.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded border border-border bg-muted/20">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              Этап
            </th>
            <th className="px-2 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              Да
            </th>
            <th className="px-2 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              Нет
            </th>
            <th className="px-2 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              ?
            </th>
            <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              Прогресс
            </th>
            <th className="px-2 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((stage, i) => {
            const r = clampRate(stage?.yes_rate || 0);
            const colorClass =
              r >= 80
                ? "bg-primary"
                : r >= 60
                ? "bg-chart-4"
                : r > 0
                ? "bg-destructive"
                : "bg-foreground/20";
            return (
              <tr key={i} className="border-b border-border/60 last:border-b-0">
                <td className="px-3 py-2 whitespace-nowrap text-foreground font-medium">
                  {stage.label || "Этап"}
                </td>
                <td className="px-2 py-2 text-right text-foreground">
                  {formatNumber(stage.yes_count || 0)}
                </td>
                <td className="px-2 py-2 text-right text-muted-foreground">
                  {formatNumber(stage.no_count || 0)}
                </td>
                <td className="px-2 py-2 text-right text-muted-foreground">
                  {formatNumber(stage.unknown_count || 0)}
                </td>
                <td className="px-3 py-2">
                  <div className="w-48 h-2 rounded-full bg-foreground/10 overflow-hidden">
                    <div className={`h-full ${colorClass}`} style={{ width: `${r}%` }} />
                  </div>
                </td>
                <td className="px-2 py-2 text-right text-foreground font-semibold">
                  {Number(r || 0).toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActionGuide({ items }) {
  const rows = ensureArray(items).filter(Boolean);
  if (!rows.length) {
    return (
      <div className="text-xs text-muted-foreground">Нет рекомендаций.</div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((item, index) => (
        <article
          key={index}
          className="flex flex-col gap-2 rounded border border-border bg-muted/30 p-4 @2xl:flex-row @2xl:gap-5"
        >
          <div className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-primary @2xl:w-32">
            Рекомендация {index + 1}
          </div>
          <p className="min-w-0 text-sm leading-6 text-foreground">{item}</p>
        </article>
      ))}
    </div>
  );
}

function FeedbackForm({ source = "report" }) {
  const { appState, getActiveRun } = useStore();
  const activeRun = getActiveRun();
  const [form, setForm] = useState({
    type: "improvement",
    contact: "",
    message: "",
  });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const options = [
    { value: "liked", label: "Полезно" },
    { value: "inaccuracy", label: "Неточно" },
    { value: "improvement", label: "Добавить" },
    { value: "service", label: "Сервис" },
  ];

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const message = form.message.trim();
    if (message.length < 8) {
      setError("Напишите чуть подробнее, чтобы команда поняла контекст.");
      return;
    }

    setStatus("submitting");
    setError("");
    try {
      await postJson(
        "/api/feedback",
        {
          source,
          type: form.type,
          contact: form.contact.trim(),
          message,
          report_run_id: activeRun?.id || null,
          report_title: activeRun?.title || appState?.latest_run?.title || "",
          page: "report",
          created_at: new Date().toISOString(),
        },
        appState,
      );
      setStatus("sent");
      setForm((prev) => ({ ...prev, message: "" }));
    } catch (err) {
      setStatus("idle");
      setError(err?.message || "Не удалось отправить обратную связь.");
    }
  };

  return (
    <section className="rounded border border-border bg-card p-4">
      <div className="rounded border border-primary/20 bg-primary/[0.035] p-4 sm:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 xl:max-w-[420px]">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="text-[10px] uppercase tracking-widest text-primary">
                Обратная связь
              </div>
              <div className="h-1 w-1 rounded-full bg-border" />
              <div className="max-w-full truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                {activeRun?.title || "Текущий отчет"}
              </div>
            </div>
            <h3 className="text-lg font-headline font-bold text-foreground mb-2">
              Что уточнить в отчете?
            </h3>
            <p className="text-sm text-muted-foreground leading-6">
              Отметьте неточность, идею для доработки или просто оставьте
              комментарий по сервису.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="w-full xl:max-w-[760px] rounded border border-border bg-card/80 p-3 sm:p-4"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded border border-border bg-muted/20 p-1">
              {options.map((option) => {
                const active = form.type === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`min-h-9 rounded px-2.5 text-[10px] font-semibold uppercase tracking-widest transition-colors active:scale-[0.98] ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                    }`}
                    onClick={() => updateField("type", option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-3">
              <label className="block">
                <span className="sr-only">Комментарий</span>
                <textarea
                  value={form.message}
                  onChange={(event) => updateField("message", event.target.value)}
                  rows={3}
                  className="min-h-[108px] w-full resize-y rounded border border-border bg-input px-3 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
                  placeholder="Что было неточно, что понравилось или чего не хватило?"
                />
              </label>

              <div className="flex flex-col gap-3">
                <label className="block">
                  <span className="sr-only">Контакт для ответа</span>
                  <input
                    value={form.contact}
                    onChange={(event) => updateField("contact", event.target.value)}
                    className="w-full rounded border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
                    placeholder="Контакт, необязательно"
                  />
                </label>
                {(error || status === "sent") && (
                  <div
                    className={`min-h-[38px] rounded border px-3 py-2 text-xs leading-5 ${
                      error
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-primary/30 bg-primary/10 text-primary"
                    }`}
                  >
                    {error || "Спасибо, комментарий отправлен."}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                Ответим, если оставите контакт.
              </div>
              <button
                type="submit"
                disabled={status === "submitting"}
                className="cta-button min-h-[40px] w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "submitting" ? "Отправляем" : "Отправить"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

function InsightListModal({ title, subtitle, items, tone = "red", onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const rows = ensureArray(items).filter(Boolean);
  const toneClasses = {
    red: {
      badge: "border-destructive/30 bg-destructive/10 text-destructive",
      index: "text-destructive",
    },
    green: {
      badge: "border-primary/30 bg-primary/10 text-primary",
      index: "text-primary",
    },
  };
  const selectedTone = toneClasses[tone] || toneClasses.red;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        aria-label="Закрыть окно"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded border border-border bg-card shadow-2xl shadow-background/70">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className={`mb-2 inline-flex rounded border px-2 py-1 text-[9px] font-semibold uppercase tracking-widest ${selectedTone.badge}`}>
              {formatNumber(rows.length)} пунктов
            </div>
            <h3 className="text-xl font-headline font-bold text-foreground">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            className="rounded border border-border bg-muted/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-[0.98]"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>

        <div className="custom-scrollbar overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3">
            {rows.map((item, index) => (
              <article
                key={`${getInsightTitle(item, index)}-${index}`}
                className="rounded border border-border bg-muted/20 p-4"
              >
                <div className="mb-2 flex items-start gap-3">
                  <div className={`pt-0.5 font-mono text-[10px] font-bold ${selectedTone.index}`}>
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">
                      {getInsightTitle(item, index)}
                    </h4>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      {getInsightDetail(item)}
                    </p>
                  </div>
                </div>
                {(item.recommendation || item.action || item.next_step || item.effect) && (
                  <div className="mt-3 rounded border border-border/70 bg-card/60 px-3 py-2 text-xs leading-6 text-foreground">
                    {item.recommendation || item.action || item.next_step || item.effect}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function resolveDealUrl(item) {
  const direct =
    item?.deal_url ||
    item?.bitrix_url ||
    item?.deal_link ||
    item?.crm_url ||
    item?.url ||
    "";
  if (String(direct || "").trim()) return String(direct).trim();
  const dealId = String(item?.deal_id || "").trim();
  const portal =
    String(item?.bitrix_portal || item?.portal_domain || "").trim() || "";
  if (!dealId || !portal) return "";
  const host = portal.startsWith("http") ? portal : `https://${portal}`;
  return `${host.replace(/\/+$/, "")}/crm/deal/details/${dealId}/`;
}

function getDealLinkLabel(item) {
  if (String(item?.deal_title || "").trim()) return String(item.deal_title).trim();
  if (item?.deal_id) return `Сделка #${item.deal_id}`;
  return "Открыть сделку";
}

function collectStageColumns(departmentStageMetrics, managerRows) {
  const fromDepartment = ensureArray(departmentStageMetrics?.stages)
    .filter(Boolean)
    .map((stage) => ({
      key: String(stage?.code || stage?.label || "").trim(),
      label: stage?.label || "Этап",
    }))
    .filter((stage) => stage.key);
  if (fromDepartment.length) return fromDepartment;

  const seen = new Set();
  const fromManagers = [];
  ensureArray(managerRows).forEach((row) => {
    ensureArray(row?.stages).forEach((stage) => {
      const key = String(stage?.code || stage?.label || "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      fromManagers.push({ key, label: stage?.label || "Этап" });
    });
  });
  return fromManagers;
}

function StageComplianceManagerTable({ rows, stageColumns }) {
  const managers = ensureArray(rows).filter(Boolean);
  const columns = ensureArray(stageColumns).filter(Boolean);

  if (!managers.length || !columns.length) {
    return (
      <div className="text-xs text-muted-foreground">
        Нет данных по этапам менеджеров.
      </div>
    );
  }

  const pickStage = (managerRow, key) =>
    ensureArray(managerRow?.stages).find(
      (stage) => String(stage?.code || stage?.label || "").trim() === key
    );

  const getRateTone = (rate) => {
    if (rate >= 70) return "text-primary";
    if (rate >= 45) return "text-chart-4";
    return "text-destructive";
  };

  return (
    <div className="overflow-x-auto rounded border border-border bg-muted/20">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              Менеджер
            </th>
            <th className="px-3 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              Среднее
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-3 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {managers.map((row, index) => (
            <tr key={String(row.manager_id || row.manager_label || index)} className="border-b border-border/60 last:border-b-0">
              <td className="px-3 py-2 align-top">
                <ManagerCellButton row={row} />
              </td>
              <td className="px-3 py-2 text-right align-top">
                <span className={`font-semibold ${getRateTone(Number(row.average_rate || 0))}`}>
                  {formatPercent(row.average_rate || 0)}
                </span>
              </td>
              {columns.map((column) => {
                const stage = pickStage(row, column.key);
                const rate = Number(stage?.yes_rate || 0);
                return (
                  <td key={`${String(row.manager_id || row.manager_label)}-${column.key}`} className="px-3 py-2 text-right align-top">
                    <span className={`font-semibold ${getRateTone(rate)}`}>
                      {stage ? formatPercent(rate) : "—"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecoveryCandidates({ items }) {
  const rows = ensureArray(items).filter(Boolean);
  const [managerFilter, setManagerFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");

  const managers = useMemo(() => {
    const seen = new Set();
    return rows.reduce((acc, row) => {
      const id = getRecoveryManagerKey(row);
      if (seen.has(id)) return acc;
      seen.add(id);
      acc.push({ id, name: getRecoveryManagerLabel(row) });
      return acc;
    }, []);
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (managerFilter !== "all" && getRecoveryManagerKey(row) !== managerFilter) {
        return false;
      }
      if (reasonFilter !== "all" && normalizeFailedDealReasonType(row) !== reasonFilter) {
        return false;
      }
      return true;
    });
  }, [rows, managerFilter, reasonFilter]);

  const reasonCounts = useMemo(() => {
    return rows.reduce((acc, row) => {
      const key = normalizeFailedDealReasonType(row);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [rows]);

  if (!rows.length) {
    return (
      <div className="text-xs text-muted-foreground">
        Кандидаты на дожим не найдены.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <section className="dialog-toolbar">
        <div className="dialog-toolbar__copy">
          <span>AI-анализ проваленных сделок</span>
          <strong>{filteredRows.length} из {rows.length} сделок</strong>
        </div>
        <div className="dialog-filters">
          <label>
            <span>Ответственный менеджер</span>
            <select value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)}>
              <option value="all">Все менеджеры</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="min-h-[38px] rounded border border-border bg-muted/20 px-3 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground active:scale-[0.98]"
            onClick={() => {
              setManagerFilter("all");
              setReasonFilter("all");
            }}
          >
            Сбросить фильтры
          </button>
        </div>
      </section>

      <section className="dialog-status-strip">
        {FAILED_DEAL_REASON_FILTERS.filter((item) => item.value !== "all").map((item) => (
          <button
            type="button"
            key={item.value}
            className={reasonFilter === item.value ? "active" : ""}
            onClick={() => setReasonFilter(reasonFilter === item.value ? "all" : item.value)}
          >
            <FailedDealReasonFilterBadge type={item.value} />
            <span>{reasonCounts[item.value] || 0}</span>
          </button>
        ))}
      </section>

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[900px] table-fixed text-xs border-collapse">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[34%]" />
            <col className="w-[44%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border">
                Ссылка на сделку
              </th>
              <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border">
                Сделка провалена, потому что
              </th>
              <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border">
                Что делать
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((item, i) => {
              const dealUrl = resolveDealUrl(item);
              return (
                <tr key={`${item.deal_id || "deal"}-${i}`} className="border-b border-border/60 last:border-b-0">
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-col gap-1">
                      {dealUrl ? (
                        <a
                          href={dealUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-primary hover:text-primary/80 underline decoration-primary/50"
                        >
                          {getDealLinkLabel(item)}
                        </a>
                      ) : (
                        <span className="font-bold text-foreground">
                          {getDealLinkLabel(item)}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {getRecoveryManagerLabel(item)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <FailedDealReasonBadge item={item} />
                  </td>
                  <td className="px-3 py-3 align-top text-muted-foreground leading-6">
                    {item.comment || item.summary || "Нет комментария"}
                  </td>
                </tr>
              );
            })}
            {!filteredRows.length && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Нет проваленных сделок под выбранные фильтры.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ManagerCellButton({ row }) {
  const { setFilters } = useStore();
  const navigate = useNavigate();
  if (!row.manager_id) {
    return (
      <span className="font-bold text-foreground">
        {row.manager_label || "Менеджер"}
      </span>
    );
  }
  return (
    <button
      className="font-bold text-foreground hover:text-primary transition-colors text-left"
      type="button"
      onClick={() => {
        setFilters({ manager: String(row.manager_id) });
        navigate("/explorer");
      }}
    >
      {row.manager_label || getManagerName(row.manager_id)}
    </button>
  );
}

function ReportContent({ summary, markdown, actionGuideOnly = false, showActionGuide = true }) {
  const snapshot = summary?.report_snapshot || {};
  const [isActionGuideOpen, setIsActionGuideOpen] = useState(false);
  const [openInsightModal, setOpenInsightModal] = useState(null);
  const [lossReasonsView, setLossReasonsView] = useState("department");

  if (actionGuideOnly) {
    return (
      <div className="max-w-[1380px] w-full mx-auto">
        <section className="bg-card border border-border rounded p-4">
          <div className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">
            Руководство к действию
          </div>
          <ActionGuide items={snapshot.action_guide} />
        </section>
      </div>
    );
  }

  if (!Object.keys(snapshot).length) {
    return (
      <div className="flex flex-col gap-5 max-w-[1380px] w-full mx-auto">
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown || "") }}
        />
        <FeedbackForm source="report_markdown" />
      </div>
    );
  }

  const lossReasons = snapshot.loss_reasons || {};
  const failedDealAnalysis = snapshot.failed_deal_analysis || {};
  const missedRevenue = snapshot.missed_revenue || {};
  const dataQualityNotes = ensureArray(summary.data_quality_notes);
  const markdownBlock = String(markdown || "").trim();
  const showTechnicalBlocks = false;

  const departmentProblems = collectInsightItems(
    snapshot.department_problems ||
      snapshot.all_department_problems ||
      snapshot.problems ||
      snapshot.top_department_problems,
    GENERATED_SALES_ERRORS,
  );

  return (
    <div className="flex flex-col gap-5 max-w-[1380px] w-full mx-auto">
      {openInsightModal === "problems" && (
        <InsightListModal
          title="Все ошибки отдела продаж"
          subtitle="Полный чек-лист ошибок, которые стоит учитывать в аудите и разборе менеджеров."
          items={departmentProblems}
          tone="red"
          onClose={() => setOpenInsightModal(null)}
        />
      )}
      <section className="bg-card border border-border rounded p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Топ-3 проблемы отдела продаж
          </div>
          <button
            type="button"
            className="rounded border border-border bg-muted/20 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-destructive/40 hover:text-foreground active:scale-[0.98]"
            onClick={() => setOpenInsightModal("problems")}
          >
            Остальные ошибки
          </button>
        </div>
        <PriorityCards
          items={snapshot.top_department_problems}
          emptyText="Проблемы пока не выделены."
          tone="red"
          compact
        />
      </section>

      <section className="grid grid-cols-1 gap-5">
        <article className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Самые частые причины слива лидов
          </div>
          <p className="text-sm text-muted-foreground leading-7 mb-4">
            По отделу в проигрыш ушло{" "}
            <strong className="text-foreground">
              {formatNumber(lossReasons.department?.lost_deals || 0)}
            </strong>{" "}
            сделок. Причины ниже рассчитаны по{" "}
            <strong className="text-foreground">
              {formatNumber(lossReasons.department?.analyzed_failed_interactions || 0)}
            </strong>{" "}
            AI-разборам.
          </p>
          <div className="rounded border border-border bg-muted/10 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded border border-border bg-card p-1">
                {[
                  { value: "department", label: "По отделу" },
                  { value: "managers", label: "По менеджерам" },
                ].map((tab) => {
                  const isActive = lossReasonsView === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      className={`min-h-[32px] rounded px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                      onClick={() => setLossReasonsView(tab.value)}
                      aria-pressed={isActive}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {lossReasonsView === "department" ? (
              <>
              <div className="mb-3 text-[10px] uppercase tracking-widest text-primary">
                По отделу продаж
              </div>
              <InlineTable
                compact
                columns={[
                  {
                    key: "department_reason",
                    label: "Причина",
                    className: "min-w-[500px]",
                    render: (row) => (
                      <span className="text-foreground">{row.name || "Не указано"}</span>
                    ),
                  },
                  {
                    key: "department_count",
                    label: "Кол-во",
                    align: "right",
                    className: "w-32",
                    render: (row) => (
                      <span className="text-foreground">{formatNumber(row.count || 0)}</span>
                    ),
                  },
                  {
                    key: "department_rate",
                    label: "Доля",
                    align: "right",
                    className: "w-32",
                    render: (row) => (
                      <span className="text-foreground">{formatPercent(row.rate || 0)}</span>
                    ),
                  },
                ]}
                rows={lossReasons.department?.reasons_top}
                emptyText="Причины слива пока не определены."
              />
              </>
            ) : (
              <>
              <div className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                По менеджерам
              </div>
              <InlineTable
                columns={[
                  { label: "Менеджер", render: (row) => <ManagerCellButton row={row} /> },
                  {
                    label: "Провалено",
                    align: "right",
                    render: (row) => (
                      <span className="text-foreground">{formatNumber(row.lost_deals || 0)}</span>
                    ),
                  },
                  {
                    label: "AI-разборов",
                    align: "right",
                    render: (row) => (
                      <span className="text-muted-foreground">
                        {formatNumber(row.analyzed_failed_interactions || 0)}
                      </span>
                    ),
                  },
                  {
                    label: "Главная причина",
                    render: (row) => (
                      <span className="text-muted-foreground">
                        {(ensureArray(row.reasons_top)[0] || {}).name || "Нет AI-данных"}
                      </span>
                    ),
                  },
                ]}
                rows={lossReasons.by_manager}
                emptyText="Нет данных по менеджерам."
              />
              </>
            )}
          </div>
        </article>

        <article className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Анализ проваленных сделок
          </div>
          <p className="text-sm text-muted-foreground leading-7 mb-4">
            Ниже AI-классификация проваленных сделок: нецелевой лид, отказ из-за
            цены или условий, либо сделка без явного отказа, где интерес клиента
            сохранялся, но менеджер закрыл ее в провал.
          </p>
          <RecoveryCandidates items={failedDealAnalysis.recovery_candidates} />
        </article>
      </section>

      <section className="bg-card border border-border rounded p-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
          Упущенная выгода
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <MiniCard
            label="Проваленных сделок"
            value={formatNumber(missedRevenue.lost_deals || 0)}
            note="База расчета"
            tone="red"
          />
          <MiniCard
            label="Средняя конверсия"
            value={formatPercent(missedRevenue.average_conversion_rate || 0)}
            note="По закрытым сделкам"
            tone="green"
          />
          <MiniCard
            label="Средний чек"
            value={formatMoney(missedRevenue.average_ticket_kzt || 0)}
            note="Используется в формуле"
            tone="yellow"
          />
          <MiniCard
            label="Не заработано"
            value={formatMoney(
              missedRevenue.estimated_missed_revenue_kzt || 0
            )}
            note={
              missedRevenue.formula ||
              "Проигранные сделки × средняя конверсия × средний чек"
            }
            tone="violet"
          />
        </div>
        <p className="text-xs text-muted-foreground leading-6">
          {missedRevenue.formula ||
            "Проигранные сделки × средняя конверсия × средний чек"}
          .
        </p>
      </section>

      {showActionGuide && (
        <section className="bg-card border border-border rounded p-4">
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 text-left"
            onClick={() => setIsActionGuideOpen((prev) => !prev)}
          >
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Руководство к действию
            </div>
            <span className="text-[10px] uppercase tracking-widest text-primary font-bold">
              {isActionGuideOpen ? "Свернуть −" : "Развернуть +"}
            </span>
          </button>
          {isActionGuideOpen && (
            <div className="mt-3">
              <ActionGuide items={snapshot.action_guide} />
            </div>
          )}
        </section>
      )}

      <FeedbackForm source="report_snapshot" />

      {showTechnicalBlocks && dataQualityNotes.length > 0 && (
        <section className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            Примечания к данным
          </div>
          <div className="grid grid-cols-1 gap-3">
            {dataQualityNotes.map((item, i) => (
              <article
                key={i}
                className="rounded border border-border bg-muted/30 p-4"
              >
                <p className="text-xs text-muted-foreground leading-6">{item}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {showTechnicalBlocks && markdownBlock && (
        <section className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            Текстовая версия отчета
          </div>
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(markdownBlock) }}
          />
        </section>
      )}
    </div>
  );
}

function EvidenceCard({ title, rows, tone }) {
  const navigate = useNavigate();
  const { setSelectedId } = useStore();
  const TONES = {
    ok: "bg-primary/20 text-primary",
    neutral: "bg-chart-3/20 text-chart-3",
    warning: "bg-chart-4/20 text-chart-4",
    danger: "bg-destructive/20 text-destructive",
  };
  return (
    <article className="bg-card border border-border rounded p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-border">
        <strong className="text-[10px] font-bold uppercase tracking-widest text-foreground">
          {title}
        </strong>
        <span
          className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${TONES[tone]}`}
        >
          {formatNumber(rows.length)} примеров
        </span>
      </div>
      <div className="flex flex-col gap-4 flex-1">
        {rows.map((item) => (
          <div key={item.interaction_id} className="bg-muted/30 p-3 rounded">
            <div className="flex justify-between items-start gap-2 mb-2">
              <button
                className="text-xs font-bold text-foreground hover:text-primary text-left transition-colors truncate block flex-1"
                type="button"
                onClick={() => {
                  setSelectedId(item.interaction_id);
                  navigate("/explorer");
                }}
              >
                {item.primary_topic || "Без темы"}
              </button>
              <span className="px-1.5 py-0.5 text-[8px] bg-foreground/5 border border-border rounded uppercase font-bold text-muted-foreground">
                {item.channel}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3 mb-2">
              {item.summary || "Нет summary"}
            </p>
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider truncate">
              {getManagerName(item.manager_id)} | {item.outcome_status || "не указано"}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function isRealReportRun(run) {
  const id = String(run?.id || run?.run_id || "").trim();
  return Boolean(run && id && !id.startsWith("run-mock-"));
}

function EmptyReportState() {
  const navigate = useNavigate();

  return (
    <section className="max-w-[1380px] w-full mx-auto">
      <div className="rounded border border-border bg-card p-8">
        <div className="max-w-2xl">
          <div className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
            Итоговый отчет
          </div>
          <h2 className="text-2xl font-headline font-bold text-foreground">
            Отчет пока не создан
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Здесь появится первый реальный отчет клиента после запуска AI-аудита. Моковые данные в рабочем кабинете не показываются.
          </p>
          <button
            type="button"
            onClick={() => navigate("/launch")}
            className="mt-5 inline-flex min-h-[40px] items-center justify-center rounded border border-primary/30 bg-primary/15 px-5 py-2 text-[11px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/20"
          >
            Запустить аудит
          </button>
        </div>
      </div>
    </section>
  );
}

export default function ReportScreen() {
  const { pathname } = useLocation();
  const { summary, reportMarkdown, getActiveRun, executiveReport } = useStore();

  const activeRun = getActiveRun();
  const hasReportData = Boolean(
    executiveReport ||
      reportMarkdown ||
      summary?.report_snapshot ||
      summary?.analysis_scope ||
      summary?.crm_context,
  );
  if (!hasReportData || (!executiveReport && !isRealReportRun(activeRun) && !reportMarkdown)) {
    return <EmptyReportState />;
  }

  return (
    <ReportContent
      summary={summary || {}}
      markdown={reportMarkdown || ""}
      actionGuideOnly={pathname === "/growth"}
      showActionGuide={pathname !== "/lead-leakage"}
    />
  );
}
