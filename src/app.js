import {
  DEFAULT_SETTINGS,
  apiUrl,
  findNextPrayer,
  formatCountdown,
  getZonedParts,
  normalizeSettings,
  secondsUntilPrayer,
  settingsFromSearch,
} from "./core.js";

const STORAGE_KEY = "prayerzone-mosque-display-settings-v1";
const CACHE_KEY = "prayerzone-mosque-display-data-v1";
const REFRESH_INTERVAL = 30 * 60 * 1000;

const elements = Object.fromEntries(
  [
    "app", "connection-status", "connection-label", "fullscreen-button",
    "settings-button", "location-kind", "location-name", "location-meta",
    "clock", "date", "next-prayer-name", "next-prayer-time",
    "countdown-value", "prayer-progress", "prayer-grid",
    "calculation-summary", "announcement", "announcement-text",
    "last-updated", "error-banner", "error-message", "retry-button",
    "settings-dialog", "settings-form", "source-type", "source-id",
    "source-label", "source-help", "reset-button",
  ].map((id) => [id, document.getElementById(id)]),
);

let settings = loadSettings();
let payload = null;
let lastUpdated = null;
let announcementTimer = null;
let announcementIndex = 0;

function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    saved = {};
  }
  return settingsFromSearch(location.search, normalizeSettings(saved));
}

function saveSettings(value) {
  settings = normalizeSettings(value);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function setConnection(state, label) {
  elements["connection-status"].dataset.state = state;
  elements["connection-label"].textContent = label;
}

function setError(error, cached = false) {
  elements["error-message"].textContent = cached
    ? " Showing the latest saved schedule."
    : ` ${error instanceof Error ? error.message : "Please try again."}`;
  elements["error-banner"].hidden = false;
  setConnection(cached ? "cached" : "offline", cached ? "Cached" : "Offline");
}

function clearError() {
  elements["error-banner"].hidden = true;
  setConnection("online", "Live");
}

async function fetchSchedule() {
  setConnection("loading", "Updating");
  try {
    const demoMode = new URLSearchParams(location.search).get("demo") === "1";
    const response = await fetch(demoMode ? "./assets/sample-paris.json" : apiUrl(settings), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`PrayerZone API returned ${response.status}`);
    payload = await response.json();
    lastUpdated = new Date();
    localStorage.setItem(CACHE_KEY, JSON.stringify({ payload, lastUpdated }));
    clearError();
    render();
  } catch (error) {
    const cached = loadCachedSchedule();
    if (cached) {
      payload = cached.payload;
      lastUpdated = new Date(cached.lastUpdated);
      setError(error, true);
      render();
    } else {
      setError(error, false);
    }
  } finally {
    elements.app.setAttribute("aria-busy", "false");
  }
}

function loadCachedSchedule() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!cached?.payload?.data?.prayerTimes) return null;
    return cached;
  } catch {
    return null;
  }
}

function locationDetails() {
  const source = payload?.mosque ?? payload?.city ?? {};
  const fallbackName = settings.sourceId.replaceAll("-", " ");
  return {
    title: settings.displayName || source.title || source.name || fallbackName,
    meta: [source.city, source.country, source.address]
      .filter((item, index, array) => item && array.indexOf(item) === index)
      .join(" · "),
    kind: payload?.type === "mosque" ? "Mosque prayer times" : "Local prayer times",
  };
}

function render() {
  if (!payload?.data) return;
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.lang = settings.language;

  const details = locationDetails();
  elements["location-kind"].textContent = details.kind;
  elements["location-name"].textContent = details.title;
  elements["location-meta"].textContent = details.meta;

  const prayers = payload.data.prayerTimes ?? [];
  elements["prayer-grid"].replaceChildren(
    ...prayers.map((prayer) => {
      const article = document.createElement("article");
      article.className = "prayer-card";
      article.dataset.prayer = String(prayer.id ?? prayer.name ?? "").toLowerCase();

      const label = document.createElement("p");
      label.textContent = prayer.name || prayer.id || "Prayer";
      const time = document.createElement("time");
      time.textContent = prayer.time;
      article.append(label, time);
      return article;
    }),
  );

  const calculation = payload.data.calculation;
  elements["calculation-summary"].textContent = calculation?.method
    ? `${calculation.method} · ${payload.data.timezone}`
    : payload.data.timezone;
  elements["last-updated"].textContent = lastUpdated
    ? `Updated ${new Intl.DateTimeFormat(settings.language, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(lastUpdated)}`
    : "";

  startAnnouncements();
  updateClock();
}

