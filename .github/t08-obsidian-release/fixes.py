from pathlib import Path
p=Path('cs50/path/notebook.js')
s=p.read_text()
old="async function sync(){const active=ledger;if(!active)return;active.enabled=!!await active.setting('cloud');if(!active.enabled)return;try{await active.sync(FC.client,s=>{if(ledger===active)status(s);});if(ledger!==active)return;await refresh();renderList();if(current&&!dirty){const n=all.find(n=>n.id===current.id);if(n)loadEditor(n);}}catch(e){status('Saved locally; cloud sync pending: '+e.message);}}"
new="async function sync(){const active=ledger;if(!active)return;active.enabled=!!await active.setting('cloud');if(!active.enabled)return;let outcome='';try{await active.sync(FC.client,s=>{if(ledger===active){outcome=s;status(s);}});if(ledger!==active)return;await refresh();renderList();if(current&&!dirty){const n=all.find(n=>n.id===current.id);if(n)loadEditor(n);}if(outcome)status((current?.conflict?'Conflicting revisions preserved. ':dirty?'Local draft retained. ':'')+outcome);}catch(e){if(ledger===active)status('Saved locally; cloud sync pending: '+e.message);}}"
if new not in s:
    assert s.count(old)==1,'Unexpected notebook sync function'
    p.write_text(s.replace(old,new))
print('Preserved final cloud-sync status after editor refresh.')

p=Path('tests/course-path-browser.py')
s=p.read_text()
old="page.locator('#toggleSync').click();wait_ready(page,"
new="page.locator('#syncNow').click();wait_ready(page,"
if new not in s:
    assert s.count(old)==1,'Unexpected existing sync control check'
    p.write_text(s.replace(old,new))
print('Test uses Sync now because the inline connection step already enabled cloud sync.')
