"""Current swipe/objective display regression; real renderer, synthetic account/cards/API.
The retired showAnswerBtn/answer-box grid is deliberately not recreated by fixtures.
"""
from pathlib import Path
import json, threading, http.server, tempfile, os
from urllib.parse import quote
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('T08_LAYOUT_OUTPUT', tempfile.mkdtemp(prefix='t08-study-layout-')))
OUT.mkdir(parents=True, exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
ORIGIN = f'http://127.0.0.1:{server.server_port}'
TEXT = '7 Application\n6 Presentation\n5 Session\n4 Transport\n3 Network\n2 Data Link\n1 Physical'
GROUPS = 'Upper Layers: 7, 6, 5 "Application, Presentation, Session"\n\nLower Layers: 4, 3, 2, 1 "Transport, Network, Data Link, Physical"'
def diagram(width=220,height=440):
    labels = ['APPLICATION','PRESENTATION','SESSION','TRANSPORT','NETWORK','DATA LINK','PHYSICAL']
    bars=''.join(f'<rect x="4" y="{i*62+4}" width="212" height="58" fill="hsl(215 75% {64-i*6}%)"/><text x="14" y="{i*62+39}" fill="white" font-family="sans-serif" font-size="13">{name}</text>' for i,name in enumerate(labels))
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 220 440">{bars}</svg>'
    return 'data:image/svg+xml,'+quote(svg)
IMAGE=diagram()
MOCK = r'''
window.__writes=[];
const p={id:'11111111-1111-4111-8111-111111111111',role:'tester',username:'layout-fixture'};
const blank={module:{id:'fixture-module',slug:'mod-3',name:'MOD 3'},groups:[{id:'g',name:'3.1.0 OSI MODEL'}],cards:[]};
window.FC={
 requireUser:async()=>p, getProfile:async()=>p, getSession:async()=>({user:p}), studLabel:()=>'',
 loadBank:async()=>structuredClone(blank), loadProgress:async()=>({progress:{},mastery:{},totalReviews:0}), memorizedRank:async()=>null,
 saveCardProgress:async()=>{},saveSession:async()=>{},reportQuestion:async()=>{},signOut:async()=>{},
 client:{rpc:async(name,args)=>{window.__writes.push({name,args});return {data:true,error:null};},
 auth:{getUser:async()=>({data:{user:p}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 from:()=>({upsert:async()=>({error:null})})}
};
'''
checks=[]
def check(name,ok=True):
    assert ok,name
    checks.append(name); print('PASS',name,flush=True)
try:
 with sync_playwright() as pw:
    opts={'headless':True}
    if os.environ.get('T08_CHROMIUM_EXECUTABLE'):opts['executable_path']=os.environ['T08_CHROMIUM_EXECUTABLE']
    browser=pw.chromium.launch(**opts)
    ctx=browser.new_context(viewport={'width':1366,'height':1024},accept_downloads=True)
    def route(r):
        if '/cloud.js' in r.request.url:r.fulfill(content_type='application/javascript',body=MOCK)
        elif r.request.url.startswith(ORIGIN):r.continue_()
        else:r.abort()
    ctx.route('**/*',route)
    page=ctx.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:d.accept())
    page.goto(ORIGIN+'/mod1.html?module=mod-3')
    page.wait_for_function('window.FC_STUDY_RELIABILITY && document.querySelector("#studyView").dataset.presentationReady')
    def show(text=TEXT,image=IMAGE,kind='flashcard',question_image=None,extra=None,reveal=True):
        card={'id':'fixture-card','groupId':'g','type':kind,'question':{'text':'What are the layers of the OSI model?','image':question_image},'answer':{'text':text,'image':image},'status':'complete',**(extra or {})}
        page.evaluate('''card=>{bank={module:{id:'fixture-module',slug:'mod-3',name:'MOD 3'},groups:[{id:'g',name:'3.1.0 OSI MODEL'}],cards:[card]}; state=defaultState();renderSidebar();startSession([card]);}''',card)
        if kind=='flashcard' and reveal:
            page.locator('#swipeCard').click()
            page.locator('.swipe-face-answer').wait_for(state='visible')
        if image and kind=='flashcard' and reveal and not image.endswith('missing.png'):
            page.wait_for_function('document.querySelector(".answer-image")?.naturalWidth > 0')
        # Ensure styles loaded and frames laid out, not a time-dependent arbitrary sleep.
        page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    show(reveal=False)
    check('Answer image and text remain absent until reveal',page.locator('.answer-image').count()==0 and page.locator('.swipe-face-answer').text_content()=='' and not page.locator('.swipe-face-answer').is_visible())
    check('Current flashcard has one visible question and no obsolete reveal/rating controls',page.locator('.swipe-face-question:visible').count()==1 and not page.locator('#questionText').is_visible() and page.locator('#showAnswerBtn,[data-rate]').count()==0)
    before=page.evaluate('JSON.stringify(state)');writes=page.evaluate('__writes.length')
    page.locator('#swipeCard').focus();page.locator('#swipeCard').press('Enter');page.locator('.swipe-face-answer').wait_for(state='visible')
    page.wait_for_function('document.querySelector(".answer-image").naturalWidth>0')
    check('Every multiline answer line is retained exactly in the current answer face',page.locator('.swipe-face-answer').text_content()==TEXT)
    check('Keyboard reveal hides the question face and changes no grades or saves',not page.locator('.swipe-face-question').is_visible() and before==page.evaluate('JSON.stringify(state)') and writes==page.evaluate('__writes.length'))
    card=page.locator('#swipeCard').bounding_box();img=page.locator('.answer-image').bounding_box()
    check('Portrait answer image stays inside the swipe card',img['x']>=card['x'] and img['x']+img['width']<=card['x']+card['width']+1 and img['y']+img['height']<=card['y']+card['height']+1)
    check('Answer image is a block below the answer text, not a tall inline character',page.locator('.answer-image').evaluate('e=>getComputedStyle(e).display')=='block')
    page.screenshot(path=str(OUT/'study-answer-tablet.png'),full_page=True)
    page.locator('#swipeCard').focus();page.locator('#swipeCard').press('ArrowRight');page.wait_for_function('state.mastery["fixture-card"]?.lastResult==="correct"')
    check('Current keyboard rating records once through the original progress handler',page.evaluate('state.totalReviews')==1)
    for width in [390,768,1024,1440]:
        page.set_viewport_size({'width':width,'height':1000});show()
        check(f'No page-wide overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        check(f'Answer text remains complete at {width}px',page.locator('.swipe-face-answer').text_content()==TEXT)
        i=page.locator('.answer-image').bounding_box()
        check(f'Portrait aspect ratio preserved at {width}px',abs(i['width']/i['height']-0.5)<0.02)
        if width==390:page.screenshot(path=str(OUT/'study-answer-mobile.png'),full_page=True)
    page.set_viewport_size({'width':1366,'height':1024});show(GROUPS)
    check('Grouped answer text retains all content and blank lines',page.locator('.swipe-face-answer').text_content()==GROUPS)
    show('Plain answer. No diagram.',None)
    check('Text-only answer has no empty image node',page.locator('.answer-image').count()==0 and page.locator('.swipe-face-answer').text_content()=='Plain answer. No diagram.')
    show('',IMAGE)
    check('Image-only answer remains visible without placeholder text',page.locator('.swipe-face-answer').text_content()=='' and page.locator('.answer-image').is_visible())
    show('Wide network diagram.',diagram(1000,350))
    wide=page.locator('.answer-image').bounding_box();face=page.locator('.swipe-face-answer').bounding_box()
    check('Landscape diagram preserves its aspect ratio within the answer face',abs(wide['width']/wide['height']-1000/350)<0.03 and wide['width']<=face['width']+1)
    show('<script>window.injected=true</script>\n& exact spacing',None)
    check('Answer text is never parsed as executable markup',page.locator('.swipe-face-answer').text_content()=='<script>window.injected=true</script>\n& exact spacing' and page.evaluate('window.injected!==true') and page.locator('.swipe-face-answer script').count()==0)
    show('Question image',None,question_image=IMAGE,reveal=False)
    page.wait_for_function('document.querySelector(".swipe-face-question .question-image").naturalWidth>0')
    check('Flashcard question image appears once inside the visible question face',page.locator('.swipe-face-question .question-image').count()==1 and page.locator('.swipe-face-question').is_visible() and page.locator('#questionImageWrap img').count()==0)
    show('Broken picture',ORIGIN+'/missing.png')
    page.wait_for_function('document.querySelector(".answer-image").complete && document.querySelector(".answer-image").naturalWidth===0')
    check('Unavailable answer media does not discard the answer text or disable grading',page.locator('.swipe-face-answer').text_content()=='Broken picture' and page.locator('#swipeCard').get_attribute('aria-disabled') is None)
    page.locator('#swipeCard').focus();page.locator('#swipeCard').press('ArrowRight');page.wait_for_function('state.totalReviews===1')
    check('Keyboard rating still works when an answer image fails to load',page.evaluate('state.mastery["fixture-card"].lastResult')=='correct')
    show(kind='multiple-choice',extra={'shuffleChoices':False,'choices':[{'id':'one','text':'Application\nPresentation','image':IMAGE,'correct':True},{'id':'two','text':'Incorrect','correct':False}]})
    page.locator('.choice-image').wait_for()
    check('Choice images are block elements, not tall inline characters',page.locator('.choice-image').evaluate('e=>getComputedStyle(e).display')=='block')
    check('Image choices do not contain nested zoom buttons',page.locator('.choice-option button').count()==0)
    page.locator('input[value="one"]').check();page.locator('#submitObjectiveBtn').click()
    check('Choice selection and grading still work',page.locator('.feedback.good').count()==1)
    show(kind='numeric',extra={'entry':{'value':'72','tolerance':0,'unit':'W','accept':[]}})
    page.locator('#entryInput').fill('72');page.locator('#submitEntryBtn').click()
    check('Numeric grading remains unchanged',page.locator('.feedback.good').count()==1)
    show(kind='image-entry',question_image=IMAGE,extra={'diagram':{'labels':[],'fields':[{'id':'field','x':50,'y':50,'w':30,'answer':'7','accept':[]}]}})
    page.wait_for_function('document.querySelector(".diagram-study-stage img").naturalWidth>0')
    check('Diagram-entry overlay is never moved into a figure',page.locator('.diagram-study-stage > img').count()==1 and page.locator('.diagram-study-stage .t08-study-figure').count()==0)
    inp=page.locator('[data-diagram-input]');inp.fill('7');page.locator('#submitDiagramBtn').click()
    check('Diagram-entry grading remains unchanged',page.locator('.feedback.good').count()==1)
    show(kind='matching',extra={'pairs':[{'id':'a','left':{'text':'Left','image':IMAGE},'right':{'text':'Right','image':IMAGE}}]})
    page.locator('[data-source="a"]').click();page.locator('[data-drop="a"]').click();page.locator('#submitMatchBtn').click()
    check('Matching images and assignment handlers remain usable',page.locator('.feedback.good').count()==1)
    show();page.evaluate('document.querySelector("#interaction").appendChild(document.createTextNode(""))')
    check('Repeated enhancement does not duplicate the swipe answer',page.locator('.swipe-face-answer').count()==1 and page.locator('.swipe-face-answer').text_content()==TEXT and page.locator('.answer-image').count()==1)
    check('No uncaught browser exceptions',not errors)
    browser.close()
finally:server.shutdown()
(OUT/'results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'scope':'Native Chromium; actual study renderer/styles and grading. Synthetic identity, API and images. Not a real account or iPad Safari test.'},indent=2))
print('OUTPUT',OUT)
