import React from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import { formatDate } from "../utils/format.js";
import { ensureArray } from "../utils/index.js";

function createLabelMap(rows) {
  const map = new Map();
  ensureArray(rows).forEach((row) => {
    const id = String(row?.id || "").trim();
    if (!id) return;
    map.set(id, row?.label || `#${id}`);
  });
  return map;
}

function formatFilterText(run, launcher) {
  const filters = run?.filters || run?.quote?.filters || {};
  const managerIds = ensureArray(filters.manager_ids || filters.responsible_ids || filters.responsible_id)
    .map((id) => String(id).trim())
    .filter(Boolean);
  const categoryIds = ensureArray(filters.category_ids).map((id) => String(id).trim()).filter(Boolean);
  const managerMap = createLabelMap(launcher?.available_managers);
  const categoryMap = createLabelMap(launcher?.available_categories);

  const managerLabel = managerIds.length
    ? managerIds.map((id) => managerMap.get(id) || `Менеджер #${id}`).join(", ")
    : "Все сотрудники";
  const categoryLabel = categoryIds.length
    ? categoryIds.map((id) => categoryMap.get(id) || `Воронка #${id}`).join(", ")
    : "Все воронки";

  const from = String(filters.period_from || "").trim();
  const to = String(filters.period_to || "").trim();
  const periodLabel = from || to ? `${from || "…"} - ${to || "…"} ` : "";

  return `${managerLabel} / ${categoryLabel}${periodLabel ? ` · ${periodLabel}` : ""}`;
}

export default function HistoryScreen() {
  const navigate = useNavigate();
  const appState = useStore((s) => s.appState);
  const activateRunData = useStore((s) => s.activateRunData);

  const history = appState?.history || {};
  const runs = ensureArray(history.runs).filter(
    (run) => !String(run?.id || run?.run_id || "").startsWith("run-mock-"),
  );
  const launcher = appState?.setup?.analysis_launcher || {};

  const openRunReport = async (runId) => {
    await activateRunData(runId);
    navigate("/report");
  };

  return (
    <div className="space-y-4 max-w-[1380px] w-full mx-auto">
      {runs.length ? (
        runs.map((run) => (
          <article key={run.id} className="bg-card border border-border rounded p-5">
            <div className="flex flex-col @3xl:flex-row @3xl:items-center @3xl:justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                  {formatDate(run.created_at)}
                </div>
                <h3 className="text-base font-headline font-bold text-foreground">
                  {run.title || run.scope_label || run.id}
                </h3>
                <p className="text-xs text-muted-foreground mt-2 leading-6">
                  {formatFilterText(run, launcher)}
                </p>
              </div>
              <button
                type="button"
                className="px-4 py-2 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest self-start @3xl:self-auto"
                onClick={() => openRunReport(run.id)}
              >
                Посмотреть
              </button>
            </div>
          </article>
        ))
      ) : (
        <div className="empty-state">
          <p>История анализов пока пуста.</p>
        </div>
      )}
    </div>
  );
}
