import { create } from "zustand";
import {
  clearStoredAuth,
  fetchAuthStatus,
  fetchExecutiveReport,
  fetchTenants,
  fetchJsonAny,
  fetchTextAny,
  fetchJson,
  fetchLiveCurrentUser,
  getStoredAuth,
  getCurrentTenantId,
  postLiveLogin,
  postBitrixConnectStart,
  postJson,
  resumePendingExecutiveReportBuild,
  setCurrentTenantId as persistCurrentTenantId,
  DATA_PATHS,
} from "../api/index.js";
import {
  buildAppStateWithExecutiveReport,
  buildSummaryFromExecutiveReport,
} from "../utils/executiveReportAdapter.js";
import { ensureArray, normalizeRepoPath } from "../utils/index.js";

const useStore = create((set, get) => ({
  appState: null,
  baseSummary: null,
  baseInteractions: [],
  summary: null,
  interactions: [],
  reportMarkdown: "",
  usageSummary: null,
  usageEvents: [],
  executiveReport: null,
  authRequired: false,
  authStatus: null,
  authToken: getStoredAuth()?.access_token || "",
  currentUser: getStoredAuth()?.user || null,
  currentTenantId: getCurrentTenantId(),
  tenants: [],
  activeRunId: null,
  selectedId: null,
  analysisQuote: null,
  analysisQuoteRequestKey: "",
  filters: {
    search: "",
    channel: "all",
    relevance: "all",
    outcome: "all",
    manager: "all",
  },
  featureCache: new Map(),
  sourceCache: new Map(),
  isLoading: false,
  error: null,

  setFilters: (patch) =>
    set((s) => ({ filters: { ...s.filters, ...patch } })),

  setSelectedId: (id) => set({ selectedId: id }),

  setAnalysisQuote: (quote, key) =>
    set({ analysisQuote: quote, analysisQuoteRequestKey: key }),

  clearAnalysisQuote: () =>
    set({ analysisQuote: null, analysisQuoteRequestKey: "" }),

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const auth = await postLiveLogin(credentials);
      set({
        authToken: auth?.access_token || "",
        currentUser: auth?.user || null,
        authRequired: false,
        currentTenantId: auth?.user?.tenant_id || getCurrentTenantId(),
      });
      await get().init();
      return auth;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: () => {
    clearStoredAuth();
    set({
      authToken: "",
      currentUser: null,
      appState: null,
      executiveReport: null,
      summary: null,
      interactions: [],
      activeRunId: null,
      selectedId: null,
      analysisQuote: null,
      analysisQuoteRequestKey: "",
    });
  },

  loadTenants: async () => {
    const tenants = await fetchTenants();
    set({ tenants, currentTenantId: getCurrentTenantId() });
    return tenants;
  },

  setCurrentTenant: async (tenantId) => {
    const user = get().currentUser;
    if (user && user.role !== "admin" && tenantId !== user.tenant_id) {
      throw new Error("Нет доступа к этому клиенту");
    }
    const nextTenantId = persistCurrentTenantId(tenantId);
    set({
      currentTenantId: nextTenantId,
      executiveReport: null,
      activeRunId: null,
      selectedId: null,
      analysisQuote: null,
      analysisQuoteRequestKey: "",
    });
    await get().refreshAppState();
    return nextTenantId;
  },

  saveTenant: async (payload) => {
    const { appState, loadTenants, setCurrentTenant } = get();
    const res = await postJson("/api/tenants", payload, appState);
    await loadTenants();
    const tenantId = res?.tenant?.id || payload?.id || payload?.tenant_id;
    if (tenantId) await setCurrentTenant(tenantId);
    return res;
  },

  getActiveRun: () => {
    const { appState, activeRunId } = get();
    const runs = ensureArray(appState?.history?.runs);
    return (
      runs.find((r) => r.id === activeRunId) ||
      appState?.latest_run ||
      null
    );
  },

  activateRunData: async (runId) => {
    const { appState, baseSummary, baseInteractions } = get();
    if (runId) set({ activeRunId: runId });

    const getActiveRun = () => {
      const id = runId || get().activeRunId;
      const runs = ensureArray(appState?.history?.runs);
      return runs.find((r) => r.id === id) || appState?.latest_run || null;
    };

    const run = getActiveRun();

    if (run?.source === "executive_report" || run?.source === "sales_audit_report") {
      const reportRunId =
        run?.run_id || (run?.id && run.id !== "run-executive-latest" ? run.id : "");
      const report = run?.executive_report || await fetchExecutiveReport(reportRunId).catch(() => null);
      if (!report) return;
      const summary = buildSummaryFromExecutiveReport(report, baseSummary);
      set({
        executiveReport: report,
        summary,
        interactions: ensureArray(baseInteractions),
        reportMarkdown: "",
        selectedId: ensureArray(baseInteractions)[0]?.interaction_id || null,
        filters: {
          search: "",
          channel: "all",
          relevance: "all",
          outcome: "all",
          manager: "all",
        },
      });
      return;
    }

    const loadSummary = async () => {
      const p = run?.summary_path || appState?.current_assets?.summary_path;
      const url = normalizeRepoPath(p);
      if (!url) return baseSummary;
      try { return await fetchJson(url); } catch { return baseSummary; }
    };

    const loadInteractions = async () => {
      if (run && !run.interaction_path) return fallbackRunInteractions(run, baseInteractions);
      const p = run?.interaction_path || appState?.current_assets?.interaction_path;
      const url = normalizeRepoPath(p);
      if (!url) return fallbackRunInteractions(run, baseInteractions);
      try { return ensureArray(await fetchJson(url)); }
      catch { return fallbackRunInteractions(run, baseInteractions); }
    };

    const loadReport = async () => {
      const p = run?.report_path || appState?.current_assets?.report_path;
      const url = normalizeRepoPath(p);
      if (!url) return "";
      try {
        const res = await fetch(url, { cache: "no-store" });
        return res.ok ? res.text() : "";
      } catch { return ""; }
    };

    const [summary, interactions, markdown] = await Promise.all([
      loadSummary(),
      loadInteractions(),
      loadReport(),
    ]);

    set((s) => ({
      summary: summary || s.baseSummary,
      interactions: ensureArray(interactions),
      reportMarkdown: markdown || s.reportMarkdown,
      selectedId: ensureArray(interactions)[0]?.interaction_id || null,
      filters: {
        search: "",
        channel: "all",
        relevance: "all",
        outcome: "all",
        manager: "all",
      },
    }));
  },

  refreshAppState: async () => {
    const { activeRunId, activateRunData } = get();
    const [rawAppState, executiveReport] = await Promise.all([
      fetchJsonAny(DATA_PATHS.appState).catch(() => get().appState),
      fetchExecutiveReport().catch(() => null),
    ]);
    const appState = executiveReport
      ? buildAppStateWithExecutiveReport(rawAppState, executiveReport)
      : rawAppState;
    const newRunId =
      executiveReport
        ? appState?.history?.latest_run_id || appState?.latest_run?.id || "run-executive-latest"
        : activeRunId ||
      appState?.history?.latest_run_id ||
      appState?.latest_run?.id ||
      null;
    const summary = executiveReport
      ? buildSummaryFromExecutiveReport(executiveReport, get().baseSummary)
      : get().summary;
    set({
      appState,
      currentTenantId: appState?.tenant_id || getCurrentTenantId(),
      activeRunId: newRunId,
      executiveReport,
      ...(summary ? { summary } : {}),
    });
    if (!executiveReport) await activateRunData(newRunId);
  },

  init: async () => {
    set({ isLoading: true, error: null });
    try {
      const authStatus = await fetchAuthStatus().catch(() => ({ auth_required: false }));
      let storedAuth = getStoredAuth();
      if (authStatus?.auth_required && !storedAuth?.access_token) {
        set({
          authRequired: true,
          authStatus,
          authToken: "",
          currentUser: null,
          isLoading: false,
          error: null,
        });
        return;
      }

      let currentUser = storedAuth?.user || null;
      if (storedAuth?.access_token) {
        try {
          currentUser = await fetchLiveCurrentUser();
        } catch (err) {
          if (err?.status === 401 || err?.status === 403) {
            clearStoredAuth();
            storedAuth = null;
            currentUser = null;
            if (authStatus?.auth_required) {
              set({
                authRequired: true,
                authStatus,
                authToken: "",
                currentUser: null,
                isLoading: false,
                error: null,
              });
              return;
            }
          }
          if (err?.status !== 401 && err?.status !== 403) throw err;
        }
      }

      if (currentUser?.tenant_id) persistCurrentTenantId(currentUser.tenant_id);

      const [appState, summary, interactions, reportMarkdown, usageSummary, usageEvents, tenants] =
        await Promise.all([
          fetchJsonAny(DATA_PATHS.appState).catch(() => null),
          fetchJsonAny(DATA_PATHS.summary).catch(() => null),
          fetchJsonAny(DATA_PATHS.interactions).catch(() => []),
          fetchTextAny(DATA_PATHS.report).catch(() => ""),
          fetchJsonAny(DATA_PATHS.usageSummary).catch(() => null),
          fetchJsonAny(DATA_PATHS.usageEvents).catch(() => []),
          fetchTenants().catch(() => []),
        ]);
      const executiveReport = await fetchExecutiveReport().catch(() => null);

      const interactionArr = ensureArray(interactions);
      const resolvedSummary = executiveReport
        ? buildSummaryFromExecutiveReport(executiveReport, summary)
        : summary;
      const resolvedAppState = executiveReport
        ? buildAppStateWithExecutiveReport(appState, executiveReport)
        : appState;
      const runId =
        executiveReport
          ? resolvedAppState?.history?.latest_run_id || resolvedAppState?.latest_run?.id || "run-executive-latest"
          : appState?.history?.latest_run_id || appState?.latest_run?.id || null;

      set({
        appState: resolvedAppState,
        authRequired: Boolean(authStatus?.auth_required),
        authStatus,
        authToken: storedAuth?.access_token || "",
        currentUser,
        currentTenantId: resolvedAppState?.tenant_id || getCurrentTenantId(),
        tenants,
        baseSummary: summary,
        baseInteractions: interactionArr,
        summary: resolvedSummary,
        interactions: interactionArr,
        reportMarkdown,
        usageSummary,
        usageEvents: ensureArray(usageEvents),
        executiveReport,
        activeRunId: runId,
        selectedId: interactionArr[0]?.interaction_id || null,
        isLoading: false,
      });

      if (runId && !executiveReport) await get().activateRunData(runId);
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  saveBusinessProfile: async (payload) => {
    const { appState } = get();
    const res = await postJson("/api/setup-profile", payload, appState);
    set({ appState: res.app_state || appState });
    return res;
  },

  saveIntegrations: async (payload) => {
    const { appState } = get();
    const res = await postJson("/api/setup-integrations", payload, appState);
    if (res?.integrations) {
      set({
        appState: {
          ...appState,
          setup: { ...(appState?.setup || {}), integrations: res.integrations },
        },
      });
    }
    return res;
  },

  startBitrixConnect: async (payload) => {
    const { appState } = get();
    const res = await postBitrixConnectStart(payload);
    if (res?.bitrix_oauth) {
      set({
        appState: {
          ...appState,
          setup: { ...(appState?.setup || {}), bitrix_oauth: res.bitrix_oauth },
        },
      });
    }
    return res;
  },

  estimateAnalysis: async (request) => {
    const { appState } = get();
    return await postJson("/api/analysis/estimate", request, appState);
  },

  createAnalysisRun: async (request) => {
    const { appState, activateRunData } = get();
    const res = await postJson("/api/analysis/runs", request, appState);
    set({
      analysisQuote: res.run?.quote || get().analysisQuote,
      appState: res.app_state || appState,
    });
    await activateRunData(res.run?.id || get().activeRunId);
    return res.run;
  },

  buildExecutiveReportRun: async (request) => {
    const { appState, baseSummary } = get();
    const res = await postJson("/api/executive-report/build", request, appState);
    const report = res.executive_report || null;
    const nextAppState = res.app_state || (report
      ? buildAppStateWithExecutiveReport(appState, report)
      : appState);
    const summary = report
      ? buildSummaryFromExecutiveReport(report, baseSummary)
      : res.summary || get().summary;
    const runId =
      res.run?.id ||
      nextAppState?.history?.latest_run_id ||
      nextAppState?.latest_run?.id ||
      get().activeRunId;
    set({
      appState: nextAppState,
      executiveReport: report,
      summary,
      activeRunId: runId,
      reportMarkdown: "",
    });
    return res.run || nextAppState?.latest_run || null;
  },

  resumeExecutiveReportRun: async () => {
    const { appState, baseSummary } = get();
    const res = await resumePendingExecutiveReportBuild(appState);
    if (!res) return null;
    const report = res.executive_report || null;
    const nextAppState = res.app_state || (report
      ? buildAppStateWithExecutiveReport(appState, report)
      : appState);
    const summary = report
      ? buildSummaryFromExecutiveReport(report, baseSummary)
      : res.summary || get().summary;
    const runId =
      res.run?.id ||
      nextAppState?.history?.latest_run_id ||
      nextAppState?.latest_run?.id ||
      get().activeRunId;
    set({
      appState: nextAppState,
      executiveReport: report,
      summary,
      activeRunId: runId,
      reportMarkdown: "",
    });
    return res.run || nextAppState?.latest_run || null;
  },
}));

function fallbackRunInteractions(run, baseInteractions) {
  const rows = ensureArray(baseInteractions);
  if (!run?.filters) return rows;
  return rows.filter((row) => {
    const f = run.filters || {};
    const mids = ensureArray(f.manager_ids || f.responsible_ids || f.responsible_id).map(String);
    const cids = ensureArray(f.category_ids).map(String);
    const createdAt = row.created_at ? String(row.created_at).slice(0, 10) : "";
    if (mids.length && !mids.includes(String(row.manager_id || ""))) return false;
    if (cids.length && !cids.includes(String(row.deal_category_id || ""))) return false;
    if (f.period_from && createdAt && createdAt < f.period_from) return false;
    if (f.period_to && createdAt && createdAt > f.period_to) return false;
    return true;
  });
}

export default useStore;
