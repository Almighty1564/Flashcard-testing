"""Native linear-course/notebook integration. Real storage; synthetic Auth/cloud only."""
from pathlib import Path
import json,threading,http.server,time,tempfile,os
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
from browser_wait import wait_ready
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('T08_PATH_OUTPUT',tempfile.mkdtemp(prefix='t08-course-map-')));OUT.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
ORIGIN=f'http://127.0.0.1:{server.server_port}';REMOTE=[];checks=[]
MOCK=(ROOT/'tests/python-drills-browser.py').read_text().split("MOCK=r'''",1)[1].split("'''",1)[0]
def check(name,ok=True):assert ok,name;checks.append(name);print('PASS',name,flush=True)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,**({'executable_path':os.environ['T08_CHROMIUM_EXECUTABLE']} if os.environ.get('T08_CHROMIUM_EXECUTABLE') else {}))
  def context(width=1440,account='11111111-1111-4111-8111-111111111111',approved=True):
   ctx=browser.new_context(viewport={'width':width,'height':1000},accept_downloads=True)
   ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(content_type='application/javascript',body='window.supabase={};'))
   mock=MOCK.replace('11111111-1111-4111-8111-111111111111',account)
   if not approved:mock=mock.replace("async()=>({id:'"+account+"',username:'fixture-learner',role:'tester'})",'async()=>null')
   ctx.route('**/cloud.js*',lambda r:r.fulfill(content_type='application/javascript',body=mock))
   ctx.route('**/security-auth.js*',lambda r:r.fulfill(content_type='application/javascript',body='window.T08Security={};'))
   def cloud(route):
    req=route.request
    if req.method=='POST':
     row=json.loads(req.post_data)
     if any(x['id']==row['id'] and x['user_id']==row['user_id'] for x in REMOTE):out={'error':{'code':'23505','message':'duplicate'}}
     else:REMOTE.append({**row,'recorded_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())});out={'error':None}
    else:
     q=parse_qs(urlparse(req.url).query);rows=[r for r in REMOTE if all(r.get(k)==v[0] for k,v in q.items() if k not in ('a','b'))];out={'data':rows[int(q.get('a',['0'])[0]):int(q.get('b',['99999'])[0])+1],'error':None}
    route.fulfill(content_type='application/json',body=json.dumps(out))
   ctx.route('**/__mockCloud*',cloud);return ctx
  def choose_objective(page,node_id):
   overview=page.locator('.linear-overview')
   if not overview.evaluate('e=>e.open'):overview.locator(':scope > summary').click()
   target=page.locator('.path-node[data-node="'+node_id+'"]')
   phase=page.locator('.path-phase').filter(has=target)
   if not phase.evaluate('e=>e.open'):phase.locator(':scope > summary').click()
   target.focus();page.keyboard.press('Enter')
   wait_ready(page,'T08CoursePath.selected.id==='+json.dumps(node_id))
  ctx=context();page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  page.goto(ORIGIN+'/cs50/index.html');page.locator('#objectiveDetail').wait_for();wait_ready(page,'window.T08CoursePath?.data.map.nodes.length===39');check('Default entrance redirects to connected map',page.url.endswith('/cs50/path.html'))
  check('All 39 objectives are available through the outline',page.locator('.path-node').count()==39)
  check('Default course begins with Scratch','Scratch' in page.locator('.linear-course-head h1').inner_text())
  check('Existing linear Foundation, Practice, Apply and Review sequence is preserved',page.locator('.linear-stage').evaluate_all('els=>els.map(e=>e.id)')==['stage-foundation','stage-practice','stage-apply','stage-review'])
  check('Course header returns to the new DEV workspace',page.locator('header nav a[href="../dev.html"]').count()==1)
  choose_objective(page,'cs-structures')
  check('Data structures retains its three prerequisite dependencies',page.evaluate('T08CoursePath.selected.requires.length')==3 and page.locator('#objectiveDetail .path-warning a').count()==3)
  check('Unfinished prerequisites warn but do not block the activity','Builds on unfinished work:' in page.locator('#objectiveDetail').inner_text() and page.locator('#objectiveDetail .task-copy a').first.is_enabled())
  check('Every activity keeps a real assignment link',page.locator('.linear-open-task').count()>0 and page.locator('.linear-open-task').evaluate_all('els=>els.every(a=>a.getAttribute("href") && a.getAttribute("href")!=="#")'))
  page.screenshot(path=str(OUT/'course-linear-desktop.png'),full_page=True)
  choose_objective(page,'cs-arrays');check('Course outline is keyboard navigable')
  page.locator('#reviewText').fill('I can explain array bounds, but this is a reflection without a completed implementation.');page.locator('[data-action="saveReflection"]').click();wait_ready(page,'T08CoursePath.progress.get("cs-arrays").reflection');check('Reflection without implementation cannot complete the objective',not page.evaluate('T08CoursePath.progress.get("cs-arrays").complete'))
  page.locator('#notesButton').click();wait_ready(page,'window.T08Notebook?.ledger');page.locator('#nbNew').click();page.locator('#nbText').wait_for(state='visible');page.locator('#nbTitle').fill('Array reasoning');page.locator('#nbText').fill('An array contains elements. See [[Memory notes]].\n\n```python\nvalues = [1, 2, 3]\n```');page.locator('#nbSave').click();wait_ready(page,'!T08Notebook.dirty && T08Notebook.notes.some(n=>n.title==="Array reasoning")');nid=page.evaluate('T08Notebook.current.id');check('Notebook saves actual account-isolated revisions')
  check('Note is associated with selected topic',page.evaluate('T08Notebook.current.topics.includes("cs-arrays")'))
  page.locator('#nbObsidian summary').click()
  check('Obsidian setup is available inside the notebook without another tab',len(ctx.pages)==1 and page.locator('#nbObsidianSync').is_visible())
  check('Website setup never asks for an Obsidian password',page.locator('#nbObsidian input[type=password]').count()==0)
  with page.expect_download() as dl:page.locator('#nbObsidian a[download]').first.click()
  archive=OUT/'tomato08-notebook-sync.zip';dl.value.save_as(str(archive))
  import zipfile,hashlib
  with zipfile.ZipFile(archive) as z:
   names=z.namelist();check('Plugin download contains installable bundle and manifest',all('tomato08-notebook-sync/'+x in names for x in ['main.js','manifest.json','styles.css']))
   check('Downloaded plugin matches the tested bundle',hashlib.sha256(z.read('tomato08-notebook-sync/main.js')).hexdigest()==hashlib.sha256((ROOT/'cs50/obsidian/main.js').read_bytes()).hexdigest())
  page.locator('#nbObsidianSync').click();wait_ready(page,'document.querySelector("#nbStatus").textContent.includes("Cloud sync complete")')
  check('Notebook cloud control publishes a saved revision after explicit consent',any(r['payload'].get('kind')=='course-note' for r in REMOTE))
  page.locator('#nbObsidian summary').click()

  page.locator('#nbLinks [data-create-title]').click();page.locator('#nbTitle').wait_for();wait_ready(page,'T08Notebook.current?.title==="Memory notes"');page.locator('#nbText').fill('Pointers refer to an address.');page.locator('#nbSave').click();wait_ready(page,'!T08Notebook.dirty');check('Wikilink creates related note without a new browser tab',len(ctx.pages)==1)
  check('Backlinks show the referring note','Array reasoning' in page.locator('#nbBacklinks').inner_text())
  page.locator('#nbTitle').fill('Memory and addresses');page.locator('#nbSave').click();wait_ready(page,'!T08Notebook.dirty && T08Notebook.current.title==="Memory and addresses"');check('Renaming retains a link alias',page.evaluate('T08Notebook.current.aliases.includes("Memory notes")'))
  page.locator('#nbBacklinks [data-note]').click();wait_ready(page,'T08Notebook.current.title==="Array reasoning"');check('Old title link resolves after rename','Memory notes' in page.locator('#nbLinks').inner_text())
  page.locator('#nbText').fill('<img src=x onerror="window.__executed=true">\n\n[[Memory notes]]');page.locator('#nbPreviewButton').click();check('Preview treats HTML as text rather than executable markup',page.locator('#nbPreview img').count()==0 and page.evaluate('window.__executed===undefined'))
  page.locator('#nbSave').click();wait_ready(page,'!T08Notebook.dirty');page.locator('#nbClose').click();page.reload();page.locator('#objectiveDetail').wait_for();page.locator('#notesButton').click();page.locator('#nbText').wait_for();check('Notebook survives real page reload','<img src=x' in page.locator('#nbText').input_value())
  page.locator('#nbText').fill('Updated reasoning, saved automatically before course navigation.');page.locator('#nbClose').click();choose_objective(page,'cs-c');page.locator('#objectiveDetail .task-copy a').first.click();page.locator('#lessonWorkbench').wait_for();page.locator('#courseNotesButton').wait_for();check('Foundation assignment has course navigation in its sidebar',page.locator('#lwNavigation a[href="path.html"]').is_visible())
  page.locator('#courseNotesButton').click();wait_ready(page,'T08Notebook.notes.some(n=>n.title==="Array reasoning")');page.locator('#nbList [data-note="'+nid+'"]').click();check('Same notebook is accessible beside Foundation lessons','Updated reasoning' in page.locator('#nbText').input_value())
  page.locator('#nbClose').click();page.goto(ORIGIN+'/cs50/practice.html#view=topic&topic=functions&stage=learn');page.locator('#workspace').wait_for(state='visible');page.locator('#courseNotesButton').wait_for();page.locator('#courseNotesButton').click();wait_ready(page,'T08Notebook.notes.length===2');check('Same notebook is accessible beside Python practice')
  page.locator('#nbList [data-note="'+nid+'"]').click();page.locator('#nbLinkTopic').click();wait_ready(page,'T08Notebook.current.topics.includes("py-functions")');check('One note can attach to multiple course objectives')
  # Explicit conflict handling: two concurrent revisions from the same parent.
  page.evaluate('''async()=>{const n=T08Notebook.current,base=n.heads.map(h=>h.id);await T08Notebook.ledger.append(T08NotesCore.payload(n,{text:'Branch A'},base));await T08Notebook.ledger.append(T08NotesCore.payload(n,{text:'Branch B'},base));}''');page.locator('#nbClose').click();page.reload();page.locator('#workspace').wait_for(state='visible');page.locator('#courseNotesButton').click();page.locator('#nbList [data-note="'+nid+'"]').click();page.locator('#nbConflict').wait_for(state='visible');check('Concurrent note revisions remain visible, not overwritten',page.locator('#nbText').is_disabled())
  page.locator('#nbConflict details summary').first.click();page.locator('[data-merge]').first.click();page.locator('#nbText').fill('Merged both independent branches into this explicitly reviewed note.');page.locator('#nbSave').click();wait_ready(page,'!T08Notebook.current.conflict && !T08Notebook.dirty');check('Explicit merge preserves history and resolves the conflict')
  page.locator('#nbArchive').click();wait_ready(page,'T08Notebook.current.archived');page.locator('#nbArchived').check();check('Archived note is recoverable from the notebook list',page.locator('#nbList [data-note="'+nid+'"]').count()==1);page.locator('#nbArchive').click();wait_ready(page,'!T08Notebook.current.archived');page.locator('#nbArchived').uncheck()
  page.locator('.nb-backup summary').click()
  with page.expect_download() as dl:page.locator('#nbBackup').click()
  backup=OUT/'notebook.json';dl.value.save_as(str(backup));raw=json.loads(backup.read_text());check('Notebook export retains all revision history',len(raw['events'])>=6 and raw['kind']=='tomato08-notebook-backup')
  with page.expect_download() as dl:page.locator('#nbMarkdown').click()
  md=OUT/'note.md';dl.value.save_as(str(md));check('Markdown export contains the note text','Merged both' in md.read_text())
  page.locator('#nbClose').click();page.goto(ORIGIN+'/cs50/path.html#objective=cs-structures');page.locator('#objectiveDetail').wait_for();page.locator('#accountButton').click();page.locator('#toggleSync').click();wait_ready(page,'document.querySelector("#saveStatus").textContent.includes("sync complete")');page.locator('#accountDialog .path-close').click();check('Map sync uploads notebook revisions through the existing mock cloud',any(r['payload'].get('kind')=='course-note' for r in REMOTE))
  ctx2=context(390);mobile=ctx2.new_page();mobile.on('dialog',lambda d:d.accept());mobile.goto(ORIGIN+'/cs50/path.html#objective=cs-structures');mobile.locator('#objectiveDetail').wait_for();mobile.locator('#accountButton').click();mobile.locator('#toggleSync').click();wait_ready(mobile,'document.querySelector("#saveStatus").textContent.includes("sync complete")');mobile.locator('#accountDialog .path-close').click();mobile.locator('#notesButton').click();wait_ready(mobile,'T08Notebook.notes.length===2');check('Second browser retrieves notebook revisions with opt-in sync')
  check('Mobile notebook fits the viewport',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));mobile.screenshot(path=str(OUT/'course-notebook-mobile.png'),full_page=True);mobile.locator('#nbClose').click();check('Mobile course map has no page-wide overflow',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));mobile.screenshot(path=str(OUT/'course-map-mobile.png'),full_page=True)
  page.locator('#notesButton').click();page.locator('#nbList [data-note="'+nid+'"]').click();page.screenshot(path=str(OUT/'course-map-notebook-desktop.png'),full_page=True)
  other=context(account='22222222-2222-4222-8222-222222222222').new_page();other.goto(ORIGIN+'/cs50/path.html');other.locator('#objectiveDetail').wait_for();other.locator('#notesButton').click();wait_ready(other,'window.T08Notebook?.ledger');check('Different account does not inherit another notebook',other.evaluate('T08Notebook.notes.length')==0)
  denied=context(approved=False).new_page();denied.goto(ORIGIN+'/cs50/path.html');wait_ready(denied,'document.querySelector("#gateMessage").textContent.includes("Sign in with")');check('Unauthenticated account cannot open map evidence',denied.locator('#main').is_hidden())
  page.locator('#nbClose').click();page.locator('#accountButton').click();page.locator('#signout').click();page.locator('#gate').wait_for(state='visible');check('Signout removes rendered course and notebook data',page.locator('#content').inner_text()=='' and page.locator('#nbText').input_value()=='')
  check('No uncaught application exceptions',not errors);browser.close()
except Exception:
 try:page.screenshot(path=str(OUT/'failure.png'),full_page=True)
 except Exception:pass
 (OUT/'partial-results.json').write_text(json.dumps({'checks':checks,'errors':errors},indent=2))
 raise
finally:server.shutdown()
(OUT/'results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'scope':'Native Chromium; actual HTTP, CSP, IndexedDB, reload and downloads. Auth/cloud mocked; not production-account verification.'},indent=2))
print('CONNECTED COURSE / NOTEBOOK:',len(checks),'passed')
