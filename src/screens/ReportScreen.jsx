import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import { postJson } from "../api/index.js";
import {
  ensureArray,
  isTrueLike,
  clampRate,
  normalizeRepoPath,
} from "../utils/index.js";
import {
  formatNumber,
  formatPercent,
  formatMoney,
  formatMinutes,
  formatScore,
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

const GENERATED_GROWTH_POINTS = [
  {
    title: "Ускорить первый ответ",
    detail: "Самый быстрый прирост обычно дает сокращение времени реакции на новые лиды.",
    recommendation: "Настроить SLA 3-5 минут и отдельный мониторинг просрочек.",
  },
  {
    title: "Стандартизировать следующий шаг",
    detail: "У каждой целевой сделки должен быть понятный следующий контакт или действие.",
    recommendation: "Ввести правило: нет следующего шага - сделка не считается обработанной.",
  },
  {
    title: "Усилить квалификацию клиента",
    detail: "Чем точнее выявлена потребность, тем проще предложить релевантное решение.",
    recommendation: "Добавить вопросы про цель, сроки, бюджет, участников решения и критерии выбора.",
  },
  {
    title: "Разобрать частые причины отказа",
    detail: "Повторяющиеся отказы показывают, где ломается предложение или процесс продажи.",
    recommendation: "Сгруппировать проигранные сделки по причинам и разобрать топ-3 на планерке.",
  },
  {
    title: "Контролировать сделки без активности",
    detail: "Открытые сделки без задач и сообщений быстро превращаются в потерянную выручку.",
    recommendation: "Выводить их отдельным списком и назначать ответственного за возврат.",
  },
  {
    title: "Улучшить работу с возражениями",
    detail: "Отказы по цене, срокам и сомнениям требуют единого набора ответов и кейсов.",
    recommendation: "Собрать базу возражений и отмечать, применяет ли ее менеджер.",
  },
  {
    title: "Проверять обещания менеджеров",
    detail: "Если обещанный расчет или КП не отправлены, доверие клиента быстро падает.",
    recommendation: "Сверять обещания из диалогов с задачами, письмами и файлами в CRM.",
  },
  {
    title: "Разделить качество лида и качество работы",
    detail: "Не все обращения являются продажными, но целевые лиды должны обрабатываться без потерь.",
    recommendation: "Отдельно считать непрофильные обращения и ошибки по целевым лидам.",
  },
  {
    title: "Ввести короткий чек-лист диалога",
    detail: "Единый стандарт помогает сравнивать менеджеров и видеть, где проседает процесс.",
    recommendation: "Оценивать приветствие, вопросы, предложение, возражения и следующий шаг.",
  },
  {
    title: "Сделать регулярный follow-up",
    detail: "Многие сделки теряются не из-за отказа, а из-за отсутствия повторного касания.",
    recommendation: "Настроить шаблоны и сроки follow-up для теплых и зависших сделок.",
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

function buildRatingComponents(rating) {
  const raw = ensureArray(rating?.components);
  const byLabel = new Map(
    raw.map((item) => [
      String(item?.label || "").trim().toLowerCase(),
      item,
    ]),
  );
  const fallbackScore = Number(rating?.score_100 || rating?.value * 10 || 0);
  const pickScore = (...labels) => {
    for (const label of labels) {
      const item = byLabel.get(String(label).toLowerCase());
      if (item) return Number(item.score_100 || 0);
    }
    return fallbackScore;
  };

  return [
    { label: "Этапы продаж", score_100: pickScore("Этапы продаж") },
    { label: "Скорость реакции", score_100: pickScore("Скорость реакции", "Реакция") },
    { label: "Переписки", score_100: pickScore("Переписки", "WhatsApp") },
    { label: "Звонки", score_100: pickScore("Звонки", "Calls") },
  ];
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

function InlineTable({ columns, rows, emptyText = "Нет данных для отображения." }) {
  const items = ensureArray(rows);
  if (!items.length) {
    return <div className="text-xs text-muted-foreground">{emptyText}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.label}
                className={`px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border ${col.align === "right" ? "text-right" : ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-b-0">
              {columns.map((col) => (
                <td
                  key={col.label}
                  className={`px-3 py-2 align-top ${col.align === "right" ? "text-right" : ""}`}
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

function PriorityCards({ items, emptyText, tone = "red" }) {
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
    <div className="grid grid-cols-1 gap-3">
      {rows.map((item, index) => (
        <article
          key={index}
          className={`rounded border ${accent[tone] || accent.red} p-4`}
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <strong className="text-sm text-foreground">
              {item.title || `Пункт ${index + 1}`}
            </strong>
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
              Топ {index + 1}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-6">
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {rows.map((item, index) => (
        <article
          key={index}
          className="rounded border border-border bg-muted/30 p-3"
        >
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
            Шаг {index + 1}
          </div>
          <p className="text-xs text-foreground leading-6">{item}</p>
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
  const navigate = useNavigate();
  const { setSelectedId } = useStore();
  const rows = ensureArray(items).filter(Boolean);
  if (!rows.length) {
    return (
      <div className="text-xs text-muted-foreground">
        Кандидаты на дожим не найдены.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border">
              Ссылка на сделку
            </th>
            <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border">
              Комментарий
            </th>
            <th className="px-3 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border">
              Действие
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, i) => {
            const dealUrl = resolveDealUrl(item);
            return (
              <tr key={i} className="border-b border-border/60 last:border-b-0">
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
                      {item.manager_label || getManagerName(item.manager_id)} |{" "}
                      {item.reason || "Причина не указана"}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 align-top text-muted-foreground leading-6">
                  {item.comment || item.summary || "Нет комментария"}
                </td>
                <td className="px-3 py-3 align-top text-right">
                  {item.interaction_id ? (
                    <button
                      className="px-3 py-1.5 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest rounded hover:bg-primary/80 transition-colors"
                      type="button"
                      onClick={() => {
                        setSelectedId(item.interaction_id);
                        navigate("/explorer");
                      }}
                    >
                      Диалог
                    </button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

function ReportContent({ summary, markdown }) {
  const snapshot = summary?.report_snapshot || {};
  const [isActionGuideOpen, setIsActionGuideOpen] = useState(false);
  const [openInsightModal, setOpenInsightModal] = useState(null);

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

  const rating = snapshot.department_rating || {};
  const dashboard = snapshot.dashboard || {};
  const department = dashboard.department || {};
  const managerRows = ensureArray(dashboard.by_manager);
  const responseSpeed = snapshot.response_speed || {};
  const taskDiscipline = snapshot.task_discipline || {};
  const stageCompliance = snapshot.sales_stage_compliance || {};
  const lossReasons = snapshot.loss_reasons || {};
  const failedDealAnalysis = snapshot.failed_deal_analysis || {};
  const missedRevenue = snapshot.missed_revenue || {};
  const dataQualityNotes = ensureArray(summary.data_quality_notes);
  const markdownBlock = String(markdown || "").trim();
  const showTechnicalBlocks = false;

  const ratingComponents = buildRatingComponents(rating);
  const managerStageRows = ensureArray(stageCompliance.by_manager);
  const stageColumns = collectStageColumns(stageCompliance.department, managerStageRows);
  const departmentProblems = collectInsightItems(
    snapshot.department_problems ||
      snapshot.all_department_problems ||
      snapshot.problems ||
      snapshot.top_department_problems,
    GENERATED_SALES_ERRORS,
  );
  const departmentGrowthPoints = collectInsightItems(
    snapshot.department_growth_points ||
      snapshot.all_department_growth_points ||
      snapshot.growth_points ||
      snapshot.top_department_growth_points,
    GENERATED_GROWTH_POINTS,
  );
  const responseStatus = getResponseSpeedStatus(
    responseSpeed.department?.average_minutes || 0,
  );
  const salesRequestCount = ensureArray(summary.managers).reduce(
    (sum, row) => sum + Number(row?.qualified_count || 0),
    0,
  );
  const totalDealCount =
    Number(department.total_deals || 0) ||
    Number(summary.crm_context?.total_deals || 0) ||
    Number(summary.billing_quote?.matched_deal_count || 0);
  const totalConversionRate = totalDealCount
    ? (Number(department.won_deals || 0) / totalDealCount) * 100
    : 0;
  const hasCrmWonAmount =
    Number(department.won_amount_kzt || 0) > 0 ||
    managerRows.some((row) => Number(row?.won_amount_kzt || 0) > 0);

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
      {openInsightModal === "growth" && (
        <InsightListModal
          title="Все точки роста отдела продаж"
          subtitle="Расширенный список направлений, которые можно использовать для задач после аудита."
          items={departmentGrowthPoints}
          tone="green"
          onClose={() => setOpenInsightModal(null)}
        />
      )}
      <section className="bg-card border border-border rounded p-4">
        <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-4">
          <div className="rounded border border-border bg-muted/15 px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              Общий рейтинг отдела
            </div>
            <h2 className="font-headline text-4xl font-bold text-foreground leading-none mb-2">
              {formatScore(rating)}
            </h2>
            <p className="text-xs text-muted-foreground leading-5">
              CRM, этапы, реакция, дисциплина, переписки и звонки.
            </p>
          </div>

          {ratingComponents.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-2">
              {ratingComponents.map((item, i) => (
                <article
                  key={i}
                  className="rounded border border-border bg-muted/15 px-3 py-3 min-w-0"
                >
                  <div className="truncate text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                    {item.label || "Компонент"}
                  </div>
                  <div className="whitespace-nowrap text-2xl font-semibold leading-none text-foreground">
                    {`${formatNumber(item.score_100 || 0)} / 100`}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded border border-border bg-muted/15 p-4 text-xs text-muted-foreground">
              Компоненты рейтинга недоступны.
            </div>
          )}
        </div>
      </section>

      <section className="bg-card border border-border rounded p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              Дашборд
            </div>
            <h3 className="text-xl font-headline font-bold text-foreground">
              Сделки по отделу и менеджерам
            </h3>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
          {[
            {
              label: "Всего сделок",
              value: formatNumber(totalDealCount),
              note: "В текущей выборке",
              noteClass: "text-foreground",
            },
            {
              label: "Сделок в работе",
              value: formatNumber(department.in_work_deals || 0),
              note: `из ${formatNumber(department.total_deals || 0)} всех сделок`,
              noteClass: "text-chart-3",
            },
            {
              label: "Сумма в работе",
              value: formatMoney(department.in_work_amount_kzt || 0),
              note: "Потенциал открытых сделок",
              noteClass: "text-chart-3",
            },
            {
              label: "Успешно",
              value: formatNumber(department.won_deals || 0),
              note: "Закрыто в плюс",
              noteClass: "text-primary",
            },
            {
              label: "Сумма побед",
              value: formatMoney(department.won_amount_kzt || 0),
              note: "Общая сумма выигранных сделок",
              noteClass: "text-chart-4",
            },
            {
              label: "Провалено",
              value: formatNumber(department.lost_deals || 0),
              note: `Сумма: ${formatMoney(department.lost_amount_kzt || 0)}`,
              noteClass: "text-destructive",
            },
            {
              label: "Сумма провалов",
              value: formatMoney(department.lost_amount_kzt || 0),
              note: "Сумма проигранных сделок",
              noteClass: "text-destructive",
            },
            {
              label: "Win rate",
              value: formatPercent(department.closed_win_rate || 0),
              note: `${formatNumber(department.closed_deals || 0)} закрытых сделок`,
              noteClass: "text-primary",
            },
            {
              label: "Конверсия",
              value: formatPercent(totalConversionRate),
              note: "Победы от всех сделок",
              noteClass: totalConversionRate > 0 ? "text-primary" : "text-muted-foreground",
            },
            {
              label: "Заявки в продажу",
              value: formatNumber(salesRequestCount),
              note: "Квалифицированный интерес",
              noteClass: "text-chart-3",
            },
          ].map((metric) => (
            <article
              key={metric.label}
              className="rounded border border-border bg-muted/20 px-4 py-3"
            >
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                {metric.label}
              </div>
              <div className="text-3xl leading-none font-light text-foreground mb-2">
                {metric.value}
              </div>
              <div className={`text-xs ${metric.noteClass}`}>{metric.note}</div>
            </article>
          ))}
        </div>
        <InlineTable
          columns={[
            { label: "Менеджер", render: (row) => <ManagerCellButton row={row} /> },
            {
              label: "В работе",
              align: "right",
              render: (row) => (
                <span className="text-foreground">{formatNumber(row.in_work_deals || 0)}</span>
              ),
            },
            {
              label: "Успешно",
              align: "right",
              render: (row) => (
                <span className="text-foreground">{formatNumber(row.won_deals || 0)}</span>
              ),
            },
            {
              label: "Провалено",
              align: "right",
              render: (row) => (
                <span className="text-foreground">{formatNumber(row.lost_deals || 0)}</span>
              ),
            },
            {
              label: "Сумма провалов",
              align: "right",
              render: (row) => (
                <span className="text-foreground">{formatMoney(row.lost_amount_kzt || 0)}</span>
              ),
            },
            {
              label: "Рейтинг",
              align: "right",
              render: (row) => (
                <span
                  className={`font-bold ${
                    Number(row.rating?.value || 0) >= 7
                      ? "text-primary"
                      : Number(row.rating?.value || 0) >= 5
                      ? "text-chart-4"
                      : "text-destructive"
                  }`}
                >
                  {formatScore(row.rating || {})}
                </span>
              ),
            },
          ]}
          rows={managerRows}
          emptyText="Менеджеры не найдены в текущем срезе."
        />
        <div className="mt-3 rounded border border-border bg-muted/20 px-3 py-2 text-xs leading-6 text-muted-foreground">
          {hasCrmWonAmount
            ? "Сумма побед отображается по данным CRM."
            : "Сумма побед не найдена в данных CRM. Денежные оценки ниже можно считать примерными и рассчитывать от среднего чека."}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <article className="bg-card border border-border rounded p-4">
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
          />
        </article>
        <article className="bg-card border border-border rounded p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Топ-3 точки роста отдела продаж
            </div>
            <button
              type="button"
              className="rounded border border-border bg-muted/20 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-[0.98]"
              onClick={() => setOpenInsightModal("growth")}
            >
              Остальные точки роста
            </button>
          </div>
          <PriorityCards
            items={snapshot.top_department_growth_points}
            emptyText="Точки роста пока не выделены."
            tone="green"
          />
        </article>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <article className="bg-card border border-border rounded p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                Скорость ответа новым лидам
              </div>
              <div className="text-sm text-foreground">
                Среднее по отделу:{" "}
                <strong>{formatMinutes(responseSpeed.department?.average_minutes || 0)}</strong>
              </div>
            </div>
            <TrafficStatusBadge status={responseStatus} />
          </div>
          <p className="text-sm text-muted-foreground leading-7 mb-4">
            {responseStatus.caption}. Измерено по{" "}
            {formatNumber(responseSpeed.department?.measured_deals || 0)} из{" "}
            {formatNumber(responseSpeed.department?.deal_count || 0)} сделок.
          </p>
          <InlineTable
            columns={[
              { label: "Менеджер", render: (row) => <ManagerCellButton row={row} /> },
              {
                label: "Среднее",
                align: "right",
                render: (row) => (
                  <span className="text-foreground">
                    {formatMinutes(row.average_minutes || 0)}
                  </span>
                ),
              },
              {
                label: "Статус",
                align: "right",
                render: (row) => (
                  <TrafficStatusBadge
                    status={getResponseSpeedStatus(row.average_minutes || 0)}
                    compact
                  />
                ),
              },
            ]}
            rows={responseSpeed.by_manager}
            emptyText="Нет данных по скорости ответа."
          />
        </article>

        <article className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Работа с задачами
          </div>
          <p className="text-sm text-muted-foreground leading-7 mb-4">
            В работе {formatNumber(taskDiscipline.department?.in_work_deals || 0)}{" "}
            сделок. Активных задач{" "}
            {formatNumber(taskDiscipline.department?.active_task_count || 0)}. Без
            задач{" "}
            {formatNumber(taskDiscipline.department?.deals_without_tasks || 0)}, с
            просрочкой{" "}
            {formatNumber(
              taskDiscipline.department?.deals_with_overdue_tasks || 0
            )}
            .
          </p>
          <InlineTable
            columns={[
              { label: "Менеджер", render: (row) => <ManagerCellButton row={row} /> },
              {
                label: "В работе",
                align: "right",
                render: (row) => (
                  <span className="text-foreground">
                    {formatNumber(row.in_work_deals || 0)}
                  </span>
                ),
              },
              {
                label: "Активных задач",
                align: "right",
                render: (row) => (
                  <span className="text-primary">
                    {formatNumber(row.active_task_count || 0)}
                  </span>
                ),
              },
              {
                label: "Без задач",
                align: "right",
                render: (row) => (
                  <span className="text-destructive">
                    {formatNumber(row.deals_without_tasks || 0)}
                  </span>
                ),
              },
              {
                label: "Просрочено",
                align: "right",
                render: (row) => (
                  <span className="text-chart-4">
                    {formatNumber(row.deals_with_overdue_tasks || 0)}
                  </span>
                ),
              },
            ]}
            rows={taskDiscipline.by_manager}
            emptyText="Нет данных по задачам."
          />
        </article>
      </section>

      <section className="bg-card border border-border rounded p-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Соблюдение этапов продаж
        </div>
        <p className="text-sm text-muted-foreground leading-7 mb-4">
          Среднее соблюдение по отделу:{" "}
          <strong className="text-foreground">
            {formatPercent(stageCompliance.department?.average_rate || 0)}
          </strong>
          . Слабое место:{" "}
          <strong className="text-foreground">
            {getWeakestStageLabel(stageCompliance.department || {})}
          </strong>
          .
        </p>
        <div className="grid grid-cols-1 gap-5">
          <StageComplianceBars stages={stageCompliance.department?.stages} />
          <div className="rounded border border-border bg-muted/20 p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
              По менеджерам
            </div>
            <StageComplianceManagerTable
              rows={managerStageRows}
              stageColumns={stageColumns}
            />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
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
          <InlineTable
            columns={[
              {
                label: "Причина",
                render: (row) => (
                  <span className="text-foreground">{row.name || "Не указано"}</span>
                ),
              },
              {
                label: "Кол-во",
                align: "right",
                render: (row) => (
                  <span className="text-foreground">{formatNumber(row.count || 0)}</span>
                ),
              },
              {
                label: "Доля",
                align: "right",
                render: (row) => (
                  <span className="text-foreground">{formatPercent(row.rate || 0)}</span>
                ),
              },
            ]}
            rows={lossReasons.department?.reasons_top}
            emptyText="Причины слива пока не определены."
          />
          <div className="mt-5 text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
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
        </article>

        <article className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Анализ проваленных сделок
          </div>
          <p className="text-sm text-muted-foreground leading-7 mb-4">
            Ниже сделки, которые можно вернуть в работу точечным follow-up. Ссылка
            ведет в карточку сделки Bitrix24, рядом комментарий — почему ее стоит
            вернуть в работу.
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

export default function ReportScreen() {
  const { summary, reportMarkdown, getActiveRun } = useStore();

  const s = summary || {};
  const activeRun = getActiveRun();
  const reportSnapshot = s.report_snapshot || {};
  const departmentDashboard = reportSnapshot.dashboard?.department || {};
  const departmentRating = reportSnapshot.department_rating || {};
  const taskDiscipline = reportSnapshot.task_discipline || {};

  const filters = activeRun?.filters || activeRun?.quote?.filters || {};
  const periodFrom = String(filters.period_from || "").trim();
  const periodTo = String(filters.period_to || "").trim();
  const periodLabel =
    periodFrom || periodTo
      ? `${periodFrom || "…"} - ${periodTo || "…"}`
      : "Текущий период";
  const ratingValue = Number(departmentRating?.value || 0);
  const ratingTrend = ratingValue >= 5 ? "↑" : "↓";

  const headerParams = [
    { label: "Период", value: periodLabel, tone: "text-chart-3" },
    { label: "Оценка", value: `${formatScore(departmentRating)} ${ratingTrend}`, tone: ratingValue >= 5 ? "text-primary" : "text-destructive" },
    {
      label: "Сделки",
      value: formatNumber(
        departmentDashboard.in_work_deals || s?.crm_context?.open_deals || 0
      ),
      tone: "text-foreground",
    },
    {
      label: "Задачи",
      value: formatNumber(taskDiscipline.department?.active_task_count || 0),
      tone: "text-chart-4",
    },
    {
      label: "Ошибки",
      value: formatNumber(
        departmentDashboard.lost_deals || s?.crm_context?.lost_deals || 0
      ),
      tone: "text-destructive",
    },
  ];

  const targetExamples = ensureArray(s.examples?.target_examples).slice(0, 3);
  const actionableExamples = ensureArray(s.examples?.actionable_examples).slice(0, 3);
  const awaitingExamples = ensureArray(s.examples?.awaiting_response_examples).slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[1380px] w-full mx-auto">
        <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
          Параметры отчета
        </h2>
        <div className="rounded border border-border bg-card/70 px-3 py-2.5">
          <div className="flex flex-wrap items-stretch gap-2">
            {headerParams.map((item) => (
              <div
                key={item.label}
                className="min-w-[170px] flex-1 rounded border border-border bg-muted/20 px-3 py-2"
              >
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                  {item.label}
                </div>
                <div className={`text-sm font-semibold ${item.tone}`}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-[1380px] w-full mx-auto">
        <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
          Содержание отчета
        </h2>
        <ReportContent summary={s} markdown={reportMarkdown || ""} />
      </section>

    </div>
  );
}
