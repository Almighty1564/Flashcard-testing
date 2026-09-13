# Weather update: seven-day outlook, sun times and UV

Approved scope: weather UI only. Authentication, Supabase, encryption, question banks,
news providers and podcast functionality are unchanged.

## User-facing changes

- Seven calendar days: today and the next six days. Each includes conditions,
  high/low temperature, rain probability and peak UV. Missing days and readings
  explicitly say unavailable; a missing reading is never converted to zero.
- Prominent Sun & UV cards separate this hour's estimated UV from today's forecast
  maximum. Sunrise and sunset use the selected city's timezone. Hourly UV values
  accompany the existing six-hour outlook. Risk labels include text and color.
- Existing Fahrenheit/Celsius controls convert the complete outlook. New styles
  inherit the site's glass-palette variables. Desktop cards become stacked rows
  on smaller screens; hourly forecasts wrap rather than overflowing phones.
- Failed refreshes retain the previous payload, timestamp and failure flag. Saved
  UV is not labeled as current. All forecast dates and hourly selections are
  re-evaluated when rendered, so cached data does not freeze yesterday as today.

## Implementation

`briefing-data.js`: requests seven days and daily `weather_code`; normalizes daily
arrays into calendar-keyed rows, and selects only the model value for the current
hour for the UV estimate. Daily UNIX calendar keys use Open-Meteo's response offset;
sunrise/sunset remain real timestamps formatted in the selected IANA timezone.

`briefing.js`: renders the expanded panel, keeps raw weather responses in the
existing memory cache, and reprojects them on render. A one-minute visible-only
clock update advances dates/hours. Provider refreshes are spaced by the existing
15-minute TTL. It does not request weather while signed out, hidden or on another
briefing tab. Provider failures do not create a rapid retry loop.

`briefing-weather.css`: scoped, palette-aware addition loaded after the existing
glass styles. `tester.html` versions the changed JS and the new stylesheet. No new
runtime packages, backend endpoints, API keys, permissions or database migrations.

## Validation and limits

- `node --test tests/briefing-weather.test.cjs`: 20 passing tests covering API
  fields, missing values, zero UV, UV thresholds, unit conversion, timezone/day
  rollover, DST, malformed payloads, input immutability and basic regressions.
- `python tests/briefing-browser.py`: 15 passing Chromium component checks,
  including eight viewport widths from 320 to 1440 pixels, city changes, unit
  controls, stale responses, hidden-state inactivity and first-load failure.
  Requires Python Playwright plus Chromium. Screenshots/results go to a temporary
  directory. Synthetic provider responses and an isolated copy of the briefing
  shell are used; these tests never sign in to or modify the production backend.
- The authenticated production page, real device geolocation, physical iPhone/
  iPad behavior and live provider responses were not verified in this environment.
  Repository deployment status must be checked separately after publishing.

## Provider contracts

- Open-Meteo fields and UNIX daily-date handling: https://open-meteo.com/en/docs
- UV risk categories: https://www.weather.gov/ilx/uv-index

UV categories use the displayed one-decimal value with boundaries at 3, 6, 8 and
11. The current UV card is explicitly an hourly model estimate, not a sensor.
