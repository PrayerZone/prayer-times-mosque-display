export const PRAYER_ORDER = [
  "fajr",
  "sunrise",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
];

export const DEFAULT_SETTINGS = Object.freeze({
  sourceType: "city",
  sourceId: "paris",
  language: "en",
  theme: "emerald",
  displayName: "",
  announcements: "",
  announcementInterval: 20,
  showSeconds: false,
});

export function parseTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? "");
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function secondsUntilPrayer(nowParts, prayerTime) {
  const prayerMinutes = parseTime(prayerTime);
  if (prayerMinutes === null) return null;
  const nowSeconds =
    nowParts.hour * 3600 + nowParts.minute * 60 + nowParts.second;
  let delta = prayerMinutes * 60 - nowSeconds;
  if (delta <= 0) delta += 24 * 60 * 60;
  return delta;
}

export function formatCountdown(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "--:--:--";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function findNextPrayer(prayers, nowParts) {
  const usable = (prayers ?? [])
    .map((prayer) => ({
      ...prayer,
      minutes: parseTime(prayer.time),
    }))
    .filter((prayer) => prayer.minutes !== null);

  if (!usable.length) return null;

  const currentMinutes = nowParts.hour * 60 + nowParts.minute;
  return (
    usable.find((prayer) => prayer.minutes > currentMinutes) ??
    usable[0]
  );
}

export function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter(({ type }) => ["hour", "minute", "second"].includes(type))
      .map(({ type, value }) => [type, Number(value)]),
  );
}

export function normalizeSettings(value = {}) {
  const sourceType = value.sourceType === "mosque" ? "mosque" : "city";
  const sourceId = String(value.sourceId || DEFAULT_SETTINGS.sourceId)
    .trim()
    .replace(/^\/+|\/+$/g, "");
  const interval = Number(value.announcementInterval);

  return {
    ...DEFAULT_SETTINGS,
    ...value,
    sourceType,
    sourceId: sourceId || DEFAULT_SETTINGS.sourceId,
    announcementInterval: [10, 20, 30, 60].includes(interval) ? interval : 20,
    showSeconds: Boolean(value.showSeconds),
  };
}

export function settingsFromSearch(search, fallback = DEFAULT_SETTINGS) {
  const params = new URLSearchParams(search);
  const value = { ...fallback };

  if (params.has("mosque")) {
    value.sourceType = "mosque";
    value.sourceId = params.get("mosque");
  } else if (params.has("city")) {
    value.sourceType = "city";
    value.sourceId = params.get("city");
  }

  if (params.has("lang")) value.language = params.get("lang");
  if (params.has("theme")) value.theme = params.get("theme");
  if (params.has("name")) value.displayName = params.get("name");

  return normalizeSettings(value);
}

export function apiUrl(settings) {
  const segment = settings.sourceType === "mosque" ? "mosques" : "cities";
  const path = `/api/public/${segment}/${encodeURIComponent(settings.sourceId)}/prayer-times`;
  const url = new URL(path, "https://pray.zone");
  url.searchParams.set("lang", settings.language);
  return url;
}
