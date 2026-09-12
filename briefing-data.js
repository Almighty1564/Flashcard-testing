/* Pure briefing adapters. Forecast units: Celsius, km/h, mm; weather times: UNIX seconds.
   News times: UNIX milliseconds. The controller must render text as textContent / escaped HTML.
   Open-Meteo variable contract: https://open-meteo.com/en/docs */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BriefingData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const defaultLocation = Object.freeze({
    name: 'Fayetteville', admin1: 'North Carolina', country: 'United States',
    country_code: 'US', latitude: 35.0527, longitude: -78.8784, timezone: 'America/New_York'
  });
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const bounded = (value, low, high) => {
    const number = finite(value);
    return number !== null && number >= low && number <= high ? number : null;
  };
  const label = (value, max) => {
    if (typeof value !== 'string' || /[<>\u0000-\u001f\u007f]/u.test(value)) return '';
    const result = value.trim().replace(/\s+/gu, ' ');
    return result.length <= max ? result : '';
  };

  function validLocation(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const name = label(value.name, 100);
    const latitude = bounded(value.latitude, -90, 90);
    const longitude = bounded(value.longitude, -180, 180);
    if (!name || latitude === null || longitude === null) return null;
    const zone = label(value.timezone, 80);
    let timezone = '';
    if (zone) {
      try { new Intl.DateTimeFormat('en', { timeZone: zone }); timezone = zone; } catch (_) { /* Unknown zone. */ }
    }
    return {
      name, admin1: label(value.admin1, 100), country: label(value.country, 100),
      country_code: typeof value.country_code === 'string' && /^[a-z]{2}$/i.test(value.country_code)
        ? value.country_code.toUpperCase() : '',
      latitude, longitude, timezone
    };
  }

  function weatherURL(location) {
    const city = validLocation(location);
    if (!city) throw new TypeError('A valid city and geographic coordinates are required.');
    const params = new URLSearchParams({
      latitude: String(city.latitude), longitude: String(city.longitude),
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly: 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_gusts_10m,uv_index,is_day',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
      forecast_days: '2', timezone: 'auto', timeformat: 'unixtime',
      temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm'
    });
    return 'https://api.open-meteo.com/v1/forecast?' + params.toString();
  }

  const at = (record, key, index) => Array.isArray(record[key]) ? finite(record[key][index]) : null;
  const nonnegative = value => bounded(value, 0, Number.MAX_VALUE);

  function normalizeWeather(payload, nowMs = Date.now()) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.error) return null;
    const raw = payload.current && typeof payload.current === 'object' ? payload.current : {};
    const hourly = payload.hourly && typeof payload.hourly === 'object' ? payload.hourly : {};
    const daily = payload.daily && typeof payload.daily === 'object' ? payload.daily : {};
    if (!Object.keys(raw).length && !Array.isArray(hourly.time) && !Array.isArray(daily.time)) return null;
    const now = (finite(nowMs) === null ? Date.now() : nowMs) / 1000;
    const current = {
      temp: finite(raw.temperature_2m), feels: finite(raw.apparent_temperature),
      humidity: bounded(raw.relative_humidity_2m, 0, 100),
      wind: nonnegative(raw.wind_speed_10m), gust: nonnegative(raw.wind_gusts_10m),
      direction: bounded(raw.wind_direction_10m, 0, 360), code: finite(raw.weather_code),
      isDay: raw.is_day === 1 ? true : raw.is_day === 0 ? false : null,
      precip: nonnegative(raw.precipitation), time: finite(raw.time)
    };
    const times = Array.isArray(hourly.time) ? hourly.time : [];
    const hours = times.map((time, index) => ({ time: finite(time), index }))
      .filter(row => row.time !== null && row.time >= now)
      .sort((a, b) => a.time - b.time)
      .filter((row, index, rows) => !index || row.time !== rows[index - 1].time)
      .slice(0, 6).map(({ time, index }) => ({
        time, temp: at(hourly, 'temperature_2m', index), feels: at(hourly, 'apparent_temperature', index),
        rainChance: bounded(at(hourly, 'precipitation_probability', index), 0, 100),
        code: at(hourly, 'weather_code', index), isDay: at(hourly, 'is_day', index) === 1 ? true : at(hourly, 'is_day', index) === 0 ? false : null,
        gust: nonnegative(at(hourly, 'wind_gusts_10m', index)),
        uv: nonnegative(at(hourly, 'uv_index', index))
      }));
    // Daily epochs identify local midnight; compare the instants rather than the device's date.
    const dailyTimes = Array.isArray(daily.time) ? daily.time : [];
    let dayIndex = 0;
    for (let index = 0; index < dailyTimes.length; index++) {
      if (finite(dailyTimes[index]) !== null && dailyTimes[index] <= now) dayIndex = index;
    }
    const day = {
      high: at(daily, 'temperature_2m_max', dayIndex), low: at(daily, 'temperature_2m_min', dayIndex),
      rainChance: bounded(at(daily, 'precipitation_probability_max', dayIndex), 0, 100),
      sunrise: at(daily, 'sunrise', dayIndex), sunset: at(daily, 'sunset', dayIndex),
      uv: nonnegative(at(daily, 'uv_index_max', dayIndex))
    };
    let timezone = 'UTC';
    if (typeof payload.timezone === 'string') {
      try { new Intl.DateTimeFormat('en', { timeZone: payload.timezone }); timezone = payload.timezone; } catch (_) { /* UTC fallback. */ }
    }
    return { current, daily: day, hours, timezone };
  }

  function description(code, isDay) {
    if (code === 0) return { label: isDay === false ? 'Clear night' : isDay === true ? 'Clear sky' : 'Clear', icon: isDay === false ? '☾' : '☀' };
    if (code === 1) return { label: 'Mainly clear', icon: isDay === false ? '☾' : '🌤' };
    if (code === 2) return { label: 'Partly cloudy', icon: '⛅' };
    if (code === 3) return { label: 'Overcast', icon: '☁' };
    if ([45, 48].includes(code)) return { label: code === 48 ? 'Freezing fog' : 'Fog', icon: '🌫' };
    if ([51, 53, 55].includes(code)) return { label: 'Drizzle', icon: '🌦' };
    if ([56, 57].includes(code)) return { label: 'Freezing drizzle', icon: '🌧' };
    if ([61, 63, 65].includes(code)) return { label: code === 65 ? 'Heavy rain' : 'Rain', icon: '🌧' };
    if ([66, 67].includes(code)) return { label: 'Freezing rain', icon: '🌧' };
    if ([71, 73, 75, 77].includes(code)) return { label: code === 75 ? 'Heavy snow' : 'Snow', icon: '❄' };
    if ([80, 81, 82].includes(code)) return { label: code === 82 ? 'Heavy showers' : 'Rain showers', icon: '🌦' };
    if ([85, 86].includes(code)) return { label: 'Snow showers', icon: '❄' };
    if ([95, 96, 99].includes(code)) return { label: code === 95 ? 'Thunderstorms' : 'Thunderstorms with hail', icon: '⛈' };
    return { label: 'Conditions unavailable', icon: '—' };
  }

  function advice(weather) {
    if (!weather || typeof weather !== 'object') return '';
    const current = weather.current || {};
    const hours = Array.isArray(weather.hours) ? weather.hours.slice(0, 6) : [];
    const day = weather.daily || {};
    const validValues = values => values.filter(value => finite(value) !== null);
    const feels = finite(current.feels) ?? finite(current.temp);
    const futureTemps = validValues(hours.map(hour => finite(hour.feels) ?? finite(hour.temp)));
    const temps = validValues([feels, ...futureTemps]);
    const codes = [current.code, ...hours.map(hour => hour.code)];
    const gusts = validValues([current.gust, ...hours.map(hour => hour.gust)]);
    const maxGust = gusts.length ? Math.max(...gusts) : null;
    const chances = validValues(hours.map(hour => hour.rainChance));
    const rainChance = chances.length ? Math.max(...chances) : finite(day.rainChance);
    const wetCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
    const wet = (rainChance !== null && rainChance >= 40) || current.precip > 0 || codes.some(code => wetCodes.includes(code));
    const storm = codes.some(code => [95, 96, 99].includes(code));
    const snow = codes.some(code => [56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(code));
    if (!temps.length && !wet && !storm && !snow && maxGust === null) return '';
    const sentences = [];
    const temp = feels === null ? (temps.length ? temps[0] : null) : feels;
    if (temp !== null) {
      if (temp >= 26) sentences.push('Shorts and breathable clothing should be comfortable.');
      else if (temp >= 20) sentences.push('Wear light layers.');
      else if (temp >= 12) sentences.push('Bring a light jacket.');
      else if (temp >= 4) sentences.push('Wear a warm jacket and layers.');
      else sentences.push('Bundle up with a coat, hat and warm layers.');
      if (temp >= 20 && futureTemps.some(value => value < 18)) sentences.push('Bring an extra layer for cooler hours ahead.');
    }
    if (storm) sentences.push('Thunderstorms are possible: plan indoor shelter and avoid exposed outdoor areas.');
    else if (snow) sentences.push('Choose a waterproof coat and shoes with good grip; icy conditions may occur.');
    else if (wet) sentences.push(maxGust !== null && maxGust >= 45
      ? 'Bring a rain jacket; strong gusts can make an umbrella impractical.'
      : 'Bring an umbrella or a rain jacket.');
    else if (maxGust !== null && maxGust >= 45) sentences.push('A windproof outer layer will help in strong gusts.');
    const uvValues = validValues(hours.map(hour => hour.uv));
    // The daily maximum is useful for daytime planning only, not an overnight sunscreen prompt.
    const uv = uvValues.length ? Math.max(...uvValues) : current.isDay === true ? finite(day.uv) : null;
    if (uv !== null && uv >= 3) sentences.push('Use sunscreen and sunglasses outdoors.');
    if (temp !== null && temp >= 32) sentences.push('Carry water and take breaks in the shade.');
    return sentences.join(' ');
  }

  const fahrenheit = value => finite(value) === null ? null : value * 9 / 5 + 32;
  const mph = value => finite(value) === null ? null : value / 1.609344;

  function safeURL(value) {
    if (typeof value !== 'string' || !/^https:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/u.test(value)) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
      return url.href;
    } catch (_) { return null; }
  }

  function plainText(value, maxLength) {
    if (typeof value !== 'string') return '';
    const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
    return value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
        if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? match;
        const hex = entity[1].toLowerCase() === 'x';
        const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
      })
      .replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, maxLength);
  }

  function newsTime(value, kind) {
    if (typeof value !== 'string' || !value.trim()) return null;
    let text = value.trim();
    if (kind === 'Seen') text = text.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z');
    // rss2json's offset-free dates are UTC; never let the browser's local zone change them.
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(text)) text = text.replace(' ', 'T') + 'Z';
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeNews(payload, fallbackSource) {
    if (!payload || typeof payload !== 'object' || (payload.status && payload.status !== 'ok')) return [];
    const isGdelt = Array.isArray(payload.articles);
    const rows = isGdelt ? payload.articles : Array.isArray(payload.items) ? payload.items : [];
    const seen = new Set();
    const items = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const url = safeURL(isGdelt ? row.url : row.link);
      const title = plainText(row.title, 320);
      if (!url || !title) continue;
      const canonical = new URL(url);
      canonical.hash = '';
      if (seen.has(canonical.href)) continue;
      seen.add(canonical.href);
      const timeLabel = isGdelt ? 'Seen' : 'Published';
      const source = plainText((isGdelt ? row.domain : row.author || row.source?.title)
        || payload.feed?.title || fallbackSource || canonical.hostname, 100);
      items.push({ title, url, source, time: newsTime(isGdelt ? row.seendate : row.pubDate, timeLabel), timeLabel });
      if (items.length === 6) break;
    }
    return items;
  }

  return Object.freeze({ defaultLocation, validLocation, weatherURL, normalizeWeather, description, advice, fahrenheit, mph, safeURL, normalizeNews });
});
