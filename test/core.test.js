import test from "node:test";
import assert from "node:assert/strict";
import {
  apiUrl,
  findNextPrayer,
  formatCountdown,
  normalizeSettings,
  parseTime,
  secondsUntilPrayer,
  settingsFromSearch,
} from "../src/core.js";

test("parseTime validates 24-hour prayer times", () => {
  assert.equal(parseTime("04:52"), 292);
  assert.equal(parseTime("23:59"), 1439);
  assert.equal(parseTime("24:00"), null);
  assert.equal(parseTime("4:52"), null);
});

test("findNextPrayer returns the next time or wraps to tomorrow", () => {
  const prayers = [
    { id: "Fajr", time: "05:00" },
    { id: "Dhuhr", time: "13:30" },
  ];
  assert.equal(findNextPrayer(prayers, { hour: 7, minute: 0 }).id, "Dhuhr");
  assert.equal(findNextPrayer(prayers, { hour: 23, minute: 0 }).id, "Fajr");
});

test("secondsUntilPrayer wraps over midnight", () => {
  assert.equal(secondsUntilPrayer({ hour: 23, minute: 59, second: 30 }, "00:01"), 90);
  assert.equal(secondsUntilPrayer({ hour: 12, minute: 0, second: 0 }, "13:00"), 3600);
});

test("formatCountdown uses a stable display format", () => {
  assert.equal(formatCountdown(3661), "01:01:01");
});

test("URL parameters override saved settings", () => {
  const settings = settingsFromSearch("?mosque=central&lang=fr&theme=sand", {
    sourceType: "city",
    sourceId: "london",
  });
  assert.equal(settings.sourceType, "mosque");
  assert.equal(settings.sourceId, "central");
  assert.equal(settings.language, "fr");
  assert.equal(settings.theme, "sand");
});

test("API URL uses the selected source", () => {
  const settings = normalizeSettings({ sourceType: "city", sourceId: "new-york", language: "en" });
  assert.equal(
    apiUrl(settings).href,
    "https://pray.zone/api/public/cities/new-york/prayer-times?lang=en",
  );
});
