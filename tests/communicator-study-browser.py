"""Real Communicator + study engine; synthetic accounts, question banks and API only."""
from pathlib import Path
import json, os, mimetypes
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('T08_COMMUNICATOR_OUTPUT','/tmp/communicator-results'));OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='https://tomato08.test'
MOCK=r'''
(function(){
 const get=()=>JSON.parse(sessionStorage.getItem('__cw_fixture'));
 const put=s=>sessionStorage.setItem('__cw_fixture',JSON.stringify(s));
 const user=()=>({id:'11111111-1111-4111-8111-111111111111',username:'fixture',role:get().role||'tester'});
 const log=(name,args)=>{const s=get();s.calls.push({name,args});put(s);};
 const modules=[{id:'m1',slug:'mod1',name:'MOD 1',is_published:true},{id:'m2',slug:'module-two',name:'MOD 2',is_published:true},{id:'m3',slug:'mod3',name:'MOD 3',is_published:true},{slug:'draft',name:'DRAFT',is_published:false}];
 const bank=slug=>{const m=modules.find(m=>m.slug===slug);if(!m)throw Error('Unknown module');
 return {module:m,groups:[{id:slug+'-acl',name:'3.8 Access Control Lists'},{id:slug+'-other',name:'Practice examples'}],cards:[
 {id:slug+'-flash',groupId:slug+'-acl',type:'flashcard',status:'complete',question:{text:'Explain a named access list and when it is used.'},answer:{text:'A named ACL uses a descriptive name rather than only a number.'}},
 {id:slug+'-choice',groupId:slug+'-acl',type:'multiple-choice',status:'complete',shuffleChoices:false,question:{text:'Which keyword permits traffic?'},answer:{text:'permit'},choices:[{id:'yes',text:'permit',correct:true},{id:'no',text:'deny',correct:false}]},
 {id:slug+'-numeric',groupId:slug+'-other',type:'numeric',status:'complete',question:{text:'Enter the Telnet TCP port number.'},entry:{value:'23',unit:'',tolerance:0,accept:[]},answer:{text:'23'}},
 {id:slug+'-second',groupId:slug+'-other',type:'flashcard',status:'complete',question:{text:'What does an access port carry?'},answer:{text:'Traffic in its assigned data VLAN.'}}
 ]};};
 window.__authCallbacks=[];
 window.FC={
 usernameToEmail:u=>u+'@example.invalid',
 requireUser:async()=>get().signedIn?user():null,getProfile:async()=>get().signedIn?user():null,
 getSession:async()=>get().signedIn?{user:user()}:null,studLabel:()=>'',
 listModules:async()=>{log('listModules');if(get().moduleFail)throw Error('Fixture offline');return modules;},
 loadBank:async slug=>{log('loadBank',{slug});if(!get().signedIn||get().bankFail)throw Error('Module unavailable in test fixture');return structuredClone(bank(slug));},
 loadProgress:async ids=>{const saved=get().progress||{};const progress={},mastery={};for(const id of ids){const r=saved[id];if(r){progress[id]={totalReviews:r.p_total_reviews,reps:r.p_reps,dueAt:0};mastery[id]={lastResult:r.p_last_result};}}return {progress,mastery,totalReviews:Object.keys(progress).length};},
 memorizedRank:async()=>null,saveCardProgress:async()=>{},saveSession:async()=>{},reportQuestion:async d=>{log('reportQuestion',d);return true;},
 signOut:async()=>{put({...get(),signedIn:false});window.__authCallbacks.forEach(fn=>fn('SIGNED_OUT',null));},
 client:{rpc:async(name,args)=>{log(name,args);if(name==='security_access_status')return {data:{approved:get().approved,session_valid:true,mfa_required:false,aal:'aal1',allowed:get().approved},error:null};if(name==='security_record_session')return {data:{allowed:true},error:null};
 if(get().writeFail)return {data:null,error:{message:'Fixture offline'}};
 if(name==='save_card_progress_safe'){const s=get();s.progress=s.progress||{};s.progress[args.p_question_id]=args;put(s);}
 return {data:true,error:null};},
 auth:{getUser:async()=>({data:{user:get().signedIn?user():null}}),getSession:async()=>({data:{session:get().signedIn?{user:user()}:null}}),
 onAuthStateChange:fn=>{window.__authCallbacks.push(fn);return {data:{subscription:{unsubscribe(){}}}};},
 signInWithPassword:async()=>{put({...get(),signedIn:true});return {data:{session:{user:user()}}};},mfa:{listFactors:async()=>({data:{totp:[]}})}},
 from:table=>({upsert:async()=>{if(table!=='presence')throw Error('Unexpected write');return {error:null};}})}
 };
})();
'''
checks=[];errors=[]
def check(name,ok=True):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
try:
 with sync_playwright() as pw:
  opts={'headless':True}
  if os.environ.get('T08_CHROMIUM_EXECUTABLE'):opts['executable_path']=os.environ['T08_CHROMIUM_EXECUTABLE']
  browser=pw.chromium.launch(**opts)
  def setup(**overrides):
   ctx=browser.new_context(viewport={'width':1440,'height':1050},accept_downloads=True)
   state={'signedIn':True,'approved':True,'role':'developer','calls':[],'progress':{},**overrides}
   ctx.add_init_script("if(!sessionStorage.getItem('__cw_fixture'))sessionStorage.setItem('__cw_fixture',JSON.stringify("+json.dumps(state)+"));")
   def route(r):
    if '/cloud.js' in r.request.url:r.fulfill(content_type='application/javascript',body=MOCK)
    elif r.request.url.startswith(ORIGIN):
     local=(ROOT/unquote(urlparse(r.request.url).path).lstrip('/')).resolve()
     if local.is_file() and local.is_relative_to(ROOT):r.fulfill(body=local.read_bytes(),content_type=mimetypes.guess_type(str(local))[0] or 'application/octet-stream')
     else:r.fulfill(status=404,body='Not found')
    else:r.abort()
   ctx.route('**/*',route);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());return ctx,page
  def patch(page,**kw):page.evaluate('x=>{const s=JSON.parse(sessionStorage.__cw_fixture);sessionStorage.__cw_fixture=JSON.stringify({...s,...x});}',kw)
  def goto(page,path='tester.html'):
   page.goto(ORIGIN+'/'+path);page.wait_for_function('window.T08Communicator && !document.querySelector("#testerApp").hidden')
   expect(page.locator('#modList .p-module')).to_have_count(3)
  def openmod(page,key='mod3'):
   page.locator('#workspaceNav a.w-child[href$="module='+key+'"]').click()
   page.wait_for_function('!document.querySelector("#cwStudy").hidden && !document.querySelector("#cwStudyFrame").hidden && !document.querySelector("#cwRing").disabled')
   return page.locator('#cwStudyFrame').content_frame
  def current_frame(page):return next(f for f in page.frames if '/mod1.html?' in f.url)
  def force_card(page,kind='flashcard'):
   f=current_frame(page);f.evaluate('kind=>{const c=cards().find(c=>c.type===kind);startSession([c],"all");renderSidebar();}',kind);return f
  ctx,page=setup();goto(page)
  check('Overview retains three published module cards, with no study frame yet',page.locator('iframe').count()==0)
  check('Overview restores DEV, Utilities, account and Appearance navigation',page.locator('#cwWorkspaceMenu').get_attribute('open') is not None and page.locator('#workspaceNav a[href="./dev.html"]').is_visible() and page.locator('#cwWorkspaceMenu .lg-controls').count()==1)
  page.screenshot(path=str(OUT/'01-communicator-overview.png'),full_page=True)
  page.evaluate('window.__documentSentinel="unchanged"');openmod(page)
  check('Opening a MOD stays in tester.html and preserves the outer document','/tester.html?module=mod3' in page.url and page.evaluate('__documentSentinel')=='unchanged')
  check('All MOD links remain visible; other workspace links fold into one dropdown',page.locator('#workspaceNav a.w-child[href*="tester.html"]:visible').count()==3 and not page.locator('#workspaceNav a[href="./dev.html"]').is_visible())
  f=force_card(page)
  check('Original safeguards and answer presentation run inside the embedded engine',f.evaluate('Boolean(FC_STUDY_RELIABILITY && document.querySelector("#studyView").dataset.presentationReady)'))
  check('Only one visible navigation system and no duplicate study header',not f.locator('#fcSidebar').is_visible() and not f.locator('.topbar').is_visible() and page.locator('#cwTitle').inner_text()=='MOD 3')
  before=f.evaluate('JSON.stringify(state)');f.locator('#showAnswerBtn').click()
  check('Original answer reveal changes no grades',before==f.evaluate('JSON.stringify(state)'))
  f.locator('[data-rate="correct"]').click();page.wait_for_function('document.querySelector("#cwCount1").textContent==="1"')
  check('Rating writes through the existing safe-progress RPC and updates the shared sidebar',page.evaluate('JSON.parse(sessionStorage.__cw_fixture).calls.some(x=>x.name==="save_card_progress_safe")'))
  force_card(page)
  page.screenshot(path=str(OUT/'02-inline-mod3.png'),full_page=True)
  q=f.locator('#questionText').inner_text();queue=f.evaluate('JSON.stringify(session.queue)')
  page.locator('#cwWorkspaceMenu>summary').click();expect(page.locator('#cwWorkspaceMenu a[href="./dev.html"]')).to_be_visible()
  check('Workspace dropdown opens without replacing the question',f.locator('#questionText').inner_text()==q)
  page.screenshot(path=str(OUT/'03-workspace-dropdown.png'),full_page=True)
  page.keyboard.press('Escape');check('Escape closes dropdown and restores summary focus',page.locator('#cwWorkspaceMenu').get_attribute('open') is None and page.locator('#cwWorkspaceMenu>summary').evaluate('e=>e===document.activeElement'))
  page.locator('#cwStudy .cw-back').click();expect(page.locator('#testerApp')).to_be_visible();expect(page.locator('#cwStudy')).to_be_hidden()
  check('Clicking Communicator restores full overview without unloading current test',len([x for x in page.frames if '/mod1.html?' in x.url])==1)
  openmod(page);f=current_frame(page)
  check('Reopening the same MOD resumes its unanswered question and queue',f.locator('#questionText').inner_text()==q and f.evaluate('JSON.stringify(session.queue)')==queue)
  page.go_back();expect(page.locator('#testerApp')).to_be_visible();page.go_forward();expect(page.locator('#cwStudy')).to_be_visible()
  check('Browser Back and Forward restore overview and selected MOD in place',page.evaluate('__documentSentinel')=='unchanged')
  page.locator('#cwGroups>summary').click();expect(page.locator('#cwGroupList button')).to_have_count(2)
  page.locator('#cwGroupSearch').fill('Access');check('Groups search filters actual module groups',page.locator('#cwGroupList button:visible').count()==1)
  page.screenshot(path=str(OUT/'04-groups-dropdown.png'),full_page=True)
  page.locator('#cwGroupList button:visible').click();f=current_frame(page)
  check('Group selection uses the original engine with the selected group',f.evaluate('selectedGroupId')=='mod3-acl')
  page.locator('#cwCustom>summary').click();page.locator('[data-study-action="customPickBtn"]').click();expect(f.locator('#customView')).to_be_visible()
  f.locator('#customAllBtn').click();f.locator('#startCustomBtn').click();expect(f.locator('#studyView')).to_be_visible()
  check('Original custom-test group picker still builds and starts the selected test',f.evaluate('session.mode')=='custom' and f.evaluate('session.queue.length')==4)
  f=force_card(page,'multiple-choice');f.locator('input[value="yes"]').check();f.locator('#submitObjectiveBtn').click()
  check('Multiple-choice grading still uses original answer handlers',f.locator('.feedback.good').count()==1)
  f=force_card(page,'numeric');f.locator('#entryInput').fill('23abc');f.locator('#submitEntryBtn').click();check('Strict numeric safeguard remains enabled',f.locator('.feedback.bad').count()==1)
  f=force_card(page);page.locator('#cwSettings>summary').click()
  with page.expect_download() as info:page.locator('[data-study-action="exportBtn"]').click()
  download=info.value;dest=OUT/'progress-export.json';download.save_as(str(dest));data=json.loads(dest.read_text())
  check('Progress export retains original module-specific backup schema',data['format']=='question-bank-study-progress-v1' and data['module']['slug']=='mod3')
  page.locator('#cwSettings>summary').click()
  with page.expect_file_chooser() as info:page.locator('[data-study-action="importBtn"]').click()
  info.value.set_files(str(dest));expect(f.locator('#importInput')).to_have_value('')
  check('Import reaches the original input and checks the existing backup format')
  page.wait_for_function('!document.querySelector("#cwSaveStatus").classList.contains("cw-pending")')
  openmod(page,'mod2');f=current_frame(page)
  check('Noncanonical module slugs resolve from published records',page.url.endswith('module=module-two') and f.url.endswith('module=module-two'))
  check('Changing modules leaves only one active engine instance',page.locator('#cwStudyFrame').count()==1 and len([x for x in page.frames if '/mod1.html?' in x.url])==1)
  page.locator('#cwWorkspaceMenu>summary').click();page.locator('#cwWorkspaceMenu .lg-controls>summary').click();page.locator('#cwWorkspaceMenu [data-lg-palette="dawn"]').click()
  check('Appearance applies to both shell and question workspace',f.locator('body').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(239, 243, 248)')
  page.locator('#cwWorkspaceMenu [data-lg-palette="atelier"]').click();page.locator('#cwWorkspaceMenu>summary').click()
  for width in [320,390,768,1024,1440]:
   page.set_viewport_size({'width':width,'height':1000});force_card(page)
   page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
   check(f'No horizontal page overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
   check(f'No horizontal question overflow at {width}px',f.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
   if width==390:
    page.screenshot(path=str(OUT/'05-mobile-study.png'),full_page=True)
    page.locator('#menuButton').click();expect(page.locator('#workspaceNav')).to_have_attribute('aria-modal','true')
    check('Mobile navigation focuses its close control and contains study tools',page.locator('.w-nav-close').evaluate('e=>e===document.activeElement') and page.locator('#cwStudyTools').is_visible())
    page.screenshot(path=str(OUT/'06-mobile-study-menu.png'),full_page=True)
    page.keyboard.press('Escape');check('Mobile Escape restores focus to menu button',page.locator('#menuButton').evaluate('e=>e===document.activeElement'))
  page.locator('#cwWorkspaceMenu>summary').click();page.locator('#signOutBtn').click();page.wait_for_url('**/index.html**')
  check('Sign out discards embedded content and returns to authentication',page.locator('#cwStudyFrame').count()==0)
  ctx.close()
  ctx,page=setup(approved=False);page.goto(ORIGIN+'/tester.html?module=mod3');page.wait_for_url('**/index.html**');check('Unapproved account never opens a study frame',page.locator('#cwStudyFrame').count()==0);ctx.close()
  ctx,page=setup(signedIn=False);page.goto(ORIGIN+'/tester.html?module=mod3');page.wait_for_url('**/index.html?return=**');check('Signed-out deep link retains intended module through login', 'module%3Dmod3' in page.url);ctx.close()
  ctx,page=setup();page.goto(ORIGIN+'/tester.html?module=missing');expect(page.locator('#requestedModuleStatus')).to_be_visible();check('Unknown modules show overview instead of an arbitrary iframe URL',page.locator('#cwStudyFrame').count()==0);ctx.close()
  ctx,page=setup(bankFail=True);goto(page);page.locator('#workspaceNav a.w-child[href$="module=mod3"]').click();page.wait_for_function('document.querySelector("#cwStudyFrame")&&!document.querySelector("#cwStudyFrame").hidden');f=current_frame(page)
  expect(f.locator('#lockedText')).to_contain_text('Module unavailable');patch(page,bankFail=False)
  check('Refresh is available after a failed module load',page.locator('[data-study-action="unlockBtn"]').is_enabled())
  page.locator('[data-study-action="unlockBtn"]').click();expect(f.locator('#studyView')).to_be_visible();check('Existing bank reload recovers without a new login');ctx.close()
  check('No uncaught browser exceptions',not errors)
  browser.close()
finally:
 (OUT/'results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},indent=2))
