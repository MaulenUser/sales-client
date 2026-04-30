import { ensureArray, normalizeRepoPath } from "../utils/index.js";
import {
  buildAppStateWithExecutiveReport,
  buildExecutiveReportRun,
  buildSummaryFromExecutiveReport,
} from "../utils/executiveReportAdapter.js";

const DATA_PATHS = {
  appState: ["/api/app-state", "mock-app-state.json"],
  summary: ["mock-aggregate-summary.json"],
  interactions: ["mock-interaction-index.json"],
  report: ["mock-sales-report.md"],
  usageSummary: ["mock-usage-summary.json"],
  usageEvents: ["mock-usage-events.json"],
};

const LIVE_BASE_URL = String(import.meta.env.VITE_BACKEND_URL || "").trim().replace(/\/+$/, "");
const LIVE_TIMEOUT_MS = parseTimeout(import.meta.env.VITE_API_TIMEOUT_MS, 60000);
const LIVE_PREVIEW_TIMEOUT_MS = parseTimeout(
  import.meta.env.VITE_PREVIEW_TIMEOUT_MS,
  Math.max(LIVE_TIMEOUT_MS, 90000),
);
const LIVE_AUDIT_RUN_TIMEOUT_MS = parseTimeout(
  import.meta.env.VITE_AUDIT_RUN_TIMEOUT_MS,
  1800000,
);
const LIVE_EXECUTIVE_JOB_POLL_MS = parseTimeout(
  import.meta.env.VITE_EXECUTIVE_JOB_POLL_MS,
  5000,
);
const LIVE_EXECUTIVE_JOB_TIMEOUT_MS = parseTimeout(
  import.meta.env.VITE_EXECUTIVE_JOB_TIMEOUT_MS,
  Math.max(LIVE_AUDIT_RUN_TIMEOUT_MS, 7200000),
);
const LIVE_FEEDBACK_WEBHOOK_URL = String(import.meta.env.VITE_FEEDBACK_WEBHOOK_URL || "").trim();
const LIVE_AUTH_REQUIRED = parseBoolean(import.meta.env.VITE_AUTH_REQUIRED, false);
const DEFAULT_TENANT_ID = normalizeTenantId(import.meta.env.VITE_TENANT_ID || "default");
const TENANT_STORAGE_KEY = "ai-auditor:tenant-id";
const AUTH_STORAGE_KEY = "ai-auditor:auth";
const EXECUTIVE_REPORT_JOB_STORAGE_KEY = "ai-auditor:executive-report-job";

const MOCK_SCOPE_MANAGERS = [
  { id: "8", name: "Жасуан Менеджер", active: true },
  { id: "18", name: "Жандос Менеджер", active: true },
  { id: "98", name: "Альханов Ruslan / директор Алматы", active: true },
  { id: "124", name: "Логист склад Алматы", active: true },
  { id: "131", name: "Кладовщик выдача", active: true },
];

function isLiveConfigured() {
  return Boolean(LIVE_BASE_URL);
}

function normalizeTenantId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || "default";
}

function parseBoolean(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function getStoredAuth() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  return String(getStoredAuth()?.access_token || "").trim();
}

function storeAuth(auth) {
  if (typeof window === "undefined") return null;
  const payload = {
    access_token: auth?.access_token || "",
    token_type: auth?.token_type || "bearer",
    expires_in: auth?.expires_in || 0,
    user: auth?.user || null,
    saved_at: new Date().toISOString(),
  };
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  if (payload.user?.tenant_id) setCurrentTenantId(payload.user.tenant_id);
  return payload;
}

export function clearStoredAuth() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export function getCurrentTenantId() {
  if (typeof window === "undefined") return DEFAULT_TENANT_ID;
  return normalizeTenantId(window.localStorage.getItem(TENANT_STORAGE_KEY) || DEFAULT_TENANT_ID);
}

export function setCurrentTenantId(value) {
  const tenantId = normalizeTenantId(value);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
  }
  return tenantId;
}

