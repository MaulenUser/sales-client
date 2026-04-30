export function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

export function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function isTrueLike(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return ["true", "1", "yes", "да"].includes(String(value || "").trim().toLowerCase());
}

export function isActionableOutcome(value) {
  return ["follow_up", "qualified_interest", "callback_requested"].includes(
    String(value || "").toLowerCase()
  );
}

export function clampRate(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function toTimestamp(value) {
  const ts = Date.parse(value || "");
  return Number.isFinite(ts) ? ts : 0;
}

export function rate(numerator, denominator) {
  const n = Number(numerator || 0);
  const d = Number(denominator || 0);
  if (!d) return 0;
  return (n / d) * 100;
}

export function average(values) {
  const nums = ensureArray(values)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (!nums.length) return 0;
  return sum(nums) / nums.length;
}

export function sum(values) {
  return ensureArray(values)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .reduce((acc, v) => acc + v, 0);
}

export function metricRate(rows, key) {
  const values = ensureArray(rows).map((r) => r?.[key]);
  const yesCount = values.filter(
    (v) => String(v || "").toLowerCase() === "yes" || isTrueLike(v)
  ).length;
  const unknownCount = values.filter(
    (v) => String(v || "").toLowerCase() === "unknown"
  ).length;
  const total = values.length;
  return { total, yesCount, unknownCount, rate: rate(yesCount, total) };
}

export function topCounts(values, limit = 5) {
  const filtered = ensureArray(values)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .filter((v) => v.toLowerCase() !== "unknown");

  const total = filtered.length;
  const counts = filtered.reduce((acc, v) => {
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count, rate: rate(count, total) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"))
    .slice(0, limit);
}

export function sortRowsByDateDesc(rows) {
  return [...ensureArray(rows)].sort(
    (a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at)
  );
}

export function uniqueValues(values) {
  return [
    ...new Set(
      ensureArray(values)
        .map((v) => String(v || "").trim())
        .filter(Boolean)
    ),
  ];
}

export function normalizeRepoPath(inputPath) {
  if (!inputPath) return "";
  let normalized = String(inputPath).replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  const repoMarker = "/export-audio-bitrix/";
  const markerIdx = lower.lastIndexOf(repoMarker);
  if (markerIdx >= 0) normalized = normalized.slice(markerIdx + repoMarker.length);

  const lowered = normalized.toLowerCase();
  const exportIdx = lowered.lastIndexOf("/export/");
  const dashboardIdx = lowered.lastIndexOf("/dashboard/");
  if (exportIdx > 0) normalized = normalized.slice(exportIdx + 1);
  else if (dashboardIdx > 0) normalized = normalized.slice(dashboardIdx + 1);

  normalized = normalized.replace(/^\/+/, "");
  if (normalized.startsWith("dashboard/"))
    return encodeURI(`./${normalized.slice("dashboard/".length)}`);
  if (normalized.startsWith("../") || normalized.startsWith("./"))
    return encodeURI(normalized);
  return encodeURI(`../${normalized}`);
}

export function mapDistribution(distribution) {
  const rows = ensureArray(distribution)
    .filter(Boolean)
    .map((row) => (isPlainObject(row) ? row : { name: String(row), count: 0, rate: 0 }));
  return rows.reduce((acc, row) => {
    if (!row?.name) return acc;
    acc[String(row.name).toLowerCase()] = row;
    return acc;
  }, {});
}
