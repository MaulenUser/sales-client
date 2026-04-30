import React, { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import { loadJsonFromPath, fetchTextSafe } from "../api/index.js";
import {
  ensureArray, isTrueLike, sortRowsByDateDesc, normalizeRepoPath,
} from "../utils/index.js";
import {
  formatNumber, formatPercent, formatDate, formatTime, formatValue, humanizeToken,
} from "../utils/format.js";

function getManagerName(id) {
  const s = String(id || "").trim();
  return s ? `Менеджер #${s}` : "Менеджер не указан";
}

function getSortedManagers(summary) {
  return [...ensureArray(summary?.managers)]
    .map((m) => ({ ...m, top_topics: ensureArray(m?.top_topics) }))
    .sort(
      (a, b) =>
        Number(b.interactions || 0) - Number(a.interactions || 0) ||
        Number(b.actionable_rate || 0) - Number(a.actionable_rate || 0)
    );
}

function getFiltered(interactions, filters) {
  return sortRowsByDateDesc(
    interactions.filter((row) => {
      if (filters.channel !== "all" && row.channel !== filters.channel) return false;
      if (filters.relevance !== "all" && row.relevance !== filters.relevance) return false;
      if (filters.outcome !== "all" && row.outcome_status !== filters.outcome) return false;
      if (filters.manager !== "all" && String(row.manager_id) !== String(filters.manager)) return false;
      const q = filters.search;
      if (!q) return true;
      const hay = [
        row.interaction_id, row.primary_topic, row.client_request,
        row.summary, row.relevance, row.outcome_status,
        getManagerName(row.manager_id), ...ensureArray(row.tags),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    })
  );
}

function toAuditStatus(value) {
  const n = String(value || "").toLowerCase();
  if (n === "yes" || isTrueLike(value)) return { label: "Да", tone: "ok" };
  if (n === "no") return { label: "Нет", tone: "danger" };
  return { label: "Неясно", tone: "neutral" };
}

function inverseAuditStatus(value) {
  const n = String(value || "").toLowerCase();
  if (n === "yes" || isTrueLike(value)) return { label: "Есть", tone: "danger" };
  if (n === "no") return { label: "Нет", tone: "ok" };
  return { label: "Неясно", tone: "neutral" };
}

function toFlagStatus(value) {
  if (value === null || value === undefined || value === "") return { label: "Неясно", tone: "neutral" };
  return isTrueLike(value) ? { label: "Есть", tone: "danger" } : { label: "Нет", tone: "ok" };
}

function computeAuditScore(statuses) {
  const vals = ensureArray(statuses).map((s) => {
    if (!s) return 0;
    if (s.tone === "ok") return 1;
    if (s.tone === "neutral") return 0.55;
    if (s.tone === "warning") return 0.35;
    return 0;
  });
  return vals.length ? (vals.reduce((a, v) => a + v, 0) / vals.length) * 100 : 0;
}

function buildScoreSummary(score) {
  if (score >= 75) return "Сильный паттерн: структура разговора или чата уже дает материал для тиражирования внутри отдела.";
  if (score >= 45) return "Средний уровень: есть полезные сигналы продаж, но они не доведены до устойчивого процесса.";
  return "Слабый паттерн: взаимодействие либо короткое, либо не прошло ключевые этапы квалификации и фиксации следующего шага.";
}

const AUDIT_TONES = {
  ok: "bg-primary/10 border-primary/30 text-primary",
  neutral: "bg-foreground/5 border-foreground/15 text-muted-foreground",
  warning: "bg-chart-4/10 border-chart-4/30 text-chart-4",
  danger: "bg-destructive/10 border-destructive/30 text-destructive",
};

function AuditRow({ label, status }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-foreground">{label}</span>
      <strong className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded ${AUDIT_TONES[status.tone] || AUDIT_TONES.neutral}`}>
        {status.label}
      </strong>
    </div>
  );
}

function AuditCard({ title, rows }) {
  return (
    <article className="bg-card p-4 rounded border border-border">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">{title}</div>
      <div className="flex flex-col gap-2">
        {rows.map(([label, status]) => <AuditRow key={label} label={label} status={status} />)}
      </div>
    </article>
  );
}

function KeyValueList({ entries }) {
  const pairs = Object.entries(entries || {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return (
    <div className="grid gap-2">
      {pairs.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 text-[10px] border-b border-foreground/5 pb-2">
          <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
          <span className="text-foreground text-right">{formatValue(value)}</span>
        </div>
      ))}
    </div>
  );
}

function AuditPane({ interaction, feature }) {
  const contactChecks = [
    ["Менеджер представился", toAuditStatus(interaction.manager_introduced_self)],
    ["Задавал вопросы", toAuditStatus(interaction.manager_asked_questions)],
  ];
  const qualChecks = [
    ["Потребность выявлена", toAuditStatus(interaction.need_identified)],
    ["Бюджет обсужден", toAuditStatus(feature?.qualification?.budget_discussed)],
    ["ЛПР определен", toAuditStatus(feature?.qualification?.decision_maker_identified)],
    ["Сроки обсуждены", toAuditStatus(feature?.qualification?.timeline_discussed)],
  ];
  const closingChecks = [
    ["Презентация услуги", toAuditStatus(interaction.manager_presented_service)],
    ["Следующий шаг согласован", toAuditStatus(interaction.manager_agreed_next_step)],
    ["Не rushed to pitch", inverseAuditStatus(interaction.manager_rushed_to_pitch)],
  ];
  const score = computeAuditScore([...contactChecks, ...qualChecks, ...closingChecks].map(([, s]) => s));

  return (
    <div className="flex flex-col gap-6">
      <AuditCard title="Этап 1: контакт" rows={contactChecks} />
      <AuditCard title="Этап 2: квалификация" rows={qualChecks} />
      <AuditCard title="Этап 3: закрытие" rows={closingChecks} />

      <div className="grid grid-cols-2 gap-4">
        <article className="bg-card border border-primary/40 p-4 rounded flex flex-col justify-between">
          <div className="text-[9px] font-bold uppercase tracking-widest text-primary mb-2">Оценка качества</div>
          <strong className="text-3xl font-headline font-bold text-foreground">{formatPercent(score)}</strong>
          <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">{buildScoreSummary(score)}</p>
        </article>
        <article className="bg-muted/30 border border-border p-4 rounded flex flex-col justify-between">
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Итог</div>
          <strong className="text-sm font-bold text-foreground uppercase">{interaction.outcome_status || "не указано"}</strong>
          <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">{interaction.summary || "Нет summary"}</p>
        </article>
      </div>

      <article className="bg-card p-4 rounded border border-border">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Флаги качества</div>
        <div className="flex flex-col gap-2">
          {[
            ["Short / low content", toFlagStatus(interaction.short_or_low_content)],
            ["Non-sales interaction", toFlagStatus(interaction.non_sales_interaction)],
            ["Fragmented / unclear", toFlagStatus(interaction.fragmented_or_unclear)],
          ].map(([label, status]) => <AuditRow key={label} label={label} status={status} />)}
        </div>
      </article>
    </div>
  );
}

function CallSource({ feature }) {
  const [transcript, setTranscript] = useState(null);

  useEffect(() => {
    const path = feature?.source?.transcript_file_path;
    if (!path) return;
    const url = normalizeRepoPath(path);
    fetchTextSafe(url).then(setTranscript);
  }, [feature]);

  const path = feature?.source?.transcript_file_path;
  if (!path) {
    return (
      <section className="detail-block">
        <h3>Расшифровка</h3>
        <p className="text-muted-foreground text-xs">Нет пути к расшифровке.</p>
      </section>
    );
  }

  const transcriptUrl = normalizeRepoPath(path);
  const audioUrl = transcriptUrl.replace("/transcripts/text/", "/recordings/").replace(/\.txt$/i, ".mp3");

  return (
    <section className="bg-muted/30 p-4 rounded border border-border mt-4">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Расшифровка звонка</h3>
      <audio className="w-full mb-4 outline-none rounded bg-muted" controls preload="none" src={audioUrl} />
      <div className="flex gap-4 mb-4">
        <a className="text-[10px] font-bold uppercase tracking-wider text-primary hover:text-foreground transition-colors" href={audioUrl} target="_blank" rel="noreferrer">Открыть аудио</a>
        <a className="text-[10px] font-bold uppercase tracking-wider text-primary hover:text-foreground transition-colors" href={transcriptUrl} target="_blank" rel="noreferrer">Открыть расшифровку</a>
      </div>
      <div className="text-xs text-foreground font-mono leading-relaxed h-64 overflow-y-auto custom-scrollbar p-3 bg-sidebar rounded border border-border">
        {transcript === null ? "Загрузка..." : (transcript || "Расшифровка недоступна.")}
      </div>
    </section>
  );
}

function WhatsAppSource({ feature, sourceCache }) {
  const [conversation, setConversation] = useState(null);

  useEffect(() => {
    const path = feature?.source?.conversation_file_path;
    if (!path) return;
    loadJsonFromPath(path, sourceCache.current).then(setConversation).catch(() => {});
  }, [feature]);

  const path = feature?.source?.conversation_file_path;
  if (!path) {
    return (
      <section className="detail-block">
        <h3>Переписка</h3>
        <p className="text-muted-foreground text-xs">Нет пути к переписке.</p>
      </section>
    );
  }

  const messages = ensureArray(conversation?.messages);

  return (
    <section className="bg-muted/30 p-4 rounded border border-border mt-4">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Переписка в WhatsApp</h3>
      <div className="text-xs text-muted-foreground mb-4">
        {conversation?.deal_title || `Deal #${conversation?.deal_id || ""}`} | {formatNumber(messages.length)} messages
      </div>
      <div className="flex flex-col gap-3 h-96 overflow-y-auto custom-scrollbar p-3 bg-sidebar rounded border border-border">
        {messages.map((msg, i) => {
          const isSystem = msg.is_system_message;
          const isManager = msg.sender_role === "manager";
          const wrapClass = isSystem
            ? "bg-muted text-muted-foreground self-center text-center text-[10px] p-3 rounded-lg max-w-[85%]"
            : isManager
            ? "bg-card border border-primary/30 self-end text-right p-3 rounded-lg max-w-[85%]"
            : "bg-muted border border-border self-start text-left p-3 rounded-lg max-w-[85%]";
          return (
            <div key={i} className={wrapClass}>
              {!isSystem && (
                <div className={`flex justify-between items-center mb-1 gap-4 ${isManager ? "flex-row-reverse" : ""}`}>
                  <strong className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {msg.sender_label || msg.sender_role || "не указано"}
                  </strong>
                  <span className="text-[9px] text-muted-foreground/50">{formatDate(msg.created_at)}</span>
                </div>
              )}
              <div className="text-xs text-foreground leading-relaxed">{msg.text || ""}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DetailPane({ interaction, featureState, sourceCache }) {
  if (!interaction) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h3 className="text-xl font-headline font-bold text-foreground mb-2">Выберите обращение</h3>
        <p className="text-xs text-muted-foreground">Здесь появятся краткий вывод ИИ, ключевые сигналы, расшифровка разговора или переписка и проверка качества.</p>
      </div>
    );
  }

  if (featureState.loading) {
    return <div className="p-6 text-center text-muted-foreground"><p>Загрузка...</p></div>;
  }

  if (featureState.error) {
    return (
      <div className="empty-state">
        <h3>Не удалось открыть detail</h3>
        <p>{featureState.error}</p>
      </div>
    );
  }

  const feature = featureState.data;
  const isCall = interaction.channel === "call";

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex flex-wrap gap-2 mb-2">
        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${isCall ? "bg-chart-3/20 text-chart-3" : "bg-primary/20 text-primary"}`}>
          {interaction.channel}
        </span>
        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground rounded">
          {interaction.relevance || "не указано"}
        </span>
        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground rounded">
          {interaction.outcome_status || "не указано"}
        </span>
      </div>

      <div className="pb-6 border-b border-border">
        <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
          {formatDate(interaction.created_at)} | {getManagerName(interaction.manager_id)} | {interaction.interaction_id}
        </div>
        <h2 className="font-headline text-2xl font-bold text-foreground">{interaction.primary_topic || "Без названия"}</h2>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{interaction.summary || "Нет краткого вывода по обращению."}</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <section className="bg-muted/30 p-4 rounded border border-border">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Сигналы</h3>
          <KeyValueList entries={{
            "Запрос клиента": interaction.client_request,
            "Тип обращения": interaction.relevance,
            "Итог": interaction.outcome_status,
            "Интерес клиента": interaction.client_interest,
            "Эмоция клиента": interaction.client_emotion,
            "Потребность выявлена": interaction.need_identified,
          }} />
        </section>
        <section className="bg-muted/30 p-4 rounded border border-border">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Работа менеджера</h3>
          <KeyValueList entries={{
            "Представился": interaction.manager_introduced_self,
            "Задавал вопросы": interaction.manager_asked_questions,
            "Презентовал услугу": interaction.manager_presented_service,
            "Слишком рано перешел к презентации": interaction.manager_rushed_to_pitch,
            "Согласовал следующий шаг": interaction.manager_agreed_next_step,
            "Короткое или слабое обращение": interaction.short_or_low_content,
          }} />
        </section>
      </div>

      {feature && (
        <div className="grid grid-cols-2 gap-6">
          <section className="bg-muted/30 p-4 rounded border border-border">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Что выделил ИИ</h3>
            <KeyValueList entries={{
              "Следующий шаг": feature?.outcome?.next_step,
              "Следующий шаг подтвержден": feature?.outcome?.next_step_confirmed,
              "Бюджет обсуждался": feature?.qualification?.budget_discussed,
              "Кто принимает решение, понятен": feature?.qualification?.decision_maker_identified,
              "Сроки обсуждались": feature?.qualification?.timeline_discussed,
              "Возражения": ensureArray(feature?.objections?.items).join(", ") || "нет",
            }} />
            <div className="flex flex-wrap gap-2 mt-4">
              {ensureArray(feature?.tags).map((tag) => (
                <span key={tag} className="px-2 py-1 text-[9px] bg-foreground/5 border border-border rounded text-muted-foreground uppercase">{tag}</span>
              ))}
            </div>
          </section>
          <section className="bg-muted/30 p-4 rounded border border-border">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Файлы</h3>
            <div className="flex flex-col gap-2">
              {[
                ["Структурированные данные", interaction.feature_file_path],
                ["Расшифровка", feature?.source?.transcript_file_path],
                ["Переписка", feature?.source?.conversation_file_path],
              ].map(([label, path]) =>
                path ? (
                  <a key={label} className="text-[10px] font-bold uppercase tracking-wider text-primary hover:text-foreground transition-colors" href={normalizeRepoPath(path)} target="_blank" rel="noreferrer">{label}</a>
                ) : (
                  <span key={label} className="text-[10px] text-muted-foreground">{label}: not available</span>
                )
              )}
            </div>
          </section>
        </div>
      )}

      {isCall ? (
        <CallSource feature={feature} />
      ) : (
        <WhatsAppSource feature={feature} sourceCache={sourceCache} />
      )}
    </div>
  );
}

export default function ExplorerScreen() {
  const navigate = useNavigate();
  const { interactions, summary, filters, selectedId, setFilters, setSelectedId } = useStore();
  const featureCacheRef = useRef(new Map());
  const sourceCacheRef = useRef(new Map());
  const [featureState, setFeatureState] = useState({ data: null, loading: false, error: null });

  const filtered = getFiltered(interactions, filters);
  const managers = getSortedManagers(summary);

  const activeId = filtered.some((r) => r.interaction_id === selectedId)
    ? selectedId
    : filtered[0]?.interaction_id || null;

  const selectedInteraction = filtered.find((r) => r.interaction_id === activeId) || null;

  useEffect(() => {
    if (!selectedInteraction) return;
    setFeatureState({ data: null, loading: true, error: null });
    loadJsonFromPath(selectedInteraction.feature_file_path, featureCacheRef.current)
      .then((data) => setFeatureState({ data, loading: false, error: null }))
      .catch((err) => setFeatureState({ data: null, loading: false, error: err.message }));
  }, [activeId]);

  const uniqueChannels = [...new Set(interactions.map((r) => r.channel).filter(Boolean))];
  const uniqueRelevance = [...new Set(interactions.map((r) => r.relevance).filter(Boolean))];
  const uniqueOutcomes = [...new Set(interactions.map((r) => r.outcome_status).filter(Boolean))];

  return (
    <section className="h-[calc(100vh-200px)]">
      <div className="flex h-full border border-border rounded-lg overflow-hidden bg-background">
        <aside className="w-1/3 border-r border-border bg-sidebar flex flex-col h-full shrink-0">
          <div className="p-4 border-b border-border space-y-3 bg-muted/30 shrink-0">
            <input
              type="text"
              placeholder="Поиск по обращениям..."
              value={filters.search}
              onChange={(e) => setFilters({ search: e.target.value.trim().toLowerCase() })}
              className="w-full bg-card border border-border rounded px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select value={filters.channel} onChange={(e) => setFilters({ channel: e.target.value })} className="bg-card border border-border rounded px-2 py-1.5 text-foreground outline-none focus:border-primary">
                <option value="all">Все каналы</option>
                {uniqueChannels.map((v) => <option key={v} value={v}>{v === "call" ? "Звонки" : v === "whatsapp" ? "WhatsApp" : v}</option>)}
              </select>
              <select value={filters.relevance} onChange={(e) => setFilters({ relevance: e.target.value })} className="bg-card border border-border rounded px-2 py-1.5 text-foreground outline-none focus:border-primary">
                <option value="all">Тип обращения</option>
                {uniqueRelevance.map((v) => <option key={v} value={v}>{humanizeToken(v)}</option>)}
              </select>
              <select value={filters.outcome} onChange={(e) => setFilters({ outcome: e.target.value })} className="bg-card border border-border rounded px-2 py-1.5 text-foreground outline-none focus:border-primary">
                <option value="all">Итог</option>
                {uniqueOutcomes.map((v) => <option key={v} value={v}>{humanizeToken(v)}</option>)}
              </select>
              <select value={filters.manager} onChange={(e) => setFilters({ manager: e.target.value })} className="bg-card border border-border rounded px-2 py-1.5 text-foreground outline-none focus:border-primary">
                <option value="all">Все менеджеры</option>
                {managers.map((m) => <option key={m.manager_id} value={String(m.manager_id)}>{getManagerName(m.manager_id)}</option>)}
              </select>
            </div>
            <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground flex justify-between items-center px-1">
              <span>Найдено</span>
              <span className="bg-card px-2 py-0.5 rounded text-primary">{formatNumber(filtered.length)}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar bg-sidebar">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground"><p>Нет данных по текущим фильтрам.</p></div>
            ) : (
              filtered.map((row) => (
                <article
                  key={row.interaction_id}
                  onClick={() => setSelectedId(row.interaction_id)}
                  className={`p-3 border-b border-border cursor-pointer hover:bg-foreground/5 transition-colors group ${row.interaction_id === activeId ? "bg-foreground/5 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
                >
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="px-1.5 py-0.5 text-[8px] bg-foreground/5 border border-border rounded uppercase font-bold text-muted-foreground">{row.channel}</span>
                    <span className="px-1.5 py-0.5 text-[8px] bg-foreground/5 border border-border rounded uppercase font-bold text-muted-foreground">{row.outcome_status || "не указано"}</span>
                  </div>
                  <h3 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1 mb-1">{row.primary_topic || "Без темы"}</h3>
                  <p className="text-[9px] text-muted-foreground line-clamp-2 leading-relaxed mb-2">{row.summary || "Нет summary"}</p>
                  <div className="text-[8px] uppercase tracking-widest text-muted-foreground">{formatDate(row.created_at)} | {getManagerName(row.manager_id)}</div>
                </article>
              ))
            )}
          </div>
        </aside>

        <main className="w-full flex">
          <div className="flex-1 border-r border-border overflow-y-auto custom-scrollbar bg-background relative">
            <DetailPane
              interaction={selectedInteraction}
              featureState={featureState}
              sourceCache={sourceCacheRef}
            />
          </div>
          <div className="w-80 bg-muted/20 shrink-0 overflow-y-auto custom-scrollbar p-6">
            {selectedInteraction && featureState.data ? (
              <AuditPane interaction={selectedInteraction} feature={featureState.data} />
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                <h3 className="text-sm font-bold text-foreground mb-2">Проверка качества</h3>
                <p className="text-xs">Выберите обращение слева.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </section>
  );
}
