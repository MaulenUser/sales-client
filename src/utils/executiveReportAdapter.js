import { ensureArray } from "./index.js";

const EXECUTIVE_RUN_ID = "run-executive-latest";

const STAGE_ORDER = [
  "contact_established",
  "need_identified",
  "product_presented",
  "offer_or_usp_mentioned",
  "next_step_or_sale",
];

const STAGE_LABELS = {
  contact_established: "Установление контакта",
  need_identified: "Выявление потребности",
  product_presented: "Презентация продукта",
  offer_or_usp_mentioned: "Акции / УТП / офферы",
  next_step_or_sale: "Следующий шаг / продажа",
};

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pctFromCount(count, total) {
  const c = num(count);
  const t = num(total);
  return t > 0 ? Math.round((c / t) * 1000) / 10 : 0;
}

function firstPresent(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? "";
}

function managerLabel(report, managerId, fallback = "") {
  const id = String(managerId || "").trim();
  const sources = [
    report?.deal_dashboard?.per_manager,
    report?.task_status?.per_manager,
    report?.lead_response_speed?.per_manager,
    report?.sales_stage_compliance?.manager_heatmap,
    report?.failure_reasons?.per_manager,
  ];
  for (const rows of sources) {
    const row = ensureArray(rows).find((item) => String(item?.manager_id || "").trim() === id);
    const name = String(row?.manager_name || "").trim();
    if (name) return name;
  }
  return String(fallback || (id ? `Менеджер #${id}` : "Менеджер не указан"));
}

function ratingForManager(report, managerId) {
  const row = ensureArray(report?.sales_stage_compliance?.manager_heatmap).find(
    (item) => String(item?.manager_id || "").trim() === String(managerId || "").trim(),
  );
  return {
    value: Math.round(num(row?.overall_stage_score_pct) / 10 * 10) / 10,
    max: 10,
  };
}

function adaptRating(report) {
  const rating = report?.integral_rating || {};
  const components = rating.components || {};
  return {
    value: num(rating.score_10),
    max: 10,
    score_100: num(rating.score_pct),
    components: [
      { label: "Этапы продаж", score_100: num(components.stage_compliance_pct) },
      { label: "Скорость реакции", score_100: num(components.response_speed_score_pct) },
      { label: "Дисциплина задач", score_100: num(components.task_hygiene_score_pct) },
      { label: "Win rate", score_100: num(components.closed_win_rate_pct) },
    ],
  };
}

function adaptDashboard(report) {
  const department = report?.deal_dashboard?.department || {};
  const byManager = ensureArray(report?.deal_dashboard?.per_manager).map((row) => ({
    manager_id: String(row?.manager_id || ""),
    manager_label: managerLabel(report, row?.manager_id, row?.manager_name),
      total_deals: num(row?.total_deals),
      total_amount_kzt: num(row?.total_amount),
      in_work_deals: num(row?.in_work_count),
      in_work_amount_kzt: num(row?.in_work_amount),
      won_deals: num(row?.won_count),
      won_amount_kzt: num(row?.won_amount),
      lost_deals: num(row?.failed_count),
    lost_amount_kzt: num(row?.failed_amount),
    closed_deals: num(row?.closed_count),
    closed_win_rate: num(row?.win_rate_closed_pct),
    rating: ratingForManager(report, row?.manager_id),
  }));

  return {
    department: {
      total_deals: num(department.total_deals),
      total_amount_kzt: num(department.total_amount),
      in_work_deals: num(department.in_work_count),
      in_work_amount_kzt: num(department.in_work_amount),
      won_deals: num(department.won_count),
      won_amount_kzt: num(department.won_amount),
      lost_deals: num(department.failed_count),
      lost_amount_kzt: num(department.failed_amount),
      closed_deals: num(department.closed_count),
      closed_win_rate: num(department.win_rate_closed_pct),
      currency: department.currency || "KZT",
    },
    by_manager: byManager,
  };
}

function adaptTaskDiscipline(report) {
  const department = report?.task_status?.department || {};
  return {
    department: {
      in_work_deals: num(department.in_work_deals),
      active_task_count: num(department.with_open_tasks),
      deals_without_tasks: num(department.without_open_tasks),
      deals_with_overdue_tasks: num(department.with_overdue_tasks),
      deals_without_tasks_pct: num(department.without_open_tasks_pct),
      deals_with_overdue_tasks_pct: num(department.with_overdue_tasks_pct),
    },
    by_manager: ensureArray(report?.task_status?.per_manager).map((row) => ({
      manager_id: String(row?.manager_id || ""),
      manager_label: managerLabel(report, row?.manager_id, row?.manager_name),
      in_work_deals: num(row?.in_work_deals),
      active_task_count: num(row?.with_open_tasks),
      deals_without_tasks: num(row?.without_open_tasks),
      deals_with_overdue_tasks: num(row?.with_overdue_tasks),
      deals_without_tasks_pct: num(row?.without_open_tasks_pct),
      deals_with_overdue_tasks_pct: num(row?.with_overdue_tasks_pct),
    })),
  };
}

