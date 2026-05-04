import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import { fetchAuditScope, getPendingExecutiveReportJob, isCrmWebhookConfigured } from "../api/index.js";
import { ensureArray } from "../utils/index.js";
import { formatNumber } from "../utils/format.js";
import MiniCard from "../components/shared/MiniCard.jsx";
import DatePicker from "../components/shared/DatePicker.jsx";

const WARNING_MESSAGES = {
  responsible_not_in_scope:
    "Выбранный ответственный не входит в текущую выборку по воронке и периоду. Выберите одного из доступных.",
  responsible_has_no_whatsapp_deals:
    "У выбранного ответственного есть сделки в этом диапазоне, но среди них нет WhatsApp-сделок.",
  no_deals_in_scope: "По выбранным фильтрам сделки не найдены.",
  no_whatsapp_deals_in_scope: "Сделки найдены, но WhatsApp-сделок в этой выборке нет.",
};

function getWarningMessage(code) {
  return WARNING_MESSAGES[code] || `Предупреждение: ${code}`;
}

function buildRequestKey({ responsibleIds, periodFrom, periodTo, categoryId }) {
  return JSON.stringify({
    responsible_ids: ensureArray(responsibleIds).map(String).sort(),
    period_from: periodFrom,
    period_to: periodTo,
    category_ids: categoryId ? [categoryId] : [],
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function AuditRunStatusPanel({ runStatus, statusMessage, onOpenReport }) {
  if (runStatus === "idle") return null;

  const isRunning = runStatus === "running";
  const isReady = runStatus === "ready";
  const isError = runStatus === "error";

  return (
    <article className="rounded border border-primary/20 bg-primary/[0.035] p-4">
      <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-center @3xl:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border ${
              isError
                ? "border-destructive/30 bg-destructive/10"
                : isReady
                ? "border-primary/30 bg-primary/10"
                : "border-chart-4/30 bg-chart-4/10"
            }`}
          >
            {isRunning ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-chart-4/30 border-t-chart-4" />
            ) : (
              <span className={`text-sm font-bold ${isError ? "text-destructive" : "text-primary"}`}>
                {isError ? "!" : "✓"}
              </span>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              {isReady ? "Отчет готов" : isError ? "Запуск не завершен" : "Аудит выполняется"}
            </div>
            <h3 className="text-lg font-headline font-bold text-foreground">
              {isReady
                ? "Финальный аудит можно открыть"
                : isError
                ? "Проверьте запуск аудита"
                : "Обычно занимает 20-30 минут"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isReady
                ? "Если пользователь закрывал вкладку, эта же ссылка должна прийти ему на почту."
                : isError
                ? statusMessage || "Не удалось завершить запуск аудита."
                : "Можно закрыть вкладку. Когда анализ будет готов, отправим уведомление на почту."}
            </p>
          </div>
        </div>
        {isReady && (
          <button
            type="button"
            className="inline-flex min-h-[40px] w-full items-center justify-center rounded border border-primary/30 bg-primary/15 px-5 py-2 text-[11px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60 @3xl:w-auto"
            onClick={onOpenReport}
          >
            Просмотреть финальный отчет
          </button>
        )}
      </div>
    </article>
  );
}

export default function LaunchScreen() {
  const navigate = useNavigate();
  const appState = useStore((s) => s.appState);
  const estimateAnalysis = useStore((s) => s.estimateAnalysis);
  const createAnalysisRun = useStore((s) => s.createAnalysisRun);
  const buildExecutiveReportRun = useStore((s) => s.buildExecutiveReportRun);
  const resumeExecutiveReportRun = useStore((s) => s.resumeExecutiveReportRun);
  const activateRunData = useStore((s) => s.activateRunData);

  const launcher = appState?.setup?.analysis_launcher || {};
  const businessProfile = appState?.setup?.business_profile || {};
  const defaultFilters = launcher.default_filters || {};
  const availableCategories = ensureArray(launcher.available_categories);
  const defaultCategoryId = ensureArray(defaultFilters.category_ids)[0] || "";

  const [categoryId, setCategoryId] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [responsibleIds, setResponsibleIds] = useState([]);
  const [scopeManagers, setScopeManagers] = useState([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeError, setScopeError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [quote, setQuote] = useState(null);
  const [quoteKey, setQuoteKey] = useState("");
  const [quoteStatus, setQuoteStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [runStatus, setRunStatus] = useState("idle");
  const [completedRunId, setCompletedRunId] = useState("");
  const resumeStartedRef = useRef(false);

  // Инициализация из дефолтов лаунчера
  useEffect(() => {
    if (!launcher || Object.keys(launcher).length === 0) return;
    const allowed = new Set(availableCategories.map((c) => String(c.id)));
    const resolvedCategory = allowed.has(String(defaultCategoryId)) ? String(defaultCategoryId) : "";
    setCategoryId((prev) => prev || resolvedCategory);
    setPeriodFrom((prev) => prev || defaultFilters.period_from || launcher.date_range?.from || "");
    setPeriodTo((prev) => prev || defaultFilters.period_to || launcher.date_range?.to || "");
  }, [launcher]);

  useEffect(() => {
    if (resumeStartedRef.current) return;
    const pending = getPendingExecutiveReportJob();
    if (!pending?.job_id) return;

    resumeStartedRef.current = true;
    setRunStatus("running");
    setCompletedRunId("");
    setStatusMessage("Продолжаем отслеживать уже запущенный анализ...");

    resumeExecutiveReportRun()
      .then((run) => {
        if (!run) {
          setRunStatus("idle");
          setStatusMessage("");
          return;
        }
        setCompletedRunId(run?.id || "");
        setRunStatus("ready");
        setStatusMessage("");
      })
      .catch((err) => {
        setRunStatus("error");
        setStatusMessage(`Ошибка запуска: ${err.message}`);
      });
  }, [resumeExecutiveReportRun]);

  // Каскадная загрузка scope_managers при смене воронки или дат
  useEffect(() => {
    if (periodFrom?.length < 10 || periodTo?.length < 10) {
      setScopeManagers([]);
      setScopeError("");
      setWarnings([]);
      return;
    }
    let cancelled = false;
    setScopeLoading(true);
    setScopeError("");
    fetchAuditScope({ categoryIds: categoryId ? [categoryId] : [], periodFrom, periodTo })
      .then(({ scopeManagers: managers, warnings: w }) => {
        if (cancelled) return;
        setScopeManagers(managers);
        setScopeError("");
        setWarnings(w);
        setResponsibleIds((prev) => {
          const allowedIds = new Set(managers.map((m) => String(m.id)));
          return ensureArray(prev).map(String).filter((id) => allowedIds.has(id));
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setScopeManagers([]);
        setWarnings([]);
        setResponsibleIds([]);
        setScopeError(err?.message || "Failed to load responsible list.");
      })
      .finally(() => {
        if (!cancelled) setScopeLoading(false);
      });
    return () => { cancelled = true; };
  }, [categoryId, periodFrom, periodTo]);

  const clearQuote = () => {
    setQuote(null);
    setQuoteKey("");
    setQuoteStatus("idle");
    if (runStatus !== "running") {
      setRunStatus("idle");
      setCompletedRunId("");
    }
  };

  const handleCategoryChange = (val) => {
    if (runStatus === "running") return;
    setCategoryId(val);
    clearQuote();
  };
  const handlePeriodFromChange = (val) => {
    if (runStatus === "running") return;
    setPeriodFrom(val);
    clearQuote();
  };
  const handlePeriodToChange = (val) => {
    if (runStatus === "running") return;
    setPeriodTo(val);
    clearQuote();
  };
  const toggleResponsible = (id) => {
    if (runStatus === "running") return;
    const value = String(id);
    setResponsibleIds((prev) => {
      const selected = new Set(ensureArray(prev).map(String));
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      return Array.from(selected);
    });
    clearQuote();
  };

  const clearResponsibleSelection = () => {
    if (runStatus === "running") return;
    setResponsibleIds([]);
    clearQuote();
  };

  const collectRequest = () => {
    const selectedManagers = scopeManagers.filter((m) =>
      responsibleIds.map(String).includes(String(m.id))
    );
    const selectedIds = selectedManagers.map((m) => String(m.id));
    return {
      responsible_id: selectedIds.length === 1 ? selectedIds[0] : null,
      responsible_ids: selectedIds,
      responsible_label: selectedManagers.map((m) => m.name).join(", ") || null,
      period_from: periodFrom,
      period_to: periodTo,
      category_ids: categoryId ? [categoryId] : [],
    };
  };

  const currentKey = () => buildRequestKey({ responsibleIds, periodFrom, periodTo, categoryId });
  const isQuoteFresh = quote !== null && quoteKey === currentKey();

  const validateForm = () => {
    if (periodFrom && periodTo && periodFrom > periodTo) return "Дата начала не может быть позже даты окончания.";
    return null;
  };

  const handleEstimate = async () => {
    const validationError = validateForm();
    if (validationError) { setStatusMessage(validationError); return; }
    setQuoteStatus("loading");
    setStatusMessage("Считаю объем данных и стоимость запуска...");
    try {
      const request = collectRequest();
      const result = await estimateAnalysis(request);
      const estimate = result?.estimate || result;
      const w = ensureArray(result?.warnings);
      setQuote(estimate);
      if (w.length) setWarnings(w);
      setQuoteKey(buildRequestKey({ responsibleIds, periodFrom, periodTo, categoryId }));
      setQuoteStatus("ready");
      setStatusMessage("");
    } catch (err) {
      setQuoteStatus("error");
      setStatusMessage(`Ошибка расчета: ${err.message}`);
    }
  };

  const handleRun = async () => {
    if (runStatus === "running") return;
    const validationError = validateForm();
    if (validationError) { setStatusMessage(validationError); return; }
    setRunStatus("running");
    setCompletedRunId("");
    setStatusMessage("Обновляем WhatsApp, звонки, AI-разборы и финальный отчет в одном scope...");
    try {
      const averageTicket = Number(businessProfile?.average_ticket_kzt || 0);
      const run = await buildExecutiveReportRun({
        ...collectRequest(),
        scope: "bitrix",
        average_ticket_kzt: averageTicket > 0 ? averageTicket : undefined,
      });
      setCompletedRunId(run?.id || "");
      setRunStatus("ready");
      setStatusMessage("");
    } catch (err) {
      setRunStatus("error");
      setStatusMessage(`Ошибка запуска: ${err.message}`);
    }
  };

  const openRunReport = async (runId) => {
    await activateRunData(runId);
    navigate("/report");
  };

  const latestRun = appState?.latest_run || {};

  const hasCrmWebhook = isCrmWebhookConfigured(appState);
  const isAuditRunning = runStatus === "running";

  const responsibleDisabled =
    periodFrom?.length < 10 || periodTo?.length < 10 || scopeLoading || scopeManagers.length === 0;

  const responsiblePlaceholder =
    periodFrom?.length < 10 || periodTo?.length < 10
      ? "Сначала выберите период"
      : scopeLoading
      ? "Загрузка..."
      : scopeManagers.length === 0
      ? "Нет доступных ответственных"
      : "Все ответственные (без фильтра)";
  const selectedResponsibleCount = responsibleIds.length;
  const displayManagerCount = selectedResponsibleCount || Number(quote?.manager_count || 0);

  return (
    <div className="max-w-[1380px] w-full mx-auto space-y-5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Запуск AI аудита
      </div>

      <section className="bg-card border border-border rounded p-5 space-y-5">
        <div className="grid grid-cols-1 @3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-4 items-end">
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              Воронка продаж
              <select
                value={categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
                disabled={isAuditRunning}
                className="bg-input border border-border rounded px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Все воронки</option>
                {availableCategories.length ? (
                  availableCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label} ({formatNumber(cat.interaction_count || cat.deal_count || 0)})
                    </option>
                  ))
                ) : (
                  <option value="">Нет доступных воронок</option>
                )}
              </select>
            </label>

            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
              Период анализа
              <div className="flex gap-2">
                <DatePicker
                  value={periodFrom}
                  onChange={handlePeriodFromChange}
                  placeholder="Начало"
                  disabled={isAuditRunning}
                />
                <DatePicker
                  value={periodTo}
                  onChange={handlePeriodToChange}
                  placeholder="Конец"
                  disabled={isAuditRunning}
                />
              </div>
            </div>
        </div>

        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <span className="block">Ответственные по сделкам</span>
              <span className="mt-1 block text-[10px] text-muted-foreground/60">
                Выберите менеджеров продаж. Если ничего не отмечено, в аудит попадут все ответственные.
              </span>
            </div>
            {selectedResponsibleCount > 0 && (
              <button
                type="button"
                className="rounded border border-border bg-muted/20 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
                disabled={isAuditRunning}
                onClick={clearResponsibleSelection}
              >
                Сбросить
              </button>
            )}
          </div>

          <div className="rounded border border-border bg-input p-2">
            {responsibleDisabled ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                {scopeError || responsiblePlaceholder}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1 @3xl:grid-cols-2">
                <label className="flex min-h-[38px] cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm text-foreground hover:bg-foreground/5">
                  <input
                    type="checkbox"
                    checked={selectedResponsibleCount === 0}
                    onChange={clearResponsibleSelection}
                    disabled={isAuditRunning}
                    className="rounded border-border bg-card text-primary focus:ring-primary"
                  />
                  <span className="min-w-0 truncate">Все ответственные</span>
                </label>
                {scopeManagers.map((m) => {
                  const id = String(m.id);
                  const checked = responsibleIds.map(String).includes(id);
                  return (
                    <label
                      key={id}
                      className="flex min-h-[38px] cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm text-foreground hover:bg-foreground/5"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleResponsible(id)}
                        disabled={isAuditRunning}
                        className="rounded border-border bg-card text-primary focus:ring-primary"
                      />
                      <span className="min-w-0 truncate">{m.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-chart-4 leading-6">
                {getWarningMessage(w.code)}
              </p>
            ))}
          </div>
        )}

        {scopeError && (
          <p className="text-xs text-chart-4 leading-6">{scopeError}</p>
        )}

        <div className="flex flex-col gap-3 border-t border-border pt-4 @3xl:flex-row @3xl:items-center @3xl:justify-between">
          <div className="text-xs text-muted-foreground leading-5">
            {hasCrmWebhook
              ? "Аудит анализирует WhatsApp-переписки, звонки и CRM-данные в выбранном периоде."
              : "Аудит анализирует WhatsApp-переписки и CRM-данные. Для анализа звонков настройте CRM webhook."}
          </div>
          <div className="flex shrink-0 flex-col gap-2 @3xl:items-end">
            <div className="flex flex-col gap-2 @3xl:flex-row">
              <button
                type="button"
                onClick={handleEstimate}
                disabled={quoteStatus === "loading" || isAuditRunning}
                className="inline-flex min-h-[40px] w-full items-center justify-center rounded border border-primary/25 bg-primary/[0.03] px-5 py-2 text-[11px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 @3xl:w-auto"
              >
                {quoteStatus === "loading" ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border border-primary/30 border-t-primary" />
                    Считаем объем
                  </span>
                ) : (
                  "Оценить объем"
                )}
              </button>
              <button
                type="button"
                onClick={handleRun}
                disabled={isAuditRunning}
                className="inline-flex min-h-[40px] w-full items-center justify-center rounded border border-primary/30 bg-primary/15 px-5 py-2 text-[11px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60 @3xl:w-auto"
              >
                {isAuditRunning ? "Анализ выполняется" : "Запустить анализ"}
              </button>
            </div>
            {statusMessage && (
              <div className="max-w-md text-right text-xs text-muted-foreground">
                {statusMessage}
              </div>
            )}
          </div>
        </div>
      </section>

      <AuditRunStatusPanel
        runStatus={runStatus}
        statusMessage={statusMessage}
        onOpenReport={() => openRunReport(completedRunId || latestRun?.id)}
      />

      {quote ? (
        <article className="bg-muted/30 border border-border rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap gap-6 items-start">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Стоимость анализа</div>
                <div className="text-3xl font-headline font-bold text-foreground">0 ₸</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Токены</div>
                <div className="text-3xl font-headline font-bold text-primary">{formatNumber(quote.estimated_tokens)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
              <MiniCard label="Переписки и звонки" value={formatNumber(quote.interaction_count || 0)} note="WhatsApp и звонки в периоде" tone="cyan" />
              <MiniCard label="Ответственные" value={formatNumber(displayManagerCount)} note="Менеджеры в выборке" tone="green" />
              <MiniCard label="CRM-сделки" value={formatNumber(quote.matched_deal_count || 0)} note="Связаны с обращениями" tone="yellow" />
              <MiniCard label="Период" value={`${formatNumber(quote.period_days || 0)} дн.`} note="По полю «Дата создания»" tone="violet" />
            </div>
            {(quote.charge_policy_note || launcher.charge_policy_note) && (
              <p className="text-xs text-muted-foreground leading-6">{quote.charge_policy_note || launcher.charge_policy_note}</p>
            )}
            {isQuoteFresh ? (
              <div className="flex flex-col gap-3 border-t border-border pt-4 @3xl:flex-row @3xl:items-center @3xl:justify-between">
                <div className="text-xs text-muted-foreground leading-5">
                  Объем рассчитан. Теперь можно обновить отчет по выбранной выборке.
                </div>
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={isAuditRunning}
                  className="inline-flex min-h-[40px] w-full items-center justify-center rounded border border-primary/30 bg-primary/15 px-5 py-2 text-[11px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60 @3xl:w-auto"
                >
                  {isAuditRunning ? "Анализ выполняется" : "Запустить анализ"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-chart-4 leading-6">Параметры были изменены после расчета. Пересчитайте стоимость заново.</p>
            )}
            {quote.warning && (
              <p className="text-xs text-destructive leading-6">{quote.warning}</p>
            )}
        </article>
      ) : (
        <article className="bg-muted/30 border border-border rounded-xl p-5 text-xs text-muted-foreground leading-6">
          Сначала нажмите «Оценить объем». После расчета покажем стоимость,
          количество переписок и звонков, CRM-сделки, период и кнопку запуска
          AI-аудита.
        </article>
      )}
    </div>
  );
}
