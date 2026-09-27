from pathlib import Path
UPDATES={'cs50/path/notebook.js': [('syncTimer,locked=false', 'syncTimer,gateTimer,locked=false'), ('session&&session.user.id!==profile.id', 'session&&session.user.id!==profile?.id'), ('await refresh();if(ledger.enabled)sync().catch(()=>{});', 'await refresh();gateTimer=setInterval(recheckAccess,60000);if(ledger.enabled)sync().catch(()=>{});'), ('clearTimeout(syncTimer);ledger?.close();', 'clearTimeout(syncTimer);clearInterval(gateTimer);ledger?.close();'), ("$('nbPreview').replaceChildren();status('Session changed. Sign in again.');", "$('nbPreview').replaceChildren();['nbHistory','nbLinks','nbBacklinks','nbAttached','nbContext','nbConflict'].forEach(id=>$(id).replaceChildren());$('nbEditor').hidden=true;profile=null;status('Session changed. Sign in again.');"), (' async function refresh(){', " async function recheckAccess(){const active=ledger;if(!active||document.hidden||!navigator.onLine)return;try{const res=await FC.client.rpc('security_access_status');if(ledger===active&&!res.error&&res.data?.allowed===false)lock();}catch(_){/* Offline work remains local; cloud RLS still applies. */}}\n async function refresh(){"), ('dirty=false;current=saved;', 'dirty=false;current={...saved};'), ('open,close,flush,setContext,get dirty', 'open,close,flush,setContext,lock,recheckAccess,get dirty')], 'cs50/path/app.js': [('function lock(text){clearInterval(gateTimer);', 'function lock(text){T08Notebook.lock();clearInterval(gateTimer);')]}
UPDATES['tests/course-path-browser.py'] = [("page.locator('[data-merge]').first.click();", "page.locator('#nbConflict details summary').first.click();page.locator('[data-merge]').first.click();")]
for path,edits in UPDATES.items():
    p=Path(path);s=p.read_text()
    for old,new in edits:
        if new in s:continue
        assert s.count(old)==1,(path,old)
        s=s.replace(old,new)
    p.write_text(s)
print('Applied reviewed notebook identity and authorization fixes.')
