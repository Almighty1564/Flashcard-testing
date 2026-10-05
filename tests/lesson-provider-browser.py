"""Read-only real-provider smoke check. Never signs into an external account,
shares a project, or contacts Tomato08's database. Results distinguish frame
rendering from successful video playback on this runner."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import os,json,threading,urllib.request
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('T08_LESSON_OUTPUT','/tmp/lesson-results'));OUT.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
MOCK=(ROOT/'tests/python-drills-browser.py').read_text().split("MOCK=r'''",1)[1].split("'''",1)[0]
result={}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  ctx=browser.new_context(viewport={'width':1440,'height':1000});ctx.route('**/cloud.js*',lambda r:r.fulfill(content_type='application/javascript',body=MOCK));ctx.route('**/security-auth.js*',lambda r:r.fulfill(content_type='application/javascript',body='window.T08Security={};'))
  ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(content_type='application/javascript',body='window.supabase={};'))
  page=ctx.new_page();page.on('dialog',lambda d:d.dismiss())
  page.goto(origin+'/cs50/index.html#view=course&unit=scratch&tab=theory');expect(page.locator('#lessonWorkbench')).to_be_visible();page.wait_for_timeout(300)
  page.locator('#lwTab-scratch').click();page.locator('#lwLoadScratch').click();page.locator('#lwMaximize').click()
  editor=page.frame_locator('#lwScratchFrame')
  try:
   editor.get_by_role('tab',name='Code',exact=True).wait_for(timeout=80000)
   result['scratch_editor_rendered']=True
   result['scratch_costumes']=editor.get_by_role('tab',name='Costumes',exact=True).count()>0
   result['scratch_canvas']=editor.locator('canvas').count()>0
   editor.get_by_text('File',exact=True).first.click()
   result['scratch_local_save']=editor.get_by_text('Save to your computer',exact=True).count()>0
   result['scratch_local_load']=editor.get_by_text('Load from your computer',exact=True).count()>0
   page.screenshot(path=str(OUT/'scratch-live-editor.png'),full_page=True)
   assert result['scratch_costumes'] and result['scratch_canvas'] and result['scratch_local_save'] and result['scratch_local_load']
  except Exception as e:
   result['scratch_error']=str(e);page.screenshot(path=str(OUT/'scratch-provider-failure.png'),full_page=True)
  page.locator('#lwMaximize').click();page.locator('#lwTab-lecture').click();page.locator('#lwLoadVideo').click()
  try:
   player=page.frame_locator('#lwVideoFrame');player.locator('.html5-video-player').wait_for(timeout=40000)
   result['youtube_player_rendered']=True
   try:
    player.locator('video').evaluate('(v)=>{v.muted=true;v.play().catch(()=>{});}');page.wait_for_timeout(4000)
    result['youtube_playback_started']=player.locator('video').evaluate('(v)=>v.currentTime>0&&!v.paused')
   except Exception as e:result['youtube_playback_error']=str(e)
   result['youtube_visible_message']=player.locator('body').inner_text()[:1400]
   page.screenshot(path=str(OUT/'lecture-live-player.png'),full_page=True)
  except Exception as e:result['youtube_error']=str(e)
  browser.close()
finally:
 server.shutdown();(OUT/'provider-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2),flush=True)
if not result.get('scratch_editor_rendered') or not result.get('scratch_local_save'):raise SystemExit('Real Scratch editor verification failed')
