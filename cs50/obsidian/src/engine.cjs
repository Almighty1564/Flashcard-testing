'use strict';
const C=require('./core.cjs');
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