function withTenantHeader(headers = {}, { skipAuth = false } = {}) {
  const nextHeaders = {
    "X-Tenant-Id": getCurrentTenantId(),
    ...headers,
  };
  const token = skipAuth ? "" : getAuthToken();
  if (token && !nextHeaders.Authorization && !nextHeaders.authorization) {
    nextHeaders.Authorization = `Bearer ${token}`;
  }
  return nextHeaders;
}

function parseTimeout(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function asIsoDate(value) {
  const v = String(value || "").trim();
  return v || null;
}

function daysBetween(from, to) {
  const f = Date.parse(String(from || ""));
  const t = Date.parse(String(to || ""));
  if (!Number.isFinite(f) || !Number.isFinite(t) || t < f) return 0;
  return Math.floor((t - f) / 86400000) + 1;
}

function buildUrl(path, query) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== null && item !== undefined && item !== "") params.append(key, String(item));
      });
      return;
    }
    params.append(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${normalizedPath}?${qs}` : normalizedPath;
}

function makeHttpError(status, bodyText, url) {
  const text = String(bodyText || "").trim();
  const message = text || `HTTP ${status}`;
  const err = new Error(`Request failed: ${url} (${status}) ${message}`);
  err.status = status;
  err.bodyText = text;
  return err;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = LIVE_TIMEOUT_MS) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetch(url, {
      cache: "no-store",
      ...options,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: "no-store",
      ...options,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutSeconds = Math.round(timeoutMs / 1000);
      const timeoutErr = new Error(`Request timed out after ${timeoutSeconds}s: ${url}`);
      timeoutErr.name = "AbortError";
      timeoutErr.status = 0;
      timeoutErr.timeoutMs = timeoutMs;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveJson(path, { method = "GET", headers = {}, query, body, timeoutMs, skipAuth = false } = {}) {
  if (!isLiveConfigured()) {
    throw new Error("Live backend is not configured");
  }
  const url = buildUrl(path, query);
  const res = await fetchWithTimeout(
    url,
    { method, headers: withTenantHeader(headers, { skipAuth }), body },
    timeoutMs,
  );
  if (!res.ok) {
    throw makeHttpError(res.status, await res.text(), url);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readStoredExecutiveReportJob() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EXECUTIVE_REPORT_JOB_STORAGE_KEY);
    const job = raw ? JSON.parse(raw) : null;
    if (job?.tenant_id && job.tenant_id !== getCurrentTenantId()) return null;
    return job;
  } catch {
    return null;
  }
}

function storeExecutiveReportJob(job) {
  if (typeof window === "undefined" || !job?.job_id) return;
  window.localStorage.setItem(
    EXECUTIVE_REPORT_JOB_STORAGE_KEY,
    JSON.stringify({ tenant_id: getCurrentTenantId(), ...job }),
  );
}

function clearStoredExecutiveReportJob(jobId) {
  if (typeof window === "undefined") return;
  const stored = readStoredExecutiveReportJob();
  if (!jobId || stored?.job_id === jobId) {
    window.localStorage.removeItem(EXECUTIVE_REPORT_JOB_STORAGE_KEY);
  }
}

export function getPendingExecutiveReportJob() {
  return readStoredExecutiveReportJob();
}

async function pollExecutiveReportJob(jobId) {
  const startedAt = Date.now();
  const pollMs = Math.max(1000, LIVE_EXECUTIVE_JOB_POLL_MS);

  while (true) {
    const job = await fetchLiveJson(`/executive-report/jobs/${encodeURIComponent(jobId)}`, {
      timeoutMs: LIVE_TIMEOUT_MS,
    });

    if (job?.status === "completed") {
      clearStoredExecutiveReportJob(jobId);
      return job;
    }
    if (job?.status === "error") {
      clearStoredExecutiveReportJob(jobId);
      const err = new Error(job?.error || "Запуск анализа завершился ошибкой");
      err.status = 0;
      err.job = job;
      throw err;
    }
    if (Date.now() - startedAt > LIVE_EXECUTIVE_JOB_TIMEOUT_MS) {
      const timeoutSeconds = Math.round(LIVE_EXECUTIVE_JOB_TIMEOUT_MS / 1000);
      const err = new Error(`Анализ все еще выполняется после ${timeoutSeconds}s`);
      err.status = 0;
      err.job = job;
      throw err;
    }

    await sleep(pollMs);
  }
}

function buildExecutiveReportResponse(response, appState, jobId = null) {
  return fetchExecutiveReport().then((fallbackReport) => {
    const report = response?.executive_report || fallbackReport;
    if (!report) {
      throw new Error("Анализ завершился, но итоговый executive-report.json не найден");
    }
    const run = buildExecutiveReportRun(report);
    const nextAppState = buildAppStateWithExecutiveReport(appState, report);
    return {
      run,
      app_state: nextAppState,
      executive_report: report,
      summary: buildSummaryFromExecutiveReport(report),
      backend: {
        status: response?.status || "ok",
        source: "executive_pipeline",
        job_id: jobId,
      },
    };
  });
}

export async function resumePendingExecutiveReportBuild(appState) {
  const pending = getPendingExecutiveReportJob();
  if (!pending?.job_id) return null;
  const response = await pollExecutiveReportJob(pending.job_id);
  return buildExecutiveReportResponse(response, appState, pending.job_id);
}

function requireValue(value, name) {
  if (!value) {
    const err = new Error(`${name} is not configured`);
    err.status = 0;
    throw err;
  }
  return value;
}

function normalizeLauncherManagers(rows) {
  return ensureArray(rows).map((row) => ({
    id: String(row?.id || row?.ID || "").trim(),
    label: String(row?.name || row?.NAME || "Менеджер").trim(),
    interaction_count: 0,
    active: row?.active !== false,
    email: row?.email || row?.EMAIL || "",
  })).filter((row) => row.id);
}

function normalizeLauncherCategories(rows) {
  return ensureArray(rows).map((row) => ({
    id: String(row?.id || row?.ID || "").trim(),
    label: String(row?.name || row?.NAME || "Воронка").trim(),
    interaction_count: 0,
    deal_count: 0,
    sort: Number(row?.sort || row?.SORT || 0),
  })).filter((row) => row.id).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "ru"));
}

function normalizeScopeManagers(rows) {
  return ensureArray(rows).map((row) => ({
    id: String(row?.id || "").trim(),
    name: String(row?.name || row?.label || "").trim() || `Ответственный #${row?.id}`,
    email: row?.email || "",
    active: row?.active !== false,
  })).filter((row) => row.id);
}

