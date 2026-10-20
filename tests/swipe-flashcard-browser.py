"""Offline browser regression for the real study renderer. Network/storage are synthetic."""
from pathlib import Path
import ast,json,mimetypes,os,re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('T08_SWIPE_OUTPUT','/tmp/tomato08-swipe-results'));OUT.mkdir(parents=True,exist_ok=True)
tree=ast.parse((ROOT/'tests/communicator-study-browser.py').read_text())
MOCK=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='MOCK' for t in n.targets))
SETUP="""for(const key of ['localStorage','sessionStorage']){const values={};Object.defineProperty(window,key,{value:{getItem:k=>values[k]??null,setItem:(k,v)=>{values[k]=String(v)},removeItem:k=>{delete values[k]},clear:()=>{for(const k in values)delete values[k]}}});}
sessionStorage.setItem('__cw_fixture',JSON.stringify({signedIn:true,approved:true,role:'tester',calls:[],progress:{}}));"""
source=(ROOT/'mod1.html').read_text()
def stylesheet(m):
 path=(ROOT/m.group(1).split('?')[0].lstrip('./')).resolve()
 return '<style>'+path.read_text()+'</style>' if path.is_relative_to(ROOT) and path.is_file() and path.suffix=='.css' else ''
html=re.sub(r'<link[^>]+href="([^"]+)"[^>]*>',stylesheet,source)
html=re.sub(r'<script\b[^>]+src="[^"]+"[^>]*>\s*</script>','',html)
html=html.replace('<head>','<head><script>'+SETUP+MOCK+'</script>',1)
html=re.sub(r'<body\b([^>]*)>',r'<body\1 class="cw-embedded">',html,count=1)
html=html.replace('<html lang="en">','<html lang="en" data-lg-palette="atelier" data-lg-material="solid">',1)
html=html.replace('</body>',''.join('<style>'+(ROOT/p).read_text()+'</style>' for p in ['communicator-study.css','study-presentation.css'])+''.join('<script>'+(ROOT/p).read_text()+'</script>' for p in ['study-reliability.js','study-presentation.js'])+'</body>')
checks=[];errors=[]
def check(label,value=True):
 assert value,label
 checks.append(label);print('PASS',label,flush=True)
