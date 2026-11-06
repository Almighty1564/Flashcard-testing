/* Optional learning evidence. Never changes legacy grades, SRS, or save calls. */
(function(root){
  'use strict';
  const PREFIX='t08.learning.attempt-outbox.v1.';
  let sequence=0,inFlight=null;
  const statuses=new Map();
  const clone=value=>JSON.parse(JSON.stringify(value));
  function api(){return root.T08Learning;}
  function available(){try{return api()?.isAvailable()===true;}catch{return false;}}
  function account(){try{return String(api()?.getUserId?.()||'');}catch{return '';}}
  function read(id){try{const v=JSON.parse(root.localStorage.getItem(PREFIX+id)||'[]');return Array.isArray(v)?v:[];}catch{return [];}}
  function write(id,items){try{root.localStorage.setItem(PREFIX+id,JSON.stringify(items));return true;}catch{return false;}}
  function status(owner,state,pending){
    if(!available()||account()!==owner)return;
    const detail={state,pending};statuses.set(owner,detail);
    try{if(root.CustomEvent)root.dispatchEvent?.(new root.CustomEvent('t08-learning-evidence-status',{detail}));}catch(_){/* UI status is optional. */}
  }
  function id(){return root.crypto?.randomUUID?.()||('attempt-'+Date.now()+'-'+(++sequence)+'-'+Math.random().toString(36).slice(2));}
  function canonical(value){
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  function bounded(value,limit,snapshot=false){
    const json=JSON.stringify(value),bytes=new TextEncoder().encode(json).length;
    if(bytes<=limit)return value;
    const result={truncated:true,original_bytes:bytes,encoding:'json-preview',preview:json.slice(0,1500)};
    if(snapshot)result.snapshot_truncated=true;
    while(new TextEncoder().encode(JSON.stringify(result)).length>limit)result.preview=result.preview.slice(0,Math.floor(result.preview.length/2));
    return result;
  }
  async function revision(snapshot){
    if(!root.crypto?.subtle)return null;
    const bytes=new TextEncoder().encode(canonical(snapshot));
    return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  }
  function flush(){
    if(inFlight)return inFlight;
    if(!available()||typeof api()?.saveAttempts!=='function')return Promise.resolve();
    inFlight=drain().finally(()=>{inFlight=null;});
    return inFlight;
  }
  async function drain(){
    const owner=account();if(!owner)return;
    let drained=true;
    try{
      do{
      const queued=read(owner),groups=new Map();
      status(owner,queued.length?'pending':'saved',queued.length);
      for(const item of queued){const key=item.sessionId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
      const batches=[...groups].flatMap(([sessionId,items])=>Array.from({length:Math.ceil(items.length/100)},(_,i)=>[sessionId,items.slice(i*100,(i+1)*100)]));
      for(const [sessionId,attempts] of batches){
        // Do not send one account's outbox after an account switch.
        if(!available()||account()!==owner){drained=false;break;}
        const result=await api().saveAttempts({moduleId:attempts[0].moduleId,sessionId,attempts});
        if(result?.error||!(result?.ok===true||result?.saved===true)){drained=false;status(owner,'error',read(owner).length);break;}
        const sent=new Set(attempts.map(a=>a.id));
        const remaining=read(owner).filter(a=>!sent.has(a.id));
        if(!write(owner,remaining)){drained=false;status(owner,'error',read(owner).length);break;}
        status(owner,remaining.length?'pending':'saved',remaining.length);
      }
      // A later answer can arrive while the previous batch is in flight.
      }while(drained&&available()&&account()===owner&&read(owner).length);
    }catch(_){status(owner,root.navigator?.onLine===false?'pending':'error',read(owner).length);/* Keep the separate outbox for a later retry. */}
  }
  function record(input){
    if(!available())return null;
    const owner=account();if(!owner)return null;
    let item,originalSnapshot;
    try{
      item=clone({...input,id:input.id||id(),recordedAt:new Date().toISOString()});
      originalSnapshot=item.questionSnapshot;
      item.questionSnapshot=bounded(item.questionSnapshot,6000,true);
      item.response=bounded(item.response??null,6000);
      // No confidence can be inferred merely from correctness.
      item.confidence=['confident','guessed','no_idea'].includes(input.confidence)?input.confidence:'unknown';
      item.questionRevision=null;
    }catch{return null;}
    const pending=read(owner);
    if(pending.some(a=>a.id===item.id))return item.id;
    pending.push(item);
    if(!write(owner,pending)){status(owner,'error',pending.length);return null;}
    status(owner,'pending',pending.length);
    // Persist raw evidence first. Hash and network work never block normal studying.
    revision(originalSnapshot).then(hash=>{
      const current=read(owner),stored=current.find(a=>a.id===item.id);
      if(stored){stored.questionRevision=hash;if(!write(owner,current))status(owner,'error',current.length);}
      if(account()===owner)void flush();
    }).catch(()=>{if(account()===owner)void flush();});
    return item.id;
  }
  root.T08LearningCapture={available,newSessionId:id,record,flush,getStatus:()=>statuses.get(account())||null};
  root.addEventListener?.('t08-learning-ready',()=>void flush());
  root.addEventListener?.('online',()=>void flush());
})(typeof window!=='undefined'?window:globalThis);
