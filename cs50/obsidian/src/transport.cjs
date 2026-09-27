'use strict';
const C=require('./core.cjs');
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
