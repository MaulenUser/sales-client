import React, { useState } from "react";
import useStore from "../store/index.js";
import ThemeToggle from "../components/shared/ThemeToggle.jsx";

export default function LoginScreen({ theme = "dark", onThemeChange }) {
  const login = useStore((s) => s.login);
  const register = useStore((s) => s.register);
  const authStatus = useStore((s) => s.authStatus);
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegisterMode = mode === "register";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");
    try {
      if (isRegisterMode) {
        await register({ name, phone, email, password });
      } else {
        await login({ username, password });
      }
    } catch (err) {
      const duplicate = err?.status === 409;
      const badLogin = err?.status === 401;
      const prefix = isRegisterMode ? "Ошибка регистрации" : "Ошибка входа";
      setStatus(
        duplicate
          ? "Пользователь с таким email уже существует."
          : badLogin
            ? "Неверный логин или пароль."
            : `${prefix}: ${err.message}`,
      );
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[420px] bg-card border border-border rounded p-7 space-y-5"
      >
        <div className="flex justify-end">
          <ThemeToggle theme={theme} onChange={onThemeChange} compact />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-primary mb-3">
            AI Sales Auditor
          </div>
          <h1 className="text-2xl font-light text-foreground">
            {isRegisterMode ? "Регистрация" : "Вход в кабинет"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {isRegisterMode
              ? "Создайте клиентский аккаунт, затем подключите Bitrix24 в настройках бизнеса."
              : "Доступ к отчетам и запуску аудита привязан к вашему клиентскому аккаунту."}
          </p>
        </div>

        <div className="grid grid-cols-2 rounded border border-border bg-muted/20 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setStatus("");
            }}
            className={`min-h-[34px] rounded text-xs font-bold uppercase tracking-widest transition-colors ${
              !isRegisterMode ? "bg-primary/15 text-primary" : "text-muted-foreground"
            }`}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setStatus("");
            }}
            className={`min-h-[34px] rounded text-xs font-bold uppercase tracking-widest transition-colors ${
              isRegisterMode ? "bg-primary/15 text-primary" : "text-muted-foreground"
            }`}
          >
            Регистрация
          </button>
        </div>

        {isRegisterMode && (
          <>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              Имя
              <input
                type="text"
                value={name}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
                className="bg-input border border-border rounded px-3 py-2 text-foreground"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              Телефон
              <input
                type="tel"
                value={phone}
                autoComplete="tel"
                onChange={(e) => setPhone(e.target.value)}
                className="bg-input border border-border rounded px-3 py-2 text-foreground"
                required
              />
            </label>
          </>
        )}

        <label className="flex flex-col gap-2 text-xs text-muted-foreground">
          {isRegisterMode ? "Email" : "Логин"}
          <input
            type={isRegisterMode ? "email" : "text"}
            value={isRegisterMode ? email : username}
            autoComplete="username"
            onChange={(e) => (isRegisterMode ? setEmail(e.target.value) : setUsername(e.target.value))}
            className="bg-input border border-border rounded px-3 py-2 text-foreground"
            required
          />
        </label>

        <label className="flex flex-col gap-2 text-xs text-muted-foreground">
          Пароль
          <input
            type="password"
            value={password}
            autoComplete={isRegisterMode ? "new-password" : "current-password"}
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
          {isSubmitting
            ? isRegisterMode ? "Создание..." : "Вход..."
            : isRegisterMode ? "Создать аккаунт" : "Войти"}
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
