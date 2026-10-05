"""Read-only Chromium regression for the actual workspace pages and auth adapter.
Only FC's transport and third-party weather are synthetic. No real account or data writes.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json, os, threading, time
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('T08_WORKSPACE_OUTPUT', '/tmp/workspace-results'))
OUT.mkdir(parents=True, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
ORIGIN = f'http://127.0.0.1:{server.server_port}'
checks = []
errors = []
networks = []
def passed(name, condition=True):
    assert condition, name
    checks.append(name)
    print('PASS', name, flush=True)

MOCK = r'''
(function(){
 const read=()=>JSON.parse(sessionStorage.getItem('__workspace_fixture'));
 const write=s=>sessionStorage.setItem('__workspace_fixture',JSON.stringify(s));
 const profile=()=>({id:'fixture-only',username:'fixture',role:read().role});
 const modules=[{slug:'mod1',name:'MOD 1',description:'RF fundamentals',is_published:true},{slug:'module-two',name:'MOD 2',is_published:true},{slug:'mod-3',name:'MOD 3',is_published:true},{slug:'draft',name:'Unpublished',is_published:false}];
 window.__fixtureCalls=[];
 window.FC={
  usernameToEmail:u=>u.trim() ? u+'@example.invalid':'',
  getProfile:async()=>read().signedIn ? profile():null,
  signOut:async()=>{write({...read(),signedIn:false});},
  listModules:async()=>{if(read().moduleFail)throw Error('Fixture offline');return modules;},
  client:{
   rpc:async(name,args)=>{window.__fixtureCalls.push({name,args});if(name==='security_access_status'){const s=read();return s.rpcFail?{error:{message:'offline'}}:{data:{approved:s.approved,session_valid:s.sessionValid,mfa_required:s.mfa,aal:s.aal||'aal1',allowed:s.allowed}};}if(name==='security_record_session')return {data:{allowed:true}};throw Error('Unexpected RPC '+name);},
   auth:{getSession:async()=>({data:{session:read().signedIn?{user:profile()}:null}}),getUser:async()=>({data:{user:read().signedIn?profile():null}}),
    signInWithPassword:async()=>{write({...read(),signedIn:true});return {data:{session:{user:profile()}}};},
    mfa:{listFactors:async()=>({data:{totp:[]}})}},
   from:table=>({upsert:async()=>{if(table!=='presence')throw Error('Unexpected write '+table);window.__fixtureCalls.push({name:'presence'});return {data:null};}})
  }
 };
})();
'''

def weather(temp=19.0):
    now = int(time.time())
    hour = now - now % 3600
    day = now - now % 86400
    return {'latitude':35.05,'longitude':-78.88,'timezone':'UTC','utc_offset_seconds':0,
     'current':{'time':now,'temperature_2m':temp,'apparent_temperature':temp,'relative_humidity_2m':80,'weather_code':3,'is_day':1,'wind_speed_10m':5,'wind_gusts_10m':8,'wind_direction_10m':45,'precipitation':0},
     'hourly':{'time':[hour+i*3600 for i in range(12)],'temperature_2m':[19]*12,'apparent_temperature':[19]*12,'weather_code':[3]*12,'precipitation_probability':[20]*12,'is_day':[1]*12,'uv_index':[1]*12,'wind_gusts_10m':[8]*12},
     'daily':{'time':[day+i*86400 for i in range(7)],'temperature_2m_max':[23]*7,'temperature_2m_min':[15]*7,'weather_code':[3]*7,'precipitation_probability_max':[20]*7,'sunrise':[day+i*86400+25000 for i in range(7)],'sunset':[day+i*86400+67000 for i in range(7)],'uv_index_max':[4]*7}}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    def setup(**options):
        cfg = dict(signedIn=True, role='tester', approved=True,sessionValid=True,mfa=False,allowed=True,**{})
        cfg.update(options)
        ctx = browser.new_context(viewport={'width':1440,'height':900},reduced_motion='reduce')
        ctx.add_init_script('if(!sessionStorage.getItem("__workspace_fixture"))sessionStorage.setItem("__workspace_fixture",'+json.dumps(json.dumps(cfg))+');')
        requests=[]
        control={'weatherFail':False,'temp':19.0}
        def route(r):
            u=urlparse(r.request.url)
            if u.path=='/cloud.js':
                return r.fulfill(status=200,content_type='application/javascript',body=MOCK)
            if u.netloc==urlparse(ORIGIN).netloc:
                # The deep-link resolver is tested without opening the unrelated study engine.
                if u.path=='/mod1.html':
                    return r.fulfill(status=200,content_type='text/html',body='<h1>Study route fixture</h1>')
                return r.continue_()
            requests.append(r.request.url)
            if u.hostname=='api.open-meteo.com':
                return r.fulfill(status=503 if control['weatherFail'] else 200,content_type='application/json',body=json.dumps(weather(control['temp'])))
            if u.hostname=='cdn.jsdelivr.net':
                return r.fulfill(status=200,content_type='application/javascript',body='/* FC transport provided by isolated fixture. */')
            return r.abort()
        ctx.route('**/*',route)
        page=ctx.new_page()
        page.on('pageerror',lambda err:errors.append(str(err)))
        networks.append(requests)
        return ctx,page,requests,control
    def goto(page,path='index.html',app='modePicker'):
        page.goto(ORIGIN+'/'+path)
        if app: expect(page.locator('#'+app)).to_be_visible()
    def patch(page,**values):
        page.evaluate('(x)=>sessionStorage.setItem("__workspace_fixture",JSON.stringify({...JSON.parse(sessionStorage.getItem("__workspace_fixture")),...x}))',values)

    try:
        ctx,page,req,ctl=setup()
        goto(page)
        expect(page.locator('#weatherSummary')).to_contain_text('66°F')
        passed('Signed-in Overview stays on Overview, not Learning',urlparse(page.url).path=='/index.html')
        passed('Exactly two primary choices and no dashboard clutter',page.locator('.w-discipline').count()==2 and page.locator('#dailyBriefing,.p-study-notes,.p-dashboard-hero').count()==0)
        passed('Communicator and DEV cards link to distinct real entry routes',page.locator('.w-communicator').get_attribute('href')=='./tester.html' and page.locator('.w-development').get_attribute('href')=='./dev.html')
        passed('Role-restricted admin utilities hidden from learners',page.locator('[data-developer]:visible').count()==0)
        passed('Server authorization adapter remains installed',page.evaluate('typeof T08Security.ensure === "function"') and page.evaluate('__fixtureCalls.some(x=>x.name==="security_access_status")'))
        page.wait_for_function('Array.from(document.querySelectorAll(".w-card-image")).every(i=>i.complete&&i.naturalWidth>0)')
        passed('Both self-hosted card images load')
        for width,height in [(1440,900),(1366,768),(1024,768),(768,1024),(390,844),(320,740)]:
            page.set_viewport_size({'width':width,'height':height})
            page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
            passed(f'Overview has no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            if width>=1024:
                boxes=[x.bounding_box() for x in page.locator('.w-discipline').all()]
                passed(f'Both learning choices visible without scrolling at {width}×{height}',all(x['y']+x['height']<=height for x in boxes))
            if width in [1440,1366,390]:
                page.screenshot(path=str(OUT/f'overview-{width}.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        page.locator('#menuButton').click()
        expect(page.locator('#workspaceNav')).to_have_attribute('aria-modal','true')
        passed('Mobile navigation focuses close control and makes main content inert',page.evaluate('document.activeElement.classList.contains("w-nav-close") && document.querySelector(".w-main").inert'))
        page.keyboard.press('Shift+Tab')
        passed('Drawer traps reverse keyboard focus',page.evaluate('document.querySelector("#workspaceNav").contains(document.activeElement)'))
        page.keyboard.press('Escape')
        passed('Escape closes navigation and restores menu focus',page.evaluate('!document.querySelector(".w-main").inert && document.activeElement.id==="menuButton"'))
        page.locator('#menuButton').click();page.set_viewport_size({'width':1440,'height':900})
        expect(page.locator('#menuButton')).to_have_attribute('aria-expanded','false')
        passed('Resizing to desktop resets drawer state',page.locator('#menuButton').get_attribute('aria-expanded')=='false')
        page.locator('.lg-controls summary').click()
        page.locator('.lg-controls [data-lg-palette="dawn"]').click()
        passed('Appearance palette changes apply to the new workspace',page.locator('html').get_attribute('data-lg-palette')=='dawn' and page.locator('body').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(239, 243, 248)')
        page.screenshot(path=str(OUT/'overview-light.png'),full_page=True)
        page.locator('.lg-controls [data-lg-palette="atelier"]').click()
        page.locator('.lg-controls summary').click()
        passed('Existing Appearance controls are available',page.locator('.lg-controls').count()==1)
        goto(page,'dev.html')
        passed('DEV provides course, practice, and project routes',page.locator('.w-course').count()==3 and page.locator('.w-course[href="./cs50/path.html"]').count()==1 and page.locator('.w-course[href="./cs50/practice.html"]').count()==1 and page.locator('.w-course[href="./cs50/projects.html"]').count()==1)
        page.screenshot(path=str(OUT/'dev-desktop.png'),full_page=True)
        goto(page,'tester.html','testerApp')
        expect(page.locator('#modList .p-module')).to_have_count(3)
        passed('Communicator loads published modules only, without briefing or coding promo',page.locator('#dailyBriefing,#cs50AppliedEntry').count()==0 and 'Unpublished' not in page.locator('#modList').inner_text())
        page.locator('#moduleSearch').fill('MOD 2')
        expect(page.locator('#modList .p-module')).to_have_count(1)
        passed('Module search and original study links preserved',page.locator('#modList a').get_attribute('href')=='./mod1.html?module=module-two')
        page.locator('#moduleSearch').fill('');page.screenshot(path=str(OUT/'communicator-desktop.png'),full_page=True)
        goto(page,'tester.html?module=mod2',None)
        page.wait_for_url('**/mod1.html?module=module-two')
        passed('Sidebar resolves actual published module slugs rather than guessing filenames')
        goto(page,'tester.html?module=missing','testerApp')
        expect(page.locator('#requestedModuleStatus')).to_be_visible()
        passed('Unavailable module request leaves a usable collection, not a redirect loop')
        patch(page,moduleFail=True);goto(page,'tester.html','testerApp')
        expect(page.locator('#retryModules')).to_be_visible()
        patch(page,moduleFail=False);page.locator('#retryModules').click();expect(page.locator('#modList .p-module')).to_have_count(3)
        passed('Module load failure recovers with retry')
        goto(page,'weather.html')
        expect(page.locator('.b-forecast-day')).to_have_count(7)
        expect(page.locator('.b-hour')).to_have_count(6)
        passed('Full seven-day and hourly forecast now lives only on Weather utility page')
        page.locator('#briefingUnits').click();expect(page.locator('.b-temperature')).to_have_text('19°C')
        goto(page);expect(page.locator('#weatherSummary')).to_contain_text('19°C')
        passed('Compact weather shares the selected forecast unit preference')
        page.locator('#signOutBtn').click();expect(page.locator('#gate')).to_be_visible();expect(page.locator('#modePicker')).to_be_hidden()
        passed('Sign out hides workspace and returns the existing login form')
        ctx.close()

        ctx,page,req,ctl=setup(role='developer')
        goto(page);passed('Question Studio and Security utilities available only to developer role',page.locator('[data-developer]:visible').count()==2)
        page.screenshot(path=str(OUT/'overview-developer.png'),full_page=True)
        ctx.close()

        ctx,page,req,ctl=setup(signedIn=False)
        goto(page,app=None);expect(page.locator('#gate')).to_be_visible()
        passed('Signed-out Overview does not fetch weather',not any('api.open-meteo.com' in x for x in req))
        for destination in ['dev.html','weather.html','tester.html']:
            goto(page,destination,None)
            page.wait_for_url('**/index.html?return=**')
            passed('Protected '+destination+' preserves login return destination',parse_qs(urlparse(page.url).query)['return']==['/'+destination])
        page.locator('#userInput').fill('fixture');page.locator('#passInput').fill('fixture-not-real')
        page.locator('#signInBtn').click();page.wait_for_url('**/tester.html');expect(page.locator('#testerApp')).to_be_visible()
        passed('Sign-in returns to requested protected workspace')
        page.locator('#signOutBtn').click();page.wait_for_url('**/index.html')
        page.locator('#userInput').fill('fixture');page.locator('#passInput').fill('fixture-not-real');page.locator('#signInBtn').click()
        expect(page.locator('#modePicker')).to_be_visible()
        passed('Ordinary sign-in lands on two-card Overview without redirect',urlparse(page.url).path=='/index.html')
        passed('Successful sign-in still uses session audit RPC',page.evaluate('__fixtureCalls.some(x=>x.name==="security_record_session")'))
        goto(page,'index.html?return=https://example.invalid/theft')
        passed('External return destination is rejected',urlparse(page.url).netloc==urlparse(ORIGIN).netloc)
        ctx.close()

        for flags,text in [({'approved':False,'allowed':False},'not approved'),({'sessionValid':False,'allowed':False},'revoked'),({'mfa':True,'allowed':False},'MFA is required'),({'rpcFail':True},'verification failed')]:
            ctx,page,req,ctl=setup(**flags)
            goto(page,app=None);expect(page.locator('#gateError')).to_contain_text(text)
            expect(page.locator('#modePicker')).to_be_hidden()
            passed('Authorization fails closed: '+text)
            ctx.close()

        ctx,page,req,ctl=setup()
        goto(page);patch(page,sessionValid=False,allowed=False)
        page.evaluate('window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))')
        expect(page.locator('#modePicker')).to_be_hidden();expect(page.locator('#gate')).to_be_visible()
        passed('Restored browser page revalidates a revoked session before showing workspace')
        ctx.close()

        for temp,fail,text in [(0,False,'32°F'),(None,False,'Weather unavailable'),(19,True,'Weather unavailable')]:
            ctx,page,req,ctl=setup();ctl['temp']=temp;ctl['weatherFail']=fail
            goto(page);expect(page.locator('#weatherSummary')).to_contain_text(text)
            passed('Compact weather handles '+ ('provider failure' if fail else 'zero degrees' if temp==0 else 'missing readings')+' without invented values')
            ctx.close()
        passed('No uncaught browser exceptions',not errors)
    except Exception:
        try: page.screenshot(path=str(OUT/'failure.png'),full_page=True)
        except Exception: pass
        raise
    finally:
        browser.close();server.shutdown()
        (OUT/'results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors,'scope':'Native Chromium with actual workspace pages, styles and security-auth adapter. Synthetic identity, transport and forecast only; no production account or data writes.'},indent=2))
        print('OUTPUT',OUT)
