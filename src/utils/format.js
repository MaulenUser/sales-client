import { isPlainObject, toTimestamp } from "./index.js";

export function formatNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: Number.isInteger(n) ? 0 : 1,
  }).format(n);
}

export function formatPercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0%";
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: n % 1 === 0 ? 0 : 1,
  }).format(n)}%`;
}

export function formatDate(value) {
  if (!value) return "—";
  const ts = toTimestamp(value);
  if (!ts) return String(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function formatTime(value) {
  const ts = toTimestamp(value);
  if (!ts) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0 ₸";
  return `${formatNumber(Math.round(n))} ₸`;
}

export function formatMinutes(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 мин";
  if (n < 60) return `${formatNumber(n)} мин`;
  if (n < 1440) return `${formatNumber(n / 60)} ч`;
  return `${formatNumber(n / 1440)} дн`;
}

export function formatScore(rating) {
  const value = Number(isPlainObject(rating) ? rating?.value : rating) || 0;
  const max = Number(isPlainObject(rating) ? rating?.max : 10) || 10;
  return `${formatNumber(value)} / ${formatNumber(max)}`;
}

export function formatValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  return String(value);
}

export function humanizeToken(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}