function adaptDepartmentStages(report) {
  return ensureArray(report?.sales_stage_compliance?.stage_funnel).map((stage) => {
    const total = num(stage?.total);
    const yes = num(stage?.yes_count);
    return {
      code: String(stage?.key || stage?.code || ""),
      label: firstPresent(stage?.label, STAGE_LABELS[stage?.key], "Этап"),
      yes_count: yes,
      no_count: Math.max(0, total - yes),
      unknown_count: 0,
      yes_rate: firstPresent(stage?.pct, pctFromCount(yes, total)),
    };
  });
}

function adaptManagerStages(report) {
  return ensureArray(report?.sales_stage_compliance?.manager_heatmap).map((row) => {
    const total = num(row?.total);
    return {
      manager_id: String(row?.manager_id || ""),
      manager_label: managerLabel(report, row?.manager_id, row?.manager_name),
      average_rate: num(row?.overall_stage_score_pct),
      stages: STAGE_ORDER.map((key) => {
        const yesRate = num(row?.[key]);
        const yes = Math.round((total * yesRate) / 100);
        return {
          code: key,
          label: STAGE_LABELS[key] || key,
          yes_count: yes,
          no_count: Math.max(0, total - yes),
          unknown_count: 0,
          yes_rate: yesRate,
        };
      }),
    };
  });
}

function adaptStageCompliance(report) {
  return {
    department: {
      average_rate: num(report?.sales_stage_compliance?.overall_stage_score_pct),
      stages: adaptDepartmentStages(report),
    },
    by_manager: adaptManagerStages(report),
  };
}

function adaptResponseSpeed(report, dashboard) {
  const department = report?.lead_response_speed?.department || {};
  return {
    department: {
      average_minutes: num(department.avg_first_response_time_min),
      measured_deals: num(department.known_count),
      deal_count: num(dashboard?.department?.total_deals),
      slow_pct: num(department.slow_pct),
    },
    by_manager: ensureArray(report?.lead_response_speed?.per_manager).map((row) => ({
      manager_id: String(row?.manager_id || ""),
      manager_label: managerLabel(report, row?.manager_id, row?.manager_name),
      average_minutes: num(row?.avg_first_response_time_min),
      measured_deals: num(row?.known_count),
      slow_pct: num(row?.slow_pct),
    })),
  };
}

function adaptLossReasons(report) {
  const failedDeals = num(report?.failure_reasons?.failed_deals_count);
  const reasons = ensureArray(report?.failure_reasons?.department_top_reasons).map((row) => ({
    key: row?.key || "",
    name: row?.label || row?.key || "Причина не указана",
    count: num(row?.count),
    total: num(row?.total),
    rate: num(row?.pct),
  }));
  return {
    department: {
      lost_deals: failedDeals,
      analyzed_failed_interactions: num(report?.failure_reasons?.failed_interactions_analyzed),
      reasons_top: reasons,
    },
    by_manager: ensureArray(report?.failure_reasons?.per_manager).map((row) => ({
      manager_id: String(row?.manager_id || ""),
      manager_label: managerLabel(report, row?.manager_id, row?.manager_name),
      lost_deals: num(row?.failed_deals_count ?? row?.failed_interactions_analyzed),
      lost_amount_kzt: num(row?.failed_amount),
      analyzed_failed_interactions: num(row?.failed_interactions_analyzed),
      reasons_top: ensureArray(row?.top_reasons).map((reason) => ({
        key: reason?.key || "",
        name: reason?.label || reason?.key || "Причина не указана",
        count: num(reason?.count),
        total: num(reason?.total),
        rate: num(reason?.pct),
      })),
    })),
  };
}

function adaptFailedDeals(report) {
  return {
    recovery_candidates: ensureArray(report?.failed_deal_reanimation?.cards).map((card) => ({
      deal_id: String(card?.deal_id || ""),
      deal_title: card?.deal_title || "",
      deal_url: card?.deal_url || "",
      contact_url: card?.contact_url || "",
      contact_name: card?.contact_name || "",
      manager_id: String(card?.manager_id || ""),
      manager_label: managerLabel(report, card?.manager_id, card?.manager_name),
      reason: ensureArray(card?.reason_signals).join(", "),
      comment: ensureArray(card?.recommendations).join(" "),
      summary: ensureArray(card?.recommendations).join(" "),
      priority: card?.priority || "",
    })),
  };
}

