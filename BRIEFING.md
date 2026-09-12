# Daily briefing

The learning-page artwork banner is replaced with live Weather, Local, United States, World, and Sports slides. The original module launcher and study workflows remain intact; **Start learning** now appears beside the module collection.

Fayetteville, North Carolina is the starting city. A selected city and temperature-unit preference stay in this browser. City search uses Open-Meteo's GeoNames-backed geocoder. **Use my location** requests browser permission only after a click, rounds coordinates to two decimal places, and uses BigDataCloud to identify the nearby city. The location dialog explains that provider's location/IP processing. No location, weather, or news data is written to Supabase, and no account token is sent to the briefing providers. Resetting the area removes saved preferences and restores Fayetteville.

## Included

- Current temperature, feels-like temperature, conditions, daily high/low, rain probability, wind/gusts, humidity, UV peak, sunrise/sunset, and six upcoming hourly forecasts. Fahrenheit/Celsius also switches wind units.
- Forecast-based clothing suggestions account for heat, cooling hours, rain, strong gusts, snow/ice, thunderstorms, and UV. Missing values remain unavailable; failed requests do not generate invented weather.
- Local headlines follow the chosen city and region. US headlines use Google News's national feed. World news uses BBC World; **Surprise me** selects another group of real stories already fetched, without another network call.
- US sports: American football/NFL, basketball/NBA, baseball/MLB. Europe: football, tennis, and basketball with a EuroLeague focus. These are sports headline feeds, not a live scoreboard.
- Buttons, keyboard tabs/arrows/Home/End, and horizontal swipes navigate sections. There is no automatic slide rotation or animation loop.

## Sources and service boundaries

Weather comes directly from [Open-Meteo](https://open-meteo.com/en/docs), with linked attribution. Its free API supports noncommercial use under the provider's [terms](https://open-meteo.com/en/terms); a commercial or much larger deployment needs a suitable service plan. Location naming uses the consent-based [BigDataCloud client service](https://www.bigdatacloud.com/docs/article/why-is-reverse-geocoding-api-free). Manual searches use [Open-Meteo geocoding](https://open-meteo.com/en/docs/geocoding-api).

News uses Google News RSS, [BBC RSS](https://support.bbc.co.uk/platform/feeds/NewsFeeds.htm), [BBC Sport RSS](https://support.bbc.co.uk/platform/feeds/SportFeeds.htm), and [ESPN's supported RSS feeds](https://www.espn.com/espn/news/story?page=rssinfo). Only headlines, publisher names, publication times, and links are shown. No full articles, publisher artwork, or inserted advertisements are copied.

[rss2json's documented keyless API](https://rss2json.com/docs) converts RSS for browser access. This is an external service dependency, not an imported JavaScript library. Only `rss_url` is supplied; parameters requiring a key are omitted. The [provider's privacy policy](https://rss2json.com/privacy-policy) describes request/usage logging. Weather providers receive the selected area's coordinates; news providers receive city names or sports queries. All fetches omit cookies and referrers, and contain no Supabase keys or session tokens.

Requests occur for the visible slide only, after the learning workspace opens. Results are cached in memory for 15 minutes. Manual refresh is throttled; hidden pages abort outstanding requests. Requests time out after 14 seconds. If refreshing a previously loaded feed fails, it retains its original timestamp and is marked as saved data. Provider-side caching can make headlines older than the time the app last checked the feed. A fresh page has no persistent headline/weather cache.

The US sports selection is supported by [Gallup's September 2026 survey](https://news.gallup.com/poll/714281/football-top-sport-soccer-inching.aspx). The European trio is a practical selection supported by a [pan-European live-sport survey](https://www.mastercard.com/news/europe/en/newsroom/press-releases/en/2022/january/mastercard-sport-economy-index-reveals-europe-set-for-60-boost-of-new-and-returning-fans-at-live-events-in-2022/); it is not presented as a definitive current ranking in every European country.

## Validation

The existing signed-in local page was checked in the browser: weather, local/US/world headlines, world shuffle, US NFL and European football/basketball feeds, city search/selection, and Fahrenheit/Celsius switching all worked. Browser logs showed no errors during those checks. Direct endpoint probes confirmed successful JSON/CORS responses. Device-location permission was left for the user; its browser prompt and real GPS path were not exercised. Physical iPhone/iPad testing remains outstanding.

Local tests cover data validation and conversions, missing readings, clothing advice, safe links/headlines, signed-out inactivity, caching, cancellation, provider timeouts, keyboard tabs, and location changes. Existing account/module regression tests still pass. No database changes, paid subscriptions, GitHub pushes, or public deployment were performed.

## Maintenance

`briefing-data.js` contains pure data adapters and forecast advice. `briefing.js` contains source URLs, caching, rendering, and UI behavior. `briefing.css` styles the panel; `tester.html` contains its accessible shell. There are no new npm packages or build steps. For a large audience, replace the public RSS converter with an owned, rate-limited feed service and a supported weather plan; the current adapters can remain the interface boundary.