function normalizeTenants(rows) {
  return ensureArray(rows).map((row) => {
    const id = normalizeTenantId(row?.id || row?.tenant_id || "");
    return {
      id,
      name: String(row?.name || row?.label || id).trim() || id,
      created_at: row?.created_at || "",
    };
  }).filter((row) => row.id);
}

async function fetchLiveAppState() {
  const [backendState, funnelsPayload, managersPayload] = await Promise.all([
    fetchLiveJson("/api/app-state").catch(() => null),
    fetchLiveJson("/catalog/funnels").catch(() => null),
    fetchLiveJson("/catalog/managers").catch(() => null),
  ]);

  const mockBase = await fetchJson("mock-app-state.json").catch(() => ({}));
  const baseSetup = {
    ...(mockBase?.setup || {}),
    ...(backendState?.setup || {}),
  };

  const availableCategories = normalizeLauncherCategories(funnelsPayload?.funnels);
  const availableManagers = normalizeLauncherManagers(managersPayload?.managers);
  const defaultCategoryId = availableCategories[0]?.id || "";
  const tenantId = backendState?.tenant_id || getCurrentTenantId();

  return {
    ...mockBase,
    tenant_id: tenantId,
    setup: {
      ...baseSetup,
      analysis_launcher: {
        ...(baseSetup?.analysis_launcher || {}),
        available_categories: availableCategories,
        available_managers: availableManagers,
        default_filters: {
          ...((baseSetup?.analysis_launcher || {}).default_filters || {}),
          category_ids: defaultCategoryId ? [defaultCategoryId] : [],
        },
      },
    },
    runtime: {
      source: "live",
      backend_url: LIVE_BASE_URL,
      refreshed_at: new Date().toISOString(),
    },
  };
}