function adaptMissedRevenue(report) {
  const lost = report?.lost_revenue || {};
  return {
    lost_deals: num(lost.failed_deals_count),
    average_conversion_rate: num(lost.expected_conversion_pct),
    average_ticket_kzt: num(lost.average_ticket_kzt),
    estimated_missed_revenue_kzt: num(lost.estimated_lost_revenue_kzt),
    formula: lost.available
      ? "Проваленные сделки × ожидаемая конверсия × средний чек"
      : "Не рассчитано: укажите средний чек и ожидаемую конверсию",
    available: Boolean(lost.available),
    missing_inputs: ensureArray(lost.missing_inputs),
  };
}

function adaptProblems(report) {
  return ensureArray(report?.top_3_problems).map((item) => ({
    title: item?.label || item?.key || "Проблема",
    detail: `${num(item?.pct)}% взаимодействий: ${num(item?.count)} из ${num(item?.total)}`,
    key: item?.key || "",
    pct: num(item?.pct),
    count: num(item?.count),
    total: num(item?.total),
  }));
}

function adaptGrowthPoints(report) {
  return ensureArray(report?.top_3_growth_opportunities).map((item) => ({
    title: item?.title || "Точка роста",
    detail: item?.impact || item?.description || "",
    recommendation: item?.impact || "",
    priority: item?.priority || "",
  }));
}

export function buildExecutiveReportRun(report) {
  if (!report) return null;
  const scope = report.scope || {};
  return {
    id: EXECUTIVE_RUN_ID,
    title: "Executive sales report",
    created_at: report.generated_at || new Date().toISOString(),
    source: "executive_report",
    executive_report: report,
    scope_label: scope.mode === "bitrix" ? "Bitrix CRM" : "Проанализированные сделки",
    filters: {
      period_from: scope.date_from || "",
      period_to: scope.date_to || "",
      category_ids: ensureArray(scope.category_ids).map(String),
      responsible_id: scope.responsible_id || null,
      channels: ["call", "whatsapp"],
    },
  };
}

export function buildAppStateWithExecutiveReport(appState, report) {
  const run = buildExecutiveReportRun(report);
  if (!run) return appState;
  const state = appState || {};
  const history = state.history || {};
  const runs = [run, ...ensureArray(history.runs).filter((item) => item?.id !== run.id)];
  return {
    ...state,
    history: {
      ...history,
      latest_run_id: run.id,
      runs,
    },
    latest_run: run,
    runtime: {
      ...(state.runtime || {}),
      executive_report_loaded: true,
      executive_report_generated_at: report.generated_at || "",
    },
  };
}

export function buildSummaryFromExecutiveReport(report, baseSummary = {}) {
  if (!report) return baseSummary || null;

  const dashboard = adaptDashboard(report);
  const responseSpeed = adaptResponseSpeed(report, dashboard);
  const missedRevenue = adaptMissedRevenue(report);
  const topProblems = adaptProblems(report);
  const topGrowthPoints = adaptGrowthPoints(report);
  const department = dashboard.department || {};

  return {
    ...(baseSummary || {}),
    generated_at: report.generated_at || baseSummary?.generated_at || "",
    source: "executive_report",
    analysis_scope: {
      ...(baseSummary?.analysis_scope || {}),
      mode: report?.scope?.mode || "analyzed",
      label: report?.scope?.mode === "bitrix" ? "Bitrix CRM" : "Проанализированные сделки",
      filters: {
        category_ids: ensureArray(report?.scope?.category_ids).map(String),
        responsible_id: report?.scope?.responsible_id || null,
      },
    },
    crm_context: {
      ...(baseSummary?.crm_context || {}),
      total_deals: num(department.total_deals),
      open_deals: num(department.in_work_deals),
      won_deals: num(department.won_deals),
      lost_deals: num(department.lost_deals),
    },
    billing_quote: {
      ...(baseSummary?.billing_quote || {}),
      matched_deal_count: num(department.total_deals),
    },
    managers: dashboard.by_manager,
    data_quality_notes: ensureArray(report?.data_readiness)
      .filter((item) => item?.status !== "ready")
      .map((item) => `${item.question}: ${item.status}`),
    report_snapshot: {
      department_rating: adaptRating(report),
      dashboard,
      task_discipline: adaptTaskDiscipline(report),
      sales_stage_compliance: adaptStageCompliance(report),
      response_speed: responseSpeed,
      loss_reasons: adaptLossReasons(report),
      failed_deal_analysis: adaptFailedDeals(report),
      missed_revenue: missedRevenue,
      top_department_problems: topProblems,
      department_problems: topProblems,
      top_department_growth_points: topGrowthPoints,
      department_growth_points: topGrowthPoints,
      action_guide: [
        ...topGrowthPoints.map((item) => item.title).filter(Boolean),
        missedRevenue.available
          ? "Проверить расчет упущенной выгоды с фактической экономикой бизнеса."
          : "Добавить средний чек и ожидаемую конверсию для расчета упущенной выгоды.",
      ],
    },
  };
}