function updateClock() {
  if (!payload?.data?.timezone) return;
  const now = new Date();
  const timeZone = payload.data.timezone;
  const parts = getZonedParts(now, timeZone);
  const timeOptions = {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  if (settings.showSeconds) timeOptions.second = "2-digit";

  elements.clock.textContent = new Intl.DateTimeFormat(settings.language, timeOptions).format(now);
  elements.date.textContent = new Intl.DateTimeFormat(settings.language, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  const prayers = payload.data.prayerTimes ?? [];
  const next = findNextPrayer(prayers, parts);
  document.querySelectorAll(".prayer-card").forEach((card) => {
    const id = String(next?.id ?? next?.name ?? "").toLowerCase();
    card.classList.toggle("is-next", card.dataset.prayer === id);
  });

  if (!next) return;
  const remaining = secondsUntilPrayer(parts, next.time);
  elements["next-prayer-name"].textContent = next.name || next.id || "Prayer";
  elements["next-prayer-time"].textContent = next.time;
  elements["countdown-value"].textContent = formatCountdown(remaining);
  const dayProgress = 1 - Math.min(remaining ?? 86400, 86400) / 86400;
  elements["prayer-progress"].style.width = `${Math.max(4, dayProgress * 100)}%`;
}

function startAnnouncements() {
  clearInterval(announcementTimer);
  const announcements = settings.announcements
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!announcements.length) {
    elements.announcement.hidden = true;
    return;
  }

  const show = () => {
    elements["announcement-text"].textContent =
      announcements[announcementIndex % announcements.length];
    elements.announcement.hidden = false;
    announcementIndex += 1;
  };
  show();
  announcementTimer = setInterval(show, settings.announcementInterval * 1000);
}

function populateSettings() {
  for (const [key, value] of Object.entries(settings)) {
    const field = elements["settings-form"].elements.namedItem(key);
    if (!field) continue;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = String(value);
  }
  updateSourceHelp();
}

function updateSourceHelp() {
  const isMosque = elements["source-type"].value === "mosque";
  elements["source-label"].textContent = isMosque ? "Mosque ID" : "City slug";
  elements["source-help"].textContent = isMosque
    ? "Example: paris_grande-mosquee-de-paris"
    : "Example: paris";
}

elements["settings-form"].addEventListener("submit", (event) => {
  if (event.submitter?.value !== "save") return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements["settings-form"]));
  data.showSeconds = elements["settings-form"].elements.showSeconds.checked;
  saveSettings(data);
  elements["settings-dialog"].close();
  void fetchSchedule();
});

elements["source-type"].addEventListener("change", updateSourceHelp);
elements["settings-button"].addEventListener("click", () => {
  populateSettings();
  elements["settings-dialog"].showModal();
});
elements["retry-button"].addEventListener("click", fetchSchedule);
elements["reset-button"].addEventListener("click", () => {
  saveSettings(DEFAULT_SETTINGS);
  populateSettings();
});
elements["fullscreen-button"].addEventListener("click", async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
});

document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement);
  elements["fullscreen-button"].textContent = active ? "×" : "⛶";
  elements["fullscreen-button"].ariaLabel = active ? "Exit fullscreen" : "Enter fullscreen";
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key.toLowerCase() === "f") elements["fullscreen-button"].click();
  if (event.key.toLowerCase() === "s") elements["settings-button"].click();
});

window.addEventListener("online", fetchSchedule);
window.addEventListener("offline", () => setConnection("offline", "Offline"));

setInterval(updateClock, 1000);
setInterval(fetchSchedule, REFRESH_INTERVAL);
void fetchSchedule();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}
