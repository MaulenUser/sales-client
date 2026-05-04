import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import useStore from "../../store/index.js";
import { formatNumber, formatDate } from "../../utils/format.js";

const SCREEN_META = {
  business: { eyebrow: "Настройка бизнеса",  title: "Настройка бизнеса",           subtitle: "Интеграция с Bitrix24 или amoCRM и анкета компании." },
  launch:   { eyebrow: "Запуск AI аудита",    title: "Запуск AI аудита",            subtitle: "Выберите воронку, сотрудников и период, оцените объём и запустите аудит." },
  overview: { eyebrow: "Общий обзор",         title: "Картина по отделу продаж",    subtitle: "Управленческая сводка: где отдел теряет деньги и что происходит в CRM." },
  managers: { eyebrow: "Менеджеры",           title: "Аналитика Менеджеров",        subtitle: "Сравнение менеджеров по качеству общения, полезным действиям и слабым местам." },
  calls:    { eyebrow: "Звонки",              title: "Голосовой Слой",              subtitle: "Разбор звонков: что спрашивают клиенты и где разговоры теряют пользу." },
  whatsapp: { eyebrow: "WhatsApp",            title: "Разбор чатов WhatsApp",       subtitle: "Чаты, зависшие диалоги, темы спроса и качество ответов менеджеров." },
  explorer: { eyebrow: "Разбор обращений",   title: "Разбор Взаимодействий",       subtitle: "Просмотр конкретных звонков и чатов с выводом ИИ и проверкой качества." },
  report:   { eyebrow: "Итоговый отчет",      title: "Итоговый отчет руководителю", subtitle: "Главный экран для собственника: что не так в продажах и что делать дальше." },
  history:  { eyebrow: "История анализов",    title: "История анализов",             subtitle: "Список запусков: дата, выбранные фильтры и быстрый переход к отчету." },
  usage:    { eyebrow: "Расходы ИИ",          title: "Токены и стоимость",          subtitle: "Сколько запросов ушло в ИИ и какие этапы обходятся дороже всего." },
};

export { SCREEN_META };


export default function Header() {
  const { pathname } = useLocation();
  const screen = pathname.replace("/", "") || "business";
  const meta = SCREEN_META[screen] || SCREEN_META.business;
  const { appState, summary, usageSummary, activeRunId, currentUser, logout } = useStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 100); return () => clearTimeout(t); }, []);

  const generatedAt = summary?.generated_at || usageSummary?.generated_at;
  const totalTokensFact = Number(usageSummary?.totals?.total_tokens || 0);

  const activeRun = useMemo(() => {
    const runs = Array.isArray(appState?.history?.runs) ? appState.history.runs : [];
    return runs.find((run) => run.id === activeRunId) || appState?.latest_run || null;
  }, [appState, activeRunId]);

  const totalTokens = totalTokensFact || Number(activeRun?.quote?.estimated_tokens || 0);

  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        padding: "28px 40px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(-10px)",
        transition: "all 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s",
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(8,11,18,0.85)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.12em",
          color: "rgb(52,168,90)", marginBottom: 10,
          fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase",
        }}>
          {meta.eyebrow}
        </div>
        <h1 style={{
          fontSize: 32, fontWeight: 500, margin: "0 0 10px",
          letterSpacing: "-0.025em", lineHeight: 1.15, color: "#fff",
          fontFamily: "'Inter', 'Outfit', sans-serif",
        }}>
          {meta.title}
        </h1>
        <p style={{
          fontSize: 14, color: "rgba(255,255,255,0.58)",
          maxWidth: 560, lineHeight: 1.65, margin: 0,
          fontFamily: "'Inter', 'Outfit', sans-serif",
        }}>
          {meta.subtitle}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <div style={{
          fontSize: 12, color: "rgba(255,255,255,0.4)",
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: "right", lineHeight: 1.7,
        }}>
          {generatedAt ? (
            <>
              <div>{formatDate(generatedAt)}</div>
              <div>Баланс токенов: {formatNumber(totalTokens)}</div>
            </>
          ) : (
            <div>Загружаю данные...</div>
          )}
        </div>
        {currentUser && (
          <button
            type="button"
            onClick={logout}
            title="Выйти"
            style={{
              minHeight: 34,
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.65)",
              padding: "0 12px",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {currentUser.username}
          </button>
        )}
      </div>
    </div>
  );
}
