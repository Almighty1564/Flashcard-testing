"""Real public-provider smoke check. Auth is synthetic, provider media is not.
No external sign-in, sharing, or production account/database writes."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import os,json,threading,zipfile
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('T08_LESSON_OUTPUT','/tmp/lesson-results'));OUT.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
MOCK=(ROOT/'tests/python-drills-browser.py').read_text().split("MOCK=r'''",1)[1].split("'''",1)[0]
result={};failures=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  ctx=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
  ctx.route('**/cloud.js*',lambda r:r.fulfill(content_type='application/javascript',body=MOCK))
  ctx.route('**/security-auth.js*',lambda r:r.fulfill(content_type='application/javascript',body='window.T08Security={};'))
  ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(content_type='application/javascript',body='window.supabase={};'))
  page=ctx.new_page();page.on('dialog',lambda d:d.dismiss())
  page.goto(origin+'/cs50/index.html#view=course&unit=scratch&tab=theory');expect(page.locator('#lessonWorkbench')).to_be_visible();page.wait_for_timeout(300)
  page.locator('#lwTab-scratch').click();page.locator('#lwLoadScratch').click();page.locator('#lwMaximize').click()
  editor=page.frame_locator('#lwScratchFrame')
  try:
   editor.get_by_role('tab',name='Code',exact=True).wait_for(timeout=80000)
   expect(editor.get_by_text('Costumes',exact=True).first).to_be_visible()
   result['scratch_editor_rendered']=True
   result['scratch_costumes']=True
   result['scratch_canvas']=editor.locator('canvas').count()>0
   editor.get_by_text('File',exact=True).first.click()
   expect(editor.get_by_text('Save to your computer',exact=True)).to_be_visible()
   expect(editor.get_by_text('Load from your computer',exact=True)).to_be_visible()
   page.screenshot(path=str(OUT/'scratch-live-editor.png'),full_page=True)
   with page.expect_download(timeout=30000) as d:editor.get_by_text('Save to your computer',exact=True).click()
   project=OUT/'scratch-fixture.sb3';d.value.save_as(str(project))
   with zipfile.ZipFile(project) as archive:
    result['scratch_real_sb3_download']='project.json' in archive.namelist()
    result['scratch_project_has_sprite']=len(json.loads(archive.read('project.json'))['targets'])>=2
   editor.get_by_text('File',exact=True).first.click()
   with page.expect_file_chooser(timeout=10000) as chooser:editor.get_by_text('Load from your computer',exact=True).click()
   chooser.value.set_files(str(project));editor.get_by_role('tab',name='Code',exact=True).wait_for()
   result['scratch_local_import']=True
   assert result['scratch_canvas'] and result['scratch_real_sb3_download'] and result['scratch_project_has_sprite']
  except Exception as e:
   result['scratch_error']=repr(e);failures.append('Scratch project editing/save verification');page.screenshot(path=str(OUT/'scratch-provider-failure.png'),full_page=True)
  page.locator('#lwMaximize').click();page.locator('#lwTab-lecture').click();page.locator('#lwLoadVideo').click()
  try:
   page.wait_for_function('document.querySelector("video#lwVideoFrame")?.readyState>=2',timeout=70000)
   player=page.locator('video#lwVideoFrame');player.evaluate('(v)=>{v.muted=true;return v.play();}')
   page.wait_for_function('document.querySelector("#lwVideoFrame").currentTime>2',timeout=30000)
   result['harvard_video_playback']=player.evaluate('(v)=>({playing:!v.paused,time:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight})')
   assert result['harvard_video_playback']['playing'] and result['harvard_video_playback']['duration']>300 and result['harvard_video_playback']['width']>0
   page.wait_for_function('document.querySelector("video#lwVideoFrame track")',timeout=20000)
   player.evaluate('(v)=>{v.textTracks[0].mode="showing";}')
   page.wait_for_function('document.querySelector("video#lwVideoFrame track").readyState===2',timeout=20000)
   result['harvard_english_captions']=True
   page.screenshot(path=str(OUT/'lecture-live-player.png'),full_page=True)
   page.locator('#lwTab-files').click();result['harvard_paused_on_tab_change']=player.evaluate('(v)=>v.paused');assert result['harvard_paused_on_tab_change']
   page.locator('#lwTab-lecture').click();result['harvard_retained_position']=player.evaluate('(v)=>v.currentTime>2');assert result['harvard_retained_position']
   player.evaluate('(v)=>v.pause()')
  except Exception as e:
   result['harvard_error']=repr(e);failures.append('Harvard direct stream/captions verification');page.screenshot(path=str(OUT/'harvard-provider-failure.png'),full_page=True)
  # Optional alternative: record runner restrictions rather than calling them a pass.
  page.locator('#lwVideoSource').select_option('youtube')
  try:
   player=page.frame_locator('#lwVideoFrame');player.locator('.html5-video-player').wait_for(timeout=30000)
   result['youtube_player_rendered']=True
   result['youtube_visible_message']=player.locator('body').inner_text()[:600]
  except Exception as e:result['youtube_error']=repr(e)
  browser.close()
finally:
 server.shutdown();result['failures']=failures;(OUT/'provider-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2),flush=True)
if failures:raise SystemExit('; '.join(failures))
