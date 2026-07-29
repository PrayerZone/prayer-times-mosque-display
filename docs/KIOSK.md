# Kiosk setup

## Raspberry Pi

Install Raspberry Pi OS with Desktop, open Chromium once, and verify that the
display URL returns the expected location. Then add this command to the desktop
session's autostart configuration:

```bash
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --incognito \
  "https://prayerzone.github.io/prayer-times-mosque-display/?city=paris&lang=en"
```

Replace `city=paris` with the required city slug, or use a PrayerZone mosque ID:

```text
?mosque=paris_grande-mosquee-de-paris&lang=fr
```

Disable screen blanking in Raspberry Pi settings and configure the device to
restart after a power failure.

## Android TV or tablet

Open the hosted display in a modern browser, save the desired settings, then add
the Progressive Web App to the home screen when the browser offers installation.
Use the fullscreen button or press `F` with a connected keyboard.

## Operational checklist

- use a wired connection where possible;
- verify the selected city or mosque and timezone;
- keep the device clock synchronized;
- confirm the display after daylight-saving-time changes;
- arrange announcements as one short message per line;
- test a brief offline period before deploying the screen;
- configure automatic operating-system security updates.
