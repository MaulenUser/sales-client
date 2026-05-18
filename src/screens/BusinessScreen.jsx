import React, { useState, useEffect, useRef } from "react";
import useStore from "../store/index.js";

export default function BusinessScreen() {
  const appState = useStore((s) => s.appState);
  const currentUser = useStore((s) => s.currentUser);
  const currentTenantId = useStore((s) => s.currentTenantId);
  const tenants = useStore((s) => s.tenants);
  const loadTenants = useStore((s) => s.loadTenants);
  const setCurrentTenant = useStore((s) => s.setCurrentTenant);
  const saveTenant = useStore((s) => s.saveTenant);
  const saveBusinessProfile = useStore((s) => s.saveBusinessProfile);
  const startBitrixConnect = useStore((s) => s.startBitrixConnect);

  // Tenant state
  const [tenantIdInput, setTenantIdInput] = useState("");
  const [tenantNameInput, setTenantNameInput] = useState("");
  const [tenantStatus, setTenantStatus] = useState("");

  // Bitrix OAuth state
  const [bitrixPortal, setBitrixPortal] = useState("");
  const [bitrixConnectStatus, setBitrixConnectStatus] = useState("");
  const [isBitrixConnecting, setIsBitrixConnecting] = useState(false);

  // Business profile state
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [priceList, setPriceList] = useState("");
  const [averageTicket, setAverageTicket] = useState("");
  const [advantages, setAdvantages] = useState("");
  const [promotions, setPromotions] = useState("");
  const [profileSaveStatus, setProfileSaveStatus] = useState("");

  const initializedTenantRef = useRef("");

  useEffect(() => {
    loadTenants().catch(() => {});
  }, [loadTenants]);

  useEffect(() => {
    const profile = appState?.setup?.business_profile;
    const tenantId = appState?.tenant_id || currentTenantId || "default";
    if (initializedTenantRef.current === tenantId) return;
    initializedTenantRef.current = tenantId;
    setCompanyName(profile.company_name || "");
    setWebsiteUrl(profile.website_url || "");
    setInstagramUrl(profile.instagram_url || "");
    setPriceList(profile.price_list || "");
    setAverageTicket(profile.average_ticket_kzt ? String(profile.average_ticket_kzt) : "");
    setAdvantages(profile.advantages || "");
    setPromotions(profile.promotions || "");
    setProfileSaveStatus("");
  }, [appState, currentTenantId]);

  const integrations = appState?.setup?.integrations || {};
  const bitrixOauth = appState?.setup?.bitrix_oauth || {};
  const missingBitrixScopes = Array.isArray(bitrixOauth.missing_scopes) ? bitrixOauth.missing_scopes : [];
  const bitrixOAuthConfigured = Boolean(bitrixOauth.configured && bitrixOauth.status === "active");
  const activeTenantId = appState?.tenant_id || currentTenantId || "default";
  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    if (bitrixOauth.bitrix_domain && !bitrixPortal) {
      setBitrixPortal(bitrixOauth.bitrix_domain);
    }
  }, [bitrixOauth.bitrix_domain, bitrixPortal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("bitrix_oauth") === "connected") {
      setBitrixConnectStatus("Bitrix24 подключен.");
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    }
  }, []);

  const getErrorMessage = (err) => {
    const raw = String(err?.bodyText || "").trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const detail = parsed?.detail;
        if (typeof detail === "string") return detail;
        if (detail?.message) return detail.message;
      } catch {
        return raw;
      }
    }
    return err?.message || "Не удалось выполнить запрос.";
  };

  const handleTenantChange = async (tenantId) => {
    setTenantStatus("Переключаю клиента...");
    try {
      await setCurrentTenant(tenantId);
      setTenantStatus("Клиент выбран.");
    } catch (err) {
      setTenantStatus(`Ошибка переключения: ${err.message}`);
    }
  };

  const handleTenantSubmit = async (e) => {
    e.preventDefault();
    setTenantStatus("Создаю клиента...");
    try {
      const result = await saveTenant({
        id: tenantIdInput,
        name: tenantNameInput || tenantIdInput,
      });
      setTenantIdInput("");
      setTenantNameInput("");
      setTenantStatus(`Клиент ${result?.tenant?.id || ""} создан и выбран.`);
    } catch (err) {
      setTenantStatus(`Ошибка создания клиента: ${err.message}`);
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSaveStatus("Сохраняю анкету бизнеса...");
    try {
      await saveBusinessProfile({
        company_name: companyName,
        website_url: websiteUrl,
        instagram_url: instagramUrl,
        price_list: priceList,
        average_ticket_kzt: averageTicket ? Number(averageTicket) : null,
        advantages,
        promotions,
      });
      setProfileSaveStatus("Анкета бизнеса сохранена.");
    } catch (err) {
      setProfileSaveStatus(`Ошибка сохранения: ${err.message}`);
    }
  };

  const handleBitrixConnectSubmit = async (e) => {
    e.preventDefault();
    setBitrixConnectStatus("Готовлю подключение Bitrix24...");
    setIsBitrixConnecting(true);
    try {
      const result = await startBitrixConnect({
        portal: bitrixPortal,
        return_url: "/app/#/business",
      });
      if (!result?.authorize_url) throw new Error("Backend не вернул authorize_url.");
      setBitrixConnectStatus("Открываю Bitrix24...");
      window.location.assign(result.authorize_url);
    } catch (err) {
      setBitrixConnectStatus(`Ошибка подключения Bitrix24: ${getErrorMessage(err)}`);
      setIsBitrixConnecting(false);
    }
  };

  function StatusBadge({ configured }) {
    return configured ? (
      <span className="px-2 py-0.5 rounded border border-primary/30 text-primary text-[9px] font-bold uppercase tracking-widest">
        Настроено
      </span>
    ) : (
      <span className="px-2 py-0.5 rounded border border-destructive/30 text-destructive text-[9px] font-bold uppercase tracking-widest">
        Не настроено
      </span>
    );
  }

  return (
    <div className="max-w-[1380px] w-full mx-auto space-y-6">
      <section>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">Клиент</div>
        <div className="bg-card border border-border rounded p-6 space-y-5">
          {isAdmin ? (
            <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <label className="flex flex-col gap-2 text-xs text-muted-foreground">
                Текущий клиент
                <select
                  value={activeTenantId}
                  onChange={(e) => handleTenantChange(e.target.value)}
                  className="bg-input border border-border rounded px-3 py-2 text-foreground"
                >
                  {tenants.length ? (
                    tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name || tenant.id} ({tenant.id})
                      </option>
                    ))
                  ) : (
                    <option value={activeTenantId}>{activeTenantId}</option>
                  )}
                </select>
                <span className="text-[10px] text-muted-foreground/60">
                  Все настройки, интеграции, запуски и отчеты привязаны к выбранному клиенту.
                </span>
              </label>

              <form onSubmit={handleTenantSubmit} className="grid grid-cols-1 gap-3 @3xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] @3xl:items-end">
                <label className="flex flex-col gap-2 text-xs text-muted-foreground">
                  ID клиента
                  <input
                    type="text"
                    value={tenantIdInput}
                    onChange={(e) => setTenantIdInput(e.target.value)}
                    placeholder="sapaplast"
                    className="bg-input border border-border rounded px-3 py-2 text-foreground"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs text-muted-foreground">
                  Название
                  <input
                    type="text"
                    value={tenantNameInput}
                    onChange={(e) => setTenantNameInput(e.target.value)}
                    placeholder="Sapaplast"
                    className="bg-input border border-border rounded px-3 py-2 text-foreground"
                  />
                </label>
                <button
                  type="submit"
                  className="min-h-[38px] px-4 py-2 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest"
                >
                  Создать
                </button>
              </form>
            </div>
          ) : (
            <div className="rounded border border-border bg-muted/20 px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Ваш клиент
              </div>
              <div className="text-lg text-white">{activeTenantId}</div>
              <div className="mt-2 text-xs leading-6 text-muted-foreground">
                Переключение клиентов доступно только администратору.
              </div>
            </div>
          )}
          {tenantStatus && <div className="text-xs text-muted-foreground">{tenantStatus}</div>}
        </div>
      </section>

      <section>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">Интеграции</div>
        <div className="bg-card border border-border rounded p-6 space-y-4">
          <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-4">
            <div className="rounded border border-border bg-muted/20 px-4 py-3">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Bitrix CRM
              </div>
              <StatusBadge configured={integrations.bitrix_webhook_url_configured} />
            </div>
            <div className="rounded border border-border bg-muted/20 px-4 py-3">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                WhatsApp
              </div>
              <StatusBadge configured={integrations.whatsapp_webhook_url_configured} />
            </div>
            <div className="rounded border border-border bg-muted/20 px-4 py-3">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                OpenAI
              </div>
              <StatusBadge configured={integrations.openai_api_key_configured} />
            </div>
            <div className="rounded border border-border bg-muted/20 px-4 py-3">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Bitrix OAuth
              </div>
              <StatusBadge configured={bitrixOAuthConfigured} />
              {bitrixOauth.bitrix_domain ? (
                <div className="mt-2 text-[11px] text-muted-foreground">{bitrixOauth.bitrix_domain}</div>
              ) : null}
            </div>
          </div>
          <form onSubmit={handleBitrixConnectSubmit} className="rounded border border-border bg-muted/20 p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-end">
              <label className="flex flex-col gap-2 text-xs text-muted-foreground">
                Домен Bitrix24
                <input
                  type="text"
                  value={bitrixPortal}
                  onChange={(e) => setBitrixPortal(e.target.value)}
                  placeholder="client.bitrix24.kz"
                  className="bg-input border border-border rounded px-3 py-2 text-foreground"
                />
              </label>
              <button
                type="submit"
                disabled={isBitrixConnecting}
                className="min-h-[38px] px-4 py-2 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Подключить Bitrix24
              </button>
            </div>
            {missingBitrixScopes.length ? (
              <div className="text-xs leading-6 text-destructive">
                Недостаточно прав Bitrix: {missingBitrixScopes.join(", ")}
              </div>
            ) : bitrixOAuthConfigured ? (
              <div className="text-xs leading-6 text-primary">
                Bitrix24 подключен через OAuth.
              </div>
            ) : null}
            {bitrixConnectStatus && (
              <div className="text-xs leading-6 text-muted-foreground">{bitrixConnectStatus}</div>
            )}
          </form>
          <div className="rounded border border-border bg-muted/20 px-3 py-2 text-xs leading-6 text-muted-foreground">
            Webhook-и и OpenAI ключ не вводятся в клиентском интерфейсе.
          </div>
        </div>
      </section>

      <section>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">Анкета бизнеса</div>
        <form onSubmit={handleProfileSubmit} className="bg-card border border-border rounded p-6 space-y-5">
          <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              Название вашей компании
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="bg-input border border-border rounded px-3 py-2 text-foreground"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              Сайт
              <input
                type="text"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="bg-input border border-border rounded px-3 py-2 text-foreground"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              Instagram
              <input
                type="text"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                className="bg-input border border-border rounded px-3 py-2 text-foreground"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              Средний чек (тенге)
              <input
                type="text"
                value={averageTicket}
                onChange={(e) => setAverageTicket(e.target.value)}
                className="bg-input border border-border rounded px-3 py-2 text-foreground"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground @3xl:col-span-2">
              Прайс-лист / описание услуг
              <textarea
                value={priceList}
                onChange={(e) => setPriceList(e.target.value)}
                rows={4}
                className="bg-input border border-border rounded px-3 py-2 text-foreground resize-y"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground @3xl:col-span-2">
              Преимущества компании
              <textarea
                value={advantages}
                onChange={(e) => setAdvantages(e.target.value)}
                rows={3}
                className="bg-input border border-border rounded px-3 py-2 text-foreground resize-y"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground @3xl:col-span-2">
              Акции и специальные предложения
              <textarea
                value={promotions}
                onChange={(e) => setPromotions(e.target.value)}
                rows={3}
                className="bg-input border border-border rounded px-3 py-2 text-foreground resize-y"
              />
            </label>
          </div>
          <div className="flex flex-col @3xl:flex-row @3xl:items-center gap-3">
            <button
              type="submit"
              className="px-4 py-2 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest"
            >
              Сохранить анкету бизнеса
            </button>
            <div className="text-xs text-muted-foreground">{profileSaveStatus}</div>
          </div>
        </form>
      </section>
    </div>
  );
}
