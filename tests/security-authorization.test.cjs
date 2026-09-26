const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function app(overrides={}){
 const state={approved:true,session_valid:true,mfa_required:false,aal:'aal1',allowed:true,role:'developer',...overrides};
 const calls=[]; const session={user:{id:'fixture-only'}};
 const context={console:{warn(){}}};
 context.window=context;
 context.FC={usernameToEmail:x=>x+'@example.invalid',getProfile:async()=>({id:'fixture-only',role:state.role}),client:{rpc:async name=>{calls.push(name);return {data:name==='security_access_status'?state:{allowed:true}};},auth:{getSession:async()=>({data:{session}}),signInWithPassword:async()=>({data:{session}}),mfa:{listFactors:async()=>({data:{totp:[]}})}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../security-auth.js'),'utf8'),context);
 return {context,state,calls,session};
}
test('approved active account can obtain profile',async()=>{const {context}=app();assert.equal((await context.FC.requireUser()).role,'developer');});
test('unapproved account is denied before reading a profile',async()=>{const {context}=app({approved:false,allowed:false});await assert.rejects(context.FC.requireUser(),/not approved/);});
test('revoked session is denied',async()=>{const {context}=app({session_valid:false,allowed:false});await assert.rejects(context.FC.requireUser(),/revoked/);});
test('MFA-required account cannot bypass missing authenticator',async()=>{const {context}=app({mfa_required:true,allowed:false});await assert.rejects(context.FC.requireUser(),/MFA is required/);});
test('tester is not developer',async()=>{const {context}=app({role:'tester'});assert.equal((await context.FC.requireDeveloper()).denied,true);});
test('login uses server session audit and authorization',async()=>{const {context,calls,session}=app();assert.equal(await context.FC.signIn('fixture','not-a-real-password'),session);assert.ok(calls.includes('security_record_session'));assert.ok(calls.includes('security_access_status'));});
test('RPC failure fails closed',async()=>{const {context}=app();context.FC.client.rpc=async()=>({error:{message:'offline'}});await assert.rejects(context.FC.requireUser(),/verification failed/);});
test('malformed authorization response fails closed',async()=>{const {context}=app();context.FC.client.rpc=async()=>({data:{}});await assert.rejects(context.FC.requireUser(),/Invalid access/);});
