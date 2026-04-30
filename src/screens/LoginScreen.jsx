import React, { useState } from "react";
import useStore from "../store/index.js";

export default function LoginScreen() {
  const login = useStore((s) => s.login);
  const authStatus = useStore((s) => s.authStatus);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");
    try {
      await login({ username, password });
    } catch (err) {
      setStatus(err?.status === 401 ? "Неверный логин или пароль." : `Ошибка входа: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[420px] bg-card border border-border rounded p-7 space-y-5"
      >
        <div>
          <div className="text-[10px] uppercase tracking-widest text-primary mb-3">
            AI Sales Auditor
          </div>
          <h1 className="text-2xl font-light text-white">Вход в кабинет</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Доступ к отчетам и запуску аудита привязан к вашему клиентскому аккаунту.
          </p>
        </div>

        <label className="flex flex-col gap-2 text-xs text-muted-foreground">
          Логин
          <input
            type="text"
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
            className="bg-input border border-border rounded px-3 py-2 text-foreground"
            required
          />
        </label>

        <label className="flex flex-col gap-2 text-xs text-muted-foreground">
          Пароль
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            className="bg-input border border-border rounded px-3 py-2 text-foreground"
            required
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[40px] rounded bg-primary/15 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest disabled:opacity-50"
        >
          {isSubmitting ? "Вход..." : "Войти"}
        </button>

        {status && <div className="text-xs text-destructive">{status}</div>}
        {!authStatus?.has_users && (
          <div className="rounded border border-border bg-muted/20 px-3 py-2 text-xs leading-6 text-muted-foreground">
            Пользователи еще не созданы. Создайте администратора на сервере через setup_auth_user.py.
          </div>
        )}
      </form>
    </main>
  );
}
