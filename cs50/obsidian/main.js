/* Tomato08 Notebook Sync 1.0.0. Source modules are included in this repository. */
'use strict';
const __modules = Object.create(null), __cache = Object.create(null);
__modules["core"] = (module, exports) => {
'use strict';
// Shared note contract and deterministic sync decisions. No network or filesystem access here.
const crypto = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE = /^notebook-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOT = 'Tomato08';
const clone = x => JSON.parse(JSON.stringify(x));
function canonical(x) { return JSON.stringify(x, (_,v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a,k)=>(a[k]=v[k],a),{}) : v); }
function hash(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function validPayload(p) {
  return p && p.schema===2 && p.type==='draft' && p.kind==='course-note' && p.note_schema===1 && NOTE.test(p.release_id) &&
    typeof p.title==='string' && p.title.trim().length>0 && p.title.length<=140 && typeof p.text==='string' && p.text.length<=50000 &&
    Array.isArray(p.parents) && p.parents.length<=100 && p.parents.every(x=>UUID.test(x)) && new Set(p.parents).size===p.parents.length &&
    Array.isArray(p.topics) && p.topics.length<=50 && p.topics.every(x=>typeof x==='string' && /^[-a-z0-9]+$/.test(x)) &&
    Array.isArray(p.aliases) && p.aliases.length<=30 && p.aliases.every(x=>typeof x==='string' && x.length<=140) && typeof p.archived==='boolean';
}
function validEvent(e) { return e && UUID.test(e.id) && typeof e.client_at==='string' && Number.isFinite(Date.parse(e.client_at)) && validPayload(e.payload) && !e.payload.parents.includes(e.id); }
function mergeEvents(a,b) {
  const events=new Map();
  for(const e of [...a,...b]) {
    if(!validEvent(e)) throw new Error('Malformed notebook revision. Sync stopped without overwriting notes.');
    const old=events.get(e.id);
    if(old && (canonical(old.payload)!==canonical(e.payload)||Date.parse(old.client_at)!==Date.parse(e.client_at)))throw new Error('Immutable revision collision. Sync stopped.');
    events.set(e.id, clone(e));
  }
  if(events.size>15000)throw new Error('Notebook exceeds the 15,000-revision safety limit. Export a backup.');
  return [...events.values()];
}
function groups(events) {
  const byNote=new Map(), byId=new Map(events.map(e=>[e.id,e]));
  for(const e of events) {
    for(const p of e.payload.parents) if(!byId.has(p)||byId.get(p).payload.release_id!==e.payload.release_id)throw new Error('Incomplete or cross-note revision ancestry. Retry sync; no local files changed.');
    const id=e.payload.release_id;if(!byNote.has(id))byNote.set(id,[]);byNote.get(id).push(e);
  }
  const color=new Map();
  function visit(id,depth=0){if(depth>1500)throw new Error('Revision ancestry is too deep. Export a backup.');if(color.get(id)===1)throw new Error('Cyclic revision history.');if(color.get(id)===2)return;color.set(id,1);for(const p of byId.get(id).payload.parents)visit(p,depth+1);color.set(id,2);}
  for(const id of byId.keys())visit(id);
  return new Map([...byNote].map(([id,rs])=>{const replaced=new Set(rs.flatMap(e=>e.payload.parents));const heads=rs.filter(e=>!replaced.has(e.id)).sort((a,b)=>Date.parse(a.client_at)-Date.parse(b.client_at)||a.id.localeCompare(b.id));if(!heads.length)throw new Error('No valid revision head.');return [id,heads];}));
}
function logical(p) { return {title:p.title,text:p.text,topics:p.topics,aliases:p.aliases,archived:p.archived}; }
function same(a,b){return canonical(logical(a))===canonical(logical(b));}
function newEvent(base,patch,parents) {
  const title=(patch.title??base.title).trim();
  const aliases=[...new Set([...(patch.aliases??base.aliases??[]),...(title!==base.title?[base.title]:[])])].slice(-30);
  const payload={schema:2,type:'draft',kind:'course-note',note_schema:1,release_id:base.release_id||base.id,
    title,text:patch.text??base.text,topics:patch.topics??base.topics??[],aliases,archived:patch.archived??base.archived??false,
    parents:[...parents],repo:'',origin:'obsidian-bridge'};
  if(!validPayload(payload))throw new Error('Note exceeds supported limits or has invalid metadata. Existing files were preserved.');
  return {id:crypto.randomUUID(),client_at:new Date().toISOString(),payload};
}
function basename(title,id){let s=title.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\[\]#^]/g,' ').replace(/\s+/g,' ').replace(/[ .]+$/,'').trim().slice(0,65)||'Note';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))s='Note '+s;return `${s}--${id.slice(9)}.md`;}
function managedPath(path){return typeof path==='string' && path.startsWith(ROOT+'/Notes/') && !/[\\\x00-\x1f:]/.test(path) && path.split('/').every(s=>s && s!=='.' && s!=='..' && !s.startsWith('.')) && path.endsWith('.md');}
function defaultPath(p){return ROOT+'/Notes/'+basename(p.title,p.release_id);}
function split(text,parseYaml){
  if(text.length>180000)throw new Error('Note file exceeds safe size.');
  const m=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!m)return {meta:{},body:text};
  let meta;try{meta=parseYaml(m[1]);}catch(_){throw new Error('Malformed YAML properties. File was not changed.');}
  if(!meta||typeof meta!=='object'||Array.isArray(meta))throw new Error('Properties must be a YAML object.');
  return {meta,body:text.slice(m[0].length)};
}
function rewriteLinks(text,resolve){
  let fence=null;
  return text.split('\n').map(line=>{
    const f=line.match(/^\s*(`{3,}|~{3,})/);
    if(f){if(!fence)fence=f[1][0];else if(fence===f[1][0])fence=null;return line;}
    if(fence)return line;
    return line.split(/(`+[^`]*`+)/g).map((part,i)=>i%2?part:part.replace(/(?<!!)\[\[([^\]\n]+)\]\]/g,(all,inside)=>{
      const [target,...rest]=inside.split('|');if(target.includes('#')||target.includes('^'))return all;
      const result=resolve(target.trim(),rest.join('|')||null);return result||all;
    })).join('');
  }).join('\n');
}
function linkIndex(heads,entries){
 const byName=new Map(),byId=new Map(),byPath=new Map();
 for(const [id,hs] of heads){const p=hs.at(-1).payload;byId.set(id,p);for(const name of [p.title,...p.aliases]){const k=name.trim().toLowerCase();const set=byName.get(k)||new Set();set.add(id);byName.set(k,set);}const path=entries[id]?.path||defaultPath(p);byPath.set(path.replace(/\.md$/,''),id);byPath.set(path.split('/').at(-1).replace(/\.md$/,''),id);}
 return {byName,byId,byPath};
}
function toVault(text,index,entries){return rewriteLinks(text,(target,label)=>{let id=NOTE.test(target)?target:null;if(!id){const ids=index.byName.get(target.toLowerCase());if(ids?.size===1)id=[...ids][0];}const p=id&&index.byId.get(id);if(!p)return null;return `[[${(entries[id]?.path||defaultPath(p)).replace(/\.md$/,'')}|${label||p.title}]]`;});}
function toWeb(text,index){return rewriteLinks(text,(target,label)=>{const id=index.byPath.get(target.replace(/\.md$/,''));if(!id)return null;return `[[${id}|${label||index.byId.get(id).title}]]`;});}
function parseManaged(raw,account,parseYaml,index){const {meta,body}=split(raw,parseYaml);if(!NOTE.test(meta.tomato08_id)||meta.tomato08_account!==account)throw new Error('Missing note ID or wrong Tomato08 account. File was not changed.');const p={schema:2,type:'draft',kind:'course-note',note_schema:1,release_id:meta.tomato08_id,title:meta.tomato08_title,text:toWeb(body,index),topics:meta.tomato08_topics,aliases:meta.aliases,archived:meta.tomato08_archived,parents:meta.tomato08_heads,repo:''};if(!validPayload(p))throw new Error('Invalid Tomato08 note properties. Restore them before syncing.');return {payload:p,meta,body};}
function render(p,heads,account,index,entries,stringifyYaml,extra={}){
 const meta={...extra,tomato08_id:p.release_id,tomato08_account:account,tomato08_title:p.title,tomato08_topics:p.topics,tomato08_archived:p.archived,tomato08_heads:[...heads],aliases:p.aliases};
 return '---\n'+stringifyYaml(meta).trimEnd()+'\n---\n'+toVault(p.text,index,entries);
}
module.exports={UUID,NOTE,ROOT,clone,canonical,hash,validPayload,validEvent,mergeEvents,groups,logical,same,newEvent,basename,managedPath,defaultPath,split,toVault,toWeb,linkIndex,parseManaged,render};

};
__modules["transport"] = (module, exports) => {
'use strict';
const C=__load('core');
const URL='https://semtnzdzpluhnkzxkquk.supabase.co';
// This is the existing public client key. Authorization is enforced by Auth and RLS.
const KEY='sb_publishable__iTA6kUw3yTS1f2W0kfOig_alnmzLcz';
class Cloud {
 constructor(request,account=null){this.request=request;this.account=account;this.session=null;this.epoch=0;this.refreshing=null;}
 clear(){this.epoch++;this.session=null;}
 async call(path,method='GET',body,authenticated=true){
  if(!/^\/(auth\/v1\/|rest\/v1\/|functions\/v1\/)/.test(path)||path.includes('://'))throw new Error('Unexpected endpoint.');
  if(authenticated&&!this.session)throw new Error('Sign in inside Obsidian first.');
  const epoch=this.epoch;let timer;
  const headers={apikey:KEY,'Content-Type':'application/json','X-Client-Info':'tomato08-obsidian/1.0.0'};
  if(authenticated)headers.Authorization='Bearer '+this.session.access_token;
  let res;
  try{res=await Promise.race([this.request({url:URL+path,method,headers,body:body===undefined?undefined:JSON.stringify(body),throw:false}),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Request timed out. Local changes remain queued.')),30000))]);}
  finally{clearTimeout(timer);}
  if(epoch!==this.epoch)throw new Error('Session changed. Operation stopped.');
  let data;try{data=res.json;}catch(_){data=null;}
  if(res.status<200||res.status>=300){const err=new Error(res.status===401?'Session expired. Sign in again.':res.status===403?'Access denied. Check approval, session status and MFA.':res.status===429?'Rate limited. Wait before retrying.':`Cloud request failed (HTTP ${res.status}). Local notes were retained.`);err.status=res.status;err.code=data?.code;throw err;}
  return data;
 }
 setSession(s){if(!s||typeof s.access_token!=='string'||typeof s.refresh_token!=='string'||!C.UUID.test(s.user?.id))throw new Error('Invalid authentication response.');if(this.account&&s.user.id!==this.account){this.clear();throw new Error('This plugin is bound to another account. Use a separate vault for that account.');}this.session={...s,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600)};}
 async login(username,password){this.clear();const name=String(username||'').trim().toLowerCase();if(!name||!password)throw new Error('Enter your Tomato08 username and password.');const s=await this.call('/auth/v1/token?grant_type=password','POST',{email:name.includes('@')?name:name+'@flashcard.invalid',password},false);this.setSession(s);return this.access();}
 async refresh(){if(!this.session)throw new Error('Sign in inside Obsidian.');if(this.session.expires_at*1000>Date.now()+60000)return;if(!this.refreshing)this.refreshing=(async()=>{const s=await this.call('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:this.session.refresh_token},false);this.setSession(s);})().finally(()=>this.refreshing=null);return this.refreshing;}
 async access(){await this.refresh();const user=await this.call('/auth/v1/user');if(user?.id!==this.session.user.id||this.account&&user.id!==this.account){this.clear();throw new Error('Authenticated account mismatch.');}const a=await this.call('/rest/v1/rpc/security_access_status','POST',{});if(!a||typeof a.allowed!=='boolean'||(a.user_id&&a.user_id!==user.id))throw new Error('Invalid access response. Sync remains disabled.');return {...a,user};}
 async requireAccess(){const a=await this.access();if(a.allowed!==true){const e=new Error(a.mfa_required&&a.aal!=='aal2'?'Verify your authenticator code before syncing.':'Account not approved, session revoked, or access blocked.');e.denied=true;throw e;}return a.user;}
 async verify(factorId,code){if(!C.UUID.test(factorId)||!/^\d{6}$/.test(code))throw new Error('Choose a verified factor and enter its six-digit code.');const challenge=await this.call('/auth/v1/factors/'+factorId+'/challenge','POST',{});if(!C.UUID.test(challenge?.id))throw new Error('Invalid MFA challenge.');const s=await this.call('/auth/v1/factors/'+factorId+'/verify','POST',{challenge_id:challenge.id,code});if(!s.user)s.user=this.session.user;this.setSession(s);return this.requireAccess();}
 async logout(){try{if(this.session)await this.call('/auth/v1/logout?scope=local','POST',{});}finally{this.clear();}}
 async pull(){const user=await this.requireAccess(),out=[];let bytes=0;for(let offset=0;offset<15000;offset+=200){const q=new URLSearchParams({select:'id,user_id,client_at,recorded_at,payload',user_id:'eq.'+user.id,'payload->>kind':'eq.course-note',order:'recorded_at.asc,id.asc',limit:'200',offset:String(offset)});const rows=await this.call('/rest/v1/cs50_project_events?'+q);if(!Array.isArray(rows)||rows.some(e=>e.user_id!==user.id||!C.validEvent(e)))throw new Error('Invalid notebook data. No files overwritten.');bytes+=JSON.stringify(rows).length;if(bytes>32000000)throw new Error('Notebook exceeds the 32 MB sync safety limit.');out.push(...rows.map(({user_id,...e})=>e));if(rows.length<200)return out;}throw new Error('Notebook reached the 15,000-revision sync limit.');}
 async push(e){if(!C.validEvent(e))throw new Error('Invalid local notebook event.');const user=await this.requireAccess();const row={id:e.id,user_id:user.id,client_at:e.client_at,payload:e.payload};try{await this.call('/rest/v1/cs50_project_events','POST',row);}catch(err){if(err.status!==409||err.code!=='23505')throw err;const q=new URLSearchParams({select:'id,client_at,payload',user_id:'eq.'+user.id,id:'eq.'+e.id});const existing=await this.call('/rest/v1/cs50_project_events?'+q);if(existing?.length!==1||C.canonical(existing[0].payload)!==C.canonical(e.payload)||Date.parse(existing[0].client_at)!==Date.parse(e.client_at))throw new Error('Cloud revision collision. Nothing overwritten.');}}
}
module.exports={Cloud,URL,KEY};

};
__modules["engine"] = (module, exports) => {
'use strict';
const C=__load('core');
const crypto=require('node:crypto');
function initial(){return {schema:1,account:null,autoSync:false,events:[],pending:[],entries:{},lastSync:null};}
function validateState(raw){
 if(raw===null||raw===undefined)return initial();
 if(raw.schema!==1||raw.account!==null&&!C.UUID.test(raw.account)||typeof raw.autoSync!=='boolean'||!Array.isArray(raw.events)||!Array.isArray(raw.pending)||!raw.entries||typeof raw.entries!=='object'||Array.isArray(raw.entries))throw new Error('Unsupported plugin state. Export data.json; do not reset it.');
 C.mergeEvents([],raw.events);if(raw.pending.some(id=>!raw.events.some(e=>e.id===id)))throw new Error('Pending revision missing from state.');
 for(const [id,e]of Object.entries(raw.entries)){if(!C.NOTE.test(id)||!C.managedPath(e.path)||!Array.isArray(e.heads)||e.heads.some(x=>!C.UUID.test(x))||!C.validPayload(e.base)||e.base.release_id!==id||typeof e.lastHash!=='string')throw new Error('Invalid file mapping. Plugin stopped to preserve notes.');}
 return C.clone(raw);
}
class Engine {
 constructor(port,cloud,state,save,notify=()=>{}){this.port=port;this.cloud=cloud;this.state=state;this.save=save;this.notify=notify;this.busy=false;this.cancelled=false;}
 async persist(){await this.save(C.clone(this.state));}
 ensure(){if(this.cancelled)throw new Error('Sync was stopped.');if(!this.state.account||this.cloud.session?.user?.id!==this.state.account)throw new Error('Sign in to the vault’s bound Tomato08 account.');}
 async bind(user){if(this.state.account&&this.state.account!==user.id)throw new Error('Use a separate vault for a different account.');this.state.account=user.id;this.cloud.account=user.id;await this.persist();}
 index(){return C.linkIndex(C.groups(this.state.events),this.state.entries);}
 async discover(){
  const paths=await this.port.list();const ids=new Set();
  for(const path of paths){this.ensure();if(!C.managedPath(path))continue;const raw=await this.port.read(path);const doc=C.split(raw,this.port.parseYaml);if(!doc.meta.tomato08_id)continue;if(doc.meta.tomato08_account!==this.state.account)throw new Error('Another account’s note is in the managed folder. Move it to a separate vault.');const id=doc.meta.tomato08_id;if(!C.NOTE.test(id)||ids.has(id))throw new Error('Duplicate or invalid note ID in managed files. No notes overwritten.');ids.add(id);let entry=this.state.entries[id];if(entry){entry.path=path;continue;}
   // Recovery after state loss: a managed file carries the exact parents it was based on.
   const baseIds=doc.meta.tomato08_heads;if(!Array.isArray(baseIds)||baseIds.length!==1)throw new Error('Untracked conflicted note. Restore the plugin backup before syncing.');
   const base=this.state.events.find(e=>e.id===baseIds[0]&&e.payload.release_id===id);if(!base)throw new Error('Untracked note has unknown revision ancestry. Restore its plugin backup.');
   const index=this.index(),rendered=C.render(base.payload,baseIds,this.state.account,index,this.state.entries,this.port.stringifyYaml,doc.meta);
   this.state.entries[id]={path,heads:[...baseIds],base:C.parseManaged(rendered,this.state.account,this.port.parseYaml,index).payload,lastHash:C.hash(rendered)};
  }
 }
 async queue(base,patch,parents){const e=C.newEvent(base,patch,parents);this.state.events=C.mergeEvents(this.state.events,[e]);this.state.pending.push(e.id);await this.persist();return e;}
 async scanLocal(){
  const index=this.index();
  for(const [id,entry]of Object.entries(this.state.entries)){
   this.ensure();if(!await this.port.exists(entry.path))continue;const raw=await this.port.read(entry.path);if(C.hash(raw)===entry.lastHash)continue;
   const local=C.parseManaged(raw,this.state.account,this.port.parseYaml,index).payload;if(local.release_id!==id)throw new Error('A managed file changed its identity. Restore its original properties.');
   if(C.same(local,entry.base)){entry.lastHash=C.hash(raw);continue;}
   if(entry.heads.length!==1)continue; // An unresolved branch requires explicit merge, never an automatic winner.
   const e=C.newEvent(entry.base,local,entry.heads);
   // Save outbox and its base together before touching the network. Retrying uses the same immutable ID.
   this.state.events=C.mergeEvents(this.state.events,[e]);this.state.pending.push(e.id);
   entry.base=e.payload;entry.heads=[e.id];entry.lastHash=C.hash(raw);await this.persist();
  }
 }
 async flushPending(){for(const id of [...this.state.pending]){this.ensure();const e=this.state.events.find(e=>e.id===id);await this.cloud.push(e);this.ensure();this.state.pending=this.state.pending.filter(x=>x!==id);await this.persist();}}
 async applyRemote(){
  const groups=C.groups(this.state.events),index=C.linkIndex(groups,this.state.entries);let pulled=0,conflicts=0,missing=0,deferred=0;
  for(const [id,heads]of groups){
   this.ensure();let entry=this.state.entries[id];
   if(heads.length>1){conflicts++;for(const e of heads){await this.port.conflict(id,e);}continue;}
   const event=heads[0],p=event.payload;
   if(entry&&!await this.port.exists(entry.path)){missing++;continue;}
   const path=entry?.path||C.defaultPath(p);let raw=null,meta={};
   if(await this.port.exists(path)){
     raw=await this.port.read(path);
     if(!entry)throw new Error('Destination exists but is not mapped. No overwrite performed.');
     if(C.hash(raw)!==entry.lastHash){deferred++;continue;}
     const parsed=C.parseManaged(raw,this.state.account,this.port.parseYaml,index);if(parsed.payload.release_id!==id)throw new Error('Destination identity mismatch.');meta=parsed.meta;
   }
   const next=C.render(p,[event.id],this.state.account,index,this.state.entries,this.port.stringifyYaml,meta);
   this.ensure();const ok=raw===null?await this.port.create(path,next):await this.port.replace(path,raw,next);
   if(!ok){deferred++;continue;}
   // Only advance the remembered base after a successful guarded write.
   const parsed=C.parseManaged(next,this.state.account,this.port.parseYaml,index);
   this.state.entries[id]={path,heads:[event.id],base:parsed.payload,lastHash:C.hash(next)};await this.persist();pulled++;
  }
  return {pulled,conflicts,missing,deferred};
 }
 async sync(){if(this.busy)throw new Error('A sync is already running.');this.busy=true;try{this.ensure();await this.cloud.requireAccess();const remote=await this.cloud.pull();this.ensure();this.state.events=C.mergeEvents(this.state.events,remote);C.groups(this.state.events);await this.discover();await this.persist();await this.scanLocal();await this.flushPending();const fresh=await this.cloud.pull();this.ensure();this.state.events=C.mergeEvents(this.state.events,fresh);C.groups(this.state.events);await this.persist();const result=await this.applyRemote();this.state.lastSync=new Date().toISOString();await this.persist();return result;}finally{this.busy=false;}}
 async add(title,body,extra={}){
   if(this.busy)throw new Error('Wait for the current sync.');this.ensure();
   const p={release_id:'notebook-'+crypto.randomUUID(),title:String(title).trim(),text:body,topics:[],aliases:[],archived:false};const e=C.newEvent(p,{},[]),path=C.defaultPath(e.payload);
   const index=this.index();const next=C.render(e.payload,[e.id],this.state.account,index,this.state.entries,this.port.stringifyYaml,extra);
   if(await this.port.exists(path))throw new Error('Destination already exists.');
   await this.port.create(path,next);
   this.state.events=C.mergeEvents(this.state.events,[e]);this.state.pending.push(e.id);this.state.entries[p.release_id]={path,heads:[e.id],base:e.payload,lastHash:C.hash(next)};await this.persist();return path;
 }
 async resolve(id){
   if(this.busy)throw new Error('Wait for the current sync.');this.ensure();await this.cloud.requireAccess();this.state.events=C.mergeEvents(this.state.events,await this.cloud.pull());const heads=C.groups(this.state.events).get(id);if(!heads||heads.length<2)throw new Error('No current conflict for this note.');const entry=this.state.entries[id];if(!entry)throw new Error('Resolve this note in the website notebook first.');const raw=await this.port.read(entry.path),p=C.parseManaged(raw,this.state.account,this.port.parseYaml,this.index()).payload;
   if(!await this.port.confirmMerge(heads.length))return false;
   this.ensure();if(await this.port.read(entry.path)!==raw)throw new Error('Note changed during review. Try again.');
   const e=C.newEvent(entry.base,p,heads.map(e=>e.id));this.state.events=C.mergeEvents(this.state.events,[e]);this.state.pending.push(e.id);entry.base=e.payload;entry.heads=[e.id];entry.lastHash=C.hash(raw);await this.persist();return true;
 }
}
module.exports={Engine,initial,validateState};

};
__modules["plugin"] = (module, exports) => {
'use strict';
const {Plugin,PluginSettingTab,Setting,Modal,Notice,TFile,FileSystemAdapter,requestUrl,parseYaml,stringifyYaml}=require('obsidian');
const fs=require('node:fs/promises'),pathUtil=require('node:path');
const C=__load('core'),{Cloud}=__load('transport'),{Engine,initial,validateState}=__load('engine');
class Confirm extends Modal {
 constructor(app,title,message){super(app);this.heading=title;this.message=message;this.answer=false;}
 ask(){return new Promise(resolve=>{this.resolve=resolve;this.open();});}
 onOpen(){this.contentEl.createEl('h2',{text:this.heading});this.contentEl.createEl('p',{text:this.message});new Setting(this.contentEl).addButton(b=>b.setButtonText('Cancel').onClick(()=>this.close())).addButton(b=>b.setButtonText('Confirm').setCta().onClick(()=>{this.answer=true;this.close();}));}
 onClose(){this.resolve?.(this.answer);this.contentEl.empty();}
}
class Login extends Modal {
 constructor(plugin){super(plugin.app);this.p=plugin;this.closed=false;this.busy=false;this.success=false;}
 onOpen(){
  this.contentEl.createEl('h2',{text:'Connect Tomato08'});this.contentEl.createEl('p',{text:'Use your Tomato08 account, not your Obsidian account. Credentials go only to your existing Supabase Auth service. Passwords and tokens are not saved to the vault.'});
  let username='',password='',code='',factorId='';
  new Setting(this.contentEl).setName('Tomato08 username').addText(t=>{t.inputEl.autocomplete='username';t.onChange(v=>username=v);});
  let passwordInput;new Setting(this.contentEl).setName('Password').addText(t=>{passwordInput=t.inputEl;t.inputEl.type='password';t.inputEl.autocomplete='current-password';t.onChange(v=>password=v);});
  this.status=this.contentEl.createEl('p',{attr:{role:'status'}});this.factors=this.contentEl.createDiv();
  const finish=async()=>{if(this.closed)return;const user=await this.p.cloud.requireAccess();await this.p.engine.bind(user);this.success=true;this.p.message('Connected. Choose Sync now to exchange notebook notes.');this.close();};
  const guarded=fn=>async()=>{if(this.busy)return;this.busy=true;this.status.setText('Checking…');try{await fn();}catch(e){if(!this.closed)this.status.setText(e.message);}finally{password='';passwordInput.value='';this.busy=false;}};
  new Setting(this.contentEl).addButton(b=>b.setButtonText('Sign in').setCta().onClick(guarded(async()=>{
    const result=await this.p.cloud.login(username,password);if(this.closed)return;if(result.allowed)return finish();
    const factors=(result.user.factors||[]).filter(f=>f.factor_type==='totp'&&f.status==='verified');
    if(!result.approved||!result.session_valid)throw new Error('This account or session is not approved. Review Security Activity on Tomato08.');
    if(!result.mfa_required||!factors.length)throw new Error('Complete authenticator enrollment on Tomato08 before connecting.');
    this.factors.empty();factorId=factors[0].id;
    new Setting(this.factors).setName('Authenticator').addDropdown(d=>{factors.forEach((f,i)=>d.addOption(f.id,f.friendly_name||'Authenticator '+(i+1)));d.setValue(factorId).onChange(v=>factorId=v);});
    new Setting(this.factors).setName('Six-digit code').addText(t=>{t.inputEl.inputMode='numeric';t.inputEl.autocomplete='one-time-code';t.onChange(v=>code=v.trim());});
    new Setting(this.factors).addButton(v=>v.setButtonText('Verify authenticator').setCta().onClick(guarded(async()=>{await this.p.cloud.verify(factorId,code);code='';await finish();})));
    this.status.setText('Enter the current authenticator code.');
  })));
 }
 onClose(){this.closed=true;if(!this.success)this.p.cloud.clear();this.contentEl.empty();}
}
class Settings extends PluginSettingTab {
 constructor(app,plugin){super(app,plugin);this.p=plugin;}
 display(){
  const el=this.containerEl;el.empty();el.createEl('h2',{text:'Tomato08 Notebook Sync'});
  el.createEl('p',{text:'Two-way Markdown note sync with the Tomato08 course notebook. Only managed notes under Tomato08/Notes are exchanged. Other vault files are not uploaded. No Obsidian Sync subscription is required.'});
  el.createEl('p',{text:'Back up your vault first. Cloud notes are not end-to-end encrypted. Use only non-sensitive training material. Deletions are not propagated. Conflicts require an explicit merge.'});
  if(this.p.error){el.createEl('p',{text:this.p.error});return;}
  el.createEl('p',{text:'Bound account: '+(this.p.state.account||'Not connected')+'. One Tomato08 account per vault. Login is session-only; sign in again after restarting Obsidian.'});
  new Setting(el).setName('Session').addButton(b=>b.setButtonText('Sign in').onClick(()=>new Login(this.p).open())).addButton(b=>b.setButtonText('Sign out').onClick(async()=>{await this.p.disconnect();this.display();}));
  new Setting(el).setName('Exchange notes').setDesc('First enable cloud sync on the website. Close or finish editing the selected note before syncing.').addButton(b=>b.setButtonText('Sync now').setCta().onClick(()=>this.p.runSync()));
  new Setting(el).setName('Automatic sync while Obsidian is open').setDesc('Checks every 60 seconds while signed in. Off by default. Website notes update on its next cloud sync.').addToggle(t=>t.setValue(this.p.state.autoSync).onChange(async v=>{this.p.state.autoSync=v;await this.p.persist(this.p.state);}));
  new Setting(el).setName('Publish an existing note').setDesc('Use the command palette: “Tomato08: Publish a copy of the active note”. You will be asked before it is copied and queued. The original is unchanged.');
  new Setting(el).setName('Conflicts').setDesc('Originals remain untouched; all competing heads are copied into Tomato08/Conflicts. Merge in the website, or edit the managed note and use “Resolve conflict using the active note”.');
  new Setting(el).setName('Archive and removal').setDesc('Use Archive in the website. Archiving updates a property; it never deletes your local file. Deleting or moving a managed file outside Tomato08/Notes pauses that file instead of deleting cloud history.');
  new Setting(el).setName('Restore a removed local note').setDesc('Recreates missing managed files from the last synchronized history without deleting or overwriting any existing file.').addButton(b=>b.setButtonText('Restore missing copies').onClick(()=>this.p.restoreMissing()));
  el.createEl('p',{text:'Markdown body, note title, ordinary wikilinks, aliases and course-topic IDs synchronize. Attachments, Canvas, plugins, embedded files, block/heading links, and arbitrary extra properties are not synchronized. Extra YAML properties on managed files remain local.'});
  el.createEl('p',{text:'Do not run another file-sync engine over this same managed folder or synchronize this plugin’s data.json between devices. Use one independent plugin state per device; let Tomato08 exchange note revisions.'});
 }
}
class Tomato08 extends Plugin {
 async onload(){
  this.status=this.addStatusBarItem();this.status.setText('Tomato08: not connected');this.saveChain=Promise.resolve();
  try{this.state=validateState(await this.loadData());}catch(e){this.error=e.message;new Notice(e.message,15000);this.addSettingTab(new Settings(this.app,this));return;}
  if(!(this.app.vault.adapter instanceof FileSystemAdapter)){this.error='This release requires desktop Obsidian with a local vault.';new Notice(this.error);this.addSettingTab(new Settings(this.app,this));return;}
  this.cloud=new Cloud(requestUrl,this.state.account);
  this.engine=new Engine(this.port(),this.cloud,this.state,s=>this.persist(s),s=>this.message(s));
  this.addSettingTab(new Settings(this.app,this));
  this.addCommand({id:'sign-in',name:'Sign in to Tomato08',callback:()=>new Login(this).open()});
  this.addCommand({id:'sync-now',name:'Sync notebook now',callback:()=>this.runSync()});
  this.addCommand({id:'publish-copy',name:'Publish a copy of the active note',callback:()=>this.publish()});
  this.addCommand({id:'new-note',name:'Create a synced course note',callback:()=>this.createNote()});
  this.addCommand({id:'resolve-conflict',name:'Resolve conflict using the active note',callback:()=>this.resolve()});
  this.addCommand({id:'sign-out',name:'Sign out of Tomato08',callback:()=>this.disconnect()});
  this.addRibbonIcon('refresh-cw','Sync Tomato08 notebook',()=>this.runSync());
  this.registerInterval(window.setInterval(()=>{if(this.state.autoSync&&this.cloud.session&&!this.engine.busy)this.runSync(false);},60000));
  this.registerObsidianProtocolHandler('tomato08',async params=>{try{
   if(!C.NOTE.test(params.note)||params.account!==this.state.account)throw new Error('This note link belongs to an unconnected account. Sign in and sync this vault first.');
   let entry=this.state.entries[params.note];if(!entry&&this.cloud.session){await this.runSync(false);entry=this.state.entries[params.note];}
   if(!entry)throw new Error('Sync notebook now, then open the link again.');await this.openPath(entry.path);
  }catch(e){this.message(e.message);}});
 }
 onunload(){if(this.engine)this.engine.cancelled=true;this.cloud?.clear();}
 persist(state){const copy=C.clone(state);this.saveChain=this.saveChain.catch(()=>{}).then(()=>this.saveData(copy));return this.saveChain;}
 message(text,notice=true){this.status?.setText('Tomato08: '+text);if(notice)new Notice(text,8000);}
 async disconnect(){if(this.engine?.busy){this.message('Wait for the current sync before signing out.');return;}try{await this.cloud?.logout();}catch(_){this.cloud?.clear();}this.message('Signed out. Local Markdown files remain in your vault.');}
 async safe(relative){
  if(!relative||relative.startsWith('/')||/[\\\x00-\x1f:]/.test(relative)||relative.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')))throw new Error('Unsafe vault path.');
  const base=this.app.vault.adapter.getBasePath(),parts=relative.split('/');let p=base;
  for(const part of parts){p=pathUtil.join(p,part);try{const st=await fs.lstat(p);if(st.isSymbolicLink())throw new Error('Symlink paths are not supported for synced notes.');}catch(e){if(e.code!=='ENOENT')throw e;}}
 }
 async ensureFolders(relative){await this.safe(relative);const parts=relative.split('/');let p='';for(const part of parts){p=p?p+'/'+part:part;const old=this.app.vault.getAbstractFileByPath(p);if(old instanceof TFile)throw new Error('A file blocks the sync folder.');if(!old)await this.app.vault.createFolder(p);}}
 async read(path){await this.safe(path);const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw new Error('Managed note is missing.');return this.app.vault.read(file);}
 port(){const p=this;return {
  parseYaml,stringifyYaml,
  async list(){return p.app.vault.getMarkdownFiles().map(f=>f.path).filter(C.managedPath);},
  async exists(path){await p.safe(path);return !!p.app.vault.getAbstractFileByPath(path);},
  read:path=>p.read(path),
  async create(path,text){await p.safe(path);await p.ensureFolders(path.split('/').slice(0,-1).join('/'));if(p.app.vault.getAbstractFileByPath(path))throw new Error('Destination already exists; no overwrite.');await p.app.vault.create(path,text);return true;},
  async replace(path,expected,next){await p.safe(path);const file=p.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))return false;
   const views=p.app.workspace.getLeavesOfType('markdown');if(views.some(l=>l.view.file?.path===path&&l.view.editor&&l.view.editor.getValue()!==expected))return false;
   let written=false;await p.app.vault.process(file,current=>{if(current!==expected)return current;written=true;return next;});return written;},
  async conflict(id,event){const name=`${C.ROOT}/Conflicts/${id.slice(9)}--${event.id}.md`;await p.safe(name);if(p.app.vault.getAbstractFileByPath(name))return;await p.ensureFolders(C.ROOT+'/Conflicts');const text='# Preserved conflicting revision\n\nNote: '+event.payload.title+'\n\nRevision: '+event.id+'\n\nEdit the managed note or merge in Tomato08. This file is a non-syncing recovery copy.\n\n---\n\n'+event.payload.text;await p.app.vault.create(name,text);},
  confirmMerge:count=>new Confirm(p.app,'Merge '+count+' revisions?','The current managed note will become the merged version. Review the copies in Tomato08/Conflicts first. All original cloud revisions remain preserved.').ask()
 };}
 async runSync(show=true){if(!this.cloud.session){if(show)new Login(this).open();return;}if(this.engine.busy){if(show)this.message('Sync already running.');return;}this.message('Syncing…',false);try{const r=await this.engine.sync();this.message(`Synced ${r.pulled} notes; ${r.conflicts} conflicts; ${r.missing} missing local files; ${r.deferred} edits deferred.`,show||r.conflicts>0);return r;}catch(e){if(e.denied||e.status===401||e.status===403)this.cloud.clear();this.message(e.message,show);}}
 async openPath(path){await this.safe(path);const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw new Error('Local note is missing. Restore it from backup or restore missing copies.');await this.app.workspace.getLeaf(false).openFile(file);}
 async createNote(){try{if(!this.state.account||!this.cloud.session){new Login(this).open();return;}const path=await this.engine.add('New course note','');await this.openPath(path);this.message('New managed note created. Edit its title property and body, then sync.');}catch(e){this.message(e.message);}}
 async publish(){try{
  if(!this.cloud.session){new Login(this).open();return;}const file=this.app.workspace.getActiveFile();if(!(file instanceof TFile)||file.extension!=='md')throw new Error('Open a Markdown note first.');if(C.managedPath(file.path))throw new Error('This note is already in the managed folder. Use Sync now.');
  await this.safe(file.path);const raw=await this.app.vault.read(file);if(raw.length>50000)throw new Error('The note exceeds the 50,000-character limit.');
  if(!await new Confirm(this.app,'Publish a copy to Tomato08?',`A copy of “${file.basename}” will be stored in Tomato08/Notes and queued for your course cloud notebook. The original is unchanged. No attachments are uploaded. Do not publish secrets or operational records.`).ask())return;
  const path=await this.engine.add(file.basename,raw);await this.openPath(path);this.message('Copy queued. Use Sync now to publish it.');
 }catch(e){this.message(e.message);}}
 async resolve(){try{const file=this.app.workspace.getActiveFile();if(!(file instanceof TFile)||!C.managedPath(file.path))throw new Error('Open the original managed note, not a conflict copy.');const {meta}=C.split(await this.read(file.path),parseYaml);if(await this.engine.resolve(meta.tomato08_id))await this.runSync();}catch(e){this.message(e.message);}}
 async restoreMissing(){try{
  if(this.engine.busy)throw new Error('Wait for the current sync.');if(!this.cloud.session){new Login(this).open();return;}await this.cloud.requireAccess();
  if(!await new Confirm(this.app,'Restore missing copies?','Missing managed Markdown files will be recreated from the last synced version. No existing files are overwritten.').ask())return;
  const groups=C.groups(this.state.events),index=this.engine.index();let count=0;
  for(const[id,e]of Object.entries(this.state.entries)){if(await this.engine.port.exists(e.path))continue;const heads=groups.get(id);if(heads?.length!==1)continue;const p=heads[0].payload,raw=C.render(p,[heads[0].id],this.state.account,index,this.state.entries,stringifyYaml);await this.engine.port.create(e.path,raw);e.heads=[heads[0].id];e.base=C.parseManaged(raw,this.state.account,parseYaml,index).payload;e.lastHash=C.hash(raw);count++;await this.persist(this.state);}
  this.message('Restored '+count+' missing notes.');
 }catch(e){this.message(e.message);}}
}
module.exports=Tomato08;

};
function __load(name){if(!__cache[name]){const m={exports:{}};__cache[name]=m;__modules[name](m,m.exports);}return __cache[name].exports;}
module.exports=__load('plugin');
