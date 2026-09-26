/* Append-only IndexedDB ledger. Draft branches remain visible; sync never uses last-write-wins. */
(function(){
 'use strict';
 const core=window.T08ProjectCore;
 class Ledger{
  constructor(account){this.account=account;this.db=null;this.enabled=false;this.syncing=false;this.channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('t08-project-events'):null;}
  async open(){this.db=await new Promise((resolve,reject)=>{const request=indexedDB.open('tomato08-project-studio',1);request.onupgradeneeded=()=>{const db=request.result;const events=db.createObjectStore('events',{keyPath:'key'});events.createIndex('account','account');db.createObjectStore('settings',{keyPath:'key'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Browser database unavailable. Do not close unsaved work.'));});this.enabled=!!(await this.setting('cloud'));return this;}
  async setting(name,value){const key=this.account+'/'+name;if(arguments.length===2)return this.transaction('settings','readwrite',s=>s.put({key,value}));return (await this.transaction('settings','readonly',s=>s.get(key)))?.value;}
  transaction(table,mode,action){return new Promise((resolve,reject)=>{const tx=this.db.transaction(table,mode),store=tx.objectStore(table);let req;try{req=action(store);}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(req?.result);tx.onerror=()=>reject(tx.error||new Error('Local save failed.'));tx.onabort=()=>reject(tx.error||new Error('Local save aborted.'));});}
  async all(){return (await this.transaction('events','readonly',s=>s.index('account').getAll(this.account))).map(({key,account,...e})=>e);}
  async append(payload){const event={id:crypto.randomUUID(),client_at:new Date().toISOString(),payload:{schema:2,...payload},synced:false};await this.merge([event]);this.channel?.postMessage({account:this.account});return event;}
  async merge(events){
   events=core.mergeEvents([],events);
   return new Promise((resolve,reject)=>{const tx=this.db.transaction('events','readwrite'),s=tx.objectStore('events');let failure=null;
    for(const event of events){const key=this.account+'/'+event.id,req=s.get(key);req.onsuccess=()=>{const existing=req.result;if(existing&&core.canonical(existing.payload)!==core.canonical(event.payload)){failure=new Error('Conflicting event ID. Import stopped without overwriting history.');tx.abort();return;}s.put(existing?{...existing,synced:existing.synced||event.synced,recorded_at:event.recorded_at||existing.recorded_at}:{...event,key,account:this.account});};}
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(failure||tx.error||new Error('Save failed.'));tx.onabort=()=>reject(failure||tx.error||new Error('Save aborted.'));
   });
  }
  async sync(client,onStatus=()=>{}){
   if(!this.enabled||this.syncing)return;this.syncing=true;
   try{
    const session=(await client.auth.getSession()).data.session;if(!session||session.user.id!==this.account)throw new Error('Sign in to this account again before syncing.');
    const access=await client.rpc('security_access_status');if(access.error||!access.data?.allowed)throw new Error('Cloud sync requires current approved access and any required MFA.');
    onStatus('Syncing private project evidence…');
    const local=await this.all();
    for(const e of local.filter(e=>!e.synced)){
      const row={user_id:this.account,id:e.id,client_at:e.client_at,payload:e.payload};const res=await client.from('cs50_project_events').insert(row);
      if(res.error){
       if(res.error.code!=='23505')throw new Error(res.error.message||'Cloud upload failed.');
       const old=await client.from('cs50_project_events').select('payload,recorded_at').eq('user_id',this.account).eq('id',e.id).single();
       if(old.error||core.canonical(old.data.payload)!==core.canonical(e.payload))throw new Error('Cloud event conflict. Local evidence retained; export a backup.');
      }
      await this.merge([{...e,synced:true}]);
    }
    // Full paged pull avoids a lossy timestamp/sequence watermark across concurrent transactions.
    let count=0;
    for(let offset=0;offset<20000;offset+=200){
      const res=await client.from('cs50_project_events').select('id,client_at,recorded_at,payload').eq('user_id',this.account).order('recorded_at',{ascending:true}).order('id',{ascending:true}).range(offset,offset+199);
      if(res.error)throw new Error(res.error.message);const rows=res.data||[];await this.merge(rows.map(e=>({...e,synced:true})));count+=rows.length;
      if(rows.length<200)break;if(offset===19800)throw new Error('Sync reached the 20,000-event safety limit. Data retained; export and contact the maintainer.');
    }
    await this.setting('lastSync',new Date().toISOString());onStatus('Cloud sync complete · '+count+' private records');
   }catch(error){onStatus('Not synced: '+error.message);throw error;}finally{this.syncing=false;}
  }
  close(){this.channel?.close();this.db?.close();}
 }
 window.T08ProjectLedger=Ledger;
})();
