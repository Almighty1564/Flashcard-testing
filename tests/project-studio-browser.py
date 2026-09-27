"""Local HTTP browser integration. Real IndexedDB/CSP; mocked Auth and cloud responses.
Run on a normal development host: pip install playwright; playwright install chromium.
This test never signs in to a real account or contacts the production database.
"""
from pathlib import Path
import json,threading,http.server,socketserver,time,tempfile,os,zipfile
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUTPUT=Path(os.environ.get('T08_TEST_OUTPUT',tempfile.mkdtemp(prefix='t08-browser-')));OUTPUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(ROOT),**k)
 def log_message(self,*a):pass
class Server(socketserver.TCPServer):allow_reuse_address=True
server=Server(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();ORIGIN=f'http://127.0.0.1:{server.server_address[1]}'
REMOTE=[];checks=[]
MOCK=r'''
window.__authListeners=[];
window.FC={requireUser:async()=>({id:'11111111-1111-4111-8111-111111111111',username:'fixture-learner',role:'tester'}),client:{auth:{getSession:async()=>({data:{session:{user:{id:'11111111-1111-4111-8111-111111111111'}}}}),onAuthStateChange:fn=>window.__authListeners.push(fn),signOut:async()=>{window.__authListeners.forEach(f=>f('SIGNED_OUT',null));return {error:null};}},rpc:async()=>({data:{allowed:true},error:null}),from:table=>({insert:async row=>(await fetch('/__mockCloud',{method:'POST',body:JSON.stringify(row)})).json(),select(){let filters={};return {eq(k,v){filters[k]=v;return this;},order(){return this;},async range(a,b){return(await fetch('/__mockCloud?'+new URLSearchParams({...filters,a,b}))).json();},async single(){const r=await(await fetch('/__mockCloud?'+new URLSearchParams(filters))).json();return {data:r.data?.[0],error:r.error};}};}})}};
'''
def check(name,value=True):assert value,name;checks.append(name);print('PASS',name,flush=True)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True, **({'executable_path':os.environ['T08_CHROMIUM_EXECUTABLE']} if os.environ.get('T08_CHROMIUM_EXECUTABLE') else {}))
  def context(width=1380):
   ctx=browser.new_context(viewport={'width':width,'height':950},accept_downloads=True)
   ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(content_type='application/javascript',body='window.supabase={};'))
   ctx.route('**/cloud.js*',lambda r:r.fulfill(content_type='application/javascript',body=MOCK))
   ctx.route('**/security-auth.js*',lambda r:r.fulfill(content_type='application/javascript',body='window.T08Security={};'))
   def cloud(route):
    req=route.request
    if req.method=='POST':
     row=json.loads(req.post_data)
     if any(x['id']==row['id'] and x['user_id']==row['user_id'] for x in REMOTE):out={'error':{'code':'23505','message':'duplicate'}}
     else:REMOTE.append({**row,'recorded_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())});out={'error':None}
    else:
     q=parse_qs(urlparse(req.url).query);rows=[x for x in REMOTE if all(x.get(k)==v[0] for k,v in q.items() if k not in ('a','b'))];out={'data':rows[int(q.get('a',['0'])[0]):int(q.get('b',['999999'])[0])+1],'error':None}
    route.fulfill(content_type='application/json',body=json.dumps(out))
   ctx.route('**/__mockCloud*',cloud);return ctx
  ctx=context();page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.goto(ORIGIN+'/cs50/projects.html');page.locator('#workspace').wait_for(state='visible');check('Workspace under deployed CSP renders with mocked auth');page.screenshot(path=str(OUTPUT/'studio-desktop.png'),full_page=True)
  page.locator('[data-release="fg-01"]').first.click();page.locator('[data-tab="evidence"]').first.click();page.locator('#notes').fill('A real IndexedDB note: expected unchanged source bytes, observed correct inventory, regression test added.');page.locator('#repo').fill('local fixture');page.wait_for_timeout(1400)
  check('Native IndexedDB saved note',page.evaluate('T08Studio.events.some(e=>e.payload.type==="draft")'))
  page.reload();page.locator('#notes').wait_for();check('Actual reload retains note','real IndexedDB' in page.locator('#notes').input_value())
  with page.expect_download() as got:page.locator('[data-download="guardian"]').click()
  target=OUTPUT/'guardian.zip';got.value.save_as(str(target));check('Actual downloadable ZIP is valid','tools/check_project.py' in zipfile.ZipFile(target).namelist())
  page.locator('#account').click();page.locator('#toggleSync').click();page.wait_for_timeout(900);check('Actual store sync pushes immutable events to mock server',len(REMOTE)>0);page.locator('#backupDialog .close').click()
  ctx2=context(390);mobile=ctx2.new_page();mobile.on('dialog',lambda d:d.accept());mobile.goto(ORIGIN+'/cs50/projects.html');mobile.locator('#workspace').wait_for(state='visible');mobile.locator('#account').click();mobile.locator('#toggleSync').click();mobile.wait_for_timeout(900);check('Second browser context pulls cloud notes',mobile.evaluate('T08Studio.events.some(e=>e.payload.type==="draft")'));mobile.locator('#backupDialog .close').click();mobile.screenshot(path=str(OUTPUT/'studio-mobile.png'),full_page=True);check('Mobile horizontal overflow absent',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  # Append distinct roots to reproduce concurrent edit branches without changing existing evidence.
  page.evaluate('''async()=>{await T08Studio.ledger.append({type:'draft',release_id:'fg-01',parents:[],text:'Second branch',repo:'another fixture',assistance:'none'});}''');page.reload();page.locator('#notes').wait_for();check('Conflicting note heads are blocked pending explicit merge',page.locator('#notes').is_disabled())
  page.locator('.conflict details summary').first.click();page.locator('[data-merge]').first.click();page.locator('[data-action="saveNotes"]').click();page.wait_for_timeout(350);page.reload();page.locator('#notes').wait_for();check('Merged revision survives reload',not page.locator('#notes').is_disabled())
  # Wait for async initial cloud sync and the diagnostics surface after reload.
  page.wait_for_function('window.T08Studio?.ledger')
  # Ledger-level batch conflict must abort atomically.
  check('Immutable batch collision rejected',page.evaluate('''async()=>{const e=(await T08Studio.ledger.all())[0];try{await T08Studio.ledger.merge([{...e,payload:{...e.payload,text:'tampered'}}]);return false;}catch(_){return (await T08Studio.ledger.all()).find(x=>x.id===e.id).payload.text===e.payload.text;}}'''))
  page.locator('#account').click();page.locator('#signout').click();page.locator('#gate').wait_for(state='visible');check('Signout clears displayed evidence',page.locator('#workspace').is_hidden());check('No uncaught browser exceptions',not errors)
  browser.close()
finally:server.shutdown()
(OUTPUT/'results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'scope':'Real local HTTP, native IndexedDB and CSP. Auth and cloud API are mocked; not a production-account end-to-end test.'},indent=2))
print('BROWSER INTEGRATION:',len(checks),'passed')