async function fetchJson(path) {
  if (path === "/api/app-state" && isLiveConfigured()) {
    return fetchLiveAppState();
  }
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load JSON: ${path} (${res.status})`);
  return res.json();
}

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load text: ${path} (${res.status})`);
  return res.text();
}

export async function fetchTextSafe(path) {
  try {
    return await fetchText(path);
  } catch {
    return "";
  }
}

async function fetchJsonAny(paths) {
  let lastError = null;
  for (const path of ensureArray(paths)) {
    try {
      return await fetchJson(path);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("No JSON paths available");
}

async function fetchTextAny(paths) {
  let lastError = null;
  for (const path of ensureArray(paths)) {
    try {
      return await fetchText(path);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("No text paths available");
}

function buildEstimateFromPreview(preview, payload) {
  const matched = Number(preview?.deal_count || 0);
  const managerCount = Number(preview?.scope_manager_count || preview?.manager_count || 0);
  const periodDays = daysBetween(payload?.period_from, payload?.period_to) || 30;
  const estimatedTokens = Math.max(0, matched * 1200);
  const estimatedCost = Math.max(0, Math.round(matched * 120));
  return {
    estimate: {
      estimated_cost_kzt: estimatedCost,
      estimated_tokens: estimatedTokens,
      interaction_count: matched,
      manager_count: managerCount,
      matched_deal_count: matched,
      period_days: periodDays,
      breakdown: [{ label: "Анализ (live)", value: estimatedCost, unit: "KZT" }],
      source: "live",
    },
    warnings: ensureArray(preview?.warnings),
    scope_managers: normalizeScopeManagers(preview?.scope_managers),
  };
}

function getScopeLabel(payload, appState) {
  const launcher = appState?.setup?.analysis_launcher || {};
  const categories = ensureArray(launcher?.available_categories);
  const categoryIds = ensureArray(payload?.category_ids).map(String);
  const categoryMap = new Map(categories.map((row) => [String(row?.id), row?.label || `Воронка #${row?.id}`]));

  const categoryLabel = categoryIds.length
    ? categoryIds.map((id) => categoryMap.get(id) || `Воронка #${id}`).join(", ")
    : "Все воронки";

  const responsibleIds = getResponsibleIds(payload);
  const responsibleLabel = responsibleIds.length
    ? (payload?.responsible_label || responsibleIds.map((id) => `Ответственный #${id}`).join(", "))
    : "Все ответственные";

  return `${responsibleLabel} / ${categoryLabel}`;
}

function getResponsibleIds(payload) {
  const ids = ensureArray(payload?.responsible_ids).map(String).filter(Boolean);
  if (ids.length) return ids;
  return payload?.responsible_id ? [String(payload.responsible_id)] : [];
}

function upsertRunToAppState(appState, run) {
  const state = appState || {};
  const history = state.history || {};
  const existingRuns = ensureArray(history.runs);
  const runs = [run, ...existingRuns.filter((row) => row?.id !== run.id)];
  return {
    ...state,
    history: {
      ...history,
      latest_run_id: run.id,
      runs,
      summary: {
        ...(history.summary || {}),
        total_runs: runs.length,
        latest_cost_kzt: Number(run?.quote?.estimated_cost_kzt || history?.summary?.latest_cost_kzt || 0),
      },
    },
    latest_run: {
      id: run.id,
      title: run.title,
      scope_label: run.scope_label,
    },
    current_assets: {
      ...(state.current_assets || {}),
      summary_path: run.summary_path,
      interaction_path: run.interaction_path,
      report_path: run.report_path,
    },
    runtime: {
      ...(state.runtime || {}),
      source: "live",
      backend_url: LIVE_BASE_URL,
      refreshed_at: new Date().toISOString(),
    },
  };
}

function buildLiveRun(payload, appState, estimate) {
  const now = new Date();
  const id = `run-live-${now.getTime()}`;
  const scopeLabel = getScopeLabel(payload, appState);
  const activeRun = appState?.latest_run || {};
  const currentAssets = appState?.current_assets || {};
  const summaryPath = activeRun?.summary_path || currentAssets?.summary_path || "./mock-aggregate-summary.json";
  const interactionPath = activeRun?.interaction_path || currentAssets?.interaction_path || "./mock-interaction-index.json";
  const reportPath = activeRun?.report_path || currentAssets?.report_path || "./mock-sales-report.md";

  return {
    id,
    title: `AI аудит: ${scopeLabel}`,
    created_at: now.toISOString(),
    scope_label: scopeLabel,
    filters: {
      period_from: asIsoDate(payload?.period_from),
      period_to: asIsoDate(payload?.period_to),
      responsible_id: getResponsibleIds(payload)[0] || null,
      responsible_ids: getResponsibleIds(payload),
      category_ids: ensureArray(payload?.category_ids).map(String),
      channels: ["call", "whatsapp"],
    },
    quote: {
      estimated_cost_kzt: Number(estimate?.estimated_cost_kzt || 0),
      estimated_tokens: Number(estimate?.estimated_tokens || 0),
    },
    summary_path: summaryPath,
    interaction_path: interactionPath,
    report_path: reportPath,
  };
}

async function postLiveEstimate(payload) {
  const categoryIds = ensureArray(payload?.category_ids).map(String).filter(Boolean);
  const responsibleIds = getResponsibleIds(payload);

  const preview = await fetchLiveJson("/audit/preview", {
    timeoutMs: LIVE_PREVIEW_TIMEOUT_MS,
    query: {
      funnel_id: categoryIds,
      date_from: asIsoDate(payload?.period_from),
      date_to: asIsoDate(payload?.period_to),
      responsible_id: responsibleIds,
    },
  });

  return buildEstimateFromPreview(preview, payload);
}

async function postLiveRun(payload, appState) {
  const categoryIds = ensureArray(payload?.category_ids).map(String).filter(Boolean);
  const responsibleIds = getResponsibleIds(payload);

  const form = new URLSearchParams();
  categoryIds.forEach((id) => form.append("funnel_id", id));
  if (payload?.period_from) form.set("date_from", payload.period_from);
  if (payload?.period_to) form.set("date_to", payload.period_to);
  responsibleIds.forEach((id) => form.append("responsible_id", id));
  form.set("limit", "0");

  const response = await fetchLiveJson("/audit/run", {
    method: "POST",
    timeoutMs: LIVE_AUDIT_RUN_TIMEOUT_MS,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const latestEstimate = appState?.analysisQuote || null;
  const estimate = latestEstimate || {
    estimated_cost_kzt: 0,
    estimated_tokens: 0,
  };

  const run = buildLiveRun(payload, appState, estimate);
  const nextAppState = upsertRunToAppState(appState, run);

  return {
    run,
    app_state: nextAppState,
    backend: {
      status: response?.status || "ok",
      source: "live",
    },
  };
}

async function postLiveExecutiveReportBuild(payload, appState) {
  const categoryIds = ensureArray(payload?.category_ids).map(String).filter(Boolean);
  const responsibleIds = getResponsibleIds(payload);
  const form = new URLSearchParams();

  if (payload?.sales_quality_dir) form.set("sales_quality_dir", payload.sales_quality_dir);
  if (payload?.output_dir) form.set("output_dir", payload.output_dir);
  if (payload?.whatsapp_dir) form.set("whatsapp_dir", payload.whatsapp_dir);
  if (payload?.call_scan_dir) form.set("call_scan_dir", payload.call_scan_dir);
  if (payload?.recordings_dir) form.set("recordings_dir", payload.recordings_dir);
  if (payload?.period_from) form.set("date_from", payload.period_from);
  if (payload?.period_to) form.set("date_to", payload.period_to);
  categoryIds.forEach((id) => form.append("category_id", id));
  responsibleIds.forEach((id) => form.append("responsible_id", id));
  if (payload?.average_ticket_kzt) form.set("average_ticket_kzt", String(payload.average_ticket_kzt));
  if (payload?.expected_conversion_pct) form.set("expected_conversion_pct", String(payload.expected_conversion_pct));
  form.set("limit", String(payload?.limit || 0));
  form.set("reset_outputs", "true");
  form.set("include_whatsapp_audio", payload?.include_whatsapp_audio ? "true" : "false");
  form.set("wait", "false");

  const startResponse = await fetchLiveJson("/executive-report/run", {
    method: "POST",
    timeoutMs: LIVE_TIMEOUT_MS,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (startResponse?.job_id) {
    storeExecutiveReportJob({
      job_id: startResponse.job_id,
      tenant_id: startResponse.tenant_id || getCurrentTenantId(),
      status: startResponse.status || "started",
      started_at: new Date().toISOString(),
      request: {
        period_from: asIsoDate(payload?.period_from),
        period_to: asIsoDate(payload?.period_to),
        category_ids: categoryIds,
        responsible_ids: responsibleIds,
      },
    });
  }

  const response = startResponse?.job_id
    ? await pollExecutiveReportJob(startResponse.job_id)
    : startResponse;
  return buildExecutiveReportResponse(response, appState, startResponse?.job_id || null);
}

async function postLiveFeedback(payload) {
  if (LIVE_FEEDBACK_WEBHOOK_URL) {
    const res = await fetchWithTimeout(LIVE_FEEDBACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) {
      throw makeHttpError(res.status, await res.text(), LIVE_FEEDBACK_WEBHOOK_URL);
    }
    return { status: "sent", source: "feedback_webhook" };
  }

  return await fetchLiveJson("/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

const MOCK_FALLBACKS = {
  "/api/setup-profile": (payload, appState) => ({
    app_state: {
      ...appState,
      setup: { ...(appState?.setup || {}), business_profile: payload },
    },
  }),
  "/api/analysis/estimate": (payload) => ({
    estimate: {
      estimated_cost_kzt: 4500,
      estimated_tokens: 120000,
      interaction_count: 84,
      manager_count: getResponsibleIds(payload).length || 3,
      matched_deal_count: 36,
      period_days: 31,
      breakdown: [{ label: "Анализ (мок)", value: 4500, unit: "KZT" }],
      source: "mock",
    },
  }),
  "/api/analysis/runs": (payload, appState) => {
    const run = buildLiveRun(payload, appState, {
      estimated_cost_kzt: 4500,
      estimated_tokens: 120000,
    });
    return {
      run,
      app_state: upsertRunToAppState(appState, run),
      backend: { status: "fallback", source: "mock" },
    };
  },
  "/api/feedback": (payload) => ({
    status: "saved",
    source: "mock",
    feedback_id: `feedback-${Date.now()}`,
    payload,
  }),
};

async function postLiveSetupProfile(payload) {
  return fetchLiveJson("/api/setup-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

async function postLiveTenant(payload) {
  const tenantId = normalizeTenantId(payload?.id || payload?.tenant_id || "");
  return fetchLiveJson("/api/tenants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: tenantId,
      name: String(payload?.name || tenantId).trim() || tenantId,
    }),
  });
}

export function isLiveAuthRequired() {
  return LIVE_AUTH_REQUIRED;
}

export async function fetchAuthStatus() {
  if (!isLiveConfigured()) {
    return { auth_required: false, has_users: false };
  }
  try {
    return await fetchLiveJson("/api/auth/status", { skipAuth: true });
  } catch {
    return { auth_required: LIVE_AUTH_REQUIRED, has_users: false };
  }
}

export async function postLiveLogin(payload) {
  if (!isLiveConfigured()) {
    throw new Error("Live backend is not configured");
  }
  const response = await fetchLiveJson("/api/auth/login", {
    method: "POST",
    skipAuth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: String(payload?.username || "").trim(),
      password: String(payload?.password || ""),
    }),
  });
  return storeAuth(response);
}

export async function fetchLiveCurrentUser() {
  if (!isLiveConfigured() || !getAuthToken()) return null;
  const response = await fetchLiveJson("/api/auth/me");
  return response?.user || null;
}

export async function fetchAuditScope({ categoryIds, periodFrom, periodTo }) {
  if (!isLiveConfigured()) {
    return {
      scopeManagers: MOCK_SCOPE_MANAGERS,
      scopeManagerCount: MOCK_SCOPE_MANAGERS.length,
      warnings: [],
    };
  }
  const preview = await fetchLiveJson("/audit/preview", {
    timeoutMs: LIVE_PREVIEW_TIMEOUT_MS,
    query: {
      funnel_id: ensureArray(categoryIds).filter(Boolean),
      date_from: asIsoDate(periodFrom),
      date_to: asIsoDate(periodTo),
    },
  });
  return {
    scopeManagers: normalizeScopeManagers(preview?.scope_managers),
    scopeManagerCount: Number(preview?.scope_manager_count || 0),
    warnings: ensureArray(preview?.warnings),
  };
}

export async function fetchExecutiveReport() {
  if (!isLiveConfigured()) return null;
  try {
    return await fetchLiveJson("/executive-report/latest");
  } catch {
    return null;
  }
}

export async function fetchTenants() {
  if (!isLiveConfigured()) {
    return [{ id: getCurrentTenantId(), name: getCurrentTenantId(), created_at: "" }];
  }
  try {
    const payload = await fetchLiveJson("/api/tenants");
    const tenants = normalizeTenants(payload?.tenants);
    return tenants.length ? tenants : [{ id: getCurrentTenantId(), name: getCurrentTenantId(), created_at: "" }];
  } catch {
    return [{ id: getCurrentTenantId(), name: getCurrentTenantId(), created_at: "" }];
  }
}

export async function postJson(url, payload, appState) {
  const liveHandlers = {
    "/api/setup-profile": () => postLiveSetupProfile(payload),
    "/api/analysis/estimate": () => postLiveEstimate(payload),
    "/api/analysis/runs": () => postLiveRun(payload, appState),
    "/api/executive-report/build": () => postLiveExecutiveReportBuild(payload, appState),
    "/api/feedback": () => postLiveFeedback(payload),
    "/api/setup-integrations": () => postLiveSetupIntegrations(payload),
    "/api/tenants": () => postLiveTenant(payload),
  };

  const liveHandler = liveHandlers[url];
  if (liveHandler && isLiveConfigured()) {
    return await liveHandler();
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) throw new Error(`Request failed: ${url} (${res.status})`);
    return res.json();
  } catch (err) {
    const mock = MOCK_FALLBACKS[url];
    if (mock) return mock(payload, appState);
    throw err;
  }
}

export async function loadJsonFromPath(path, cache) {
  const url = normalizeRepoPath(path);
  if (!url) throw new Error("Path is not available");
  if (cache?.has(url)) return cache.get(url);
  const data = await fetchJson(url);
  cache?.set(url, data);
  return data;
}

export function isCrmWebhookConfigured(appState) {
  return Boolean(appState?.setup?.integrations?.bitrix_webhook_url_configured);
}

export async function fetchIntegrations() {
  if (!isLiveConfigured()) return null;
  try {
    return await fetchLiveJson("/api/integrations");
  } catch {
    return null;
  }
}

async function postLiveSetupIntegrations(payload) {
  return fetchLiveJson("/api/setup-integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

export { DATA_PATHS, fetchJsonAny, fetchTextAny, fetchJson };
