"""Isolated real-browser component checks, using deterministic mock provider responses."""
from pathlib import Path
import json, subprocess, shutil, tempfile
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(tempfile.mkdtemp(prefix='tomato08-weather-tests-'))
html=(ROOT/'tester.html').read_text()
body=html[html.index('<section class="b-briefing"'):html.index('</dialog>')+9]
css=(ROOT/'briefing.css').read_text()+(ROOT/'briefing-weather.css').read_text()
fixture_html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\nbody{margin:0;padding:12px;background:#191a1e}#testerApp{max-width:1080px;margin:0 auto}[hidden]{display:none!important}</style></head><body data-atelier><section id="testerApp" hidden>'+body+'</section></body></html>'
raw=json.loads(subprocess.check_output(['node',str(ROOT/'tests/briefing-fixture.cjs')]))
results=[]
def passed(name):results.append(name);print('PASS',name,flush=True)
mock='''window.__now=Date.parse('2026-09-13T18:30:00Z');Date.now=()=>window.__now;
window.__ticks=[];window.setInterval=fn=>{window.__ticks.push(fn);return 1;};
window.__state={fail:false,missing:false,weather:0,news:0,options:[]};
window.fetch=async (url,options)=>{
 const s=window.__state;s.options.push({credentials:options.credentials,referrerPolicy:options.referrerPolicy,headers:options.headers||null});
 if(url.startsWith('https://api.open-meteo.com/')) {
  s.weather++;if(s.fail)return new Response('Unavailable',{status:503});
  const p=JSON.parse(JSON.stringify(window.__raw));
  if(url.includes('longitude=139')){p.timezone='Asia/Tokyo';p.utc_offset_seconds=32400;p.daily.time=Array.from({length:7},(_,i)=>Date.parse('2026-09-13T15:00:00Z')/1000+i*86400);}
  if(s.missing){p.hourly.uv_index=Array(168).fill(null);p.daily.uv_index_max=Array(7).fill(null);p.daily.sunrise=Array(7).fill(null);p.daily.sunset=Array(7).fill(null);}
  return new Response(JSON.stringify(p),{status:200});
 }
 if(url.startsWith('https://geocoding-api.open-meteo.com/'))return new Response(JSON.stringify({results:[{name:'Tokyo',country:'Japan',country_code:'JP',admin1:'Tokyo',latitude:35.68,longitude:139.69,timezone:'Asia/Tokyo'}]}));
 s.news++;return new Response(JSON.stringify({status:'ok',items:[{title:'Test headline',link:'https://example.com/news',pubDate:'2026-09-13 18:00:00'}]}));
};'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1100},timezone_id='Pacific/Honolulu')
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def setup(missing=False,fail=False):
  page.set_content(fixture_html);page.evaluate('(raw)=>window.__raw=raw',raw);page.add_script_tag(content=mock)
  page.evaluate('([missing,fail])=>{__state.missing=missing;__state.fail=fail}',[missing,fail])
  page.add_script_tag(content=(ROOT/'briefing-data.js').read_text());page.add_script_tag(content=(ROOT/'briefing.js').read_text())
 def state():return page.evaluate('window.__state')
 setup();assert state()['weather']==0;passed('signed-out component makes no provider requests')
 page.eval_on_selector('#testerApp','e=>e.hidden=false')
 expect(page.locator('.b-forecast-day')).to_have_count(7);expect(page.locator('.b-hour')).to_have_count(6)
 expect(page.locator('.b-uv-card').first).to_contain_text('6.4 · High');expect(page.locator('.b-uv-card').nth(1)).to_contain_text('7.8 · High')
 expect(page.locator('.b-sun-card').first).to_contain_text('6:55 AM');expect(page.locator('.b-sun-card').nth(1)).to_contain_text('7:23 PM')
 expect(page.locator('.b-temperature')).to_have_text('79°F');passed('seven days, six hours, separate UV values and city-local sun times render')
 page.locator('#briefingUnits').click();expect(page.locator('.b-temperature')).to_have_text('26°C')
 expect(page.locator('.b-forecast-day').first).to_contain_text('27°')
 page.locator('#briefingUnits').click();expect(page.locator('.b-temperature')).to_have_text('79°F')
 assert state()['weather']==1;passed('unit switching converts current and weekly temperatures without refetching')
 for width in (1440,1280,1024,820,768,610,390,320):
  page.set_viewport_size({'width':width,'height':1000})
  overflow=page.evaluate('''() => Array.from(document.querySelectorAll('.b-sun-uv-grid,.b-uv-card,.b-sun-card,.b-week-list,.b-forecast-day,.b-hourly-section,.b-hour,.b-weather-expanded')).filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,width:e.clientWidth,scroll:e.scrollWidth}))''')
  assert not overflow,(width,overflow)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
 passed('no weather overflow at eight desktop, tablet and phone viewport widths')
 page.set_viewport_size({'width':1440,'height':1100});page.locator('#dailyBriefing').screenshot(path=str(OUT/'weather-desktop.png'))
 page.set_viewport_size({'width':390,'height':900});page.locator('#dailyBriefing').screenshot(path=str(OUT/'weather-mobile.png'))
 page.add_style_tag(content='body[data-atelier] .b-briefing {--b-text:#172438;--b-muted:#46576d;--b-line:rgba(40,61,85,.22);--b-accent:#8b372c;--lg-solid:#eef2f8;}')
 assert page.locator('.b-uv-card').first.evaluate('e=>getComputedStyle(e).color')=='rgb(23, 36, 56)'
 assert page.locator('.b-uv-card').first.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(238, 242, 248)'
 passed('new cards inherit light-palette variables and retain explicit UV contrast pairs')
 page.set_viewport_size({'width':1440,'height':1100});page.evaluate('__state.fail=true');page.locator('#briefingRefresh').click()
 expect(page.locator('.b-weather-warning')).to_be_visible();expect(page.locator('.b-uv-card').first).to_contain_text('saved forecast');expect(page.locator('.b-forecast-day')).to_have_count(7)
 passed('failed refresh retains dated data and labels saved UV instead of current UV')
 page.locator('#briefingTabLocal').click();expect(page.locator('.b-news-card')).to_have_count(1)
 count=state()['weather'];page.locator('#briefingTabWeather').click();expect(page.locator('.b-weather-warning')).to_be_visible();assert state()['weather']==count
 passed('failed-refresh flag persists across cached tab returns')
 page.evaluate('window.__now=Date.parse("2026-09-14T04:01:00Z");window.__ticks.forEach(f=>f())')
 expect(page.locator('.b-forecast-day').first.locator('time')).to_have_attribute('datetime','2026-09-14')
 expect(page.locator('.b-sun-card').first).to_contain_text('6:55 AM');expect(page.locator('.b-uv-card').first).to_contain_text('0.0 · Low')
 passed('visible timer reprojects cached dates and UV through city-local midnight')
 count=state()['weather'];page.evaluate('window.__now+=60000;window.__ticks.forEach(f=>f())');assert state()['weather']==count;passed('automatic retry is throttled after provider failure')
 page.locator('#briefingTabLocal').click();expect(page.locator('.b-news-card')).to_have_count(1)
 count=state()['weather'];page.evaluate('window.__now+=960000;window.__ticks.forEach(f=>f())');assert state()['weather']==count;passed('weather refresh is inactive on other tabs')
 page.eval_on_selector('#testerApp','e=>e.hidden=true');page.wait_for_timeout(50)
 count=state()['weather'];page.evaluate('window.__now+=960000;window.__ticks.forEach(f=>f())');assert state()['weather']==count;passed('hidden workspace stops weather refreshes')
 setup(missing=True);page.eval_on_selector('#testerApp','e=>e.hidden=false')
 expect(page.locator('.b-uv-card').first).to_contain_text('Unavailable');expect(page.locator('.b-uv-card').nth(1)).to_contain_text('Unavailable');expect(page.locator('.b-sun-card').first).to_contain_text('Unavailable')
 assert '0.0' not in page.locator('.b-sun-uv').inner_text();passed('missing UV and sun times stay unavailable in the browser')
 page.evaluate('__state.missing=false');page.locator('#briefingLocationButton').click();page.locator('#briefingCitySearch').fill('Tokyo')
 page.locator('#briefingLocationForm button').click();page.locator('.b-location-result').click()
 expect(page.locator('#briefingLocationLabel')).to_contain_text('Tokyo');expect(page.locator('.b-sun-uv')).to_contain_text('Asia/Tokyo');expect(page.locator('.b-forecast-day').first.locator('time')).to_have_attribute('datetime','2026-09-14')
 passed('city search changes forecast and timezone independently of device timezone')
 assert all(o['credentials']=='omit' and o['referrerPolicy']=='no-referrer' and not o['headers'] for o in state()['options'])
 assert not errors,errors;passed('no JavaScript errors or account credentials in provider request options')
 setup(fail=True);page.eval_on_selector('#testerApp','e=>e.hidden=false');expect(page.locator('#briefingRetry')).to_be_visible();expect(page.locator('.b-forecast-day')).to_have_count(0)
 passed('first-load provider failure shows retry without fabricated forecast cards')
 browser.close()
(OUT/'browser-results.json').write_text(json.dumps({'passed':len(results),'checks':results},indent=2))

print("Browser screenshots and results:",OUT)
