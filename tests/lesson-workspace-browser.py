"""Native browser regression. Course and notebook are real; auth and external
iframe transports use synthetic fixtures. No production accounts are accessed."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os, json, threading
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('T08_LESSON_OUTPUT','/tmp/lesson-results'));OUT.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
ORIGIN=f'http://127.0.0.1:{server.server_port}'
MOCK=(ROOT/'tests/python-drills-browser.py').read_text().split("MOCK=r'''",1)[1].split("'''",1)[0]
MOCK += "\nconst originalRequire=FC.requireUser;FC.requireUser=async()=>window.__lessonSignedOut?null:originalRequire();const originalOut=FC.client.auth.signOut;FC.client.auth.signOut=async()=>{window.__lessonSignedOut=true;return originalOut();};"
checks=[];errors=[];requests=[]
def check(name,ok=True):
 assert ok,name
 checks.append(name); print('PASS',name,flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 def context(approved=True):
  ctx=browser.new_context(viewport={'width':1440,'height':950},accept_downloads=True)
  def route(r):
   url=r.request.url
   if url.startswith(ORIGIN):
    if '/cloud.js' in url:return r.fulfill(content_type='application/javascript',body=MOCK + ('\nFC.requireUser=async()=>null;' if not approved else ''))
    if '/security-auth.js' in url:return r.fulfill(content_type='application/javascript',body='window.T08Security={};')
    if '/__mockCloud' in url:return r.fulfill(content_type='application/json',body='{"data":[],"error":null}')
    return r.continue_()
   if 'cdn.jsdelivr.net' in url:return r.fulfill(content_type='application/javascript',body='window.supabase={};')
   requests.append(url)
   if url.startswith('https://cdn.cs50.net/'):
    if url.endswith('.srt'):return r.fulfill(content_type='text/plain',headers={'Access-Control-Allow-Origin':'*'},body='1\n00:00:00,000 --> 00:00:03,000\nSynthetic test caption.\n')
    return r.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*'})
   if url.startswith('https://www.youtube-nocookie.com/embed/'):
    return r.fulfill(content_type='text/html',body='<html><body style="background:#080d15;color:white"><h1>External video transport fixture</h1><script>window.paused=false;addEventListener("message",e=>{try{if(JSON.parse(e.data).func==="pauseVideo")window.paused=true;}catch(_){}});</script></body></html>')
   if url=='https://scratchfoundation.github.io/scratch-gui/':
    return r.fulfill(content_type='text/html',body='<html><body><h1>External editor transport fixture</h1><label>Project name<input id="projectName"></label><label>Program<textarea id="blocks"></textarea></label></body></html>')
   return r.abort()
  ctx.route('**/*',route);return ctx
 ctx=context();page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 try:
  page.goto(ORIGIN+'/cs50/index.html#view=course&unit=scratch&tab=theory')
  expect(page.locator('#lessonWorkbench')).to_be_visible();page.wait_for_timeout(300)
  check('Version 4 has exactly four accessible tabs',page.locator('.lw-tablist [role=tab]').count()==4)
  check('Default lesson is matched to Scratch','Scratch' in page.locator('#lwTitle').inner_text())
  check('Media is click-to-load; no third-party requests on entry',not requests)
  check('Original assignment count, not a fabricated completion','0/5' in page.locator('#lwProgress').inner_text())
  check('Notes moved away from global header',page.locator('#lwNotesSlot #courseNotesButton').count()==1 and page.locator('body>header #courseNotesButton').count()==0)
  check('Original course storage is untouched by opening tools',len(page.evaluate('CS50Lab.state.events'))==0)
  page.screenshot(path=str(OUT/'lesson-desktop.png'),full_page=True)
  for width in [1366,1024,768,390,320]:
   page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(70)
   check(f'No page-wide overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  page.screenshot(path=str(OUT/'lesson-mobile.png'),full_page=True)
  page.locator('#lwMenu').click();check('Mobile navigation expands',page.locator('#lwMenu').get_attribute('aria-expanded')=='true');page.locator('#lwMenu').click()
  page.set_viewport_size({'width':1440,'height':950})
  page.locator('#lwLoadVideo').click();expect(page.locator('#lwVideoFrame')).to_be_visible()
  check('Matching lecture loads in this page','/0/lecture0-720p.mp4' in page.locator('#lwVideoFrame').get_attribute('src'))
  page.locator('#lwVideoFrame').evaluate('(v)=>{window.__nativeElement=v;const pause=v.pause.bind(v);v.pause=()=>{window.__nativePause=true;pause();};}')
  page.locator('#lwTab-scratch').click();expect(page.locator('#lwPanel-scratch')).to_be_visible()
  page.wait_for_function('window.__nativePause===true')
  check('Video is paused, not destroyed when changing tabs',page.locator('#lwVideoFrame').count()==1)
  page.locator('#lwLoadScratch').click();editor=page.frame_locator('#lwScratchFrame');editor.locator('#projectName').fill('Battery monitor');editor.locator('#blocks').fill('battery = 100')
  check('Scratch editor is isolated on another origin','allow-top-navigation' not in page.locator('#lwScratchFrame').get_attribute('sandbox'))
  page.locator('#lwTab-files').click();expect(page.locator('#lwPanel-files')).to_be_visible();page.locator('#lwTab-scratch').click()
  check('Editor project survives a tab round trip',editor.locator('#blocks').input_value()=='battery = 100')
  check('Switching tabs does not reload editor',requests.count('https://scratchfoundation.github.io/scratch-gui/')==1)
  page.locator('#lwMinimize').click();expect(page.locator('#lwScratchFrame')).to_be_hidden();page.locator('#lwRestore').click()
  check('Minimize/restore preserves project',editor.locator('#projectName').input_value()=='Battery monitor')
  page.locator('#lwMaximize').click();check('Maximize stays inside page with accessible restore',page.locator('#lwMaximize').get_attribute('aria-pressed')=='true');check('Unrelated navigation is inert while maximized',page.locator('.lw-sidebar').evaluate('(e)=>e.inert'))
  page.keyboard.press('Escape');check('Escape restores panel without reload',page.locator('#lwMaximize').get_attribute('aria-pressed')=='false' and editor.locator('#blocks').input_value()=='battery = 100')
  check('Restoring size restores keyboard access',not page.locator('.lw-sidebar').evaluate('(e)=>e.inert'))
  page.locator('#lwTab-lecture').click();check('Returning to lecture preserves original iframe',page.evaluate('document.querySelector("#lwVideoFrame")===window.__nativeElement'))
  page.locator('#lwTab-lecture').focus();page.keyboard.press('ArrowRight');expect(page.locator('#lwTab-scratch')).to_have_attribute('aria-selected','true');page.keyboard.press('End');expect(page.locator('#lwTab-files')).to_have_attribute('aria-selected','true');check('Arrow keys, Home/End provide keyboard tab navigation')
  with page.expect_download() as d:page.locator('#lwDownloadInstructions').click()
  file=OUT/'scratch-lesson.md';d.value.save_as(str(file));check('Files tab downloads actual lesson requirements','Press space to reduce battery' in file.read_text())
  with page.expect_download() as d:page.locator('#lwPanel-files [data-action=backup]').click()
  backup=OUT/'foundation-backup.json';d.value.save_as(str(backup));check('Original Foundation backup action still works','events' in json.loads(backup.read_text())['state'])
  page.locator('#courseNotesButton').click();expect(page.locator('#lwNotesMount #t08Notebook')).to_be_visible();page.locator('#nbNew').click();expect(page.locator('#nbText')).to_be_visible()
  page.locator('#nbTitle').fill('Scratch battery reasoning');page.locator('#nbText').fill('Initialize at 100. Subtract 10 per space press. Restart must reset state.')
  page.locator('#lwTab-lecture').click();expect(page.locator('#lwPanel-lecture')).to_be_visible()
  check('Leaving Notes saves through original notebook ledger',page.evaluate('T08Notebook.notes.some(n=>n.title==="Scratch battery reasoning")'))
  page.locator('#lwTab-notes').click();expect(page.locator('#nbText')).to_have_value('Initialize at 100. Subtract 10 per space press. Restart must reset state.')
  check('Notes remain inline with the media tools',page.locator('#lwNotesMount #nbText').count()==1)
  check('Note retains its real course objective identity',page.evaluate('T08Notebook.current.topics.includes("cs-scratch")'))
  page.screenshot(path=str(OUT/'lesson-notes.png'),full_page=True)
  page.locator('#nbClose').click();expect(page.locator('#lwPanel-lecture')).to_be_visible();check('Notebook close returns to lecture without losing note')
  page.locator('#lwNext').click();expect(page.locator('#lwTitle')).to_contain_text('C');check('Next lesson changes the official lecture mapping',page.locator('#lwVideoFrame').count()==0 and 'SlqjA04_dpk' in page.locator('#lwVideoFallback').get_attribute('href'))
  page.locator('#lwPrevious').click();expect(page.locator('#lwTitle')).to_contain_text('Scratch')
  page.locator('#lwTab-scratch').click();check('Same-page lesson navigation preserves open project',editor.locator('#blocks').input_value()=='battery = 100')
  page.locator('#lwTab-lecture').click();page.locator('#lwLoadVideo').click();page.locator('#lwVideoSource').select_option('youtube');check('Alternate embedded player stays in the same page','youtube-nocookie.com' in page.locator('#lwVideoFrame').get_attribute('src'));page.locator('#lwVideoSource').select_option('harvard')
  check('Viewing tools never awards credit',page.evaluate('CS50Lab.state.events.length')==0)
  page.locator('.lw-quick [data-action=seen]').click();expect(page.locator('#quizForm')).to_be_visible();check('Review button opens actual quiz, not a fake Mark Complete',page.evaluate('!!CS50Lab.state.seen.scratch') and page.evaluate('CS50Lab.state.events.length')==0)
  for q in page.evaluate('CS50Lab.curriculum.units[0].quiz'):
   page.locator(f'#quizForm input[name="{q["id"]}"][value="{q["answer"]}"]').check()
  page.locator('#quizForm button[type=submit]').click();page.wait_for_function('CS50Lab.state.events.some(e=>e.type==="quiz"&&e.passed)');check('Original quiz grading still records a pass')
  page.evaluate('location.hash="view=course&unit=scratch&tab=practice&task=scratch-build"');expect(page.locator('#code')).to_be_visible();page.locator('#code').fill('# Original plan draft retained')
  check('Actual assignments and editor remain available above tools',page.locator('#app').is_visible() and page.locator('#lessonWorkbench').is_visible())
  page.locator('#lwTab-scratch').click();check('Project survives opening a real assignment',editor.locator('#blocks').input_value()=='battery = 100')
  page.evaluate('location.hash="view=evidence&unit=scratch&tab=theory"');expect(page.locator('#lessonWorkbench')).to_be_hidden();check('Progress tools restore the normal header and account',page.locator('body>header #accountButton').is_visible())
  page.evaluate('location.hash="view=course&unit=scratch&tab=theory"');expect(page.locator('#lessonWorkbench')).to_be_visible()
  page.reload();expect(page.locator('#lessonWorkbench')).to_be_visible();page.locator('#courseNotesButton').click();expect(page.locator('#nbText')).to_be_visible();check('Notes survive full page reload','Initialize at 100' in page.locator('#nbText').input_value())
  page.locator('#lwTab-scratch').click();page.locator('#lwLoadScratch').click();expect(page.locator('#lwScratchFrame')).to_be_visible();page.locator('#accountButton').click();page.locator('#signoutButton').click();expect(page.locator('#lwScratchFrame')).to_have_count(0);check('Signout destroys external editors and clears notebook display',page.evaluate('T08Notebook.ledger===null'))
  page.locator('#accountDialog .close').click()
  denied=context(approved=False).new_page();denied.goto(ORIGIN+'/cs50/index.html#view=course&unit=scratch&tab=theory');expect(denied.locator('#lessonWorkbench')).to_be_visible();denied.wait_for_timeout(200);denied.locator('#lwLoadVideo').click();check('Unapproved guest cannot launch external tools',denied.locator('#lwVideoFrame').count()==0)
  check('No uncaught JavaScript exceptions',not errors)
 except Exception:
  page.screenshot(path=str(OUT/'failure.png'),full_page=True);(OUT/'partial.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},indent=2));raise
 finally:
  browser.close();server.shutdown()
(OUT/'results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors,'scope':'Native Chromium; actual course, IndexedDB and notebook; synthetic auth and external frame transports. Separate provider smoke test verifies real embeds.'},indent=2))
