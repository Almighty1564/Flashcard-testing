/* Pure validation and evidence rules. Local reports never become trusted grader attestations. */
(function (root, factory) { const api=factory(); if(typeof module==='object'&&module.exports)module.exports=api; else root.T08ProjectCore=api; })(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
  const canonical=x=>JSON.stringify(x,(_,v)=>plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const validPath=s=>typeof s==='string'&&s.length<240&&!s.startsWith('/')&&!s.includes('\\')&&!s.includes(':')&&!s.split('/').some(x=>!x||x==='.'||x==='..')&&!s.split('/').some(x=>x.startsWith('.env'));
  const safeCodePath=p=>validPath(p)&&( /^(src|tests|templates|static)\//.test(p)||['pyproject.toml','README.md','requirements.txt'].includes(p))&&/\.(py|toml|md|json|txt|html|css|js|sql|csv)$/.test(p);
  const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
  async function sourceHash(files){const pairs=[];for(const p of Object.keys(files).sort())pairs.push([p,await sha(files[p])]);return sha(JSON.stringify(pairs));}
  function validateEvent(event){
    if(!plain(event)||typeof event.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(event.id)||typeof event.client_at!=='string'||!Number.isFinite(Date.parse(event.client_at))||!plain(event.payload))throw new Error('Invalid event envelope. Original backup remains unchanged.');
    const p=event.payload;
    if(p.schema!==2||!['attempt','draft','quiz','trace','reflection','selection'].includes(p.type)||typeof p.release_id!=='string'||p.release_id.length>80||new TextEncoder().encode(JSON.stringify(p)).length>1900000)throw new Error('Unsupported or oversized event.');
    if(p.type==='draft'&&(!Array.isArray(p.parents)||p.parents.some(x=>typeof x!=='string')||typeof p.text!=='string'||p.text.length>50000||typeof p.repo!=='string'||p.repo.length>500))throw new Error('Invalid note revision.');
    if(p.type==='attempt'&&(typeof p.passed!=='boolean'||!['none','docs','hint','ai','solution'].includes(p.assistance)||!['local-unverified','self-review'].includes(p.provenance)||typeof p.release_version!=='string'))throw new Error('Invalid attempt evidence.');
    if(p.type==='draft' && p.assistance!==undefined && !['none','docs','hint','ai','solution'].includes(p.assistance))throw new Error('Invalid draft assistance value.');
    if(p.type==='attempt'&&p.provenance==='local-unverified'){
      const r=p.report;
      if(!plain(r)||typeof r.source_sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.source_sha256)||!plain(r.source_files)||Object.keys(r.source_files).some(k=>!safeCodePath(k)||typeof r.source_files[k]!=='string')||!Array.isArray(r.results)||r.results.some(x=>!plain(x)||typeof x.id!=='string'||typeof x.passed!=='boolean'||typeof x.detail!=='string'))throw new Error('Invalid source report inside attempt.');
    }
    return event;
  }
  async function validateReport(report,release){
    if(!plain(report)||report.schema!==2||report.kind!=='tomato08-project-report'||report.release_id!==release.id||report.project_id!==release.project||report.release_version!==release.version||report.grader_version!=='2.0.0')throw new Error('This report does not match the selected release/version.');
    if(typeof report.id!=='string'||report.id.length>80||!plain(report.source_files)||Object.keys(report.source_files).length>300)throw new Error('Invalid report identity or source snapshot.');
    if(!Object.keys(report.source_files).every(p=>safeCodePath(p)&&typeof report.source_files[p]==='string'))throw new Error('Unexpected path or non-text file in the source snapshot.');
    if(new TextEncoder().encode(JSON.stringify(report)).length>1850000)throw new Error('Report exceeds the 1.85 MB import limit.');
    if(report.checks_sha256!==release.checks_sha256||await sourceHash(report.source_files)!==report.source_sha256)throw new Error('Source or reference-check fingerprint mismatch. Rerun the original project checker.');
    if(!Array.isArray(report.results)||report.results.length>300||report.results.some(x=>!plain(x)||typeof x.id!=='string'||typeof x.passed!=='boolean'||typeof x.skipped!=='boolean'||typeof x.detail!=='string'))throw new Error('Invalid test results.');
    const ids=report.results.map(x=>x.id);if(new Set(ids).size!==ids.length)throw new Error('Duplicate case IDs.');
    if(ids.some(x=>!release.test_cases.includes(x)))throw new Error('Unknown test case in report.');
    const complete=canonical([...ids].sort())===canonical([...release.test_cases].sort());
    return {report,passed:complete&&report.runner_exit_code===0&&report.results.every(x=>x.passed&&!x.skipped)&&report.passed===true};
  }
  function drafts(events,release){
    const ds=events.filter(e=>e.payload.type==='draft'&&e.payload.release_id===release),replaced=new Set(ds.flatMap(e=>e.payload.parents||[]));
    return ds.filter(e=>!replaced.has(e.id)).sort((a,b)=>a.client_at.localeCompare(b.client_at)||a.id.localeCompare(b.id));
  }
  function attempts(events,release){return events.filter(e=>e.payload.type==='attempt'&&(!release||e.payload.release_id===release)).sort((a,b)=>a.client_at.localeCompare(b.client_at)||a.id.localeCompare(b.id));}
  function accepted(events,release){return attempts(events,release.id).some(e=>e.payload.passed&&e.payload.release_version===release.version);}
  function skillEvidence(catalog,events,now=Date.now()){
    const releases=new Map(catalog.releases.map(r=>[r.id,r]));
    return Object.entries(catalog.skills).map(([id,title])=>{
      const eligible=attempts(events).filter(e=>{
        const r=releases.get(e.payload.release_id);if(!r||r.version!==e.payload.release_version)return false;
        // Tested outputs do not prove implementation style, own-test quality or public deployment readiness.
        return r.skills.includes(id);
      });
      const checked=eligible.filter(e=>e.payload.provenance==='local-unverified'),success=checked.filter(e=>e.payload.passed);
      const independent=success.filter(e=>['none','docs'].includes(e.payload.assistance)&&!(e.payload.hints>0));
      const contexts=[...new Set(independent.map(e=>releases.get(e.payload.release_id).project))];
      const reviewed=eligible.filter(e=>e.payload.provenance==='self-review'&&e.payload.passed);
      const nonBehavior=['tests','git','packaging','cli','maintenance'];
      const latest=checked.at(-1),lastGood=independent.at(-1),age=lastGood?Math.max(0,(now-Date.parse(lastGood.client_at))/86400000):null;
      const distinctReleases=new Set(independent.map(e=>e.payload.release_id)).size;
      const reviewInterval=distinctReleases>=4?21:distinctReleases>=2?7:2;
      const delayed=independent.some((e,i)=>independent.slice(0,i).some(old=>old.payload.release_id!==e.payload.release_id&&old.payload.report?.source_sha256!==e.payload.report?.source_sha256&&Date.parse(e.client_at)-Date.parse(old.client_at)>=48*3600000));
      let status='No implementation evidence';
      if(reviewed.length)status='Self-reviewed artifact';
      if(success.length)status='Behavior checked with assistance';
      if(independent.length)status='Independent work reported';
      if(contexts.length>=2&&distinctReleases>=2)status='Cross-project behavior demonstrated';
      if(nonBehavior.includes(id)&&eligible.length)status='Review required beyond output tests';
      if(latest&&!latest.payload.passed)status='Latest check needs work';
      return {id,title,status,contexts:contexts.length,passes:success.length,reviews:reviewed.length,delayed,age,reviewDue:age!==null&&age>=reviewInterval,reviewInterval,latest,events:eligible};
    });
  }
  function mergeEvents(a,b){const map=new Map(a.map(e=>[e.id,e]));for(const e of b){validateEvent(e);if(map.has(e.id)&&canonical(map.get(e.id).payload)!==canonical(e.payload))throw new Error('Conflicting immutable event ID. Neither version was overwritten.');if(!map.has(e.id))map.set(e.id,e);}return [...map.values()];}
  // Migration reader deliberately makes no writes. Callers must preserve unsupported bytes.
  function loadLegacy(raw,version,validate){if(raw===null)return {state:null,blocked:false};try{const parsed=JSON.parse(raw);if(parsed?.schema!==1||parsed.version!==version||!validate(parsed))return {state:null,blocked:true,raw};return {state:parsed,blocked:false};}catch(_){return {state:null,blocked:true,raw};}}
  return {canonical,sha,sourceHash,validPath,safeCodePath,validateEvent,validateReport,drafts,attempts,accepted,skillEvidence,mergeEvents,loadLegacy};
});
