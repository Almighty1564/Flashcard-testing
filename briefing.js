/* Live, on-demand public briefing. No account credentials leave this module. */
(function () {
  'use strict';
  const D = window.BriefingData, root = document.getElementById('dailyBriefing');
  if (!D || !root) return;
  const $ = id => document.getElementById(id);
  const panel = $('briefingPanel'), tabs = Array.from(root.querySelectorAll('[data-briefing-tab]'));
  const app = $('testerApp'), dialog = $('briefingLocationDialog');
  const PREFS_KEY = 'tomato08.briefing.preferences.v1';
  const NEWS_TTL = 15 * 60 * 1000, WEATHER_TTL = 15 * 60 * 1000;
  const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const google = query => 'https://news.google.com/rss/search?' + new URLSearchParams({q:query,hl:'en-US',gl:'US',ceid:'US:en'});
  const SOURCES = {
    us: {name:'Google News · US',url:'https://news.google.com/rss/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en',home:'https://news.google.com/home?hl=en-US&gl=US&ceid=US:en',google:true},
    world: {name:'BBC News',url:'https://feeds.bbci.co.uk/news/world/rss.xml',home:'https://www.bbc.com/news/world'},
    nfl: {name:'ESPN · NFL',url:'https://www.espn.com/espn/rss/nfl/news',home:'https://www.espn.com/nfl/'},
    nba: {name:'ESPN · NBA',url:'https://www.espn.com/espn/rss/nba/news',home:'https://www.espn.com/nba/'},
    mlb: {name:'ESPN · MLB',url:'https://www.espn.com/espn/rss/mlb/news',home:'https://www.espn.com/mlb/'},
    football: {name:'BBC Sport · Football',url:'https://feeds.bbci.co.uk/sport/football/rss.xml',home:'https://www.bbc.com/sport/football'},
    tennis: {name:'BBC Sport · Tennis',url:'https://feeds.bbci.co.uk/sport/tennis/rss.xml',home:'https://www.bbc.com/sport/tennis'},
    eurobasket: {name:'European basketball · Google News',url:google('EuroLeague basketball when:7d'),home:'https://news.google.com/search?q=EuroLeague%20basketball',google:true}
  };
  const SPORTS = {
    us:[{id:'nfl',label:'American football',league:'NFL'},{id:'nba',label:'Basketball',league:'NBA'},{id:'mlb',label:'Baseball',league:'MLB'}],
    europe:[{id:'football',label:'Football',league:'Club & international'},{id:'tennis',label:'Tennis',league:'ATP & WTA'},{id:'eurobasket',label:'Basketball',league:'European focus'}]
  };
  let location = {...D.defaultLocation}, units = 'f', tab = 'weather', region = 'us', sport = 'nfl';
  let generation = 0, request = null, cityRequest = null, geoGeneration = 0, lastGeo = 0, lastRefresh = 0;
  let weatherAttempt = 0;
  let currentWeather = null, worldItems = [], worldOffset = 0, active = false;
  const cache = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (saved?.location) location = D.validLocation(saved.location) || location;
    if (saved?.units === 'c') units = 'c';
  } catch (_) { /* Private browsing and invalid saved data both use safe defaults. */ }
  function persist() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({location,units})); }
    catch (_) { $('briefingStatus').textContent = 'Preferences will last for this visit only.'; }
  }
  function labelCity(city) { return [city.name, city.admin1 || city.country].filter(Boolean).join(', '); }
  function syncLocation() { $('briefingLocationLabel').textContent = labelCity(location); }
  function syncUnits() {
    $('briefingUnits').innerHTML = units === 'f' ? '°F <span aria-hidden="true">/ °C</span>' : '°C <span aria-hidden="true">/ °F</span>';
    $('briefingUnits').setAttribute('aria-label', 'Weather units, currently ' + (units === 'f' ? 'Fahrenheit. Switch to Celsius.' : 'Celsius. Switch to Fahrenheit.'));
  }
  function isActive() { return active && !document.hidden && (!app || !app.hidden); }
  async function getJSON(url, signal) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', onAbort, {once:true});
    const timeout = setTimeout(() => controller.abort(), 14000);
    try {
      const response = await fetch(url, {signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if (!response.ok) throw new Error('The data provider is unavailable (' + response.status + ').');
      return await response.json();
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', onAbort); }
  }
  function remember(key, data) {
    if (cache.size >= 24 && !cache.has(key)) cache.delete(cache.keys().next().value);
    const entry = {data,checked:Date.now()}; cache.set(key,entry); return entry;
  }
  async function cached(key, ttl, force, load, signal) {
    const prior = cache.get(key);
    if (prior && !force && Date.now() - prior.checked < ttl) return {...prior,stale:Boolean(prior.failed)};
    try { return {...remember(key,await load()),stale:false}; }
    catch (error) { if (signal.aborted) throw error; if (prior) { prior.failed=true; return {...prior,stale:true}; } throw error; }
  }
  function clock(seconds, timezone, options) {
    if (!Number.isFinite(seconds)) return 'Unavailable';
    try { return new Intl.DateTimeFormat('en-US',{timeZone:timezone || undefined,hour:'numeric',minute:'2-digit',...options}).format(new Date(seconds * 1000)); }
    catch (_) { return 'Unavailable'; }
  }
  function temp(value) { return Number.isFinite(value) ? Math.round(units === 'f' ? D.fahrenheit(value) : value) + '°' : 'Unavailable'; }
  function wind(value) { return Number.isFinite(value) ? Math.round(units === 'f' ? D.mph(value) : value) + (units === 'f' ? ' mph' : ' km/h') : 'Unavailable'; }
  function percent(value) { return Number.isFinite(value) ? Math.round(value) + '%' : 'Unavailable'; }
  function metric(label, value) { return '<div class="b-metric"><dt>' + e(label) + '</dt><dd>' + e(value) + '</dd></div>'; }
  function dateLabel(date, options) {
    try { return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(new Date(date + 'T12:00:00Z')); }
    catch (_) { return 'Unavailable'; }
  }
  function uvBadge(value) {
    const risk = D.uvRisk(value);
    return '<span class="b-uv-badge b-uv-' + risk.level + '">' + (risk.value === null ? 'Unavailable' : e(risk.value.toFixed(1)) + ' · ' + e(risk.label)) + '</span>';
  }
  function weatherAge(checked) {
    const minutes = Math.max(0, Math.floor((Date.now() - checked) / 60000));
    return minutes < 1 ? 'just now' : minutes < 60 ? minutes + ' min ago' : Math.floor(minutes / 60) + ' h ' + (minutes % 60) + ' min ago';
  }
  function weatherView(raw, stale, checked) {
    // Re-evaluate cached forecasts at render time, including city-local midnight and hour changes.
    const w = D.normalizeWeather(raw);
    if (!w) return '<p class="b-weather-warning">Weather unavailable. Please refresh.</p>';
    const c = w.current, d = w.daily, conditions = D.description(c.code,c.isDay);
    const saved = stale || Date.now() - checked >= WEATHER_TTL;
    const warning = saved ? '<p class="b-weather-warning" role="status">Saved forecast · fetched ' + e(weatherAge(checked)) + '. Refresh failed or this data has expired; values may be outdated.</p>' : '';
    const advice = saved ? 'Check the forecast timestamp before planning outdoor activity.' : D.advice(w);
    const date = dateLabel(w.today, { weekday:'long',month:'short',day:'numeric' });
    const uvTime = Number.isFinite(c.uvTime) ? clock(c.uvTime,w.timezone,{month:'short',day:'numeric'}) : 'Unavailable';
    const sunCard = (label, value) => '<div class="b-sun-card"><dt>' + e(label) + '</dt><dd>' + e(clock(value,w.timezone)) + '</dd><small>Today · city local time</small></div>';
    const uvCard = (label, value, note) => '<div class="b-uv-card"><dt>' + e(label) + '</dt><dd>' + uvBadge(value) + '</dd><small>' + e(note) + '</small></div>';
    const week = w.days.map((day,index) => {
      const condition = D.description(day.code,true);
      return '<li class="b-forecast-day"' + (index === 0 ? ' aria-current="date"' : '') + '>' +
        '<div class="b-day-date"><strong>' + e(index === 0 ? 'Today' : dateLabel(day.date,{weekday:'short'})) + '</strong><time datetime="' + e(day.date) + '">' + e(dateLabel(day.date,{month:'short',day:'numeric'})) + '</time></div>' +
        '<div class="b-day-condition"><span aria-hidden="true">' + e(condition.icon) + '</span><span>' + e(day.available ? condition.label : 'Forecast unavailable') + '</span></div>' +
        '<div class="b-day-temperature"><span>High <strong>' + temp(day.high) + '</strong></span><span>Low <strong>' + temp(day.low) + '</strong></span></div>' +
        '<div class="b-day-rain"><span>Rain chance</span><strong>' + percent(day.rainChance) + '</strong></div>' +
        '<div class="b-day-uv"><span>Peak UV</span>' + uvBadge(day.uv) + '</div></li>';
    }).join('');
    return warning + '<div class="b-weather b-weather-expanded"><div class="b-weather-main"><span class="b-kicker">' + e(labelCity(location)) + '</span><div class="b-temperature-row"><strong class="b-temperature' + (Number.isFinite(c.temp) ? '' : ' b-reading-missing') + '">' + temp(c.temp) + (Number.isFinite(c.temp) ? '<small>' + (units === 'f' ? 'F' : 'C') + '</small>' : '') + '</strong><span class="b-weather-icon" aria-hidden="true">' + e(conditions.icon) + '</span></div><div class="b-weather-condition">' + e(conditions.label) + '</div><p class="b-weather-range">Feels like ' + temp(c.feels) + ' · High ' + temp(d.high) + ' / Low ' + temp(d.low) + '</p></div>' +
      '<div class="b-weather-details"><dl class="b-weather-metrics">' + metric('Rain today',percent(d.rainChance)) + metric('Wind / gusts',wind(c.wind) + ' / ' + wind(c.gust)) + metric('Humidity',percent(c.humidity)) + '</dl></div>' +
      '<section class="b-sun-uv" aria-labelledby="briefingSunTitle"><h3 id="briefingSunTitle">Sun &amp; UV <small>' + e(date) + '</small></h3><dl class="b-sun-uv-grid">' +
      uvCard(saved ? 'UV estimate · saved forecast' : 'UV now · estimated',c.uv,'Hourly model at ' + uvTime) + uvCard('Today’s peak UV',d.uv,'Forecast daily maximum, not current UV') + sunCard('Sunrise',d.sunrise) + sunCard('Sunset',d.sunset) + '</dl><p class="b-weather-note">All times: ' + e(w.timezone) + '. UV is forecast, not a live sensor reading. <a href="https://www.weather.gov/ilx/uv-index" target="_blank" rel="noopener noreferrer">UV scale</a></p></section>' +
      '<section class="b-hourly-section" aria-labelledby="briefingHourlyTitle"><h3 id="briefingHourlyTitle">Next six forecast hours</h3><div class="b-hourly">' + w.hours.map(h => '<div class="b-hour"><span>' + e(clock(h.time,w.timezone,{minute:undefined})) + '</span><small class="b-hour-date">' + e(dateLabel(D.localDate(h.time,w.timezone),{month:'short',day:'numeric'})) + '</small><span class="b-hour-icon" aria-hidden="true">' + e(D.description(h.code,h.isDay).icon) + '</span><span class="b-hour-condition">' + e(D.description(h.code,h.isDay).label) + '</span><strong>' + temp(h.temp) + '</strong><small>' + percent(h.rainChance) + ' rain</small><span class="b-hour-uv">UV ' + uvBadge(h.uv) + '</span></div>').join('') + (w.hours.length ? '' : '<p>Hourly forecast unavailable.</p>') + '</div></section>' +
      '<section class="b-week-section" aria-labelledby="briefingWeekTitle"><h3 id="briefingWeekTitle">7-day forecast <small>Today + next six days</small></h3><ol class="b-week-list">' + week + '</ol><p class="b-weather-note">Daily summaries and peak UV are forecasts. Unavailable values are not zero.</p></section>' +
      '<div class="b-weather-advice"><span class="b-advice-icon" aria-hidden="true">↗</span><div><span class="b-kicker">BEFORE YOU HEAD OUT</span><p>' + e(advice || 'Weather advice is unavailable until the forecast is complete.') + '</p></div></div></div><div class="b-weather-attribution"><span>Conditions forecast at ' + e(clock(c.time,w.timezone,{month:'short',day:'numeric'})) + ' · Fetched ' + e(weatherAge(checked)) + '</span><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather by Open-Meteo</a></div>';
  }
  function renderWeather(entry) {
    panel.innerHTML = weatherView(entry.data,entry.stale,entry.checked);
    $('briefingUpdated').textContent = 'Weather fetched ' + weatherAge(entry.checked);
    $('briefingStatus').textContent = entry.stale || Date.now()-entry.checked >= WEATHER_TTL ? 'Could not refresh · showing saved forecast.' : '';
  }
  function publication(item) {
    if (!Number.isFinite(item.time)) return 'Publication time unavailable';
    return item.timeLabel + ' ' + new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(item.time));
  }
  function newsCards(items) {
    if (!items.length) return '<div class="b-empty"><h3>No recent headlines in this feed.</h3><p>Try refreshing later or open the source below.</p></div>';
    return '<div class="b-news-grid">' + items.slice(0,3).map((item,i) => '<article class="b-news-card"><div class="b-news-source"><span>' + e(item.source) + '</span><span aria-hidden="true">0' + (i+1) + '</span></div><h3 class="b-news-title"><a href="' + e(item.url) + '" target="_blank" rel="noopener noreferrer">' + e(item.title) + '</a></h3><div class="b-news-time"><time' + (Number.isFinite(item.time) ? ' datetime="' + new Date(item.time).toISOString() + '"' : '') + '>' + e(publication(item)) + '</time><span aria-hidden="true">↗</span></div></article>').join('') + '</div>';
  }
  function newsHeading(kicker, title, extra) { return '<div class="b-slide-heading"><div><span class="b-kicker">' + e(kicker) + '</span><h3>' + e(title) + '</h3></div>' + (extra || '') + '</div>'; }
  function feedCredit(source) { return '<div class="b-weather-attribution"><a href="' + e(source.home) + '" target="_blank" rel="noopener noreferrer">' + e(source.name) + '</a><span>Headlines via <a href="https://rss2json.com/" target="_blank" rel="noopener noreferrer">rss2json</a> · Publisher times shown</span></div>'; }
  function sourceForSlide() {
    if (tab === 'local') {
      const city = [location.name,location.admin1,location.country].filter(Boolean).map(x => String(x).replace(/["\\]/g,'')).join(' ');
      return {name:'Local publishers · Google News',url:google(city + ' when:7d'),home:'https://news.google.com/search?' + new URLSearchParams({q:city,hl:'en-US',gl:'US',ceid:'US:en'}),google:true};
    }
    if (tab === 'sports') return SOURCES[sport];
    return SOURCES[tab];
  }
  async function fetchFeed(source, signal) {
    const payload = await getJSON('https://api.rss2json.com/v1/api.json?' + new URLSearchParams({rss_url:source.url}),signal);
    if (payload.status !== 'ok' || !Array.isArray(payload.items)) throw new Error('The headline feed could not be read. Try again later.');
    const cutoff = Date.now() - (tab === 'local' ? 14 : 30) * 86400000;
    return D.normalizeNews(payload,source.name).map(item => {
      if (source.google) { const suffix = item.title.lastIndexOf(' - '); if (suffix > 0) item.source = item.title.slice(suffix+3); }
      else item.source = source.name;
      return item;
    }).filter(item => !Number.isFinite(item.time) || item.time >= cutoff).sort((a,b) => (b.time || 0) - (a.time || 0));
  }
  function sportsToolbar() {
    return '<div class="b-sports-toolbar"><div class="b-sports-region" role="group" aria-label="Sports coverage region"><button class="b-sport-chip" data-sports-region="us" aria-pressed="' + (region === 'us') + '">United States</button><button class="b-sport-chip" data-sports-region="europe" aria-pressed="' + (region === 'europe') + '">Europe</button></div><div class="b-sports-region" role="group" aria-label="Choose a sport">' + SPORTS[region].map(s => '<button class="b-sport-chip" data-sport="' + s.id + '" aria-pressed="' + (sport === s.id) + '">' + e(s.label) + '</button>').join('') + '</div></div>';
  }
  function wirePanel() {
    panel.querySelectorAll('[data-sports-region]').forEach(button => button.addEventListener('click',() => { region=button.dataset.sportsRegion; sport=SPORTS[region][0].id; load(false,'[data-sports-region="' + region + '"]'); }));
    panel.querySelectorAll('[data-sport]').forEach(button => button.addEventListener('click',() => { sport=button.dataset.sport; load(false,'[data-sport="' + sport + '"]'); }));
    $('briefingShuffle')?.addEventListener('click',() => {
      if (worldItems.length > 1) worldOffset=(worldOffset+1+Math.floor(Math.random() * (worldItems.length-1))) % worldItems.length;
      renderWorld(); wirePanel(); $('briefingShuffle')?.focus();
    });
    $('briefingRetry')?.addEventListener('click',() => load(true));
  }
  function renderWorld() {
    const selected = worldItems.slice(worldOffset).concat(worldItems.slice(0,worldOffset));
    panel.innerHTML = newsHeading('A DIFFERENT PERSPECTIVE','Somewhere in the world.','<button type="button" class="b-button" id="briefingShuffle">Surprise me ↗</button>') + newsCards(selected) + feedCredit(SOURCES.world);
  }
  async function load(force, focusSelector) {
    if (!isActive()) return;
    const mine = ++generation; request?.abort(); request = new AbortController(); const signal=request.signal;
    const currentTab = tab, source = sourceForSlide();
    $('briefingStatus').textContent = ''; $('briefingUpdated').textContent = 'Checking ' + (tab === 'weather' ? 'the forecast…' : 'headlines…');
    panel.setAttribute('aria-busy','true');
    panel.innerHTML = (tab === 'sports' ? sportsToolbar() : '') + '<div class="b-empty"><span class="b-kicker">' + e(tab === 'weather' ? labelCity(location) : 'YOUR BRIEFING') + '</span><h3>' + (tab === 'weather' ? 'A look at the day ahead.' : 'Opening the headlines…') + '</h3><p>Fetching the latest available update.</p></div>';
    wirePanel();
    try {
      let entry;
      if (tab === 'weather') {
        weatherAttempt = Date.now();
        const url=D.weatherURL(location);
        entry=await cached(url,WEATHER_TTL,force,async()=>{ const raw=await getJSON(url,signal); const normalized=D.normalizeWeather(raw); if (!normalized) throw new Error('The weather provider returned an incomplete forecast.'); return raw; },signal);
      } else entry=await cached(source.url,NEWS_TTL,force,()=>fetchFeed(source,signal),signal);
      if (mine !== generation || signal.aborted || !isActive()) return;
      if (currentTab === 'weather') { currentWeather=entry; renderWeather(entry); }
      else if (currentTab === 'world') { worldItems=entry.data; worldOffset=worldItems.length ? Math.floor(Math.random()*worldItems.length) : 0; renderWorld(); }
      else if (currentTab === 'sports') {
        const selected=SPORTS[region].find(x=>x.id===sport);
        panel.innerHTML=sportsToolbar()+newsHeading(region === 'us' ? 'US SPORTS' : 'EUROPE / SELECTED SPORTS',selected.label + ' · ' + selected.league)+newsCards(entry.data)+feedCredit(source);
      } else panel.innerHTML=newsHeading(currentTab === 'local' ? 'CLOSE TO HOME' : 'ACROSS THE COUNTRY',currentTab === 'local' ? labelCity(location) : 'United States.')+newsCards(entry.data)+feedCredit(source);
      if (currentTab !== 'weather') {
      $('briefingUpdated').textContent=(entry.stale ? 'Last successful update ' : 'Checked ') + new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(entry.checked));
      $('briefingStatus').textContent=entry.stale ? 'Could not refresh · showing saved data.' : '';
      }
      wirePanel();
      if (focusSelector) panel.querySelector(focusSelector)?.focus();
    } catch (error) {
      if (mine !== generation || signal.aborted || !isActive()) return;
      panel.innerHTML=(currentTab === 'sports' ? sportsToolbar() : '')+'<div class="b-empty"><span class="b-kicker">TEMPORARILY UNAVAILABLE</span><h3>'+(currentTab === 'weather' ? 'The forecast is taking a break.' : 'The headlines could not be loaded.')+'</h3><p>Check your connection or try again in a moment. No sample data is being shown.</p><button type="button" class="b-button" id="briefingRetry">Try again</button>'+(source ? ' <a class="b-button" href="'+e(source.home)+'" target="_blank" rel="noopener noreferrer">Open news source ↗</a>' : '')+'</div>';
      $('briefingUpdated').textContent='No current update'; $('briefingStatus').textContent=error.name === 'AbortError' ? 'The provider did not respond in time.' : error.message;
      wirePanel();
    } finally { if (mine === generation) panel.setAttribute('aria-busy','false'); }
  }
  function selectTab(next, focus) {
    tab=next;
    tabs.forEach(button=>{const selected=button.dataset.briefingTab===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;if(selected){panel.setAttribute('aria-labelledby',button.id);if(focus)button.focus();}});
    $('briefingUnits').hidden=tab!=='weather';
    load(false);
  }
  tabs.forEach((button,index)=>{
    button.addEventListener('click',()=>selectTab(button.dataset.briefingTab,false));
    button.addEventListener('keydown',event=>{
      let next=index;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;
      event.preventDefault();selectTab(tabs[next].dataset.briefingTab,true);
    });
  });
  function step(delta){const i=tabs.findIndex(x=>x.dataset.briefingTab===tab);selectTab(tabs[(i+delta+tabs.length)%tabs.length].dataset.briefingTab,false);}
  $('briefingPrevious').addEventListener('click',()=>step(-1));$('briefingNext').addEventListener('click',()=>step(1));
  let gesture=null;
  panel.addEventListener('touchstart',event=>{if(event.touches.length!==1 || event.target.closest('a,button,input,.b-hourly')){gesture=null;return;}gesture={x:event.touches[0].clientX,y:event.touches[0].clientY};},{passive:true});
  panel.addEventListener('touchend',event=>{if(!gesture)return;const touch=event.changedTouches[0],dx=touch.clientX-gesture.x,dy=touch.clientY-gesture.y;gesture=null;if(Math.abs(dx)>80&&Math.abs(dx)>Math.abs(dy)*2)step(dx<0?1:-1);},{passive:true});
  $('briefingRefresh').addEventListener('click',()=>{if(Date.now()-lastRefresh<5000)return;lastRefresh=Date.now();load(true);});
  $('briefingUnits').addEventListener('click',()=>{units=units==='f'?'c':'f';persist();syncUnits();if(tab==='weather'&&currentWeather)renderWeather(currentWeather);});
  $('briefingLocationButton').addEventListener('click',()=>{dialog.showModal();$('briefingCitySearch').value=location.name;$('briefingCitySearch').focus();});
  $('briefingLocationClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{geoGeneration++;cityRequest?.abort();$('briefingUseLocation').disabled=false;$('briefingLocationButton').focus();});
  function setLocation(value) {
    const selected=D.validLocation(value);if(!selected)return;
    location=selected;currentWeather=null;persist();syncLocation();dialog.close();selectTab('weather',false);
  }
  function showLocations(rows) {
    const results=$('briefingLocationResults');results.replaceChildren();
    rows.forEach(city=>{const li=document.createElement('li'),button=document.createElement('button'),name=document.createElement('strong'),region=document.createElement('span');button.type='button';button.className='b-location-result';name.textContent=city.name;region.textContent=[city.admin1,city.country].filter(Boolean).join(', ');button.append(name,region);button.addEventListener('click',()=>setLocation(city));li.append(button);results.append(li);});
  }
  $('briefingLocationForm').addEventListener('submit',async event=>{
    event.preventDefault();const query=$('briefingCitySearch').value.trim();if(query.length<2)return;
    geoGeneration++;$('briefingUseLocation').disabled=false;
    cityRequest?.abort();cityRequest=new AbortController();const signal=cityRequest.signal;
    $('briefingLocationStatus').textContent='Finding cities…';showLocations([]);
    try {
      const payload=await getJSON('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:query,count:'8',language:'en',format:'json'}),signal);
      if(signal.aborted||!dialog.open)return;
      const rows=(payload.results||[]).map(D.validLocation).filter(Boolean);showLocations(rows);
      $('briefingLocationStatus').textContent=rows.length?'Choose your city below.':'No cities found. Try the city name without the state, then choose from the results.';
    }catch(error){if(!signal.aborted)$('briefingLocationStatus').textContent='City search is unavailable. Please try again later.';}
  });
  $('briefingUseLocation').addEventListener('click',()=>{
    if(!navigator.geolocation){$('briefingLocationStatus').textContent='This browser does not support location detection. Search for a city instead.';return;}
    if(Date.now()-lastGeo<10000){$('briefingLocationStatus').textContent='Please wait a moment before trying location again.';return;}
    lastGeo=Date.now();const mine=++geoGeneration;$('briefingUseLocation').disabled=true;$('briefingLocationStatus').textContent='Waiting for location permission…';
    navigator.geolocation.getCurrentPosition(async position=>{
      if(mine!==geoGeneration||!dialog.open)return;
      // Round immediately. Exact device coordinates are never stored or used in feed queries.
      const latitude=Math.round(position.coords.latitude*100)/100,longitude=Math.round(position.coords.longitude*100)/100;
      $('briefingLocationStatus').textContent='Finding your nearest city…';
      cityRequest?.abort();cityRequest=new AbortController();const signal=cityRequest.signal;
      try {
        const data=await getJSON('https://api.bigdatacloud.net/data/reverse-geocode-client?'+new URLSearchParams({latitude,longitude,localityLanguage:'en'}),signal);
        if(mine!==geoGeneration||!dialog.open||signal.aborted)return;
        const name=data.city||data.locality;
        if(!name)throw new Error('No city found');
        const selected=D.validLocation({name,admin1:data.principalSubdivision,country:data.countryName,country_code:data.countryCode,latitude,longitude,timezone:''});
        if(!selected)throw new Error('No valid location');setLocation(selected);
      }catch(error){if(mine===geoGeneration&&!signal.aborted)$('briefingLocationStatus').textContent='Your coordinates were found, but the city lookup failed. Search for your city instead.';}
      finally{if(mine===geoGeneration)$('briefingUseLocation').disabled=false;}
    },error=>{
      if(mine!==geoGeneration||!dialog.open)return;$('briefingUseLocation').disabled=false;
      $('briefingLocationStatus').textContent=error.code===1?'Location permission was declined. You can still search for a city.':'Your location could not be found. Try again or search for a city.';
    },{enableHighAccuracy:false,timeout:12000,maximumAge:60000});
  });
  $('briefingResetLocation')?.addEventListener('click',()=>{try{localStorage.removeItem(PREFS_KEY);}catch(_){}location={...D.defaultLocation};units='f';currentWeather=null;syncLocation();syncUnits();dialog.close();selectTab('weather',false);});
  syncLocation();syncUnits();
  function visibilityChanged() {
    const visible=(!app||!app.hidden)&&!document.hidden;
    if(visible&&!active){active=true;load(false);}
    else if(!visible&&active){active=false;generation++;request?.abort();geoGeneration++;cityRequest?.abort();if(dialog.open)dialog.close();}
  }
  if(app)new MutationObserver(visibilityChanged).observe(app,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange',visibilityChanged);
  window.addEventListener('pagehide',()=>{active=false;generation++;request?.abort();cityRequest?.abort();});
  window.addEventListener('pageshow',visibilityChanged);
  // Re-project cached hours/dates once a minute. Refresh only while signed in,
  // visible and on Weather; failed refresh attempts are spaced by the normal TTL.
  setInterval(() => {
    if (!isActive() || tab !== 'weather' || !currentWeather || panel.getAttribute('aria-busy') === 'true') return;
    if (Date.now() - weatherAttempt >= WEATHER_TTL) load(false);
    else renderWeather(currentWeather);
  }, 60000);
  visibilityChanged();
})();