with sync_playwright() as pw:
 options={'headless':True}
 if os.environ.get('T08_CHROMIUM_EXECUTABLE'):options['executable_path']=os.environ['T08_CHROMIUM_EXECUTABLE']
 browser=pw.chromium.launch(**options)
 ctx=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,device_scale_factor=2)
 ctx.route('**/*',lambda r:r.abort())
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.set_content(html)
 page.evaluate("for(const [key,val] of Object.entries({bg:'#08131c',panel:'#142330',panel2:'#0b1722',line:'#30434f',text:'#f1f5fa',muted:'#a5b9c9'}))document.body.style.setProperty('--'+key,val)")
 page.wait_for_function('typeof cards==="function"&&cards().length===4')
 cdp=ctx.new_cdp_session(page)
 def start(kind='flashcard'):
  page.evaluate('kind=>{startSession([cards().find(c=>c.type===kind)],"all");renderSidebar()}',kind)
  page.wait_for_timeout(80)
 def reveal():
  page.locator('#swipeCard').tap();page.wait_for_timeout(50)
 def snapshot():
  return page.evaluate("""()=>{const c=document.querySelector('#swipeCard'),p=getComputedStyle(c,'::before');return {direction:c.dataset.direction||null,label:c.querySelector('.swipe-direction').textContent,opacity:Number(p.opacity),glow:p.backgroundImage,transform:getComputedStyle(c).transform,border:getComputedStyle(c).borderColor}}""")
 def drag(dx,dy):
  card=page.locator('#swipeCard');card.scroll_into_view_if_needed();b=card.bounding_box();x=b['x']+b['width']/2;y=b['y']+b['height']/2
  def touch(t,x=x,y=y):cdp.send('Input.dispatchTouchEvent',{'type':t,'touchPoints':[] if t in ('touchEnd','touchCancel') else [{'x':x,'y':y,'id':0,'radiusX':4,'radiusY':4,'force':1}]})
  touch('touchStart')
  for i in range(1,11):touch('touchMove',x+dx*i/10,y+dy*i/10)
  return touch
 start()
 check('Legacy question is empty and hidden; one visible flashcard question',page.locator('#questionText').inner_text()=='' and not page.locator('#questionText').is_visible() and page.locator('.swipe-face-question:visible').count()==1)
 check('No four grading buttons on the flashcard',page.locator('[data-swipe],[data-swipe-rate],[data-rate]').count()==0)
 page.locator('#studyView').screenshot(path=str(OUT/'question.png'))
 untouched=page.evaluate('JSON.stringify(state.mastery)')
 t=drag(100,0);t('touchEnd');page.wait_for_timeout(250)
 check('Dragging before reveal does not grade',page.evaluate('JSON.stringify(state.mastery)')==untouched)
 start();before=page.evaluate('JSON.stringify(state)');reveal()
 check('Tap reveals the answer without changing progress',page.locator('.swipe-face-answer').is_visible() and not page.locator('.swipe-face-question').is_visible() and page.evaluate('JSON.stringify(state)')==before)
 for label,dx,dy,border in [('wrong',-100,0,'rgb(255, 52, 74)'),('guessed',0,100,'rgb(255, 196, 0)'),('correct',100,0,'rgb(0, 230, 91)'),('confident',0,-100,'rgb(0, 170, 255)')]:
  start();reveal();before=page.evaluate('state.totalReviews');t=drag(dx,dy);data=snapshot()
  check(label+': live touch drag moves card, colors it and shows label',data['direction']==label and label.lower() in data['label'].lower() and data['opacity']>0.8 and data['glow']!='none' and data['border']==border and data['transform']!='none')
  page.locator('#studyView').screenshot(path=str(OUT/(label+'.png')))
  t('touchEnd');page.wait_for_timeout(350)
  check(label+': release grades once through existing engine',page.evaluate('state.totalReviews')==before+1 and page.evaluate('state.sessions.at(-1).counts')[label]==1)
 start();reveal();before=page.evaluate('state.totalReviews');t=drag(22,0);t('touchEnd');page.wait_for_timeout(300)
 check('Short swipe snaps back without recording a grade',snapshot()['direction'] is None and page.evaluate('state.totalReviews')==before)
 t=drag(100,0);t('touchCancel');page.wait_for_timeout(300)
 check('Canceled touch clears color without grading',snapshot()['direction'] is None and page.evaluate('state.totalReviews')==before)
 start('multiple-choice')
 check('Multiple-choice question still visible outside interaction',page.locator('#questionText').is_visible() and page.locator('#questionText').inner_text()=='Which keyword permits traffic?' and page.locator('#swipeCard').count()==0)
 page.locator('input[value="yes"]').check();page.locator('#submitObjectiveBtn').click()
 check('Multiple-choice grading remains functional',page.locator('.feedback.good').count()==1)
 start('numeric');page.locator('#entryInput').fill('23abc');page.locator('#submitEntryBtn').click()
 check('Numeric validation still rejects malformed values',page.locator('.feedback.bad').count()==1)
 start();page.locator('#skipBtn').click()
 check('Skip records unanswered, not wrong',page.evaluate('state.sessions.at(-1).counts.unanswered')==1)
 for width in [320,390,430,768,1440]:
  page.set_viewport_size({'width':width,'height':844});start()
  check(str(width)+'px: question remains single with no horizontal overflow',not page.locator('#questionText').is_visible() and page.locator('.swipe-face-question:visible').count()==1 and page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
 check('No uncaught browser exceptions',not errors)
 (OUT/'browser-results.json').write_text(json.dumps({'environment':'Chromium, real deployed renderer and styles, synthetic account/question fixtures; no live account access','checks':checks,'errors':errors},indent=2))
 browser.close()
