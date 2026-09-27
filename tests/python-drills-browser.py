"""Native browser integration on a local HTTP origin. Auth/cloud use synthetic mocks.
No production login, token, database, or network equipment is involved.
"""
from pathlib import Path
import json,threading,http.server,socketserver,time,tempfile,os,zipfile,subprocess,sys
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
from browser_wait import wait_ready
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=Path(os.environ.get('T08_DRILL_OUTPUT',tempfile.mkdtemp(prefix='t08-drills-browser-')));OUTPUT.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(ROOT),**k)
 def log_message(self,*a):pass
class Server(socketserver.ThreadingTCPServer):allow_reuse_address=True
server=Server(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();ORIGIN=f'http://127.0.0.1:{server.server_address[1]}'
REMOTE=[];checks=[]
MOCK=r'''
window.__authListeners=[];
window.FC={requireUser:async()=>({id:'11111111-1111-4111-8111-111111111111',username:'fixture-learner',role:'tester'}),client:{auth:{getSession:async()=>({data:{session:{user:{id:'11111111-1111-4111-8111-111111111111'}}}}),onAuthStateChange:fn=>window.__authListeners.push(fn),signOut:async()=>{window.__authListeners.forEach(f=>f('SIGNED_OUT',null));return {error:null};}},rpc:async()=>({data:{allowed:true},error:null}),from:table=>({insert:async row=>(await fetch('/__mockCloud',{method:'POST',body:JSON.stringify(row)})).json(),select(){let filters={};return {eq(k,v){filters[k]=v;return this;},order(){return this;},async range(a,b){return(await fetch('/__mockCloud?'+new URLSearchParams({...filters,a,b}))).json();},async single(){const r=await(await fetch('/__mockCloud?'+new URLSearchParams(filters))).json();return {data:r.data?.[0],error:r.error};}};}})}};
'''
def check(name,value=True):assert value,name;checks.append(name);print('PASS',name,flush=True)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,**({'executable_path':os.environ['T08_CHROMIUM_EXECUTABLE']} if os.environ.get('T08_CHROMIUM_EXECUTABLE') else {}))
  def context(width=1440,approved=True):
   ctx=browser.new_context(viewport={'width':width,'height':1000},accept_downloads=True)
   ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(content_type='application/javascript',body='window.supabase={};'))
   ctx.route('**/cloud.js*',lambda r:r.fulfill(content_type='application/javascript',body=MOCK if approved else MOCK.replace("async()=>({id:'11111111-1111-4111-8111-111111111111',username:'fixture-learner',role:'tester'})","async()=>null")))
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
  ctx=context();page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  page.goto(ORIGIN+'/cs50/practice.html');page.locator('#workspace').wait_for(state='visible');wait_ready(page,'window.T08Drills?.tasks.length===216');check('Practice opens with actual CSP and all 216 tasks');check('Twelve topic links',page.locator('#topics button').count()==12)
  page.screenshot(path=str(OUTPUT/'practice-desktop.png'),full_page=True)
  page.locator('#topics [data-topic="values"]').click();page.locator('[data-action="learnNext"]').click();page.locator('[data-action="learnNext"]').click();wait_ready(page,'T08Drills.events.filter(e=>e.payload.kind==="learn-step").length===2');page.reload();page.locator('[data-action="learnNext"]').wait_for();check('Learning steps survive actual reload',page.evaluate('T08Drills.core.learned(T08Drills.events,T08Drills.packs[0]).size')==2)
  page.locator('[data-view="overview"]').first.click();page.locator('[data-go-step="3"]').click();check('Continue selects next unreviewed learning step','STEP 3 OF 5' in page.locator('#body').inner_text())
  for _ in range(3):page.locator('[data-action="learnNext"]').click()
  page.locator('#code').wait_for();check('Fifth learning step leads to actual drill one',page.evaluate('T08Drills.activeTask.id')=='py-values-01')
  page.locator('#code').fill('result = data * 1000\n');page.locator('#notes').fill('Browser integration fixture: verify a source snapshot and preserve its result.');page.locator('#assistance').select_option('docs');page.locator('[data-action="save"]').click();wait_ready(page,'T08Drills.events.some(e=>e.payload.type==="draft")');page.reload();page.locator('#code').wait_for();check('Native IndexedDB preserves code and notes',page.locator('#code').input_value()=='result = data * 1000\n')
  with page.expect_download() as got:page.locator('[data-action="downloadTask"]').click()
  kit=OUTPUT/'drill.zip';got.value.save_as(str(kit))
  work=OUTPUT/'extracted';work.mkdir();zipfile.ZipFile(kit).extractall(work);check('Downloaded kit has checker and current source',(work/'check_drill.py').exists() and (work/'solutions/py-values-01.py').read_text()=='result = data * 1000\n')
  run=subprocess.run([sys.executable,'check_drill.py','--task','py-values-01'],cwd=work,capture_output=True,text=True,timeout=30);check('Actual downloaded checker executes and passes',run.returncode==0)
  result=work/'reports/py-values-01.json';page.locator('[data-action="importReport"]').click();page.locator('#reportFile').set_input_files(result);wait_ready(page,'T08Drills.events.some(e=>e.payload.type==="attempt"&&e.payload.passed)');check('Actual local checker report imports into saved evidence');count=page.evaluate('T08Drills.events.filter(e=>e.payload.type==="attempt").length')
  page.locator('[data-action="importReport"]').click();page.locator('#reportFile').set_input_files(result);wait_ready(page,'document.querySelector("#toast").textContent.includes("already recorded")');check('Duplicate report is not a new attempt',page.evaluate('T08Drills.events.filter(e=>e.payload.type==="attempt").length')==count)
  bad=json.loads(result.read_text());bad['source_files']['src/solution.py']='tampered';badfile=work/'bad.json';badfile.write_text(json.dumps(bad));page.locator('[data-action="importReport"]').click();page.locator('#reportFile').set_input_files(badfile);wait_ready(page,'document.querySelector("#toast").textContent.includes("fingerprint mismatch")');check('Tampered source fingerprint is rejected')
  page.locator('[data-action="hint"]').click();wait_ready(page,'T08Drills.events.some(e=>e.payload.kind==="drill-hint")');run=subprocess.run([sys.executable,'check_drill.py','--task','py-values-01'],cwd=work,capture_output=True,text=True,timeout=30);page.locator('[data-action="importReport"]').click();page.locator('#reportFile').set_input_files(result);wait_ready(page,'T08Drills.events.filter(e=>e.payload.type==="attempt").length===2');check('Hinted pass is recorded as assisted',page.evaluate('T08Drills.events.filter(e=>e.payload.type==="attempt").at(-1).payload.assistance')=='hint')
  (work/'solutions/py-values-01.py').write_text('result = -1\n');subprocess.run([sys.executable,'check_drill.py','--task','py-values-01'],cwd=work,capture_output=True,text=True,timeout=30);page.locator('[data-action="importReport"]').click();page.locator('#reportFile').set_input_files(result);wait_ready(page,'T08Drills.events.filter(e=>e.payload.type==="attempt").length===3');check('Recent failure remains visible after earlier pass','This attempt needs work' in page.locator('#body').inner_text())
  page.locator('[data-stage="check"]').first.click();check('Check stage has exactly three fresh problems',page.locator('.task-list [data-task]').count()==3);page.locator('.task-list [data-task]').first.click();check('Independent check has no hint control',page.locator('[data-action="hint"]').count()==0)
  page.locator('[data-view="mixed"]').first.click();page.locator('#mixCount').select_option('5');page.locator('#mixedForm [type="submit"]').click();page.locator('#code').wait_for();check('Mixed session keeps unique selected tasks',page.evaluate('(()=>{const q=T08Drills.events.filter(e=>e.payload.release_id==="py-practice-session").at(-1).payload.task_ids;return q.length===5&&new Set(q).size===5;})()'))
  page.reload();page.locator('#code').wait_for();check('Mixed session survives reload','Mixed session:' in page.locator('#body').inner_text())
  page.locator('#account').click();page.locator('#toggleSync').click();wait_ready(page,'document.querySelector("#saveStatus").textContent.includes("sync complete")');check('Shared cloud ledger pushes to mock endpoint',len(REMOTE)>0);page.locator('#accountDialog .close').click()
  ctx2=context(390);mobile=ctx2.new_page();mobile.on('dialog',lambda d:d.accept());mobile.goto(ORIGIN+'/cs50/practice.html');mobile.locator('#workspace').wait_for(state='visible');mobile.locator('#account').click();mobile.locator('#toggleSync').click();wait_ready(mobile,'document.querySelector("#saveStatus").textContent.includes("sync complete")');check('Second browser context retrieves drill evidence',mobile.evaluate('T08Drills.events.some(e=>e.payload.type==="attempt")'));mobile.locator('#accountDialog .close').click();check('Mobile overview has no horizontal overflow',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));mobile.screenshot(path=str(OUTPUT/'practice-mobile.png'),full_page=True)
  # Existing Studio should not reinterpret a drill pass as a project completion.
  page.goto(ORIGIN+'/cs50/projects.html#view=history');page.locator('#workspace').wait_for(state='visible');wait_ready(page,'window.T08Studio');check('Existing project history excludes drill reports','No project attempts yet' in page.locator('#content').inner_text())
  page.goto(ORIGIN+'/cs50/practice.html#view=topic&topic=files&stage=apply');page.locator('#workspace').wait_for(state='visible');page.locator('#body a.primary').wait_for();check('Apply links to an existing project release','release=fg-01' in page.locator('#body a.primary').get_attribute('href'))
  page.goto(ORIGIN+'/cs50/index.html');page.locator('[data-view="journey"]').wait_for();wait_ready(page,'document.querySelector("#app").textContent.includes("Learn. Practice.")');check('Default Foundation entry opens the unified course overview')
  page.locator('[data-view="course"]').first.click();wait_ready(page,'document.querySelector("#app").textContent.includes("Learn it.")');check('Existing Foundation course remains reachable')
  page.goto(ORIGIN+'/cs50/practice.html');page.locator('#workspace').wait_for(state='visible');page.locator('#account').click();page.locator('#signout').click();page.locator('#gate').wait_for(state='visible');check('Signout clears rendered drill evidence',page.locator('#content').inner_text()=='')
  denied=context(approved=False).new_page();denied.goto(ORIGIN+'/cs50/practice.html');wait_ready(denied,'document.querySelector("#gateMessage").textContent.includes("Sign in using")');check('Unapproved/unsigned account does not open evidence workspace',denied.locator('#workspace').is_hidden())
  check('No uncaught application exceptions',not errors);browser.close()
finally:server.shutdown()
(OUTPUT/'results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'scope':'Native Chromium, local HTTP, actual CSP/IndexedDB/ZIP and local checker. Auth/cloud mocked. Not production-account or Windows/macOS execution verification.'},indent=2))
print('DRILL BROWSER INTEGRATION:',len(checks),'passed')
