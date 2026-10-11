"""Additional inline-workspace checks. Reuses the synthetic FC transport, never live data."""
import ast, json, mimetypes, os
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('T08_COMMUNICATOR_OUTPUT','/tmp/communicator-results'));OUT.mkdir(parents=True,exist_ok=True)
# Read only the literal fixture; importing the other script would execute its suite.
tree=ast.parse((ROOT/'tests/communicator-study-browser.py').read_text())
MOCK=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='MOCK' for t in n.targets))
ORIGIN='https://tomato08.test'
checks=[];errors=[]
def check(name,condition=True):
 assert condition,name
 checks.append(name);print('PASS',name,flush=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True)
 def setup(width=1440,motion='no-preference',**overrides):
  ctx=browser.new_context(viewport={'width':width,'height':1000},reduced_motion=motion)
  state={'signedIn':True,'approved':True,'role':'tester','calls':[],'progress':{},**overrides}
  ctx.add_init_script("if(!sessionStorage.getItem('__cw_fixture'))sessionStorage.setItem('__cw_fixture',JSON.stringify("+json.dumps(state)+"));")
  def route(r):
   if urlparse(r.request.url).path=='/cloud.js':r.fulfill(content_type='application/javascript',body=MOCK)
   elif r.request.url.startswith(ORIGIN+'/'):
    path=(ROOT/unquote(urlparse(r.request.url).path).lstrip('/')).resolve()
    if path.is_file() and path.is_relative_to(ROOT):r.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
    else:r.fulfill(status=404,body='Not found')
   else:r.abort()
  ctx.route('**/*',route);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  page.goto(ORIGIN+'/tester.html?module=mod3');ready(page)
  return ctx,page
 def ready(page):
  page.wait_for_function('document.querySelector("#cwStudyFrame") && !document.querySelector("#cwStudyFrame").hidden && !document.querySelector("#cwRing").disabled')
 def frame(page):return next(f for f in page.frames if '/mod1.html?' in f.url)
 def flash(page):
  f=frame(page);f.evaluate('()=>{startSession([cards().find(c=>c.type==="flashcard")],"all");renderSidebar();}');return f
 def patch(page,**values):page.evaluate('x=>sessionStorage.__cw_fixture=JSON.stringify({...JSON.parse(sessionStorage.__cw_fixture),...x})',values)
 try:
  for motion in ['no-preference','reduce']:
   ctx,page=setup(390,motion)
   for width in [320,390,768]:
    page.set_viewport_size({'width':width,'height':1000});f=flash(page)
    page.wait_for_function('getComputedStyle(document.querySelector("#workspaceNav")).visibility==="hidden"')
    check(f'Closed navigation does not cover mobile content at {width}px ({motion})',page.locator('#menuButton').is_visible())
    f.locator('#showAnswerBtn').click();expect(f.locator('[data-rate="correct"]')).to_be_visible()
    check(f'Mobile question can be answered without opening or closing navigation at {width}px ({motion})')
    if width==390 and motion=='no-preference':
     flash(page);page.screenshot(path=str(OUT/'07-mobile-settled.png'),full_page=True,animations='disabled')
    page.locator('#menuButton').click()
    page.wait_for_function('Math.abs(document.querySelector("#workspaceNav").getBoundingClientRect().left)<0.5 && document.querySelector("#workspaceNav").classList.contains("is-open")')
    check(f'Open mobile drawer is fully inside the viewport at {width}px ({motion})',page.locator('#workspaceNav').bounding_box()['width']<=width)
    if width==390 and motion=='no-preference':page.screenshot(path=str(OUT/'08-mobile-menu-settled.png'),full_page=True,animations='disabled')
    page.keyboard.press('Escape');page.wait_for_function('getComputedStyle(document.querySelector("#workspaceNav")).visibility==="hidden"')
   ctx.close()
  ctx,page=setup()
  page.locator('#cwWorkspaceMenu>summary').click()
  check('Learner workspace menu never reveals developer-only tools',page.locator('#cwWorkspaceMenu [data-developer]:visible').count()==0)
  page.locator('#cwWorkspaceMenu>summary').click()
  page.evaluate('window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:true}))')
  check('Page hide removes the embedded engine and conceals study UI',page.locator('#cwStudyFrame').count()==0 and page.locator('#cwStudy').is_hidden())
  page.evaluate('window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))');ready(page)
  check('Restored approved page reopens the selected module only after account validation',page.url.endswith('module=mod3'))
  patch(page,approved=False)
  page.evaluate('window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))')
  page.wait_for_url('**/index.html**')
  check('Restored unapproved page cannot display cached questions',page.locator('#cwStudyFrame').count()==0)
  ctx.close()
  ctx,page=setup(writeFail=True)
  f=flash(page);f.locator('#showAnswerBtn').click();f.locator('[data-rate="correct"]').click()
  page.wait_for_function('/pending|not saved|saving|queued/i.test(document.querySelector("#cwSaveStatus").textContent)')
  page.locator('#workspaceNav a[href="./tester.html?module=mod2"]').click()
  check('Pending cloud writes block accidental module disposal',page.url.endswith('module=mod3') and frame(page)==f)
  check('Pending answer remains in original engine state',f.evaluate('state.mastery["mod3-flash"].lastResult')=='correct')
  ctx.close()
  check('No uncaught exceptions in lifecycle and mobile checks',not errors)
 except Exception:
  try:page.screenshot(path=str(OUT/'lifecycle-failure.png'),full_page=True,animations='disabled')
  except Exception:pass
  raise
 finally:
  browser.close();(OUT/'lifecycle-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},indent=2))
