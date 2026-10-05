"""Verify that mobile player content is not merely clipped inside the page."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import json,os,threading
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('T08_LESSON_OUTPUT','/tmp/lesson-results'));OUT.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
MOCK=(ROOT/'tests/python-drills-browser.py').read_text().split("MOCK=r'''",1)[1].split("'''",1)[0]
checks=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  context=browser.new_context(viewport={'width':1440,'height':950})
  context.route('**/cloud.js*',lambda r:r.fulfill(content_type='application/javascript',body=MOCK))
  context.route('**/security-auth.js*',lambda r:r.fulfill(content_type='application/javascript',body='window.T08Security={};'))
  context.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(content_type='application/javascript',body='window.supabase={};'))
  page=context.new_page();page.goto(origin+'/cs50/index.html#view=course&unit=scratch&tab=theory');expect(page.locator('#lessonWorkbench')).to_be_visible()
  for width in [320,390,768,1024,1440]:
   page.set_viewport_size({'width':width,'height':950});page.wait_for_timeout(60)
   box=page.locator('#lwPanel-lecture').bounding_box();content=page.locator('#lwVideoStart').bounding_box();button=page.locator('#lwLoadVideo').bounding_box()
   assert content['x']>=box['x'] and content['x']+content['width']<=box['x']+box['width']+1, f'Player content clipped at {width}'
   assert button['x']>=content['x'] and button['x']+button['width']<=content['x']+content['width']+1, f'Load button clipped at {width}'
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), f'Page overflows at {width}'
   checks.append(f'Player, action and page contained at {width}px')
   page.screenshot(path=str(OUT/f'lesson-contained-{width}.png'),full_page=True)
  browser.close()
finally:
 server.shutdown()
(OUT/'geometry-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks},indent=2));print(json.dumps(checks),flush=True)
